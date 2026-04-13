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

  // Google Ads
  googleAdsClientId: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
  googleAdsClientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
  googleAdsDeveloperToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",

  // Facebook Page ID for bot notifications
  beastbotsPageId: process.env.BEASTBOTS_PAGE_ID ?? "",

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
};
