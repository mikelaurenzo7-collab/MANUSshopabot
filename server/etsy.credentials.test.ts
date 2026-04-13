import { describe, it, expect } from "vitest";

/**
 * Etsy API Credentials Validation Test
 * Validates ETSY_API_KEY by calling the lightweight GET /v3/application/openapi-ping endpoint
 * which only requires a valid API key (no OAuth token needed)
 */
describe("Etsy API Credentials", () => {
  it.skipIf(!process.env.ETSY_API_KEY)("should have ETSY_API_KEY set", () => {
    const key = process.env.ETSY_API_KEY;
    expect(key).toBeDefined();
    expect(key?.length).toBeGreaterThan(10);
  });

  it.skipIf(!process.env.ETSY_SHARED_SECRET)("should have ETSY_SHARED_SECRET set", () => {
    const secret = process.env.ETSY_SHARED_SECRET;
    expect(secret).toBeDefined();
    expect(secret?.length).toBeGreaterThanOrEqual(10);
  });

  it.skipIf(!process.env.ETSY_API_KEY)("should authenticate with Etsy Open API v3 ping endpoint", async () => {
    const apiKey = process.env.ETSY_API_KEY;
    if (!apiKey) throw new Error("ETSY_API_KEY not set");

    const response = await fetch("https://openapi.etsy.com/v3/application/openapi-ping", {
      headers: {
        "x-api-key": apiKey,
      },
    });

    // 200 = valid key, 401 = invalid key, 403 = key exists but no permission
    expect([200, 403]).toContain(response.status);

    if (response.status === 401) {
      const body = await response.json();
      throw new Error(`Etsy auth failed: ${JSON.stringify(body)}`);
    }

    if (response.status === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("application_id");
    }
  }, 15000);
});
