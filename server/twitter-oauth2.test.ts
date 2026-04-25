import { describe, it, expect } from "vitest";

describe("Twitter OAuth 2.0 Credentials", () => {
  it("should have TWITTER_CLIENT_ID set", () => {
    const clientId = process.env.TWITTER_CLIENT_ID;
    expect(clientId).toBeDefined();
    expect(clientId!.length).toBeGreaterThan(10);
  });

  it("should have TWITTER_CLIENT_SECRET set", () => {
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    expect(clientSecret).toBeDefined();
    expect(clientSecret!.length).toBeGreaterThan(10);
  });

  it("should be able to get OAuth 2.0 token from Twitter", async () => {
    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Missing Twitter OAuth 2.0 credentials");
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
