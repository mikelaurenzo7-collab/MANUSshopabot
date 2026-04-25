import { describe, it, expect } from "vitest";

/**
 * Twitter OAuth 2.0 Credentials Validation Test
 *
 * Skipped automatically when TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET are not
 * set in the environment so that local dev and CI without Twitter credentials
 * do not produce false-negative failures. Matches the pattern used by the
 * other credential validation test suites (Twitter v1, Meta, Pinterest, Etsy).
 */
const hasCreds = Boolean(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET);

describe("Twitter OAuth 2.0 Credentials", () => {
  it.skipIf(!process.env.TWITTER_CLIENT_ID)("should have TWITTER_CLIENT_ID set", () => {
    const clientId = process.env.TWITTER_CLIENT_ID;
    expect(clientId).toBeDefined();
    expect(clientId!.length).toBeGreaterThan(10);
  });

  it.skipIf(!process.env.TWITTER_CLIENT_SECRET)("should have TWITTER_CLIENT_SECRET set", () => {
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    expect(clientSecret).toBeDefined();
    expect(clientSecret!.length).toBeGreaterThan(10);
  });

  it.skipIf(!hasCreds)("should be able to get OAuth 2.0 token from Twitter", async () => {
    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      // Belt-and-suspenders: skipIf above already gates this branch.
      return;
    }

    // Test OAuth 2.0 client credentials grant
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    // 200 means credentials are valid
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.access_token).toBeDefined();
  });
});
