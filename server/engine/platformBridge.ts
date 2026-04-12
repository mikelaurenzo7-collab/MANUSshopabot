/**
 * ShopBOTS — Platform Bridge
 *
 * The critical integration layer that connects the workflow engine
 * and agent routers to the platform-specific adapters.
 *
 * This module:
 * 1. Resolves the correct adapter (ecommerce or social) for a given store/account
 * 2. Builds credentials from DB records
 * 3. Provides high-level operations that agents call
 * 4. Wraps every external API call with circuit breaker + retry for maximum resilience
 */

import { getEcommerceAdapter, buildCredentials } from "../adapters/ecommerce";
import { getSocialAdapter, buildSocialCredentials } from "../adapters/social";
import type { AdapterCredentials, CreateProductInput, FulfillmentInput, PlatformProduct } from "../adapters/ecommerce/types";
import type { SocialCredentials, CreatePostInput, CreateAdCampaignInput, SocialPost, AdCampaign, SocialAnalytics } from "../adapters/social/types";
import { withResilience } from "../_core/retry";
import { logger } from "../_core/logger";
import * as db from "../db";

// ─── Circuit Breaker Key Helpers ──────────────────────────────────────────

/** Generate a per-platform circuit breaker key for e-commerce adapters */
function ecomCbKey(platform: string, storeId: number): string {
  return `ecom:${platform}:store:${storeId}`;
}

/** Generate a per-platform circuit breaker key for social adapters */
function socialCbKey(platform: string, accountId: number): string {
  return `social:${platform}:account:${accountId}`;
}

// ─── E-Commerce Bridge ────────────────────────────────────────────────────

/**
 * Get adapter + credentials for a store. Resolves from DB.
 */
export async function getStoreAdapter(storeId: number) {
  const store = await db.getStoreById(storeId);
  if (!store) throw new Error(`Store ${storeId} not found`);

  const adapter = getEcommerceAdapter(store.platform);

  const creds = await db.getCredentialsByStoreId(storeId);
  const credentials: AdapterCredentials = creds
    ? buildCredentials(creds, store)
    : {
        platform: store.platform,
        accessToken: store.platformAccessToken || undefined,
        storeUrl: store.platformDomain || undefined,
        shopDomain: store.platformDomain || undefined,
      };

  return { adapter, credentials, store };
}

/**
 * Sync products from a remote platform store into the local DB.
 * Wrapped with circuit breaker — if the platform API is failing, stops hammering it.
 */
export async function syncProductsFromStore(storeId: number, userId: number): Promise<{ synced: number; errors: string[] }> {
  const { adapter, credentials, store } = await getStoreAdapter(storeId);
  const cbKey = ecomCbKey(store.platform, storeId);

  const errors: string[] = [];
  let synced = 0;

  try {
    const remoteProducts = await withResilience(
      cbKey,
      () => adapter.listProducts(credentials, { limit: 250 }),
      { maxAttempts: 3, label: `sync_products:${store.platform}:${storeId}` }
    );

    for (const rp of remoteProducts) {
      try {
        if (!rp || !rp.platformId) {
          errors.push(`Invalid product data: missing platformId`);
          continue;
        }
        const existing = await db.getProductByPlatformId(storeId, rp.platformId);
        if (existing) {
          await db.updateProduct(existing.id, {
            title: rp.title,
            price: rp.priceCents,
            stockLevel: rp.stockLevel ?? existing.stockLevel,
            status: rp.status === "active" ? "active" : "draft",
            imageUrl: rp.imageUrl || existing.imageUrl,
          });
        } else {
          await db.createProduct({
            storeId,
            title: rp.title,
            description: rp.description || "",
            price: rp.priceCents,
            sku: rp.sku || undefined,
            imageUrl: rp.imageUrl || undefined,
            stockLevel: rp.stockLevel ?? 0,
            status: rp.status === "active" ? "active" : "draft",
            platformProductId: rp.platformId,
          });
        }
        synced++;
      } catch (err: any) {
        errors.push(`Product "${rp.title}": ${err.message}`);
      }
    }

    await db.createAgentTask({
      agentType: "merchant",
      taskType: "product_sync",
      title: `Synced ${synced} products from ${store.platform}`,
      description: `Store: ${store.name}. ${errors.length} errors.`,
      status: "completed",
      storeId,
      result: { synced, errors },
    });

    logger.info("product_sync_complete", { storeId, platform: store.platform, synced, errorCount: errors.length });
    return { synced, errors };
  } catch (err: any) {
    logger.error("product_sync_failed", { storeId, platform: store.platform, error: err.message });
    throw new Error(`Failed to sync products from ${store.platform}: ${err.message}`);
  }
}

/**
 * Push a product to the remote platform store.
 * Circuit-breaker protected.
 */
export async function pushProductToStore(storeId: number, productId: number): Promise<PlatformProduct> {
  const { adapter, credentials, store } = await getStoreAdapter(storeId);
  const cbKey = ecomCbKey(store.platform, storeId);

  const product = await db.getProductById(productId);
  if (!product) throw new Error(`Product ${productId} not found`);

  const input: CreateProductInput = {
    title: product.title,
    description: product.description || "",
    priceCents: product.price,
    sku: product.sku || undefined,
    imageUrl: product.imageUrl || undefined,
    stockLevel: product.stockLevel,
  };

  const created = await withResilience(
    cbKey,
    () => adapter.createProduct(credentials, input),
    { maxAttempts: 3, label: `push_product:${store.platform}:${storeId}` }
  );

  await db.updateProduct(productId, {
    platformProductId: created.platformId,
    status: "active",
  });

  logger.info("product_pushed", { storeId, productId, platform: store.platform, platformProductId: created.platformId });
  return created;
}

/**
 * Fulfill an order on the remote platform.
 * Circuit-breaker protected — fulfillment is critical, never retried more than 2x.
 */
export async function fulfillOrderOnPlatform(
  storeId: number,
  orderId: number,
  trackingNumber?: string,
  trackingUrl?: string
): Promise<boolean> {
  const { adapter, credentials, store } = await getStoreAdapter(storeId);
  const cbKey = ecomCbKey(store.platform, storeId);

  const order = await db.getOrderById(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const platformOrderId = order.platformOrderId;
  if (!platformOrderId) {
    // No platform order ID — update locally only
    await db.updateOrder(orderId, {
      status: "fulfilled",
      fulfillmentStatus: "fulfilled",
      trackingNumber: trackingNumber || `BB-${Date.now().toString(36).toUpperCase()}`,
      trackingUrl,
    });
    return true;
  }

  const fulfillment: FulfillmentInput = {
    trackingNumber: trackingNumber || `BB-${Date.now().toString(36).toUpperCase()}`,
    trackingUrl,
    carrier: "auto",
    notifyCustomer: true,
  };

  await withResilience(
    cbKey,
    () => adapter.fulfillOrder(credentials, platformOrderId, fulfillment),
    { maxAttempts: 2, label: `fulfill_order:${store.platform}:${orderId}` }
  );

  await db.updateOrder(orderId, {
    status: "fulfilled",
    fulfillmentStatus: "fulfilled",
    trackingNumber: fulfillment.trackingNumber,
    trackingUrl,
  });

  logger.info("order_fulfilled", { storeId, orderId, platform: store.platform, trackingNumber: fulfillment.trackingNumber });
  return true;
}

/**
 * Check inventory levels across all stores for a user.
 */
export async function checkInventoryAcrossStores(userId: number): Promise<{
  storeId: number;
  storeName: string;
  platform: string;
  lowStockProducts: { id: number; title: string; stockLevel: number; threshold: number }[];
}[]> {
  const stores = await db.getStoresByUser(userId);
  const results = [];

  for (const store of stores) {
    if (store.status !== "active") continue;
    const lowStock = await db.getLowStockProducts(store.id);
    results.push({
      storeId: store.id,
      storeName: store.name,
      platform: store.platform,
      lowStockProducts: lowStock.map((p: any) => ({
        id: p.id,
        title: p.title,
        stockLevel: p.stockLevel,
        threshold: p.lowStockThreshold ?? 5,
      })),
    });
  }

  return results;
}

// ─── Social Media Bridge ──────────────────────────────────────────────────

/**
 * Get adapter + credentials for a social account.
 */
export async function getSocialAccountAdapter(accountId: number) {
  const account = await db.getSocialAccountById(accountId);
  if (!account) throw new Error(`Social account ${accountId} not found`);

  const adapter = getSocialAdapter(account.platform);
  const credentials: SocialCredentials = buildSocialCredentials({
    platform: account.platform,
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    platformAccountId: account.accountId,
    metadata: account.metadata,
  });

  return { adapter, credentials, account };
}

/**
 * Publish a post to a social media platform.
 * Circuit-breaker protected per platform+account.
 */
export async function publishSocialPost(
  accountId: number,
  postInput: CreatePostInput,
  storeId?: number,
): Promise<SocialPost> {
  const { adapter, credentials, account } = await getSocialAccountAdapter(accountId);
  const cbKey = socialCbKey(account.platform, accountId);

  const post = await withResilience(
    cbKey,
    () => adapter.createPost(credentials, postInput),
    { maxAttempts: 3, label: `publish_post:${account.platform}:${accountId}` }
  );

  if (storeId) {
    const platformMap: Record<string, string> = {
      meta: "facebook", twitter: "twitter", instagram: "instagram",
      tiktok: "tiktok", pinterest: "pinterest", google_ads: "facebook",
    };
    await db.createSocialPost({
      storeId,
      platform: (platformMap[account.platform] || "facebook") as any,
      content: postInput.content,
      imageUrl: postInput.imageUrl,
      status: "published",
      publishedAt: new Date(),
      engagement: { platformPostId: post.platformId },
    });
  }

  logger.info("social_post_published", { accountId, platform: account.platform, storeId, platformPostId: post.platformId });
  return post;
}

/**
 * Schedule a post for later publishing.
 * Circuit-breaker protected.
 */
export async function scheduleSocialPost(
  accountId: number,
  postInput: CreatePostInput,
  scheduledAt: Date,
  storeId?: number,
): Promise<SocialPost> {
  const { adapter, credentials, account } = await getSocialAccountAdapter(accountId);
  const cbKey = socialCbKey(account.platform, accountId);

  const post = await withResilience(
    cbKey,
    () => adapter.schedulePost(credentials, postInput, scheduledAt),
    { maxAttempts: 3, label: `schedule_post:${account.platform}:${accountId}` }
  );

  if (storeId) {
    const platformMap: Record<string, string> = {
      meta: "facebook", twitter: "twitter", instagram: "instagram",
      tiktok: "tiktok", pinterest: "pinterest", google_ads: "facebook",
    };
    await db.createSocialPost({
      storeId,
      platform: (platformMap[account.platform] || "facebook") as any,
      content: postInput.content,
      imageUrl: postInput.imageUrl,
      status: "scheduled",
      scheduledAt,
      engagement: { platformPostId: post.platformId },
    });
  }

  logger.info("social_post_scheduled", { accountId, platform: account.platform, scheduledAt });
  return post;
}

/**
 * Launch an ad campaign on a social platform.
 * Circuit-breaker protected — ad spend decisions are high-stakes.
 */
export async function launchAdCampaign(
  accountId: number,
  campaignInput: CreateAdCampaignInput,
  storeId: number,
): Promise<AdCampaign> {
  const { adapter, credentials, account } = await getSocialAccountAdapter(accountId);
  const cbKey = socialCbKey(account.platform, accountId);

  const campaign = await withResilience(
    cbKey,
    () => adapter.createAdCampaign(credentials, campaignInput),
    { maxAttempts: 2, label: `launch_campaign:${account.platform}:${accountId}` }
  );

  const platformMap: Record<string, string> = {
    meta: "meta", instagram: "meta", tiktok: "tiktok",
    google_ads: "google", twitter: "meta", pinterest: "meta",
  };

  await db.createAdCampaign({
    storeId,
    name: campaignInput.name || `${account.platform} campaign`,
    platform: (platformMap[account.platform] || "meta") as any,
    adCopy: campaignInput.adCopy,
    targetAudience: JSON.stringify(campaignInput.targeting),
    budgetCents: campaignInput.budgetCents,
    status: "active",
    imageUrl: campaignInput.imageUrl,
  });

  logger.info("ad_campaign_launched", { accountId, platform: account.platform, storeId, campaignName: campaign.name });
  return campaign;
}

/**
 * Get analytics across all connected social accounts for a user.
 * Each platform call is circuit-breaker protected independently.
 */
export async function getCrossPlatformSocialAnalytics(userId: number) {
  const accounts = await db.getSocialAccounts(userId);
  const results: { platform: string; accountName: string; analytics: SocialAnalytics | null; error?: string }[] = [];

  for (const account of accounts) {
    if (account.status !== "active") continue;

    try {
      const adapter = getSocialAdapter(account.platform);
      const credentials: SocialCredentials = buildSocialCredentials({
        platform: account.platform,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        platformAccountId: account.accountId,
        metadata: account.metadata,
      });

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const cbKey = socialCbKey(account.platform, account.id);

      const analytics = await withResilience(
        cbKey,
        () => adapter.getAccountAnalytics(credentials, thirtyDaysAgo, now),
        { maxAttempts: 2, label: `get_analytics:${account.platform}:${account.id}` }
      );

      results.push({ platform: account.platform, accountName: account.accountName || account.platform, analytics });
    } catch (err: any) {
      logger.warn("analytics_fetch_failed", { platform: account.platform, accountId: account.id, error: err.message });
      results.push({
        platform: account.platform,
        accountName: account.accountName || account.platform,
        analytics: null,
        error: err.message,
      });
    }
  }

  return results;
}
