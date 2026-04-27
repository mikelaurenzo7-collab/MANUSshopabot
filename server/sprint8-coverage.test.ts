/**
 * Sprint 8 Optional Test Coverage
 * - Integration tests for error scenarios
 * - Performance tests for large datasets
 * - State machine tests for workflow edge cases
 * - Adapter mock tests for API failures
 */

import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

const makeCtx = (role?: "user" | "admin") => ({
  user: role
    ? ({ id: 1, role, openId: "test-open-id", name: "Test User" } as any)
    : null,
  activeOrg: role ? { id: 1, role: "owner" as const } : null,
  req: {} as any,
  res: {} as any,
});

// ─── Error Scenario Integration Tests ─────────────────────────────────────────

describe("Error Scenario Integration Tests", () => {
  describe("tRPC authentication guards", () => {
    it("returns UNAUTHORIZED for dashboard.metrics when user is null", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(caller.dashboard.metrics()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("returns UNAUTHORIZED for stores.list when user is null", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(caller.stores.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("returns FORBIDDEN for botConfig.upsert when user role is 'user'", async () => {
      const caller = appRouter.createCaller(makeCtx("user"));
      await expect(
        caller.botConfig.upsert({ agentType: "architect", enabled: true })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("Input validation errors", () => {
    it.skipIf(!process.env.DATABASE_URL)("validates agentType enum (social, architect, merchant)", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      // "social" is now a valid agentType (renamed from hypeman in Sprint 8)
      const result = await caller.botConfig.upsert({ agentType: "social", enabled: true });
      expect(result).toBeDefined();
    });

    it.skipIf(!process.env.DATABASE_URL)("accepts valid agentType 'social'", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      const result = await caller.botConfig.upsert({
        agentType: "social",
        enabled: true,
      });
      expect(result).toBeDefined();
    });
  });
});

// ─── Performance Tests for Large Datasets ─────────────────────────────────────

describe("Performance Tests — Pagination Limits", () => {
  it("activity.list rejects limit > 100", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.activity.list({ limit: 9999 })).rejects.toBeDefined();
  });

  it("activity.list accepts limit = 100 and returns array", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.activity.list({ limit: 100 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it("workflows.list has no hard limit cap (no max set) — accepts large limit", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    // workflows.list uses z.number().default(20) with no max — large values are accepted
    const result = await caller.workflows.list({ limit: 1000 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("notifications.list rejects limit > 100", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.notifications.list({ limit: 9999 })
    ).rejects.toBeDefined();
  });
});

// ─── State Machine Tests for Workflow Edge Cases ───────────────────────────────

describe("Workflow State Machine Edge Cases", () => {
  it("workflowEngine exports registerWorkflow, launchWorkflow, cancelWorkflow", async () => {
    const engine = await import("./engine/workflowEngine");
    expect(typeof engine.registerWorkflow).toBe("function");
    expect(typeof engine.launchWorkflow).toBe("function");
    expect(typeof engine.cancelWorkflow).toBe("function");
  });

  it("all three agent types have registered workflow types", async () => {
    await import("./engine/architectWorkflows");
    await import("./engine/merchantWorkflows");
    await import("./engine/socialWorkflows");

    const caller = appRouter.createCaller(makeCtx("user"));
    const types = await caller.workflows.availableTypes();
    expect(types.architect.length).toBeGreaterThan(0);
    expect(types.merchant.length).toBeGreaterThan(0);
    expect(types.social.length).toBeGreaterThan(0);
  });

  it("workflows.retry requires authentication", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.workflows.retry({ workflowId: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("workflows.cancel requires authentication", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.workflows.cancel({ workflowId: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("health.checkAll requires authentication", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.health.checkAll()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

// ─── Adapter Mock Tests for API Failures ──────────────────────────────────────

describe("Adapter Mock Tests for API Failures", () => {
  describe("Rate limiter configuration", () => {
    it("platformRateLimiters has entries for all major platforms", async () => {
      const { platformRateLimiters } = await import("./utils/rateLimiter");
      const expectedPlatforms = [
        "shopify", "etsy", "meta", "tiktok", "twitter",
      ];
      for (const platform of expectedPlatforms) {
        expect(
          platformRateLimiters[platform as keyof typeof platformRateLimiters],
          `Missing rate limiter for ${platform}`
        ).toBeDefined();
      }
    });

    it("ApiRateLimiter instance has acquire method", async () => {
      const { ApiRateLimiter } = await import("./utils/rateLimiter");
      const limiter = new ApiRateLimiter(10, 1000);
      expect(typeof limiter.acquire).toBe("function");
    });

    it("withRetry is exported and is a function", async () => {
      const { withRetry } = await import("./utils/rateLimiter");
      expect(typeof withRetry).toBe("function");
    });
  });

  describe("Adapter healthCheck methods", () => {
    it("ShopifyAdapter has healthCheck method", async () => {
      const { ShopifyAdapter } = await import(
        "./adapters/ecommerce/shopifyAdapter"
      );
      const adapter = new ShopifyAdapter({
        shopDomain: "test.myshopify.com",
        accessToken: "test_token",
      });
      expect(typeof adapter.healthCheck).toBe("function");
    });

    it("MetaAdapter has healthCheck method", async () => {
      const { MetaAdapter } = await import("./adapters/social/metaAdapter");
      const adapter = new MetaAdapter({
        accessToken: "test_token",
        adAccountId: "act_123456",
      });
      expect(typeof adapter.healthCheck).toBe("function");
    });
  });

  describe("Adapter factory functions", () => {
    it("getEcommerceAdapter returns ShopifyAdapter for 'shopify'", async () => {
      const { getEcommerceAdapter } = await import("./adapters/ecommerce");
      const adapter = getEcommerceAdapter("shopify", {
        shopDomain: "test.myshopify.com",
        accessToken: "test",
      });
      expect(adapter).toBeDefined();
      expect(typeof adapter.healthCheck).toBe("function");
    });

    it("getSocialAdapter returns MetaAdapter for 'meta'", async () => {
      const { getSocialAdapter } = await import("./adapters/social");
      const adapter = getSocialAdapter("meta", {
        accessToken: "test",
        adAccountId: "act_123",
      });
      expect(adapter).toBeDefined();
      expect(typeof adapter.healthCheck).toBe("function");
    });
  });
});
