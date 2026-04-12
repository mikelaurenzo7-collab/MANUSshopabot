import { describe, it, expect } from "vitest";

/**
 * Twitter/X API Credentials Validation Test
 * Validates that all Twitter credentials are set and the bearer token
 * can authenticate against the X API v2.
 */
describe("Twitter/X API Credentials", () => {
  it("should have TWITTER_API_KEY set", () => {
    const key = process.env.TWITTER_API_KEY;
    expect(key).toBeDefined();
    expect(key?.length).toBeGreaterThan(10);
  });

  it("should have TWITTER_API_SECRET set", () => {
    const secret = process.env.TWITTER_API_SECRET;
    expect(secret).toBeDefined();
    expect(secret?.length).toBeGreaterThan(10);
  });

  it("should have TWITTER_BEARER_TOKEN set", () => {
    const token = process.env.TWITTER_BEARER_TOKEN;
    expect(token).toBeDefined();
    expect(token?.length).toBeGreaterThan(20);
  });

  it("should have TWITTER_ACCESS_TOKEN set", () => {
    const token = process.env.TWITTER_ACCESS_TOKEN;
    expect(token).toBeDefined();
    expect(token?.length).toBeGreaterThan(10);
  });

  it("should have TWITTER_ACCESS_TOKEN_SECRET set", () => {
    const secret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
    expect(secret).toBeDefined();
    expect(secret?.length).toBeGreaterThan(10);
  });

  it("should have TWITTER_CLIENT_ID set (OAuth 2.0 PKCE)", () => {
    const clientId = process.env.TWITTER_CLIENT_ID;
    expect(clientId).toBeDefined();
    // OAuth 2.0 Client IDs are base64-encoded and typically 40+ chars
    expect(clientId?.length).toBeGreaterThan(20);
  });

  it("should have TWITTER_CLIENT_SECRET set (OAuth 2.0 PKCE)", () => {
    const secret = process.env.TWITTER_CLIENT_SECRET;
    expect(secret).toBeDefined();
    expect(secret?.length).toBeGreaterThan(20);
  });

  it("should authenticate with X API v2 using Bearer Token", async () => {
    const token = process.env.TWITTER_BEARER_TOKEN;
    if (!token) {
      throw new Error("TWITTER_BEARER_TOKEN not set");
    }

    // Decode URL-encoded token if needed
    const decodedToken = decodeURIComponent(token);

    // Lightweight call: GET /2/tweets/search/recent
    const response = await fetch(
      "https://api.twitter.com/2/tweets/search/recent?query=shopbot&max_results=10",
      {
        headers: {
          Authorization: `Bearer ${decodedToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 200 = success (full access)
    // 402 = Payment Required (Twitter Free tier plan restriction on search endpoint — token is valid)
    // 403 = Forbidden (plan restriction or scope issue — token is valid)
    // Only 401 = Unauthorized means bad credentials
    expect([200, 402, 403]).toContain(response.status);

    if (response.status === 401) {
      const body = await response.json();
      throw new Error(`Twitter auth failed: ${JSON.stringify(body)}`);
    }
  }, 15000);
});
