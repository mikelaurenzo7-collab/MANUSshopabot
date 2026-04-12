/**
 * Beast Bots — Comprehensive Test Suite
 * Covers: auth, authorization, store ownership, notifications, approvals, bot config, OAuth
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Context Factories ────────────────────────────────────────────────────────

function makeUser(overrides: Partial<TrpcContext["user"]> = {}): NonNullable<TrpcContext["user"]> {
  return {
    id: 1,
    openId: "user-open-id",
    email: "user@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    lastSignedIn: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeAdmin(overrides: Partial<TrpcContext["user"]> = {}): NonNullable<TrpcContext["user"]> {
  return makeUser({ id: 99, openId: "admin-open-id", email: "admin@beastbots.io", name: "Admin", role: "admin", ...overrides });
}

type CookieCall = { name: string; options: Record<string, unknown> };

function makeCtx(user: NonNullable<TrpcContext["user"]> | null = null): {
  ctx: TrpcContext;
  clearedCookies: CookieCall[];
} {
  const clearedCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────

describe("auth.me", () => {
  it("returns null for unauthenticated users", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns the current user when authenticated", async () => {
    const user = makeUser();
    const { ctx } = makeCtx(user);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toMatchObject({ id: 1, email: "user@example.com", role: "user" });
  });

  it("returns admin role for admin users", async () => {
    const admin = makeAdmin();
    const { ctx } = makeCtx(admin);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result?.role).toBe("admin");
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and returns success", async () => {
    const { ctx, clearedCookies } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true, path: "/" });
  });

  it("works for unauthenticated users (no session to clear)", async () => {
    const { ctx, clearedCookies } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
  });
});

// ─── Protected Procedure Guard Tests ─────────────────────────────────────────

describe("protectedProcedure guard", () => {
  it("throws UNAUTHORIZED when no user is present", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.stores.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows access when user is authenticated", async () => {
    const { ctx } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    // Should not throw — returns empty array from mocked DB
    await expect(caller.stores.list()).resolves.toBeDefined();
  });
});

// ─── Admin Procedure Guard Tests ─────────────────────────────────────────────

describe("adminProcedure guard", () => {
  it("throws FORBIDDEN when a regular user tries to review an approval", async () => {
    const { ctx } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.approvals.review({ id: 1, status: "approved" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when a regular user tries to upsert bot config", async () => {
    const { ctx } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.botConfig.upsert({ agentType: "architect", enabled: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows admin to review approvals (no FORBIDDEN thrown)", async () => {
    const { ctx } = makeCtx(makeAdmin());
    const caller = appRouter.createCaller(ctx);
    // Admin should NOT get FORBIDDEN — may succeed or fail at DB level, both are acceptable
    try {
      await caller.approvals.review({ id: 1, status: "approved" });
      // If it resolves, that's fine
    } catch (err: any) {
      // If it rejects, it must NOT be FORBIDDEN
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

  it("allows admin to upsert bot config (no FORBIDDEN thrown)", async () => {
    const { ctx } = makeCtx(makeAdmin());
    const caller = appRouter.createCaller(ctx);
    try {
      await caller.botConfig.upsert({ agentType: "merchant", enabled: false });
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });
});

// ─── Notifications Authorization Tests ───────────────────────────────────────

describe("notifications", () => {
  it("throws UNAUTHORIZED for unauthenticated list request", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED for unauthenticated unreadCount request", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.unreadCount()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED for unauthenticated markRead request", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.markRead({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED for unauthenticated markAllRead request", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.markAllRead()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── Approvals Authorization Tests ───────────────────────────────────────────

describe("approvals", () => {
  it("allows any authenticated user to view pending approvals", async () => {
    const { ctx } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    // DB will return empty/error — we just verify no auth error
    await expect(caller.approvals.pending()).resolves.toBeDefined();
  });

  it("blocks unauthenticated access to pending approvals", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.approvals.pending()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks regular users from reviewing approvals", async () => {
    const { ctx } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.approvals.review({ id: 5, status: "rejected", reviewNote: "Not appropriate" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── Bot Config Authorization Tests ──────────────────────────────────────────

describe("botConfig", () => {
  it("allows authenticated users to list bot configs", async () => {
    const { ctx } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    await expect(caller.botConfig.list()).resolves.toBeDefined();
  });

  it("blocks unauthenticated access to bot config list", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.botConfig.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("validates agentType enum in upsert", async () => {
    const { ctx } = makeCtx(makeAdmin());
    const caller = appRouter.createCaller(ctx);
    await expect(
      // @ts-expect-error — intentionally invalid agentType
      caller.botConfig.upsert({ agentType: "invalid_agent", enabled: true })
    ).rejects.toBeDefined();
  });
});

// ─── Store Ownership Tests ────────────────────────────────────────────────────

describe("stores", () => {
  it("blocks unauthenticated store creation", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.stores.create({ name: "Test Store", platform: "shopify" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks unauthenticated store listing", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.stores.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks unauthenticated Shopify OAuth URL generation", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.stores.shopifyOAuthUrl({ shopDomain: "test.myshopify.com", storeId: 1, origin: "https://example.com" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("validates platform enum in store creation", async () => {
    const { ctx } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    await expect(
      // @ts-expect-error — intentionally invalid platform
      caller.stores.create({ name: "Test Store", platform: "invalid_platform" })
    ).rejects.toBeDefined();
  });

  it("returns supported platforms for authenticated users", async () => {
    const { ctx } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    const platforms = await caller.stores.supportedPlatforms();
    expect(platforms).toHaveLength(7);
    expect(platforms.map((p) => p.id)).toContain("shopify");
    expect(platforms.map((p) => p.id)).toContain("woocommerce");
    expect(platforms.map((p) => p.id)).toContain("amazon");
    expect(platforms.map((p) => p.id)).toContain("etsy");
    expect(platforms.map((p) => p.id)).toContain("ebay");
    expect(platforms.map((p) => p.id)).toContain("tiktok_shop");
    expect(platforms.map((p) => p.id)).toContain("walmart");
  });

  it("Shopify is the only platform with oauthSupported = true", async () => {
    const { ctx } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    const platforms = await caller.stores.supportedPlatforms();
    const oauthPlatforms = platforms.filter((p) => p.oauthSupported);
    expect(oauthPlatforms).toHaveLength(1);
    expect(oauthPlatforms[0]?.id).toBe("shopify");
  });
});

// ─── Shopify OAuth URL Generation Tests ──────────────────────────────────────

describe("stores.shopifyOAuthUrl", () => {
  it("throws UNAUTHORIZED for unauthenticated requests", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.stores.shopifyOAuthUrl({ shopDomain: "test", storeId: 1, origin: "https://example.com" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws NOT_FOUND when store does not belong to user", async () => {
    const { ctx } = makeCtx(makeUser({ id: 42 }));
    const caller = appRouter.createCaller(ctx);
    // Store ID 9999 doesn't exist — should throw NOT_FOUND
    await expect(
      caller.stores.shopifyOAuthUrl({ shopDomain: "test.myshopify.com", storeId: 9999, origin: "https://example.com" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── Dashboard Tests ──────────────────────────────────────────────────────────

describe("dashboard", () => {
  it("blocks unauthenticated dashboard access", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.metrics()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows authenticated users to access dashboard metrics", async () => {
    const { ctx } = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.metrics()).resolves.toBeDefined();
  });
});

// ─── Role Distinction Tests ───────────────────────────────────────────────────

describe("role-based access control", () => {
  it("user role cannot access admin-only procedures", async () => {
    const user = makeUser({ role: "user" });
    const { ctx } = makeCtx(user);
    const caller = appRouter.createCaller(ctx);

    const adminProcedures = [
      caller.approvals.review({ id: 1, status: "approved" }),
      caller.botConfig.upsert({ agentType: "architect", enabled: true }),
    ];

    for (const proc of adminProcedures) {
      await expect(proc).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("admin role can access all procedures that regular users can", async () => {
    const admin = makeAdmin();
    const { ctx } = makeCtx(admin);
    const caller = appRouter.createCaller(ctx);

    // Admin should be able to do everything a user can
    await expect(caller.auth.me()).resolves.toMatchObject({ role: "admin" });
    await expect(caller.stores.list()).resolves.toBeDefined();
    await expect(caller.botConfig.list()).resolves.toBeDefined();
  });
});
