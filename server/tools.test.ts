import { describe, expect, it, vi } from "vitest";
import {
  getToolAdapter,
  buildToolCredentials,
  SUPPORTED_TOOL_CONNECTORS,
  GoogleSheetsAdapter,
  GoogleAnalyticsAdapter,
  KlaviyoAdapter,
  ShipStationAdapter,
  PostscriptAdapter,
  PrintfulAdapter,
  JudgeMeAdapter,
  GorgiasAdapter,
} from "./adapters/tools";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("Tool Connector Adapters", () => {
  it("registry returns all 8 expected tool ids", () => {
    expect(SUPPORTED_TOOL_CONNECTORS.sort()).toEqual(
      [
        "google_sheets",
        "google_analytics",
        "klaviyo",
        "shipstation",
        "postscript",
        "printful",
        "judgeme",
        "gorgias",
      ].sort(),
    );
  });

  it("getToolAdapter returns the right class for each id", () => {
    expect(getToolAdapter("google_sheets")).toBeInstanceOf(GoogleSheetsAdapter);
    expect(getToolAdapter("google_analytics")).toBeInstanceOf(GoogleAnalyticsAdapter);
    expect(getToolAdapter("klaviyo")).toBeInstanceOf(KlaviyoAdapter);
    expect(getToolAdapter("shipstation")).toBeInstanceOf(ShipStationAdapter);
    expect(getToolAdapter("postscript")).toBeInstanceOf(PostscriptAdapter);
    expect(getToolAdapter("printful")).toBeInstanceOf(PrintfulAdapter);
    expect(getToolAdapter("judgeme")).toBeInstanceOf(JudgeMeAdapter);
    expect(getToolAdapter("gorgias")).toBeInstanceOf(GorgiasAdapter);
  });

  it("getToolAdapter throws on unknown id", () => {
    expect(() => getToolAdapter("excel")).toThrow(/Unsupported tool connector/);
  });

  it("each adapter declares its bots, category, and capabilities", () => {
    for (const id of SUPPORTED_TOOL_CONNECTORS) {
      const a = getToolAdapter(id);
      expect(a.tool).toBe(id);
      expect(a.toolName).toBeTruthy();
      expect(a.category).toBeTruthy();
      expect(a.bots.length).toBeGreaterThan(0);
      expect(a.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("OAuth tools (sheets, analytics) flag missing access tokens as unhealthy", async () => {
    const sheets = await new GoogleSheetsAdapter().healthCheck({ tool: "google_sheets" });
    expect(sheets.healthy).toBe(false);
    expect(sheets.message).toMatch(/access token/i);

    const ga = await new GoogleAnalyticsAdapter().healthCheck({ tool: "google_analytics" });
    expect(ga.healthy).toBe(false);
  });

  it("API-key tools flag missing keys as unhealthy", async () => {
    const klaviyo = await new KlaviyoAdapter().healthCheck({ tool: "klaviyo" });
    expect(klaviyo.healthy).toBe(false);

    const shipstation = await new ShipStationAdapter().healthCheck({ tool: "shipstation" });
    expect(shipstation.healthy).toBe(false);
    expect(shipstation.message).toMatch(/key or secret/i);

    const judgeme = await new JudgeMeAdapter().healthCheck({ tool: "judgeme" });
    expect(judgeme.healthy).toBe(false);

    const gorgias = await new GorgiasAdapter().healthCheck({ tool: "gorgias" });
    expect(gorgias.healthy).toBe(false);
  });

  it("buildToolCredentials normalizes a DB record into ToolCredentials", () => {
    const creds = buildToolCredentials({
      platform: "klaviyo",
      accessToken: null,
      refreshToken: null,
      metadata: { apiKey: "pk_test_123" },
    });
    expect(creds.tool).toBe("klaviyo");
    expect(creds.apiKey).toBe("pk_test_123");

    const oauth = buildToolCredentials({
      platform: "google_sheets",
      accessToken: "ya29.token",
      refreshToken: "1//refresh",
      metadata: { scope: "spreadsheets" },
    });
    expect(oauth.accessToken).toBe("ya29.token");
    expect(oauth.refreshToken).toBe("1//refresh");
  });
});

describe("Tools Router", () => {
  it("list returns all 8 tools with required fields", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const tools = await caller.tools.list();

    expect(tools.length).toBe(8);
    for (const t of tools) {
      expect(t).toHaveProperty("id");
      expect(t).toHaveProperty("name");
      expect(t).toHaveProperty("icon");
      expect(t).toHaveProperty("category");
      expect(t).toHaveProperty("bots");
      expect(t).toHaveProperty("capabilities");
      expect(t).toHaveProperty("connectionType");
      expect(["oauth", "api_key"]).toContain(t.connectionType);
    }
  });

  it("Google Sheets and GA4 use OAuth; rest use api_key", async () => {
    const ctx = createUserContext();
    const tools = await appRouter.createCaller(ctx).tools.list();
    const byId = Object.fromEntries(tools.map((t) => [t.id, t]));
    expect(byId.google_sheets.connectionType).toBe("oauth");
    expect(byId.google_analytics.connectionType).toBe("oauth");
    for (const id of ["klaviyo", "shipstation", "postscript", "printful", "judgeme", "gorgias"]) {
      expect(byId[id].connectionType).toBe("api_key");
      expect(byId[id].fields?.length || 0).toBeGreaterThan(0);
    }
  });

  it("api_key tools advertise the fields they need", async () => {
    const ctx = createUserContext();
    const tools = await appRouter.createCaller(ctx).tools.list();
    const shipstation = tools.find((t) => t.id === "shipstation");
    const fieldKeys = (shipstation?.fields || []).map((f: any) => f.key);
    expect(fieldKeys).toContain("apiKey");
    expect(fieldKeys).toContain("apiSecret");

    const gorgias = tools.find((t) => t.id === "gorgias");
    const gorgiasKeys = (gorgias?.fields || []).map((f: any) => f.key);
    expect(gorgiasKeys).toContain("subdomain");
    expect(gorgiasKeys).toContain("email");
    expect(gorgiasKeys).toContain("apiKey");
  });

  it("each tool declares which bots can use it", async () => {
    const ctx = createUserContext();
    const tools = await appRouter.createCaller(ctx).tools.list();
    const byId = Object.fromEntries(tools.map((t) => [t.id, t]));
    expect(byId.shipstation.bots).toContain("merchant");
    expect(byId.gorgias.bots).toContain("merchant");
    expect(byId.postscript.bots).toContain("social");
    expect(byId.google_sheets.bots).toEqual(expect.arrayContaining(["architect", "merchant", "social"]));
  });
});
