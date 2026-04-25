import { logger } from "./logger";

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  forgeModel: process.env.FORGE_LLM_MODEL ?? "gemini-2.5-flash",

  // Shopify Partner OAuth
  shopifyPartnerClientId: process.env.SHOPIFY_PARTNER_CLIENT_ID ?? "",
  shopifyPartnerClientSecret: process.env.SHOPIFY_PARTNER_CLIENT_SECRET ?? "",

  // Meta / Facebook / Instagram OAuth
  metaAppId: process.env.META_APP_ID ?? "",
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  metaClientId: process.env.META_CLIENT_ID ?? "",
  metaClientSecret: process.env.META_CLIENT_SECRET ?? "",
  metaBusinessId: process.env.META_BUSINESS_ID ?? "",
  metaGraphApiBase: process.env.META_GRAPH_API_BASE ?? "https://graph.facebook.com/v19.0",
  metaOAuthAuthUrl: process.env.META_OAUTH_AUTH_URL ?? "https://www.facebook.com/v19.0/dialog/oauth",
  metaOAuthTokenUrl: process.env.META_OAUTH_TOKEN_URL ?? "https://graph.facebook.com/v19.0/oauth/access_token",

  // TikTok (Social + Shop)
  tiktokAppId: process.env.TIKTOK_APP_ID ?? "",
  tiktokClientKey: process.env.TIKTOK_CLIENT_KEY ?? "",
  tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",

  // Twitter / X
  twitterApiKey: process.env.TWITTER_API_KEY ?? "",
  twitterApiSecret: process.env.TWITTER_API_SECRET ?? "",
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN ?? "",
  twitterAccessToken: process.env.TWITTER_ACCESS_TOKEN ?? "",
  twitterAccessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET ?? "",
  twitterClientId: process.env.TWITTER_CLIENT_ID ?? "",
  twitterClientSecret: process.env.TWITTER_CLIENT_SECRET ?? "",

  // Pinterest
  pinterestAppId: process.env.PINTEREST_APP_ID ?? "",
  pinterestAppSecret: process.env.PINTEREST_APP_SECRET ?? "",
  pinterestAccessToken: process.env.PINTEREST_ACCESS_TOKEN ?? "",

  // Etsy
  etsyApiKey: process.env.ETSY_API_KEY ?? "",
  etsySharedSecret: process.env.ETSY_SHARED_SECRET ?? "",

  // eBay
  ebayAppId: process.env.EBAY_APP_ID ?? "",
  ebayCertId: process.env.EBAY_CERT_ID ?? "",
  ebayDevId: process.env.EBAY_DEV_ID ?? "",

  // Amazon SP-API
  amazonSpClientId: process.env.AMAZON_SP_CLIENT_ID ?? "",
  amazonSpClientSecret: process.env.AMAZON_SP_CLIENT_SECRET ?? "",

  // Google OAuth (Gmail + Ads)
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleAdsClientId: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
  googleAdsClientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
  googleAdsDeveloperToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",

  // Facebook Page ID for bot notifications
  beastbotsPageId: process.env.BEASTBOTS_PAGE_ID ?? "",

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",

  // Redis (for BullMQ job queues)
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
};

// ─── Startup Validation ──────────────────────────────────────────────────
// Validates that critical environment variables are set BEFORE the server
// starts accepting traffic. Non-critical vars emit warnings instead of fatal.

const REQUIRED_VARS = [
  "DATABASE_URL",
  "JWT_SECRET",
] as const;

const RECOMMENDED_VARS = [
  "SHOPIFY_PARTNER_CLIENT_ID",
  "SHOPIFY_PARTNER_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

export function validateRequiredEnv(): void {
  const missing: string[] = [];
  const warned: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) missing.push(key);
  }

  for (const key of RECOMMENDED_VARS) {
    if (!process.env[key]) warned.push(key);
  }

  if (warned.length > 0) {
    logger.warn("env_validation_warnings", {
      message: `${warned.length} recommended env vars not set — some features will be unavailable`,
      missing: warned,
    });
  }

  if (missing.length > 0) {
    logger.error("env_validation_fatal", {
      message: `Missing ${missing.length} required env var(s) — server cannot start safely`,
      missing,
    });
    throw new Error(`[ENV] Missing required environment variables: ${missing.join(", ")}`);
  }

  logger.info("env_validation_passed", { required: REQUIRED_VARS.length, warnings: warned.length });
}
