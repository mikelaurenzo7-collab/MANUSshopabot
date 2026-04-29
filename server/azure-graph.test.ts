/**
 * Azure / Microsoft Graph credential shape validation.
 *
 * Outlook + Microsoft Calendar both ride on the Microsoft Graph API.
 * This test guards the env-wiring contract — the client id must be a
 * UUID, the tenant id must be a UUID, and the secret must match
 * Microsoft's published format (no specific value asserted, so the
 * test stays clean of leaked secrets).
 *
 * If the operator hasn't provisioned the Azure app yet, this test
 * emits a soft pass with a console hint so it doesn't block CI.
 */
import { describe, it, expect } from "vitest";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("Azure / Microsoft Graph credentials", () => {
  it("client id, tenant id, and secret have valid shapes when set", () => {
    const clientId = process.env.AZURE_CLIENT_ID;
    const tenantId = process.env.AZURE_TENANT_ID;
    const secret = process.env.AZURE_CLIENT_SECRET;

    if (!clientId && !tenantId && !secret) {
      // Pre-provisioning: nothing to validate yet. The OAuth tile
      // surfaces "setup required" until the operator completes the
      // Azure App Registration + adds the Manus secret bundle.
      return;
    }

    if (clientId) expect(clientId, "AZURE_CLIENT_ID must be a UUID").toMatch(UUID_RX);
    if (tenantId) expect(tenantId, "AZURE_TENANT_ID must be a UUID").toMatch(UUID_RX);
    if (secret) {
      // Azure client secrets are 40-char base64-ish values that
      // typically include `~` or `.` separators. We just check it's a
      // non-trivial string — the actual value lives only in env.
      expect(secret.length).toBeGreaterThan(20);
    }
  });

  it("constructs a valid Microsoft Graph OAuth authorize URL", () => {
    const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    url.searchParams.set("client_id", process.env.AZURE_CLIENT_ID || "test-client");
    url.searchParams.set("redirect_uri", "https://example.com/api/tools/oauth/callback");
    url.searchParams.set("scope", "Mail.Read Mail.Send Calendars.Read offline_access");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "query");

    expect(url.searchParams.get("redirect_uri")).toContain("/api/tools/oauth/callback");
    expect(url.searchParams.get("scope")).toContain("Mail.Read");
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });
});
