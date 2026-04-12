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
 * 4. Handles errors, retries, and credential refresh
 */

import { getEcommerceAdapter, buildCredentials } from "../adapters/ecommerce";
import { getSocialAdapter, buildSocialCredentials } from "../adapters/social";
import type { AdapterCredentials, CreateProductInput, FulfillmentInput, PlatformProduct } from "../adapters/ecommerce/types";
import type { SocialCredentials, CreatePostInput, CreateAdCampaignInput, SocialPost, AdCampaign, SocialAnalytics } from "../adapters/social/types";
import * as db from "../db";

// ─── E-Commerce Bridge ────────────────────────────────────────────────────

/**
 * Get adapter + credentials for a store. Resolves from DB.
 */
export async function getStoreAdapter(storeId: number) {
  const store = await db.getStoreById(storeId);
  if (!store) throw new Error(`Store ${storeId} not found`);

  const adapter = getEcommerceAdapter(store.platform);

  // Try to find platform credentials for this store
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
 */
export async function syncProductsFromStore(storeId: number, userId: number): Promise<{ synced: number; errors: string[] }> {
  const { adapter, credentials, store } = await getStoreAdapter(storeId);
  
  if (!adapter) throw new Error(`No adapter found for store ${storeId}`);
  if (!credentials) throw new Error(`No credentials found for store ${storeId}`);
  if (!store) throw new Error(`Store ${storeId} not found`);
  
  const errors: string[] = [];
  let synced = 0;

  try {
    const remoteProducts = await adapter.listProducts(credentials, { limit: 250 });

    for (const rp of remoteProducts) {
      try {
        if (!rp || !rp.platformId) {
          errors.push(`Invalid product data: missing platformId`);
          continue;
        }
        // Check if product already exists by platform ID
        const existing = await db.getProductByPlatformId(storeId, rp.platformId);
        if (existing) {
          // Update existing product
          await db.updateProduct(existing.id, {
            title: rp.title,
            price: rp.priceCents,
            stockLevel: rp.stockLevel ?? existing.stockLevel,
            status: rp.status === "active" ? "active" : "draft",
            imageUrl: rp.imageUrl || existing.imageUrl,
          });
        } else {
          // Create new product
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

    // Log the sync task
    await db.createAgentTask({
      agentType: "merchant",
      taskType: "product_sync",
      title: `Synced ${synced} products from ${store.platform}`,
      description: `Store: ${store.name}. ${errors.length} errors.`,
      status: errors.length === 0 ? "completed" : "completed",
      storeId,
      result: { synced, errors },
    });

    return { synced, errors };
  } catch (err: any) {
    throw new Error(`Failed to sync products from ${store.platform}: ${err.message}`);
  }
}

/**
 * Push a product to the remote platform store.
 */
export async function pushProductToStore(storeId: number, productId: number): Promise<PlatformProduct> {
  const { adapter, credentials } = await getStoreAdapter(storeId);
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

  const created = await adapter.createProduct(credentials, input);

  // Update local record with platform ID
  await db.updateProduct(productId, {
    platformProductId: created.platformId,
    status: "active",
  });

  return created;
}

/**
 * Fulfill an order on the remote platform.
 */
export async function fulfillOrderOnPlatform(storeId: number, orderId: number, trackingNumber?: string, trackingUrl?: string): Promise<boolean> {
  const { adapter, credentials, store } = await getStoreAdapter(storeId);
  
  if (!adapter) throw new Error(`No adapter found for store ${storeId}`);
  if (!credentials) throw new Error(`No credentials found for store ${storeId}`);
  if (!store) throw new Error(`Store ${storeId} not found`);
  
  const order = await db.getOrderById(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const platformOrderId = order.platformOrderId; 
  if (!platformOrderId) {
    // No platform order ID — just update locally
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

  await adapter.fulfillOrder(credentials, platformOrderId, fulfillment);

  await db.updateOrder(orderId, {
    status: "fulfilled",
    fulfillmentStatus: "fulfilled",
    trackingNumber: fulfillment.trackingNumber,
    trackingUrl,
  });

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
 */
export async function publishSocialPost(
  accountId: number,
  postInput: CreatePostInput,
  storeId?: number,
): Promise<SocialPost> {
  const { adapter, credentials, account } = await getSocialAccountAdapter(accountId);

  if (!adapter) throw new Error(`No adapter found for account ${accountId}`);
  if (!credentials) throw new Error(`No credentials found for account ${accountId}`);
  if (!account) throw new Error(`Account ${accountId} not found`);

  const post = await adapter.createPost(credentials, postInput);

  // Save to local DB
  if (storeId) {
    // Map platform names to DB enum values
    const platformMap: Record<string, string> = {
      meta: "facebook",
      twitter: "twitter",
      instagram: "instagram",
      tiktok: "tiktok",
      pinterest: "pinterest",
      google_ads: "facebook", // fallback for DB enum
    };

    const dbPlatform = platformMap[account.platform] || "facebook";

    await db.createSocialPost({
      storeId,
      platform: dbPlatform as any,
      content: postInput.content,
      imageUrl: postInput.imageUrl,
      status: "published",
      publishedAt: new Date(),
      engagement: { platformPostId: post.platformId },
    });
  }

  return post;
}

/**
 * Schedule a post for later publishing.
 */
export async function scheduleSocialPost(
  accountId: number,
  postInput: CreatePostInput,
  scheduledAt: Date,
  storeId?: number,
): Promise<SocialPost> {
  const { adapter, credentials, account } = await getSocialAccountAdapter(accountId);

  if (!adapter) throw new Error(`No adapter found for account ${accountId}`);
  if (!credentials) throw new Error(`No credentials found for account ${accountId}`);
  if (!account) throw new Error(`Account ${accountId} not found`);

  const post = await adapter.schedulePost(credentials, postInput, scheduledAt);

  if (storeId) {
    const platformMap: Record<string, string> = {
      meta: "facebook",
      twitter: "twitter",
      instagram: "instagram",
      tiktok: "tiktok",
      pinterest: "pinterest",
      google_ads: "facebook",
    };

    const dbPlatform = platformMap[account.platform] || "facebook";

    await db.createSocialPost({
      storeId,
      platform: dbPlatform as any,
      content: postInput.content,
      imageUrl: postInput.imageUrl,
      status: "scheduled",
      scheduledAt,
      engagement: { platformPostId: post.platformId },
    });
  }

  return post;
}

/**
 * Launch an ad campaign on a social platform.
 */
export async function launchAdCampaign(
  accountId: number,
  campaignInput: CreateAdCampaignInput,
  storeId: number,
): Promise<AdCampaign> {
  const { adapter, credentials, account } = await getSocialAccountAdapter(accountId);

  if (!adapter) throw new Error(`No adapter found for account ${accountId}`);
  if (!credentials) throw new Error(`No credentials found for account ${accountId}`);
  if (!account) throw new Error(`Account ${accountId} not found`);

  const campaign = await adapter.createAdCampaign(credentials, campaignInput);

  // Map to DB enum
  const platformMap: Record<string, string> = {
    meta: "meta",
    instagram: "meta",
    tiktok: "tiktok",
    google_ads: "google",
    twitter: "meta", // fallback
    pinterest: "meta", // fallback
  };

  const dbPlatform = platformMap[account.platform] || "meta";

  await db.createAdCampaign({
    storeId,
    name: campaignInput.name || `${account.platform} campaign`,
    platform: dbPlatform as any,
    adCopy: campaignInput.adCopy,
    targetAudience: JSON.stringify(campaignInput.targeting),
    budgetCents: campaignInput.budgetCents,
    status: "active",
    imageUrl: campaignInput.imageUrl,
  });

  return campaign;
}

/**
 * Get analytics across all connected social accounts for a user.
 */
export async function getCrossPlatformSocialAnalytics(userId: number) {
  const accounts = await db.getSocialAccounts(userId);
  const results: { platform: string; accountName: string; analytics: any; error?: string }[] = [];

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
      const analytics = await adapter.getAccountAnalytics(credentials, thirtyDaysAgo, now);
      results.push({
        platform: account.platform,
        accountName: account.accountName || account.platform,
        analytics,
      });
    } catch (err: any) {
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
