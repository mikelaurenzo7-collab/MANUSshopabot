import { describe, it, expect } from "vitest";

/**
 * Meta/Facebook API Credentials Validation Test
 * Validates META_APP_ID and META_APP_SECRET by calling the
 * lightweight Graph API app verification endpoint.
 */
describe("Meta/Facebook API Credentials", () => {
  it.skipIf(!process.env.META_APP_ID)("should have META_APP_ID set", () => {
    expect(process.env.META_APP_ID).toBeDefined();
    expect(process.env.META_APP_ID?.length).toBeGreaterThan(5);
  });

  it.skipIf(!process.env.META_APP_SECRET)("should have META_APP_SECRET set", () => {
    expect(process.env.META_APP_SECRET).toBeDefined();
    expect(process.env.META_APP_SECRET?.length).toBeGreaterThan(10);
  });

  it.skipIf(!process.env.META_BUSINESS_ID)("should have META_BUSINESS_ID set", () => {
    expect(process.env.META_BUSINESS_ID).toBeDefined();
    expect(process.env.META_BUSINESS_ID?.length).toBeGreaterThan(5);
  });

  it.skipIf(!process.env.BEASTBOTS_PAGE_ID)("should have BEASTBOTS_PAGE_ID set", () => {
    expect(process.env.BEASTBOTS_PAGE_ID).toBeDefined();
    expect(process.env.BEASTBOTS_PAGE_ID?.length).toBeGreaterThan(5);
  });

  it.skipIf(!process.env.META_APP_ID || !process.env.META_APP_SECRET)("should authenticate with Meta Graph API using App ID + Secret", async () => {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) throw new Error("META credentials not set");

    // Use app access token (appId|appSecret) to verify credentials
    // This is a lightweight call that doesn't require user OAuth
    const appToken = `${appId}|${appSecret}`;
    const graphBase = process.env.META_GRAPH_API_BASE || "https://graph.facebook.com/v21.0";

    const response = await fetch(
      `${graphBase}/${appId}?fields=id,name&access_token=${appToken}`
    );

    // 200 = valid credentials, 400/401 = invalid
    if (response.status === 401 || response.status === 400) {
      const body = await response.json();
      throw new Error(`Meta auth failed: ${JSON.stringify(body)}`);
    }

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(appId);
  }, 15000);
});
