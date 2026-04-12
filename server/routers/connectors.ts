import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import * as db from "../db";

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
 * Social media platform configurations for the Hype-Man agent.
 */
const SOCIAL_PLATFORMS = {
  meta: {
    name: "Meta (Facebook & Instagram)",
    icon: "📘",
    color: "#1877F2",
    connectionType: "oauth" as const,
    description: "Manage Facebook Pages and Instagram Business accounts",
    oauthConfig: {
      authUrl: (clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`,
      tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
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
      authUrl: (clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`,
      tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
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
  linkedin: {
    name: "LinkedIn",
    icon: "💼",
    color: "#0A66C2",
    connectionType: "oauth" as const,
    description: "Post to LinkedIn company pages",
    oauthConfig: {
      authUrl: (clientId: string, scopes: string, redirectUri: string, state: string) =>
        `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`,
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      scopes: "w_member_social r_liteprofile r_organization_social w_organization_social",
    },
    capabilities: ["company_posting", "analytics"],
  },
};

export const connectorsRouter = router({
  // ─── E-Commerce Platform Connectors ──────────────────────────────────────

  /** List all supported e-commerce platforms with their connection details */
  ecommercePlatforms: protectedProcedure.query(() => {
    return Object.entries(ECOMMERCE_PLATFORMS).map(([id, platform]) => ({
      id,
      name: platform.name,
      icon: platform.icon,
      color: platform.color,
      connectionType: platform.connectionType,
      description: platform.description,
      capabilities: platform.capabilities,
      requiredFields: "requiredFields" in platform ? platform.requiredFields : undefined,
    }));
  }),

  /** List all supported social media platforms */
  socialPlatforms: protectedProcedure.query(() => {
    return Object.entries(SOCIAL_PLATFORMS).map(([id, platform]) => ({
      id,
      name: platform.name,
      icon: platform.icon,
      color: platform.color,
      connectionType: platform.connectionType,
      description: platform.description,
      capabilities: platform.capabilities,
    }));
  }),

  /** Get user's platform credentials (e-commerce) */
  listCredentials: protectedProcedure.query(async ({ ctx }) => {
    return db.getPlatformCredentials(ctx.user.id);
  }),

  /** Get user's social media accounts */
  listSocialAccounts: protectedProcedure.query(async ({ ctx }) => {
    return db.getSocialAccounts(ctx.user.id);
  }),

  /** Get connected platform summary for dashboard */
  connectionSummary: protectedProcedure.query(async ({ ctx }) => {
    return db.getConnectedPlatformSummary(ctx.user.id);
  }),

  /** Connect an e-commerce platform via API keys (WooCommerce, Walmart) */
  connectWithApiKey: protectedProcedure
    .input(z.object({
      platform: z.string(),
      storeId: z.number(),
      credentials: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify store ownership
      const store = await db.getStoreById(input.storeId);
      if (!store || store.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }

      const platformConfig = ECOMMERCE_PLATFORMS[input.platform as keyof typeof ECOMMERCE_PLATFORMS];
      if (!platformConfig || platformConfig.connectionType !== "api_key") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Platform does not support API key connection" });
      }

      // Store credentials
      const cred = await db.createPlatformCredential({
        userId: ctx.user.id,
        storeId: input.storeId,
        platform: input.platform,
        accessToken: JSON.stringify(input.credentials), // Store as JSON for multi-field API keys
        status: "active",
        metadata: input.credentials,
      });

      // Update store status
      await db.updateStore(input.storeId, { status: "active" });

      // Log the connection
      await db.createAgentTask({
        agentType: "architect",
        taskType: "platform_connected",
        title: `Connected ${platformConfig.name} store "${store.name}"`,
        description: `API key credentials saved for ${platformConfig.name}`,
        status: "completed",
        storeId: input.storeId,
      });

      return { credentialId: cred.id };
    }),

  /** Connect a social media account (stores OAuth token after redirect) */
  connectSocialAccount: protectedProcedure
    .input(z.object({
      platform: z.enum(["meta", "instagram", "tiktok", "twitter", "pinterest", "google_ads", "linkedin"]),
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
      const result = await db.createSocialAccount({
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
      });

      // Log the connection
      const platformName = SOCIAL_PLATFORMS[input.platform]?.name || input.platform;
      await db.createAgentTask({
        agentType: "hypeman",
        taskType: "social_connected",
        title: `Connected ${platformName} account${input.accountName ? ` "${input.accountName}"` : ""}`,
        description: `Social media account linked for content publishing`,
        status: "completed",
      });

      return { id: result.id };
    }),

  /** Disconnect a platform credential */
  disconnectCredential: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cred = await db.getPlatformCredentialById(input.id);
      if (!cred || cred.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Credential not found" });
      }
      await db.deletePlatformCredential(input.id);

      // If linked to a store, update store status
      if (cred.storeId) {
        await db.updateStore(cred.storeId, { status: "paused" });
      }

      await db.createAgentTask({
        agentType: "architect",
        taskType: "platform_disconnected",
        title: `Disconnected ${cred.platform} credential`,
        status: "completed",
        storeId: cred.storeId ?? undefined,
      });

      return { success: true };
    }),

  /** Disconnect a social media account */
  disconnectSocialAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.getSocialAccountById(input.id);
      if (!account || account.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Social account not found" });
      }
      await db.deleteSocialAccount(input.id);

      const platformName = SOCIAL_PLATFORMS[account.platform]?.name || account.platform;
      await db.createAgentTask({
        agentType: "hypeman",
        taskType: "social_disconnected",
        title: `Disconnected ${platformName} account${account.accountName ? ` "${account.accountName}"` : ""}`,
        status: "completed",
      });

      return { success: true };
    }),

  /** Check health of a platform credential (verify token is still valid) */
  checkCredentialHealth: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cred = await db.getPlatformCredentialById(input.id);
      if (!cred || cred.userId !== ctx.user.id) {
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

      // Return a placeholder URL — in production, each platform's client ID would be stored as a secret
      // and the real OAuth URL would be generated here
      return {
        url: null,
        platform: input.platform,
        message: `${platformConfig.name} OAuth integration requires app credentials. Go to Settings > Secrets to add your ${platformConfig.name} API credentials, then reconnect.`,
        setupRequired: true,
      };
    }),

  /** Generate OAuth URL for a social media platform */
  generateSocialOAuthUrl: protectedProcedure
    .input(z.object({
      platform: z.enum(["meta", "instagram", "tiktok", "twitter", "pinterest", "google_ads", "linkedin"]),
      origin: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const platformConfig = SOCIAL_PLATFORMS[input.platform];
      if (!platformConfig) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown social platform: ${input.platform}` });
      }

      // Return setup instructions — in production, each platform's OAuth app credentials
      // would be stored as secrets and the real OAuth URL would be generated
      return {
        url: null,
        platform: input.platform,
        message: `${platformConfig.name} OAuth integration requires app credentials. Add your ${platformConfig.name} App ID and Secret in Settings > Secrets to enable this connection.`,
        setupRequired: true,
        setupInstructions: getSetupInstructions(input.platform),
      };
    }),
});

function getSetupInstructions(platform: string): string {
  const instructions: Record<string, string> = {
    meta: "1. Go to developers.facebook.com\n2. Create a new app (Business type)\n3. Add Facebook Login product\n4. Copy App ID and App Secret\n5. Add them as META_APP_ID and META_APP_SECRET in Beast Bots Settings > Secrets",
    instagram: "Instagram Business accounts are connected through Meta. Set up Meta integration first, then select your Instagram Business account.",
    tiktok: "1. Go to developers.tiktok.com\n2. Create a new app\n3. Add Login Kit and Content Posting API\n4. Copy Client Key and Client Secret\n5. Add them as TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Settings > Secrets",
    twitter: "1. Go to developer.twitter.com\n2. Create a new project and app\n3. Enable OAuth 2.0 with PKCE\n4. Copy Client ID and Client Secret\n5. Add them as TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET in Settings > Secrets",
    pinterest: "1. Go to developers.pinterest.com\n2. Create a new app\n3. Request access to Pins and Boards scopes\n4. Copy App ID and App Secret\n5. Add them as PINTEREST_APP_ID and PINTEREST_APP_SECRET in Settings > Secrets",
    google_ads: "1. Go to console.cloud.google.com\n2. Create OAuth 2.0 credentials\n3. Enable Google Ads API\n4. Copy Client ID and Client Secret\n5. Add them as GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET in Settings > Secrets",
    linkedin: "1. Go to linkedin.com/developers\n2. Create a new app\n3. Request Marketing Developer Platform access\n4. Copy Client ID and Client Secret\n5. Add them as LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in Settings > Secrets",
  };
  return instructions[platform] || "Contact support for setup instructions.";
}
