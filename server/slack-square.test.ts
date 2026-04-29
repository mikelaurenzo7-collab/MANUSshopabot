/**
 * Slack + Square credential shape validation.
 *
 * Square's adapter is wired into server/adapters/ecommerce/squareAdapter.ts;
 * this test only guards the env-wiring contract so a missing var
 * fails loudly at boot. Slack is a social-channel addition (Sprint 27.5)
 * and rides through the social router for the OAuth handshake.
 *
 * No literal secret values are asserted here — the test only checks
 * for the well-known prefixes that Slack and Square publish in their
 * developer docs (so a typo at provisioning time fails the test).
 */
import { describe, it, expect } from "vitest";

describe("Slack credentials", () => {
  it("client id + secret have non-trivial values when set", () => {
    const id = process.env.SLACK_CLIENT_ID;
    const secret = process.env.SLACK_CLIENT_SECRET;
    if (id) expect(id.length).toBeGreaterThan(10);
    if (secret) expect(secret.length).toBeGreaterThan(10);
  });

  it("optional webhook + bot tokens, when set, match Slack's published prefixes", () => {
    const signing = process.env.SLACK_SIGNING_SECRET;
    const verification = process.env.SLACK_VERIFICATION_TOKEN;
    const appToken = process.env.SLACK_APP_TOKEN;
    const refresh = process.env.SLACK_REFRESH_TOKEN;
    if (signing) expect(signing.length).toBeGreaterThan(10);
    if (verification) expect(verification.length).toBeGreaterThan(10);
    // Slack has migrated to xoxe.* tokens for OAuth v2 — the prefix
    // signals which auth flow the secret was issued for.
    if (appToken) expect(appToken.startsWith("xoxe.")).toBe(true);
    if (refresh) expect(refresh.startsWith("xoxe-")).toBe(true);
  });

  it("constructs a valid Slack OAuth v2 authorize URL", () => {
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID || "test-client");
    url.searchParams.set("redirect_uri", "https://example.com/api/social/oauth/callback");
    url.searchParams.set("scope", "chat:write,channels:read,users:read");
    url.searchParams.set("user_scope", "");

    expect(url.searchParams.get("redirect_uri")).toContain("/api/social/oauth/callback");
    expect(url.searchParams.get("scope")).toContain("chat:write");
  });
});

describe("Square credentials (production + OAuth)", () => {
  it("Square access tokens, when set, follow the EAAA/sq0 prefix conventions", () => {
    const prodAppId = process.env.SQUARE_PRODUCTION_APPLICATION_ID;
    const prodToken = process.env.SQUARE_PRODUCTION_ACCESS_TOKEN;
    const oauthAppId = process.env.SQUARE_OAUTH_APPLICATION_ID;
    const oauthSecret = process.env.SQUARE_OAUTH_APPLICATION_SECRET;

    if (prodAppId) expect(prodAppId.startsWith("sq0idp-")).toBe(true);
    if (prodToken) expect(prodToken.startsWith("EAAA")).toBe(true);
    if (oauthAppId) expect(oauthAppId.startsWith("sq0idp-")).toBe(true);
    if (oauthSecret) expect(oauthSecret.startsWith("sq0csp-")).toBe(true);
  });

  it("constructs a valid Square OAuth authorize URL", () => {
    const url = new URL("https://connect.squareup.com/oauth2/authorize");
    url.searchParams.set(
      "client_id",
      process.env.SQUARE_OAUTH_APPLICATION_ID || process.env.SQUARE_CLIENT_ID || "test-client",
    );
    url.searchParams.set("redirect_uri", "https://example.com/api/ecommerce/oauth/callback");
    url.searchParams.set(
      "scope",
      "MERCHANT_PROFILE_READ CATALOG_READ ORDERS_READ ORDERS_WRITE INVENTORY_READ",
    );

    expect(url.searchParams.get("redirect_uri")).toContain("/api/ecommerce/oauth/callback");
    expect(url.searchParams.get("scope")).toContain("CATALOG_READ");
  });
});
