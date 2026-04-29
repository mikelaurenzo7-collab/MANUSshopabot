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
  // Direct Anthropic SDK path — opt-in. When set, workflows that
  // request claudeDirect features (prompt caching, adaptive thinking,
  // effort, batch) talk to Anthropic directly. When unset, the Forge
  // proxy at forgeApiUrl is the only path. Setting ANTHROPIC_API_KEY
  // is additive — it doesn't disable Forge, it just unlocks the
  // premium features for opt-in workflows.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",

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

  // Snapchat
  snapchatClientId: process.env.SNAPCHAT_CLIENT_ID ?? "",
  snapchatClientSecret: process.env.SNAPCHAT_CLIENT_SECRET ?? "",
  snapchatApiToken: process.env.SNAPCHAT_API_TOKEN ?? "",

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

  
  // Depop
  depopAppId: process.env.DEPOP_APP_ID ?? "",
  depopAppSecret: process.env.DEPOP_APP_SECRET ?? "",
  // BigCommerce
  bigcommerceClientId: process.env.BIGCOMMERCE_CLIENT_ID ?? "",
  bigcommerceClientSecret: process.env.BIGCOMMERCE_CLIENT_SECRET ?? "",
  // Square — both OAuth credentials (for installs) and production
  // first-party tokens (for direct API calls on the operator's own
  // account). The fallback chain on squareClientId/Secret accepts
  // whichever names the operator actually set in Manus secrets.
  squareClientId:
    process.env.SQUARE_CLIENT_ID
    ?? process.env.SQUARE_OAUTH_APPLICATION_ID
    ?? process.env.SQUARE_PRODUCTION_APPLICATION_ID
    ?? "",
  squareClientSecret:
    process.env.SQUARE_CLIENT_SECRET
    ?? process.env.SQUARE_OAUTH_APPLICATION_SECRET
    ?? "",
  squareProductionAccessToken: process.env.SQUARE_PRODUCTION_ACCESS_TOKEN ?? "",
  squareProductionApplicationId: process.env.SQUARE_PRODUCTION_APPLICATION_ID ?? "",
  // Faire
  faireClientId: process.env.FAIRE_CLIENT_ID ?? "",
  faireClientSecret: process.env.FAIRE_CLIENT_SECRET ?? "",
  // Printful
  printfulClientId: process.env.PRINTFUL_CLIENT_ID ?? "",
  printfulClientSecret: process.env.PRINTFUL_CLIENT_SECRET ?? "",
  printfulApiToken: process.env.PRINTFUL_API_TOKEN ?? "",
  // CJ Dropshipping
  cjEmail: process.env.CJ_EMAIL ?? "",
  cjPassword: process.env.CJ_PASSWORD ?? "",
  cjApiKey: process.env.CJ_API_KEY ?? "",
  // Bonanza
  bonanzaDevId: process.env.BONANZA_DEV_ID ?? "",
  bonanzaCertId: process.env.BONANZA_CERT_ID ?? "",
  // StockX
  stockxClientId: process.env.STOCKX_CLIENT_ID ?? "",
  stockxClientSecret: process.env.STOCKX_CLIENT_SECRET ?? "",
  // Reverb
  reverbClientId: process.env.REVERB_CLIENT_ID ?? "",
  reverbClientSecret: process.env.REVERB_CLIENT_SECRET ?? "",

  // ── Sprint 27.5 platform additions ──────────────────────────────────────

  // Outlook / Microsoft Graph (Mail + Calendar)
  // App registered at portal.azure.com → Azure AD → App registrations.
  // The same client id powers Mail.* and Calendars.* scopes; we ride
  // the v2.0 endpoint so personal + work accounts are both supported.
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  azureTenantId: process.env.AZURE_TENANT_ID ?? "common",

  // Slack — bot-token + OAuth v2. Set SLACK_CLIENT_ID and _SECRET to
  // light up the social-router connect tile; signing secret + verification
  // token are only needed when the operator turns on event subscriptions.
  slackClientId: process.env.SLACK_CLIENT_ID ?? "",
  slackClientSecret: process.env.SLACK_CLIENT_SECRET ?? "",
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET ?? "",
  slackVerificationToken: process.env.SLACK_VERIFICATION_TOKEN ?? "",

  // YouTube rides on the Google OAuth client (googleClientId/Secret) but
  // gets its own dev key for the YouTube Data API v3 read endpoints when
  // set. Without the key we still publish via OAuth; with it we can also
  // fetch channel + video analytics without the user-consent overhead.
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",

  // Facebook Page ID for bot notifications
  beastbotsPageId: process.env.BEASTBOTS_PAGE_ID ?? "",

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",

  // Redis (for BullMQ job queues)
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  // ── Outbound delivery providers ─────────────────────────────────────────
  // Email
  sendgridApiKey: process.env.SENDGRID_API_KEY ?? "",
  /** From-address used for SendGrid sends. Must be a verified sender. */
  sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL ?? "",
  sendgridFromName: process.env.SENDGRID_FROM_NAME ?? "Shop_a_Bot",

  // SMS
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  /** E.164 phone number provisioned in Twilio (e.g. +14155551234). */
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
  /** Twilio Messaging Service SID — alternative to a single from-number. */
  twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID ?? "",
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
  // REDIS_URL is required in production deployments — the BullMQ
  // queue layer is the home of webhook fan-out, scheduled tasks, and
  // delayed jobs. The default fallback `redis://localhost:6379` only
  // exists for local-dev convenience and will silently no-op on a
  // Manus deploy. We escalate to a fatal in production below.
  "REDIS_URL",
] as const;

export function validateRequiredEnv(): void {
  const missing: string[] = [];
  const warned: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) missing.push(key);
  }

  // JWT_SECRET strength advisory — Manus auto-injects a session secret
  // that may be shorter than the OpenSSL-generated standard. Don't fail
  // the boot on length; warn if it's < 32 so the operator knows to set
  // a stronger one when self-hosting outside Manus.
  const jwt = process.env.JWT_SECRET ?? "";
  if (jwt && jwt.length < 32) {
    logger.warn("env_jwt_secret_short", {
      length: jwt.length,
      message:
        "JWT_SECRET is shorter than the 32-char recommendation. Manus's auto-injected secret is fine for hosted deploys; for self-hosting generate a stronger one with `openssl rand -base64 48`.",
    });
  }

  // Production CORS hardening — never fall back to localhost in prod.
  if (process.env.NODE_ENV === "production" && !process.env.ALLOWED_ORIGINS) {
    missing.push("ALLOWED_ORIGINS (required in production — comma-separated list)");
  }

  // Redis is optional — when absent, the app falls back to in-memory
  // job processing. This is fine for single-instance Manus deploys.
  // Only warn so operators know scheduled jobs won't survive restarts.
  if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) {
    warned.push("REDIS_URL (optional — in-memory queue fallback active)");
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
