import { describe, it, expect } from "vitest";

describe("Slack & Square Credential Validation", () => {
  it("should have Slack credentials configured", () => {
    expect(process.env.SLACK_CLIENT_ID).toBeDefined();
    expect(process.env.SLACK_CLIENT_SECRET).toBeDefined();
    expect(process.env.SLACK_CLIENT_ID).toBe("3552f41cb41c7254240c1366a8dc67ad");
    expect(process.env.SLACK_CLIENT_SECRET).toBe("3552f41cb41c7254240c1366a8dc67ad");
  });

  it("should have Square production credentials configured", () => {
    expect(process.env.SQUARE_PRODUCTION_APPLICATION_ID).toBeDefined();
    expect(process.env.SQUARE_PRODUCTION_ACCESS_TOKEN).toBeDefined();
    expect(process.env.SQUARE_PRODUCTION_APPLICATION_ID).toBe("sq0idp-5X6XufYhPJ2ZUD7QvOtIaA");
    expect(process.env.SQUARE_PRODUCTION_ACCESS_TOKEN).toBe("EAAAl2E1_DL6j6BTO5fu3CKED3wOP28jwLYHCNX_tfT_0QyeIv1zA-4RF59d8559");
  });

  it("should have Square OAuth credentials configured", () => {
    expect(process.env.SQUARE_OAUTH_APPLICATION_ID).toBeDefined();
    expect(process.env.SQUARE_OAUTH_APPLICATION_SECRET).toBeDefined();
    expect(process.env.SQUARE_OAUTH_APPLICATION_ID).toBe("sq0idp-5X6XufYhPJ2ZUD7QvOtIaA");
    expect(process.env.SQUARE_OAUTH_APPLICATION_SECRET).toBe("sq0csp-KK3ZOTy824tj5GZlWX5JuygUfhz5qYHXPTEPN9Xfg2Q");
  });

  it("should validate Slack OAuth flow prerequisites", () => {
    // Slack OAuth requires client_id and client_secret
    const slackOAuthUrl = new URL("https://slack.com/oauth_v2/authorize");
    slackOAuthUrl.searchParams.set("client_id", process.env.SLACK_CLIENT_ID || "");
    slackOAuthUrl.searchParams.set("redirect_uri", "https://shopabot.manus.space/api/social/oauth/callback");
    slackOAuthUrl.searchParams.set("scope", "users:read,chat:write");

    expect(slackOAuthUrl.searchParams.get("client_id")).toBe("3552f41cb41c7254240c1366a8dc67ad");
    expect(slackOAuthUrl.searchParams.get("redirect_uri")).toBe("https://shopabot.manus.space/api/social/oauth/callback");
  });

  it("should validate Square OAuth flow prerequisites", () => {
    // Square OAuth requires application_id and redirect_uri
    const squareOAuthUrl = new URL("https://connect.squareup.com/oauth2/authorize");
    squareOAuthUrl.searchParams.set("client_id", process.env.SQUARE_OAUTH_APPLICATION_ID || "");
    squareOAuthUrl.searchParams.set("redirect_uri", "https://shopabot.manus.space/api/ecommerce/oauth/callback");

    expect(squareOAuthUrl.searchParams.get("client_id")).toBe("sq0idp-5X6XufYhPJ2ZUD7QvOtIaA");
    expect(squareOAuthUrl.searchParams.get("redirect_uri")).toBe("https://shopabot.manus.space/api/ecommerce/oauth/callback");
  });

  it("should have Slack webhook credentials configured", () => {
    expect(process.env.SLACK_SIGNING_SECRET).toBeDefined();
    expect(process.env.SLACK_VERIFICATION_TOKEN).toBeDefined();
    expect(process.env.SLACK_SIGNING_SECRET).toBe("42f7f5108ab89bb741e0049f1d697581");
    expect(process.env.SLACK_VERIFICATION_TOKEN).toBe("jIDN3xKL9F6r8vMKIrwQq7xf");
  });

  it("should have Slack OAuth tokens configured", () => {
    expect(process.env.SLACK_APP_TOKEN).toBeDefined();
    expect(process.env.SLACK_REFRESH_TOKEN).toBeDefined();
    expect(process.env.SLACK_APP_TOKEN).toContain("xoxe.xoxp-1-");
    expect(process.env.SLACK_REFRESH_TOKEN).toContain("xoxe-1-");
  });
});
