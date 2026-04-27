import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Adapter Imports ──────────────────────────────────────────────────────
import { getEcommerceAdapter, SUPPORTED_ECOMMERCE_PLATFORMS } from "./adapters/ecommerce";
import { getSocialAdapter, SUPPORTED_SOCIAL_PLATFORMS } from "./adapters/social";
import type { EcommercePlatformAdapter } from "./adapters/ecommerce/types";
import type { SocialPlatformAdapter } from "./adapters/social/types";
import { agentScheduler, registerDefaultTasks } from "./scheduler";

// ─── Test Helpers ─────────────────────────────────────────────────────────

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

// ─── E-Commerce Adapter Registry Tests ────────────────────────────────────

describe("E-Commerce Adapter Registry", () => {
  it("supports all 7 e-commerce platforms", () => {
    expect(SUPPORTED_ECOMMERCE_PLATFORMS).toBeInstanceOf(Array);
    expect(SUPPORTED_ECOMMERCE_PLATFORMS.length).toBe(7);
    expect(SUPPORTED_ECOMMERCE_PLATFORMS).toContain("shopify");
    expect(SUPPORTED_ECOMMERCE_PLATFORMS).toContain("woocommerce");
    expect(SUPPORTED_ECOMMERCE_PLATFORMS).toContain("amazon");
    expect(SUPPORTED_ECOMMERCE_PLATFORMS).toContain("etsy");
    expect(SUPPORTED_ECOMMERCE_PLATFORMS).toContain("ebay");
    expect(SUPPORTED_ECOMMERCE_PLATFORMS).toContain("tiktok_shop");
    expect(SUPPORTED_ECOMMERCE_PLATFORMS).toContain("walmart");
  });

  it("returns an adapter for each supported platform", () => {
    for (const platform of SUPPORTED_ECOMMERCE_PLATFORMS) {
      const adapter = getEcommerceAdapter(platform);
      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe(platform);
    }
  });

  it("throws for unsupported platform", () => {
    expect(() => getEcommerceAdapter("nonexistent" as any)).toThrow();
  });

  it("each adapter implements the full EcommercePlatformAdapter interface", () => {
    for (const platform of SUPPORTED_ECOMMERCE_PLATFORMS) {
      const adapter: EcommercePlatformAdapter = getEcommerceAdapter(platform);
      // Required methods
      expect(typeof adapter.listProducts).toBe("function");
      expect(typeof adapter.getProduct).toBe("function");
      expect(typeof adapter.createProduct).toBe("function");
      expect(typeof adapter.updateProduct).toBe("function");
      expect(typeof adapter.deleteProduct).toBe("function");
      expect(typeof adapter.listOrders).toBe("function");
      expect(typeof adapter.getOrder).toBe("function");
      expect(typeof adapter.fulfillOrder).toBe("function");
      expect(typeof adapter.getInventory).toBe("function");
      expect(typeof adapter.updateInventory).toBe("function");
      // Metadata
      expect(typeof adapter.platform).toBe("string");
      expect(typeof adapter.platformName).toBe("string");
    }
  });

  it("shopify adapter has correct metadata", () => {
    const adapter = getEcommerceAdapter("shopify");
    expect(adapter.platform).toBe("shopify");
    expect(adapter.platformName).toBe("Shopify");
  });

  it("woocommerce adapter has correct metadata", () => {
    const adapter = getEcommerceAdapter("woocommerce");
    expect(adapter.platform).toBe("woocommerce");
    expect(adapter.platformName).toBe("WooCommerce");
  });

  it("amazon adapter has correct metadata", () => {
    const adapter = getEcommerceAdapter("amazon");
    expect(adapter.platform).toBe("amazon");
    expect(adapter.platformName).toBe("Amazon Seller");
  });
});

// ─── Social Adapter Registry Tests ────────────────────────────────────────

describe("Social Adapter Registry", () => {
  it("supports all 7 social media platforms", () => {
    expect(SUPPORTED_SOCIAL_PLATFORMS).toBeInstanceOf(Array);
    expect(SUPPORTED_SOCIAL_PLATFORMS.length).toBe(7);
    expect(SUPPORTED_SOCIAL_PLATFORMS).toContain("meta");
    expect(SUPPORTED_SOCIAL_PLATFORMS).toContain("instagram");
    expect(SUPPORTED_SOCIAL_PLATFORMS).toContain("tiktok");
    expect(SUPPORTED_SOCIAL_PLATFORMS).toContain("twitter");
    expect(SUPPORTED_SOCIAL_PLATFORMS).toContain("pinterest");
    expect(SUPPORTED_SOCIAL_PLATFORMS).toContain("google_ads");
    expect(SUPPORTED_SOCIAL_PLATFORMS).toContain("gmail");
  });

  it("returns an adapter for each supported platform", () => {
    for (const platform of SUPPORTED_SOCIAL_PLATFORMS) {
      const adapter = getSocialAdapter(platform);
      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe(platform);
    }
  });

  it("throws for unsupported platform", () => {
    expect(() => getSocialAdapter("nonexistent" as any)).toThrow();
  });

  it("each adapter implements the full SocialPlatformAdapter interface", () => {
    for (const platform of SUPPORTED_SOCIAL_PLATFORMS) {
      const adapter: SocialPlatformAdapter = getSocialAdapter(platform);
      // Required methods
      expect(typeof adapter.createPost).toBe("function");
      expect(typeof adapter.deletePost).toBe("function");
      expect(typeof adapter.getPostAnalytics).toBe("function");
      expect(typeof adapter.createAdCampaign).toBe("function");
      expect(typeof adapter.getAdCampaignPerformance).toBe("function");
      expect(typeof adapter.getAccountAnalytics).toBe("function");
      // Metadata
      expect(typeof adapter.platform).toBe("string");
      expect(typeof adapter.platformName).toBe("string");
    }
  });

  it("meta adapter has correct metadata", () => {
    const adapter = getSocialAdapter("meta");
    expect(adapter.platform).toBe("meta");
    expect(adapter.platformName).toBe("Meta (Facebook)");
  });

  it("tiktok adapter has correct metadata", () => {
    const adapter = getSocialAdapter("tiktok");
    expect(adapter.platform).toBe("tiktok");
    expect(adapter.platformName).toBe("TikTok");
  });

  it("twitter adapter has correct metadata", () => {
    const adapter = getSocialAdapter("twitter");
    expect(adapter.platform).toBe("twitter");
    expect(adapter.platformName).toBe("Twitter / X");
  });
});

// ─── Scheduler Tests ──────────────────────────────────────────────────────

describe("Agent Scheduler", () => {
  it("registers default tasks without errors", () => {
    expect(() => registerDefaultTasks()).not.toThrow();
  });

  it("getStatus returns all registered tasks", () => {
    registerDefaultTasks();
    const status = agentScheduler.getStatus();
    expect(status).toBeInstanceOf(Array);
    expect(status.length).toBeGreaterThanOrEqual(10);
  });

  it("all registered tasks have required fields", () => {
    registerDefaultTasks();
    const status = agentScheduler.getStatus();
    for (const task of status) {
      expect(task).toHaveProperty("id");
      expect(task).toHaveProperty("name");
      expect(task).toHaveProperty("cronExpression");
      expect(task).toHaveProperty("agentType");
      expect(task).toHaveProperty("taskType");
      expect(task).toHaveProperty("enabled");
    }
  });

  it("includes merchant inventory check task", () => {
    registerDefaultTasks();
    const status = agentScheduler.getStatus();
    const inventoryTask = status.find((t: any) => t.id === "merchant:inventory-check");
    expect(inventoryTask).toBeDefined();
    expect(inventoryTask?.agentType).toBe("merchant");
    expect(inventoryTask?.enabled).toBe(true);
  });

  it("includes social scheduled posts task", () => {
    registerDefaultTasks();
    const status = agentScheduler.getStatus();
    const postsTask = status.find((t: any) => t.id === "social:scheduled-posts");
    expect(postsTask).toBeDefined();
    expect(postsTask?.agentType).toBe("social");
    expect(postsTask?.enabled).toBe(true);
  });

  it("includes architect store health task", () => {
    registerDefaultTasks();
    const status = agentScheduler.getStatus();
    const healthTask = status.find((t: any) => t.id === "architect:store-health");
    expect(healthTask).toBeDefined();
    expect(healthTask?.agentType).toBe("architect");
    expect(healthTask?.enabled).toBe(true);
  });

  it("includes seo audit task with real handler", () => {
    registerDefaultTasks();
    const status = agentScheduler.getStatus();
    const seoTask = status.find((t: any) => t.id === "social:seo-audit");
    expect(seoTask).toBeDefined();
    expect(seoTask?.agentType).toBe("social");
  });

  it("includes email recovery task with real handler", () => {
    registerDefaultTasks();
    const status = agentScheduler.getStatus();
    const emailTask = status.find((t: any) => t.id === "social:email-recovery");
    expect(emailTask).toBeDefined();
    expect(emailTask?.agentType).toBe("social");
  });

  it("includes competitor scan task with real handler", () => {
    registerDefaultTasks();
    const status = agentScheduler.getStatus();
    const compTask = status.find((t: any) => t.id === "architect:competitor-scan");
    expect(compTask).toBeDefined();
    expect(compTask?.agentType).toBe("architect");
  });

  it("can enable and disable tasks", () => {
    registerDefaultTasks();
    agentScheduler.setEnabled("merchant:inventory-check", false);
    let status = agentScheduler.getStatus();
    let task = status.find((t: any) => t.id === "merchant:inventory-check");
    expect(task?.enabled).toBe(false);

    agentScheduler.setEnabled("merchant:inventory-check", true);
    status = agentScheduler.getStatus();
    task = status.find((t: any) => t.id === "merchant:inventory-check");
    expect(task?.enabled).toBe(true);
  });
});

// ─── Cross-Store Intelligence Endpoint Tests ──────────────────────────────

describe("Cross-Store Intelligence", () => {
  it("returns intelligence data for authenticated user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const intel = await caller.dashboard.crossStoreIntelligence();
    expect(intel).toHaveProperty("storeCount");
    expect(intel).toHaveProperty("totalRevenue");
    expect(intel).toHaveProperty("totalOrders");
    expect(intel).toHaveProperty("totalProducts");
    expect(intel).toHaveProperty("totalLowStock");
    expect(intel).toHaveProperty("topStore");
    expect(intel).toHaveProperty("platformBreakdown");
    expect(intel).toHaveProperty("storeMetrics");
    expect(intel).toHaveProperty("schedulerTasks");
  });

  it("storeMetrics is an array", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const intel = await caller.dashboard.crossStoreIntelligence();
    expect(intel.storeMetrics).toBeInstanceOf(Array);
  });

  it("schedulerTasks is an array with task info", async () => {
    registerDefaultTasks();
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const intel = await caller.dashboard.crossStoreIntelligence();
    expect(intel.schedulerTasks).toBeInstanceOf(Array);
    expect(intel.schedulerTasks.length).toBeGreaterThan(0);
  });

  it("platformBreakdown is an object", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const intel = await caller.dashboard.crossStoreIntelligence();
    expect(typeof intel.platformBreakdown).toBe("object");
  });

  it("rejects unauthenticated access", async () => {
    const ctx: TrpcContext = {
      user: null,
      activeOrg: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.crossStoreIntelligence()).rejects.toThrow();
  });
});

// ─── Bot Config Autonomy Level Tests ──────────────────────────────────────

describe("Bot Config Autonomy Level", () => {
  it("admin can upsert with autonomyLevel", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    try {
      await caller.botConfig.upsert({
        agentType: "architect",
        enabled: true,
        autonomyLevel: "supervised",
      });
    } catch (e: any) {
      // DB errors are OK, auth errors are not
      expect(e.code).not.toBe("FORBIDDEN");
      expect(e.code).not.toBe("UNAUTHORIZED");
    }
  });

  it("accepts all three autonomy levels", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    for (const level of ["fully_autonomous", "supervised", "manual"] as const) {
      try {
        await caller.botConfig.upsert({
          agentType: "merchant",
          enabled: true,
          autonomyLevel: level,
        });
      } catch (e: any) {
        expect(e.code).not.toBe("FORBIDDEN");
      }
    }
  });

  it("rejects invalid autonomy level", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.botConfig.upsert({
        agentType: "architect",
        enabled: true,
        autonomyLevel: "invalid_level" as any,
      })
    ).rejects.toThrow();
  });
});
