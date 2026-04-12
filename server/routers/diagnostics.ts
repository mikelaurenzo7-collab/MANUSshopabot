import { adminProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";

/**
 * Diagnostics router — admin-only endpoint to verify all platform credentials
 * are present in the environment. Returns a status report for each integration.
 */
export const diagnosticsRouter = router({
  credentialStatus: adminProcedure.query(() => {
    const checks = [
      // Core Platform
      { platform: "Shopify", key: "SHOPIFY_PARTNER_CLIENT_ID", value: ENV.shopifyPartnerClientId },
      { platform: "Shopify", key: "SHOPIFY_PARTNER_CLIENT_SECRET", value: ENV.shopifyPartnerClientSecret },
      // Meta / Facebook / Instagram
      { platform: "Meta", key: "META_APP_ID", value: ENV.metaAppId },
      { platform: "Meta", key: "META_APP_SECRET", value: ENV.metaAppSecret },
      { platform: "Meta", key: "META_CLIENT_ID", value: ENV.metaClientId },
      { platform: "Meta", key: "META_CLIENT_SECRET", value: ENV.metaClientSecret },
      { platform: "Meta", key: "META_BUSINESS_ID", value: ENV.metaBusinessId },
      { platform: "Meta", key: "BEASTBOTS_PAGE_ID", value: ENV.beastbotsPageId },
      // TikTok
      { platform: "TikTok", key: "TIKTOK_APP_ID", value: ENV.tiktokAppId },
      { platform: "TikTok", key: "TIKTOK_CLIENT_KEY", value: ENV.tiktokClientKey },
      { platform: "TikTok", key: "TIKTOK_CLIENT_SECRET", value: ENV.tiktokClientSecret },
      // Twitter / X
      { platform: "Twitter", key: "TWITTER_API_KEY", value: ENV.twitterApiKey },
      { platform: "Twitter", key: "TWITTER_API_SECRET", value: ENV.twitterApiSecret },
      { platform: "Twitter", key: "TWITTER_BEARER_TOKEN", value: ENV.twitterBearerToken },
      { platform: "Twitter", key: "TWITTER_ACCESS_TOKEN", value: ENV.twitterAccessToken },
      { platform: "Twitter", key: "TWITTER_ACCESS_TOKEN_SECRET", value: ENV.twitterAccessTokenSecret },
      { platform: "Twitter", key: "TWITTER_CLIENT_ID", value: ENV.twitterClientId },
      { platform: "Twitter", key: "TWITTER_CLIENT_SECRET", value: ENV.twitterClientSecret },
      // Pinterest
      { platform: "Pinterest", key: "PINTEREST_APP_ID", value: ENV.pinterestAppId },
      { platform: "Pinterest", key: "PINTEREST_APP_SECRET", value: ENV.pinterestAppSecret },
      { platform: "Pinterest", key: "PINTEREST_ACCESS_TOKEN", value: ENV.pinterestAccessToken },
      // Etsy
      { platform: "Etsy", key: "ETSY_API_KEY", value: ENV.etsyApiKey },
      { platform: "Etsy", key: "ETSY_SHARED_SECRET", value: ENV.etsySharedSecret },
      // eBay (optional — per-user)
      { platform: "eBay", key: "EBAY_APP_ID", value: ENV.ebayAppId },
      { platform: "eBay", key: "EBAY_CERT_ID", value: ENV.ebayCertId },
      // Amazon SP-API (optional — per-user)
      { platform: "Amazon", key: "AMAZON_SP_CLIENT_ID", value: ENV.amazonSpClientId },
      { platform: "Amazon", key: "AMAZON_SP_CLIENT_SECRET", value: ENV.amazonSpClientSecret },
      // Google Ads (optional)
      { platform: "Google Ads", key: "GOOGLE_ADS_CLIENT_ID", value: ENV.googleAdsClientId },
      { platform: "Google Ads", key: "GOOGLE_ADS_CLIENT_SECRET", value: ENV.googleAdsClientSecret },
    ];

    const results = checks.map(({ platform, key, value }) => ({
      platform,
      key,
      configured: Boolean(value && value.length > 0),
      // Mask the value for security — show first 4 chars + asterisks
      preview: value ? `${value.slice(0, 4)}${"*".repeat(Math.min(8, value.length - 4))}` : null,
    }));

    const configured = results.filter(r => r.configured).length;
    const missing = results.filter(r => !r.configured).length;

    return {
      summary: { total: results.length, configured, missing },
      results,
    };
  }),
});
