import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("ENV wiring — all platform secrets registered", () => {
  // Meta / Facebook / Instagram
  it("should have metaAppId registered in ENV", () => {
    expect(ENV).toHaveProperty("metaAppId");
    expect(typeof ENV.metaAppId).toBe("string");
  });

  it("should have metaAppSecret registered in ENV", () => {
    expect(ENV).toHaveProperty("metaAppSecret");
    expect(typeof ENV.metaAppSecret).toBe("string");
  });

  it("should have metaClientId registered in ENV", () => {
    expect(ENV).toHaveProperty("metaClientId");
    expect(typeof ENV.metaClientId).toBe("string");
  });

  it("should have metaClientSecret registered in ENV", () => {
    expect(ENV).toHaveProperty("metaClientSecret");
    expect(typeof ENV.metaClientSecret).toBe("string");
  });

  it("should have metaBusinessId registered in ENV", () => {
    expect(ENV).toHaveProperty("metaBusinessId");
    expect(typeof ENV.metaBusinessId).toBe("string");
  });

  it("should have metaGraphApiBase registered in ENV with valid default", () => {
    expect(ENV).toHaveProperty("metaGraphApiBase");
    expect(ENV.metaGraphApiBase).toContain("graph.facebook.com");
  });

  it("should have metaOAuthAuthUrl registered in ENV with valid default", () => {
    expect(ENV).toHaveProperty("metaOAuthAuthUrl");
    expect(ENV.metaOAuthAuthUrl).toContain("facebook.com");
  });

  it("should have metaOAuthTokenUrl registered in ENV with valid default", () => {
    expect(ENV).toHaveProperty("metaOAuthTokenUrl");
    expect(ENV.metaOAuthTokenUrl).toContain("graph.facebook.com");
  });

  // TikTok
  it("should have tiktokAppId registered in ENV", () => {
    expect(ENV).toHaveProperty("tiktokAppId");
    expect(typeof ENV.tiktokAppId).toBe("string");
  });

  it("should have tiktokClientKey registered in ENV", () => {
    expect(ENV).toHaveProperty("tiktokClientKey");
    expect(typeof ENV.tiktokClientKey).toBe("string");
  });

  it("should have tiktokClientSecret registered in ENV", () => {
    expect(ENV).toHaveProperty("tiktokClientSecret");
    expect(typeof ENV.tiktokClientSecret).toBe("string");
  });

  // Twitter / X
  it("should have all 7 Twitter secrets registered in ENV", () => {
    expect(ENV).toHaveProperty("twitterApiKey");
    expect(ENV).toHaveProperty("twitterApiSecret");
    expect(ENV).toHaveProperty("twitterBearerToken");
    expect(ENV).toHaveProperty("twitterAccessToken");
    expect(ENV).toHaveProperty("twitterAccessTokenSecret");
    expect(ENV).toHaveProperty("twitterClientId");
    expect(ENV).toHaveProperty("twitterClientSecret");
  });

  // Pinterest
  it("should have pinterestAppId registered in ENV", () => {
    expect(ENV).toHaveProperty("pinterestAppId");
    expect(typeof ENV.pinterestAppId).toBe("string");
  });

  it("should have pinterestAccessToken registered in ENV", () => {
    expect(ENV).toHaveProperty("pinterestAccessToken");
    expect(typeof ENV.pinterestAccessToken).toBe("string");
  });

  // Etsy
  it("should have etsyApiKey and etsySharedSecret registered in ENV", () => {
    expect(ENV).toHaveProperty("etsyApiKey");
    expect(ENV).toHaveProperty("etsySharedSecret");
  });

  // eBay
  it("should have eBay credentials registered in ENV", () => {
    expect(ENV).toHaveProperty("ebayAppId");
    expect(ENV).toHaveProperty("ebayCertId");
    expect(ENV).toHaveProperty("ebayDevId");
  });

  // Amazon SP-API
  it("should have Amazon SP-API credentials registered in ENV", () => {
    expect(ENV).toHaveProperty("amazonSpClientId");
    expect(ENV).toHaveProperty("amazonSpClientSecret");
  });

  // Google Ads
  it("should have Google Ads credentials registered in ENV", () => {
    expect(ENV).toHaveProperty("googleAdsClientId");
    expect(ENV).toHaveProperty("googleAdsClientSecret");
    expect(ENV).toHaveProperty("googleAdsDeveloperToken");
  });

  // Shopify (already existed)
  it("should have Shopify Partner credentials registered in ENV", () => {
    expect(ENV).toHaveProperty("shopifyPartnerClientId");
    expect(ENV).toHaveProperty("shopifyPartnerClientSecret");
  });

  // Shop_a_Bot Page ID (env key stays BEASTBOTS_PAGE_ID for backward compat)
  it("should have beastbotsPageId registered in ENV", () => {
    expect(ENV).toHaveProperty("beastbotsPageId");
  });
});

describe("ENV wiring — total secret count", () => {
  it("should have at least 30 properties in ENV (all platform secrets + system)", () => {
    const keys = Object.keys(ENV);
    expect(keys.length).toBeGreaterThanOrEqual(30);
  });
});
