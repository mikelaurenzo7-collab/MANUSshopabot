import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { orgProcedure, protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import * as db from "../db";
import { getEcommerceCapabilityMatrix } from "../adapters/ecommerce";
import { getSocialCapabilityMatrix } from "../adapters/social";

/**
 * Legacy in-memory fallback for pre-deployment OAuth callbacks.
 * New flows persist state in the database.
 */
export const pkceStore = new Map<string, { codeVerifier: string; timestamp: number }>();
setInterval(() => {
  const now = Date.now();
  pkceStore.forEach((val, key) => {
    if (now - val.timestamp > 10 * 60 * 1000) pkceStore.delete(key);
  });
}, 60 * 1000);

/**
 * Legacy in-memory fallback for pre-deployment OAuth callbacks.
 * New flows persist state in the database.
 */
export const ecomOAuthStateStore = new Map<string, { userId: number; storeId?: number; platform: string; timestamp: number }>();
setInterval(() => {
  const now = Date.now();
  ecomOAuthStateStore.forEach((val, key) => {
    if (now - val.timestamp > 10 * 60 * 1000) ecomOAuthStateStore.delete(key);
  });
}, 60 * 1000);

/**
 * Platform connector configurations — defines OAuth/API details for each e-commerce platform.
 * Each platform has: OAuth URLs, scopes, connection type, and required fields.
 */
const ECOMMERCE_PLATFORMS = {
  shopify: {
    name: "Shopify",
    icon: "🛍️",
    color: "#96BF48",
    connectionType: "oauth" as const,
    description: "Full store management via Admin API & OAuth",
    oauthConfig: {
      authUrl: (shop: string, clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
      tokenUrl: (shop: string) => `https://${shop}/admin/oauth/access_token`,
      scopes: "read_products,write_products,read_orders,write_orders,read_customers,read_inventory,write_inventory,read_fulfillments,write_fulfillments,read_analytics,read_themes,write_themes,read_content,write_content",
    },
    capabilities: ["products", "orders", "fulfillment", "themes", "customers", "analytics"],
  },
  woocommerce: {
    name: "WooCommerce",
    icon: "🌐",
    color: "#96588A",
    connectionType: "api_key" as const,
    description: "Complete store control via REST API v3 — enter your consumer key and secret",
    requiredFields: ["storeUrl", "consumerKey", "consumerSecret"],
    capabilities: ["products", "orders", "customers", "coupons", "settings", "reports"],
  },
  amazon: {
    name: "Amazon Seller",
    icon: "📦",
    color: "#FF9900",
    connectionType: "oauth" as const,
    description: "Seller management via SP-API — Login with Amazon OAuth",
    oauthConfig: {
      authUrl: (_: string, clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://sellercentral.amazon.com/apps/authorize/consent?application_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
      tokenUrl: () => "https://api.amazon.com/auth/o2/token",
      scopes: "sellingpartnerapi::notifications sellingpartnerapi::migration",
    },
    capabilities: ["listings", "orders", "fulfillment", "reports", "advertising"],
  },
  etsy: {
    name: "Etsy",
    icon: "🧡",
    color: "#F1641E",
    connectionType: "oauth" as const,
    description: "Shop management via Open API v3 — OAuth 2.0 with PKCE",
    oauthConfig: {
      authUrl: (_: string, clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://www.etsy.com/oauth/connect?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge_method=S256`,
      tokenUrl: () => "https://api.etsy.com/v3/public/oauth/token",
      scopes: "listings_r listings_w transactions_r transactions_w shops_r shops_w",
    },
    capabilities: ["listings", "orders", "inventory", "reviews", "shipping"],
  },
  ebay: {
    name: "eBay",
    icon: "🔨",
    color: "#E53238",
    connectionType: "oauth" as const,
    description: "Seller tools via REST APIs — OAuth 2.0 user consent",
    oauthConfig: {
      authUrl: (_: string, clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://auth.ebay.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`,
      tokenUrl: () => "https://api.ebay.com/identity/v1/oauth2/token",
      scopes: "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.marketing",
    },
    capabilities: ["listings", "orders", "marketing", "analytics", "fulfillment"],
  },
  tiktok_shop: {
    name: "TikTok Shop",
    icon: "🎵",
    color: "#000000",
    connectionType: "oauth" as const,
    description: "Social commerce via TikTok Shop Open Platform",
    oauthConfig: {
      authUrl: (_: string, clientId: string, _scopes: string, redirectUri: string, state: string) =>
        `https://services.tiktokshop.com/open/authorize?app_key=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
      tokenUrl: () => "https://auth.tiktok-shops.com/api/v2/token/get",
      scopes: "product.read product.write order.read order.write",
    },
    capabilities: ["products", "orders", "fulfillment", "promotions"],
  },
  walmart: {
    name: "Walmart Marketplace",
    icon: "🏪",
    color: "#0071CE",
    connectionType: "api_key" as const,
    description: "Marketplace via Seller API — enter your Client ID and Client Secret from Walmart Developer Portal",
    requiredFields: ["clientId", "clientSecret"],
    capabilities: ["products", "orders", "inventory", "pricing", "reports"],
  },
};

/**
 * Social media platform configurations for the Social Bot agent.
 */
const SOCIAL_PLATFORMS = {
  meta: {
    name: "Meta (Facebook & Instagram)",
    icon: "📘",
    color: "#1877F2",
    connectionType: "oauth" as const,
    description: "Manage Facebook Pages and Instagram Business accounts",
    oauthConfig: {
      authUrl: (clientId: string, scopes: string, redirectUri: string, state: string) => {
        const base = ENV.metaOAuthAuthUrl || "https://www.facebook.com/v19.0/dialog/oauth";
        return `${base}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`;
      },
      tokenUrl: ENV.metaOAuthTokenUrl || "https://graph.facebook.com/v19.0/oauth/access_token",
      scopes: "pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,ads_management",
    },
    capabilities: ["page_posting", "instagram_posting", "ads_management", "analytics"],
  },
  instagram: {
    name: "Instagram Business",
    icon: "📸",
    color: "#E4405F",
    connectionType: "oauth" as const,
    description: "Connected via Meta — manage Instagram Business content",
    oauthConfig: {
      authUrl: (clientId: string, scopes: string, redirectUri: string, state: string) => {
        const base = ENV.metaOAuthAuthUrl || "https://www.facebook.com/v19.0/dialog/oauth";
        return `${base}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`;
      },
      tokenUrl: ENV.metaOAuthTokenUrl || "https://graph.facebook.com/v19.0/oauth/access_token",
      scopes: "instagram_basic,instagram_content_publish,pages_read_engagement",
    },
    capabilities: ["content_posting", "stories", "reels", "analytics"],
  },
  tiktok: {
    name: "TikTok",
    icon: "🎵",
    color: "#000000",
    connectionType: "oauth" as const,
    description: "Post content and manage TikTok creator account",
    oauthConfig: {
      authUrl: (clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientId}&scope=${encodeURIComponent(scopes)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
      tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
      scopes: "user.info.basic,video.publish,video.list",
    },
    capabilities: ["video_posting", "analytics"],
  },
  twitter: {
    name: "Twitter / X",
    icon: "🐦",
    color: "#1DA1F2",
    connectionType: "oauth" as const,
    description: "Post tweets and manage Twitter/X presence",
    oauthConfig: {
      authUrl: (clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=challenge&code_challenge_method=plain`,
      tokenUrl: "https://api.twitter.com/2/oauth2/token",
      scopes: "tweet.read tweet.write users.read offline.access",
    },
    capabilities: ["tweet_posting", "analytics"],
  },
  pinterest: {
    name: "Pinterest",
    icon: "📌",
    color: "#BD081C",
    connectionType: "oauth" as const,
    description: "Create pins and manage Pinterest boards",
    oauthConfig: {
      authUrl: (clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://www.pinterest.com/oauth/?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`,
      tokenUrl: "https://api.pinterest.com/v5/oauth/token",
      scopes: "boards:read,boards:write,pins:read,pins:write,user_accounts:read",
    },
    capabilities: ["pin_creation", "board_management", "analytics"],
  },
  google_ads: {
    name: "Google Ads",
    icon: "📊",
    color: "#4285F4",
    connectionType: "oauth" as const,
    description: "Manage Google Ads campaigns and performance",
    oauthConfig: {
      authUrl: (clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}&access_type=offline&prompt=consent`,
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/adwords",
    },
    capabilities: ["campaign_management", "reporting", "optimization"],
  },
  gmail: {
    name: "Gmail",
    icon: "📧",
    color: "#EA4335",
    connectionType: "oauth" as const,
    description: "Send automated emails, manage customer communications via Gmail",
    oauthConfig: {
      authUrl: (clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}&access_type=offline&prompt=consent`,
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
    },
    capabilities: ["email_sending", "customer_support", "abandoned_cart_recovery", "order_notifications"],
  },
};

export const connectorsRouter = router({
  // ─── E-Commerce Platform Connectors ──────────────────────────────────────

  /**
   * Map of platform-id → which env vars must be set for the Connect
   * button to actually complete OAuth. The query below uses this to
   * mark each tile `available: true | false` so the UI can either
   * gate the button or show a "Coming soon" badge instead of taking
   * the user to a 404.
   */
  // (intentionally local — not exported; kept next to the consumer)

  /** List all supported e-commerce platforms with their connection details + capability matrix */
  ecommercePlatforms: protectedProcedure.query(() => {
    const ecommerceAvailability: Record<string, boolean> = {
      shopify: !!ENV.shopifyPartnerClientId && !!ENV.shopifyPartnerClientSecret,
      etsy: !!ENV.etsyApiKey && !!ENV.etsySharedSecret,
      ebay: !!ENV.ebayAppId && !!ENV.ebayCertId,
      amazon: !!ENV.amazonSpClientId && !!ENV.amazonSpClientSecret,
      tiktok_shop: !!ENV.tiktokAppId && !!ENV.tiktokClientSecret,
      walmart: false, // adapter scaffolded, no OAuth wired yet
      woocommerce: true, // API-key based, no shared OAuth required
    };
    const matrix = getEcommerceCapabilityMatrix();
    return Object.entries(ECOMMERCE_PLATFORMS).map(([id, platform]) => ({
      id,
      name: platform.name,
      icon: platform.icon,
      color: platform.color,
      connectionType: platform.connectionType,
      description: platform.description,
      capabilities: platform.capabilities,
      requiredFields: "requiredFields" in platform ? platform.requiredFields : undefined,
      available: ecommerceAvailability[id] ?? false,
      // Structured per-integration capability + performance matrix.
      // Bots branch on this; UI shows the strengths/limitations on the
      // connect tile so users see what each integration actually does.
      capabilityMatrix: matrix[id] ?? null,
    }));
  }),

  /** List all supported social media platforms */
  socialPlatforms: protectedProcedure.query(() => {
    const socialAvailability: Record<string, boolean> = {
      meta: !!ENV.metaAppId && !!ENV.metaAppSecret,
      instagram: !!ENV.metaAppId && !!ENV.metaAppSecret,
      tiktok: !!ENV.tiktokClientKey && !!ENV.tiktokClientSecret,
      twitter: !!ENV.twitterClientId && !!ENV.twitterClientSecret,
      pinterest: !!ENV.pinterestAppId && !!ENV.pinterestAppSecret,
      gmail: !!ENV.googleClientId && !!ENV.googleClientSecret,
    };
    const matrix = getSocialCapabilityMatrix();
    return Object.entries(SOCIAL_PLATFORMS).map(([id, platform]) => ({
      id,
      name: platform.name,
      icon: platform.icon,
      color: platform.color,
      connectionType: platform.connectionType,
      description: platform.description,
      capabilities: platform.capabilities,
      available: socialAvailability[id] ?? false,
      // Structured per-integration capability + performance matrix.
      capabilityMatrix: matrix[id] ?? null,
    }));
  }),

  /**
   * Combined capability matrix for every supported integration.
   * Single endpoint for callers (workflows, status page, integration
   * detail UI) that need the matrix without the connection detail.
   */
  capabilityMatrix: protectedProcedure.query(() => {
    return {
      ecommerce: getEcommerceCapabilityMatrix(),
      social: getSocialCapabilityMatrix(),
    };
  }),

  /** Org's e-commerce platform credentials */
  listCredentials: orgProcedure.query(async ({ ctx }) => {
    return db.getPlatformCredentialsByOrg(ctx.org.id);
  }),

  /** Org's social media accounts */
  listSocialAccounts: orgProcedure.query(async ({ ctx }) => {
    return db.getSocialAccountsByOrg(ctx.org.id);
  }),

  /** Connected-platform summary for the active org's dashboard */
  connectionSummary: orgProcedure.query(async ({ ctx }) => {
    return db.getConnectedPlatformSummaryByOrg(ctx.org.id);
  }),

  /** Connect an e-commerce platform via API keys (WooCommerce, Walmart) */
  connectWithApiKey: orgProcedure
    .input(z.object({
      platform: z.string(),
      storeId: z.number(),
      credentials: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the store belongs to the active org. A user in two orgs
      // could otherwise call this from Org B and reach into Org A.
      const store = await db.getStoreById(input.storeId);
      if (!store || store.orgId !== ctx.org.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }

      const platformConfig = ECOMMERCE_PLATFORMS[input.platform as keyof typeof ECOMMERCE_PLATFORMS];
      if (!platformConfig || platformConfig.connectionType !== "api_key") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Platform does not support API key connection" });
      }

      const cred = await db.withTransaction(async (tx) => {
        const createdCredential = await db.createPlatformCredential({
          orgId: store.orgId,
          userId: ctx.user.id,
          storeId: input.storeId,
          platform: input.platform,
          accessToken: JSON.stringify(input.credentials),
          status: "active",
          metadata: input.credentials,
        }, tx);

        await db.updateStore(input.storeId, { status: "active" }, tx);
        await db.createAgentTask({
          agentType: "architect",
          taskType: "platform_connected",
          title: `Connected ${platformConfig.name} store "${store.name}"`,
          description: `API key credentials saved for ${platformConfig.name}`,
          status: "completed",
          storeId: input.storeId,
        }, tx);

        return createdCredential;
      });

      return { credentialId: cred.id };
    }),

  /** Connect a social media account (stores OAuth token after redirect) */
  connectSocialAccount: protectedProcedure
    .input(z.object({
      platform: z.enum(["meta", "instagram", "tiktok", "twitter", "pinterest", "google_ads", "gmail"]),
      accountName: z.string().optional(),
      accountId: z.string().optional(),
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      tokenExpiresAt: z.date().optional(),
      scopes: z.string().optional(),
      profileUrl: z.string().optional(),
      profileImageUrl: z.string().optional(),
      metadata: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const platformName = SOCIAL_PLATFORMS[input.platform]?.name || input.platform;
      // Social accounts go into the user's currently-active org. We
      // can't read ctx.org here because this stays on protectedProcedure
      // for backward compat with the manual-token flow; fall back to
      // user.currentOrgId (always populated by migration 0020).
      const orgId = ctx.user.currentOrgId
        ?? (await db.ensurePersonalOrg(ctx.user.id)).id;
      const result = await db.withTransaction(async (tx) => {
        const createdAccount = await db.createSocialAccount({
          orgId,
          userId: ctx.user.id,
          platform: input.platform,
          accountName: input.accountName,
          accountId: input.accountId,
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          tokenExpiresAt: input.tokenExpiresAt,
          scopes: input.scopes,
          profileUrl: input.profileUrl,
          profileImageUrl: input.profileImageUrl,
          status: "active",
          metadata: input.metadata,
        }, tx);
        await db.createAgentTask({
          agentType: "social",
          taskType: "social_connected",
          title: `Connected ${platformName} account${input.accountName ? ` "${input.accountName}"` : ""}`,
          description: `Social media account linked for content publishing`,
          status: "completed",
        }, tx);
        return createdAccount;
      });

      return { id: result.id };
    }),

  /** Disconnect a platform credential */
  disconnectCredential: orgProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cred = await db.getPlatformCredentialById(input.id);
      if (!cred || cred.orgId !== ctx.org.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Credential not found" });
      }
      await db.withTransaction(async (tx) => {
        await db.deletePlatformCredential(input.id, tx);
        if (cred.storeId) {
          await db.updateStore(cred.storeId, { status: "paused" }, tx);
        }
        await db.createAgentTask({
          agentType: "architect",
          taskType: "platform_disconnected",
          title: `Disconnected ${cred.platform} credential`,
          status: "completed",
          storeId: cred.storeId ?? undefined,
        }, tx);
      });

      return { success: true };
    }),

  /** Disconnect a social media account */
  disconnectSocialAccount: orgProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.getSocialAccountById(input.id);
      if (!account || account.orgId !== ctx.org.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Social account not found" });
      }
      const platformName = SOCIAL_PLATFORMS[account.platform]?.name || account.platform;
      await db.withTransaction(async (tx) => {
        await db.deleteSocialAccount(input.id, tx);
        await db.createAgentTask({
          agentType: "social",
          taskType: "social_disconnected",
          title: `Disconnected ${platformName} account${account.accountName ? ` "${account.accountName}"` : ""}`,
          status: "completed",
        }, tx);
      });

      return { success: true };
    }),

  /** Check health of a platform credential (verify token is still valid) */
  checkCredentialHealth: orgProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cred = await db.getPlatformCredentialById(input.id);
      if (!cred || cred.orgId !== ctx.org.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Credential not found" });
      }

      // Check if token is expired
      let status: "active" | "expired" | "error" = "active";
      if (cred.tokenExpiresAt && new Date(cred.tokenExpiresAt) < new Date()) {
        status = "expired";
      }

      await db.updatePlatformCredential(input.id, {
        lastHealthCheck: new Date(),
        status,
      });

      return { status, lastChecked: new Date() };
    }),

  /** Generate OAuth URL for a platform (for platforms that support OAuth) */
  generateOAuthUrl: protectedProcedure
    .input(z.object({
      platform: z.string(),
      storeId: z.number().optional(),
      origin: z.string(),
      shopDomain: z.string().optional(), // Required for Shopify
    }))
    .mutation(async ({ ctx, input }) => {
      // For Shopify, delegate to the existing Shopify OAuth flow
      if (input.platform === "shopify") {
        if (!input.shopDomain || !input.storeId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify requires shopDomain and storeId" });
        }
        const clientId = ENV.shopifyPartnerClientId;
        if (!clientId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Shopify Partner credentials not configured" });
        }
        let shop = input.shopDomain.trim().toLowerCase();
        if (!shop.includes(".")) shop = `${shop}.myshopify.com`;
        shop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
        const installUrl = `${input.origin}/api/shopify/install?shop=${encodeURIComponent(shop)}&storeId=${input.storeId}`;
        return { url: installUrl, platform: "shopify" };
      }

      // For other OAuth platforms, return the OAuth authorization URL
      // In production, each platform would need its own app credentials stored as secrets
      const platformConfig = ECOMMERCE_PLATFORMS[input.platform as keyof typeof ECOMMERCE_PLATFORMS];
      if (!platformConfig) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown platform: ${input.platform}` });
      }
      if (platformConfig.connectionType !== "oauth") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${platformConfig.name} uses API key connection, not OAuth` });
      }

      // Resolve the correct client ID for each e-commerce platform from ENV
      const ecomClientIdMap: Record<string, string> = {
        etsy: ENV.etsyApiKey,
        amazon: ENV.amazonSpClientId,
        ebay: ENV.ebayAppId,
        tiktok_shop: ENV.tiktokAppId || ENV.tiktokClientKey,
      };
      const ecomClientId = ecomClientIdMap[input.platform];
      if (!ecomClientId) {
        return {
          url: null,
          platform: input.platform,
          message: `${platformConfig.name} OAuth integration requires app credentials. Go to Settings > Secrets to add your ${platformConfig.name} API credentials, then reconnect.`,
          setupRequired: true,
        };
      }

      // Generate CSRF state parameter with origin encoded
      const crypto = await import("crypto");
      const state = crypto.randomBytes(24).toString("hex");
      const redirectUri = `${input.origin}/api/ecommerce/oauth/callback`;
      const scopes = platformConfig.oauthConfig.scopes;

      // For Etsy, generate PKCE code_challenge (RFC 7636: S256)
      let url: string;
      let codeVerifier: string | undefined;
      if (input.platform === "etsy") {
        codeVerifier = crypto.randomBytes(32).toString("base64url");
        // RFC 7636 requires code_verifier to be 43-128 characters
        if (codeVerifier.length < 43 || codeVerifier.length > 128) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PKCE code_verifier generation failed: invalid length" });
        }
        const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
        url = `https://www.etsy.com/oauth/connect?response_type=code&client_id=${ecomClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      } else {
        // Generic e-commerce OAuth URL (Amazon, eBay, TikTok Shop)
        url = platformConfig.oauthConfig.authUrl("", ecomClientId, scopes, redirectUri, state);
      }

      await db.createOAuthStateToken({
        state,
        flowType: "ecommerce",
        userId: ctx.user.id,
        platform: input.platform,
        storeId: input.storeId,
        origin: input.origin,
        codeVerifier,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      return { url, platform: input.platform };
    }),

  /** Generate OAuth URL for a social media platform */
  generateSocialOAuthUrl: protectedProcedure
    .input(z.object({
      platform: z.enum(["meta", "instagram", "tiktok", "twitter", "pinterest", "google_ads", "gmail"]),
      origin: z.string(),
      returnTo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const platformConfig = SOCIAL_PLATFORMS[input.platform];
      if (!platformConfig) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown social platform: ${input.platform}` });
      }

      // Resolve the correct client ID for each platform from ENV
      const clientIdMap: Record<string, string> = {
        meta: ENV.metaClientId || ENV.metaAppId,
        instagram: ENV.metaClientId || ENV.metaAppId, // Instagram uses Meta OAuth
        tiktok: ENV.tiktokClientKey,
        twitter: ENV.twitterClientId,
        pinterest: ENV.pinterestAppId,
        google_ads: ENV.googleAdsClientId,
        gmail: ENV.googleClientId,
      };

      const clientId = clientIdMap[input.platform];
      if (!clientId) {
        return {
          url: null,
          platform: input.platform,
          message: `${platformConfig.name} OAuth integration requires app credentials. Add your ${platformConfig.name} App ID and Secret in Settings > Secrets to enable this connection.`,
          setupRequired: true,
          setupInstructions: getSetupInstructions(input.platform),
        };
      }

      // Generate a random state parameter for CSRF protection.
      // Context is persisted in the database so callbacks survive process restarts.
      const crypto = await import("crypto");
      const state = crypto.randomBytes(24).toString("hex");

      await db.createOAuthStateToken({
        state,
        flowType: "social",
        userId: ctx.user.id,
        platform: input.platform,
        origin: input.origin,
        returnTo: input.returnTo,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // Build the redirect URI — callback endpoint on our server
      const redirectUri = `${input.origin}/api/social/oauth/callback`;
      const scopes = platformConfig.oauthConfig.scopes;

      // Generate the real OAuth authorization URL
      const url = platformConfig.oauthConfig.authUrl(clientId, scopes, redirectUri, state);

      return {
        url,
        platform: input.platform,
        message: null,
        setupRequired: false,
      };
    }),
});

function getSetupInstructions(platform: string): string {
  const instructions: Record<string, string> = {
    meta: "1. Go to developers.facebook.com\n2. Create a new app (Business type)\n3. Add Facebook Login product\n4. Copy App ID and App Secret\n5. Add them as META_APP_ID and META_APP_SECRET in Shop_a_Bot Settings > Secrets",
    instagram: "Instagram Business accounts are connected through Meta. Set up Meta integration first, then select your Instagram Business account.",
    tiktok: "1. Go to developers.tiktok.com\n2. Create a new app\n3. Add Login Kit and Content Posting API\n4. Copy Client Key and Client Secret\n5. Add them as TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Settings > Secrets",
    twitter: "1. Go to developer.twitter.com\n2. Create a new project and app\n3. Enable OAuth 2.0 with PKCE\n4. Copy Client ID and Client Secret\n5. Add them as TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET in Settings > Secrets",
    pinterest: "1. Go to developers.pinterest.com\n2. Create a new app\n3. Request access to Pins and Boards scopes\n4. Copy App ID and App Secret\n5. Add them as PINTEREST_APP_ID and PINTEREST_APP_SECRET in Settings > Secrets",
    google_ads: "1. Go to console.cloud.google.com\n2. Create OAuth 2.0 credentials\n3. Enable Google Ads API\n4. Copy Client ID and Client Secret\n5. Add them as GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET in Settings > Secrets",
  };
  return instructions[platform] || "Contact support for setup instructions.";
}
