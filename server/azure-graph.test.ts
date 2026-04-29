import { describe, it, expect } from "vitest";

describe("Azure/Microsoft Graph Credential Validation", () => {
  it("should have Azure app registration credentials configured", () => {
    expect(process.env.AZURE_CLIENT_ID).toBeDefined();
    expect(process.env.AZURE_CLIENT_SECRET).toBeDefined();
    expect(process.env.AZURE_TENANT_ID).toBeDefined();
    expect(process.env.AZURE_SECRET_ID).toBeDefined();
  });

  it("should have correct Azure credential values", () => {
    expect(process.env.AZURE_CLIENT_ID).toBe("cfc0bd96-aa96-4dc6-b171-0770915862d5");
    expect(process.env.AZURE_TENANT_ID).toBe("66c96d31-7d71-4eda-9ef9-954e0b277553");
    expect(process.env.AZURE_CLIENT_SECRET).toBe("Y7D8Q~8h1Wl4VcoBUCb6PcrlpvYrz5jkjLNIYdmp");
    expect(process.env.AZURE_SECRET_ID).toBe("d568df20-ffd2-4245-83ee-5d44f093ab12");
  });

  it("should validate Microsoft Graph OAuth flow prerequisites", () => {
    // Microsoft Graph OAuth requires client_id, tenant_id, and redirect_uri
    const graphOAuthUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    graphOAuthUrl.searchParams.set("client_id", process.env.AZURE_CLIENT_ID || "");
    graphOAuthUrl.searchParams.set("redirect_uri", "https://shopabot.manus.space/api/tools/oauth/callback");
    graphOAuthUrl.searchParams.set("scope", "Mail.Read Mail.Send Calendars.Read");
    graphOAuthUrl.searchParams.set("response_type", "code");

    expect(graphOAuthUrl.searchParams.get("client_id")).toBe("cfc0bd96-aa96-4dc6-b171-0770915862d5");
    expect(graphOAuthUrl.searchParams.get("redirect_uri")).toBe("https://shopabot.manus.space/api/tools/oauth/callback");
    expect(graphOAuthUrl.searchParams.get("scope")).toContain("Mail.Read");
  });

  it("should have valid Azure credential format", () => {
    // Client ID should be UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(process.env.AZURE_CLIENT_ID).toMatch(uuidRegex);
    expect(process.env.AZURE_TENANT_ID).toMatch(uuidRegex);
    expect(process.env.AZURE_SECRET_ID).toMatch(uuidRegex);

    // Client secret should start with specific prefix
    expect(process.env.AZURE_CLIENT_SECRET).toContain("Y7D8Q");
  });
});
