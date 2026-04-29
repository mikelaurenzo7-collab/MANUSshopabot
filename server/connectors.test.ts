import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUserContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
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
    ...overrides,
  };
  return {
    user,
    activeOrg: { id: 1, role: "owner" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createAdminContext(): TrpcContext {
  return createUserContext({ role: "admin" });
}

function createAnonContext(): TrpcContext {
  return {
    user: null,
    activeOrg: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("Connectors Router", () => {
  describe("ecommercePlatforms", () => {
    it("returns all 16 e-commerce platforms with capability matrix", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      const platforms = await caller.connectors.ecommercePlatforms();
      expect(platforms).toBeInstanceOf(Array);
      // 14 from Sprint 27 + Manus's Printful (POD) + CJ Dropshipping (sourcing).
      expect(platforms.length).toBe(16);
      const ids = platforms.map((p: any) => p.id);
      // Original 7
      expect(ids).toContain("shopify");
      expect(ids).toContain("woocommerce");
      expect(ids).toContain("amazon");
      expect(ids).toContain("etsy");
      expect(ids).toContain("ebay");
      expect(ids).toContain("tiktok_shop");
      expect(ids).toContain("walmart");
      // Sprint 27 expansion
      expect(ids).toContain("depop");
      expect(ids).toContain("bigcommerce");
      expect(ids).toContain("square");
      expect(ids).toContain("faire");
      expect(ids).toContain("bonanza");
      expect(ids).toContain("stockx");
      expect(ids).toContain("reverb");
      // Manus additions — POD + sourcing suppliers wired into the
      // connect tile but without a storefront adapter yet, so they're
      // excluded from the matrix-shape check below.
      expect(ids).toContain("printful");
      expect(ids).toContain("cjdropshipping");
      // Each storefront row carries a live capability matrix the bots
      // branch on. Suppliers without a storefront adapter (printful,
      // cjdropshipping) live behind supplierAdapter.ts and don't expose
      // a storefront capability matrix.
      const SUPPLIER_ONLY = new Set(["printful", "cjdropshipping"]);
      for (const p of platforms) {
        if (SUPPLIER_ONLY.has(p.id)) continue;
        expect(p.capabilityMatrix, `${p.id} must have a capability matrix`).toBeTruthy();
        expect(typeof p.capabilityMatrix.recommendedBatchSize).toBe("number");
      }
    });

    it("each platform has required fields", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      const platforms = await caller.connectors.ecommercePlatforms();
      for (const p of platforms) {
        expect(p).toHaveProperty("id");
        expect(p).toHaveProperty("name");
        expect(p).toHaveProperty("icon");
        expect(p).toHaveProperty("connectionType");
        expect(p).toHaveProperty("capabilities");
        expect(p).toHaveProperty("description");
        expect(["oauth", "api_key"]).toContain(p.connectionType);
      }
    });

    it("shopify uses oauth connection type", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      const platforms = await caller.connectors.ecommercePlatforms();
      const shopify = platforms.find((p: any) => p.id === "shopify");
      expect(shopify?.connectionType).toBe("oauth");
    });

    it("woocommerce uses api_key connection type", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      const platforms = await caller.connectors.ecommercePlatforms();
      const woo = platforms.find((p: any) => p.id === "woocommerce");
      expect(woo?.connectionType).toBe("api_key");
    });
  });

  describe("socialPlatforms", () => {
    it("returns all social media platforms (google_ads moved to tools)", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      const platforms = await caller.connectors.socialPlatforms();
      expect(platforms).toBeInstanceOf(Array);
      expect(platforms.length).toBeGreaterThanOrEqual(5);
      const ids = platforms.map((p: any) => p.id);
      expect(ids).toContain("meta");
      expect(ids).toContain("instagram");
      expect(ids).toContain("tiktok");
      expect(ids).toContain("twitter");
      expect(ids).toContain("pinterest");
      expect(ids).toContain("gmail");
      // Google Ads relocated to the tools router (it's a marketing tool,
      // not an organic posting surface).
      expect(ids).not.toContain("google_ads");
    });

    it("each social platform has required fields", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      const platforms = await caller.connectors.socialPlatforms();
      for (const p of platforms) {
        expect(p).toHaveProperty("id");
        expect(p).toHaveProperty("name");
        expect(p).toHaveProperty("icon");
        expect(p).toHaveProperty("capabilities");
        expect(p).toHaveProperty("description");
      }
    });
  });

  describe("connectionSummary", () => {
    it("returns summary with stores, credentials, and socialAccounts fields", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      const summary = await caller.connectors.connectionSummary();
      expect(summary).toHaveProperty("stores");
      expect(summary).toHaveProperty("credentials");
      expect(summary).toHaveProperty("socialAccounts");
      expect(typeof summary.stores).toBe("number");
      expect(typeof summary.credentials).toBe("number");
      expect(typeof summary.socialAccounts).toBe("number");
    });
  });

  describe("listCredentials", () => {
    it("returns array for authenticated user", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      const creds = await caller.connectors.listCredentials();
      expect(creds).toBeInstanceOf(Array);
    });

    it("rejects unauthenticated requests", async () => {
      const ctx = createAnonContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.connectors.listCredentials()).rejects.toThrow();
    });
  });

  describe("listSocialAccounts", () => {
    it("returns array for authenticated user", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      const accounts = await caller.connectors.listSocialAccounts();
      expect(accounts).toBeInstanceOf(Array);
    });

    it("rejects unauthenticated requests", async () => {
      const ctx = createAnonContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.connectors.listSocialAccounts()).rejects.toThrow();
    });
  });

  describe("generateOAuthUrl", () => {
    it("requires authentication", async () => {
      const ctx = createAnonContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.connectors.generateOAuthUrl({
          platform: "shopify",
          storeId: 1,
          origin: "https://example.com",
          shopDomain: "test.myshopify.com",
        })
      ).rejects.toThrow();
    });
  });
});

describe("Dashboard Router", () => {
  it("returns metrics for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const metrics = await caller.dashboard.metrics({});
    expect(metrics).toHaveProperty("totalRevenue");
    expect(metrics).toHaveProperty("totalOrders");
    expect(metrics).toHaveProperty("activeProducts");
    expect(metrics).toHaveProperty("pendingApprovals");
  });

  it("returns agent status for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const status = await caller.dashboard.agentStatus();
    expect(status).toBeInstanceOf(Array);
  });

  it("returns recent activity", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const activity = await caller.dashboard.recentActivity({ limit: 5 });
    expect(activity).toBeInstanceOf(Array);
  });
});

describe("Stores Router", () => {
  it("lists stores for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const stores = await caller.stores.list();
    expect(stores).toBeInstanceOf(Array);
  });

  it("rejects unauthenticated store listing", async () => {
    const ctx = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.stores.list()).rejects.toThrow();
  });
});

describe("Notifications Router", () => {
  it("lists notifications for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const notifications = await caller.notifications.list();
    expect(notifications).toBeInstanceOf(Array);
  });

  it("returns unread count", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const count = await caller.notifications.unreadCount();
    expect(typeof count).toBe("number");
  });

  it("rejects unauthenticated notification access", async () => {
    const ctx = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.list()).rejects.toThrow();
  });
});

describe("Approvals Router", () => {
  it("lists pending approvals for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const pending = await caller.approvals.pending();
    expect(pending).toBeInstanceOf(Array);
  });

  it("admin can list all approvals", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const all = await caller.approvals.all();
    expect(all).toBeInstanceOf(Array);
  });

  it("rejects non-admin review attempts", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.approvals.review({ id: 1, status: "approved" })
    ).rejects.toThrow();
  });
});

describe("Bot Config Router", () => {
  it("lists bot configs for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const configs = await caller.botConfig.list();
    expect(configs).toBeInstanceOf(Array);
  });

  it("rejects non-admin config upsert", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.botConfig.upsert({ agentType: "architect", enabled: true })
    ).rejects.toThrow();
  });

  it("admin can upsert bot config", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // This should not throw (it may fail at DB level but not at auth level)
    try {
      await caller.botConfig.upsert({ agentType: "architect", enabled: true });
    } catch (e: any) {
      // DB errors are OK, auth errors are not
      expect(e.code).not.toBe("FORBIDDEN");
    }
  });
});

describe("Auth Router", () => {
  it("returns null for unauthenticated user", async () => {
    const ctx = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me).toBeNull();
  });

  it("returns user for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me).not.toBeNull();
    expect(me?.name).toBe("Test User");
    expect(me?.role).toBe("user");
  });

  it("logout clears cookie", async () => {
    const clearedCookies: any[] = [];
    const ctx: TrpcContext = {
      user: {
        id: 1,
        openId: "test",
        email: "test@test.com",
        name: "Test",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string, options: any) => {
          clearedCookies.push({ name, options });
        },
      } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies.length).toBe(1);
  });
});

describe("Activity Router", () => {
  it("lists activity for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const activity = await caller.activity.list({});
    expect(activity).toBeInstanceOf(Array);
  });

  it("rejects unauthenticated activity access", async () => {
    const ctx = createAnonContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.activity.list({})).rejects.toThrow();
  });
});

describe("Analytics Router", () => {
  it("returns overview data for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const overview = await caller.analytics.overview();
    expect(overview).toHaveProperty("totalRevenue");
    expect(overview).toHaveProperty("totalOrders");
  });

  it("returns agent performance for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const performance = await caller.analytics.agentPerformance();
    expect(performance).toBeInstanceOf(Array);
  });
});
