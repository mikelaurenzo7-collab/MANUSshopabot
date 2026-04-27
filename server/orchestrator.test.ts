import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// ─── Mock DB helpers used by orchestrator ─────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getStoresByUser: vi.fn().mockResolvedValue([]),
    getAdCampaignsByUser: vi.fn().mockResolvedValue([]),
    getPricingRulesByUser: vi.fn().mockResolvedValue([]),
    getProductsByStore: vi.fn().mockResolvedValue([]),
    getWorkflowsByUser: vi.fn().mockResolvedValue([]),
  };
});

// ─── Mock eliteOrchestrator ────────────────────────────────────────────────────
vi.mock("./engine/eliteOrchestrator", () => ({
  detectAnomalies: vi.fn().mockResolvedValue([]),
  runDynamicPricingEngine: vi.fn().mockResolvedValue([
    { productId: 1, storeId: 1, platform: "shopify", currentPrice: 29.99, newPrice: 27.99, changePercent: -6.7, reason: "competitor", approved: true, requiresApproval: false },
  ]),
  pauseAdsForOutOfStockProducts: vi.fn().mockResolvedValue({ paused: 0, reactivated: 0 }),
  runCreativeVelocityOptimization: vi.fn().mockResolvedValue({ paused: 0, scaled: 0, unchanged: 0 }),
  monitorBuyBox: vi.fn().mockResolvedValue([]),
  getUnifiedMetrics: vi.fn().mockResolvedValue({
    ecommerce: {
      totalRevenue: 0,
      totalOrders: 0,
      avgOrderValue: 0,
      outOfStockRate: 0,
      topPlatform: null,
      platformBreakdown: [],
    },
    advertising: {
      totalSpend: 0,
      totalConversions: 0,
      blendedROAS: 0,
      blendedCPA: 0,
      topPlatform: null,
      platformBreakdown: [],
    },
    inventory: {
      totalProducts: 0,
      outOfStockCount: 0,
      lowStockCount: 0,
      inventoryHealthScore: 100,
    },
    period: "30d",
    generatedAt: new Date().toISOString(),
  }),
  getDLQStatus: vi.fn().mockReturnValue({ total: 0, pending: 0, entries: [] }),
  addToDeadLetterQueue: vi.fn(),
  processDLQ: vi.fn().mockResolvedValue(0),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "user-1", name: "Test User", role: "user" as const, openId: "open-1" },
    activeOrg: { id: 1, role: "owner" as const },
    ...overrides,
  };
}

function makeCaller(ctx: ReturnType<typeof makeCtx>) {
  // @ts-expect-error - test context doesn't need full tRPC context
  return appRouter.createCaller(ctx);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("orchestrator router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unifiedMetrics", () => {
    it("returns metrics for authenticated user", async () => {
      const caller = makeCaller(makeCtx());
      const result = await caller.orchestrator.unifiedMetrics({ period: "30d" });
      expect(result).toHaveProperty("ecommerce");
      expect(result).toHaveProperty("advertising");
      expect(result).toHaveProperty("inventory");
      expect(result.period).toBe("30d");
    });

    it("accepts 24h period", async () => {
      const caller = makeCaller(makeCtx());
      const result = await caller.orchestrator.unifiedMetrics({ period: "24h" });
      expect(result).toHaveProperty("ecommerce");
    });

    it("accepts 7d period", async () => {
      const caller = makeCaller(makeCtx());
      const result = await caller.orchestrator.unifiedMetrics({ period: "7d" });
      expect(result).toHaveProperty("ecommerce");
    });

    it("rejects unauthenticated requests", async () => {
      // @ts-expect-error - intentionally passing null user
      const caller = makeCaller({ user: null });
      await expect(caller.orchestrator.unifiedMetrics({ period: "30d" })).rejects.toThrow();
    });
  });

  describe("anomalies", () => {
    it("returns empty array when no anomalies", async () => {
      const caller = makeCaller(makeCtx());
      const result = await caller.orchestrator.anomalies();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it("rejects unauthenticated requests", async () => {
      // @ts-expect-error - intentionally passing null user
      const caller = makeCaller({ user: null });
      await expect(caller.orchestrator.anomalies()).rejects.toThrow();
    });
  });

  describe("buyBoxStatus", () => {
    it("returns empty array when no Amazon/eBay/Walmart stores", async () => {
      const caller = makeCaller(makeCtx());
      const result = await caller.orchestrator.buyBoxStatus();
      expect(Array.isArray(result)).toBe(true);
    });

    it("rejects unauthenticated requests", async () => {
      // @ts-expect-error - intentionally passing null user
      const caller = makeCaller({ user: null });
      await expect(caller.orchestrator.buyBoxStatus()).rejects.toThrow();
    });
  });

  describe("dlqStatus", () => {
    it("returns DLQ status with total, pending, entries", async () => {
      const caller = makeCaller(makeCtx());
      const result = await caller.orchestrator.dlqStatus();
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("pending");
      expect(result).toHaveProperty("entries");
      expect(typeof result.total).toBe("number");
    });
  });

  describe("triggerDynamicPricing", () => {
    it("returns total, autoApplied, queuedForApproval, and results", async () => {
      const caller = makeCaller(makeCtx());
      const result = await caller.orchestrator.triggerDynamicPricing();
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("autoApplied");
      expect(result).toHaveProperty("queuedForApproval");
      expect(result).toHaveProperty("results");
      expect(result.total).toBe(1);
      expect(result.autoApplied).toBe(1);
    });

    it("rejects unauthenticated requests", async () => {
      // @ts-expect-error - intentionally passing null user
      const caller = makeCaller({ user: null });
      await expect(caller.orchestrator.triggerDynamicPricing()).rejects.toThrow();
    });
  });

  describe("triggerAdPause", () => {
    it("returns paused and reactivated counts", async () => {
      const caller = makeCaller(makeCtx());
      const result = await caller.orchestrator.triggerAdPause();
      expect(result).toHaveProperty("paused");
      expect(result).toHaveProperty("reactivated");
    });
  });

  describe("triggerCreativeVelocity", () => {
    it("returns paused, scaled, unchanged counts", async () => {
      const caller = makeCaller(makeCtx());
      const result = await caller.orchestrator.triggerCreativeVelocity();
      expect(result).toHaveProperty("paused");
      expect(result).toHaveProperty("scaled");
      expect(result).toHaveProperty("unchanged");
    });
  });
});
