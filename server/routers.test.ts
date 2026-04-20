import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "test@beastbots.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("SHOPaBOT Routers", () => {
  // ─── Auth ──────────────────────────────────────────────────────────────
  describe("auth.me", () => {
    it("returns user when authenticated", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.me();
      expect(result).toBeDefined();
      expect(result?.email).toBe("test@beastbots.com");
      expect(result?.role).toBe("admin");
    });

    it("returns null when unauthenticated", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.me();
      expect(result).toBeNull();
    });
  });

  describe("auth.logout", () => {
    it("clears the session cookie and reports success", async () => {
      const { ctx, clearedCookies } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.logout();
      expect(result).toEqual({ success: true });
      expect(clearedCookies).toHaveLength(1);
      expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    });
  });

  // ─── Protected Route Access ────────────────────────────────────────────
  describe("protected routes", () => {
    it("dashboard.overview rejects unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.dashboard.overview()).rejects.toThrow();
    });

    it("stores.list rejects unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.stores.list()).rejects.toThrow();
    });

    it("botConfig.list rejects unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.botConfig.list()).rejects.toThrow();
    });

    it("approvals.pending rejects unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.approvals.pending()).rejects.toThrow();
    });

    it("notifications.list rejects unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.notifications.list()).rejects.toThrow();
    });
  });

  // ─── Router Structure ─────────────────────────────────────────────────
  describe("router structure", () => {
    it("has all expected top-level routers", () => {
      const routerKeys = Object.keys((appRouter as any)._def.procedures || {});
      // Check that the router has the expected procedure paths
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      
      // Verify all routers exist by checking their type
      expect(typeof caller.auth.me).toBe("function");
      expect(typeof caller.auth.logout).toBe("function");
      expect(typeof caller.dashboard.overview).toBe("function");
      expect(typeof caller.stores.list).toBe("function");
      expect(typeof caller.stores.create).toBe("function");
      expect(typeof caller.stores.supportedPlatforms).toBe("function");
      expect(typeof caller.architect.nicheResearch).toBe("function");
      expect(typeof caller.architect.nicheReports).toBe("function");
      expect(typeof caller.architect.generateProductCatalog).toBe("function");
      expect(typeof caller.merchant.products).toBe("function");
      expect(typeof caller.merchant.orders).toBe("function");
      expect(typeof caller.merchant.autoFulfill).toBe("function");
      expect(typeof caller.merchant.suggestPricing).toBe("function");
      expect(typeof caller.merchant.pricingRules).toBe("function");
      expect(typeof caller.social.generateAdCopy).toBe("function");
      expect(typeof caller.social.generateAdImage).toBe("function");
      expect(typeof caller.social.suggestSeoKeywords).toBe("function");
      expect(typeof caller.social.generateSocialPost).toBe("function");
      expect(typeof caller.social.generateEmailCampaign).toBe("function");
      expect(typeof caller.activity.list).toBe("function");
      expect(typeof caller.analytics.overview).toBe("function");
      expect(typeof caller.notifications.list).toBe("function");
      expect(typeof caller.notifications.unreadCount).toBe("function");
      expect(typeof caller.notifications.markRead).toBe("function");
      expect(typeof caller.notifications.markAllRead).toBe("function");
      expect(typeof caller.approvals.pending).toBe("function");
      expect(typeof caller.approvals.all).toBe("function");
      expect(typeof caller.approvals.review).toBe("function");
      expect(typeof caller.botConfig.list).toBe("function");
      expect(typeof caller.botConfig.upsert).toBe("function");
    });
  });

  // ─── Input Validation ─────────────────────────────────────────────────
  describe("input validation", () => {
    it("stores.create validates required fields", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      // Missing name should fail
      await expect(
        caller.stores.create({ name: "", platform: "shopify" })
      ).rejects.toThrow();
    });

    it("approvals.review validates status enum", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.approvals.review({ id: 1, status: "invalid" as any })
      ).rejects.toThrow();
    });

    it("botConfig.upsert validates agentType enum", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.botConfig.upsert({ agentType: "invalid" as any })
      ).rejects.toThrow();
    });
  });

  // ─── Stores Supported Platforms ───────────────────────────────────────
  describe("stores.supportedPlatforms", () => {
    it("returns all 7 supported platforms", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const platforms = await caller.stores.supportedPlatforms();
      expect(platforms).toHaveLength(7);
      const platformIds = platforms.map((p: any) => p.id);
      expect(platformIds).toContain("shopify");
      expect(platformIds).toContain("woocommerce");
      expect(platformIds).toContain("amazon");
      expect(platformIds).toContain("etsy");
      expect(platformIds).toContain("ebay");
      expect(platformIds).toContain("tiktok_shop");
      expect(platformIds).toContain("walmart");
    });

    it("each platform has required fields", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const platforms = await caller.stores.supportedPlatforms();
      for (const platform of platforms) {
        expect(platform).toHaveProperty("id");
        expect(platform).toHaveProperty("name");
        expect(platform).toHaveProperty("icon");
        expect(platform).toHaveProperty("description");
        expect(platform).toHaveProperty("capabilities");
      }
    });
  });
});
