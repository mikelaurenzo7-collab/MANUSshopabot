import { describe, it, expect } from "vitest";

/**
 * Pinterest API Credentials Validation Test
 * Validates PINTEREST_ACCESS_TOKEN by calling the lightweight
 * GET /v5/user_account endpoint which requires only the access token
 */
describe("Pinterest API Credentials", () => {
  it("should have PINTEREST_APP_ID set", () => {
    expect(process.env.PINTEREST_APP_ID).toBeDefined();
    expect(process.env.PINTEREST_APP_ID?.length).toBeGreaterThan(5);
  });

  it("should have PINTEREST_ACCESS_TOKEN set", () => {
    expect(process.env.PINTEREST_ACCESS_TOKEN).toBeDefined();
    expect(process.env.PINTEREST_ACCESS_TOKEN?.startsWith("pina_")).toBe(true);
  });

  it("should authenticate with Pinterest API v5 using Access Token", async () => {
    const token = process.env.PINTEREST_ACCESS_TOKEN;
    if (!token) throw new Error("PINTEREST_ACCESS_TOKEN not set");

    const response = await fetch("https://api.pinterest.com/v5/user_account", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    // 200 = valid token, 401 = invalid token, 403 = insufficient permissions
    if (response.status === 401) {
      const body = await response.json();
      throw new Error(`Pinterest auth failed: ${JSON.stringify(body)}`);
    }

    expect([200, 403]).toContain(response.status);
  }, 15000);
});
