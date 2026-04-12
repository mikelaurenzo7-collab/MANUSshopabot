import { describe, it, expect } from "vitest";

/**
 * Twitter/X API Credentials Validation Test
 * Validates that the TWITTER_BEARER_TOKEN is set and can authenticate
 * against the X API v2 using a lightweight endpoint (GET /2/tweets/search/recent)
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

  it("should authenticate with X API v2 using Bearer Token", async () => {
    const token = process.env.TWITTER_BEARER_TOKEN;
    if (!token) {
      throw new Error("TWITTER_BEARER_TOKEN not set");
    }

    // Decode URL-encoded token if needed
    const decodedToken = decodeURIComponent(token);

    // Lightweight call: GET /2/users/me is not available with app-only auth
    // Use GET /2/tweets/search/recent with a simple query instead
    const response = await fetch(
      "https://api.twitter.com/2/tweets/search/recent?query=beast+bots&max_results=10",
      {
        headers: {
          Authorization: `Bearer ${decodedToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 200 = success, 401 = bad credentials, 403 = forbidden (plan issue)
    // We accept 200 or 403 (valid token but plan restriction) as "credentials work"
    expect([200, 403]).toContain(response.status);

    if (response.status === 401) {
      const body = await response.json();
      throw new Error(`Twitter auth failed: ${JSON.stringify(body)}`);
    }
  }, 15000);
});
