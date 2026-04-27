/**
 * Tests for the multi-tenancy foundation.
 *
 * Verifies:
 *   1. The orgs router is wired into appRouter and exposes the
 *      expected procedures.
 *   2. Org-scoped procedures throw FORBIDDEN when the caller has no
 *      active org context (i.e., the resolver couldn't seat them).
 *   3. setActive rejects an org the caller is not a member of —
 *      proving cross-org reads are denied at the membership boundary.
 *
 * The procedures themselves don't run real DB queries here (the test
 * harness has no MySQL); we verify the auth/membership boundary which
 * is the part that prevents data leakage between tenants.
 */
import { describe, it, expect, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function buildContext(overrides?: {
  user?: Partial<AuthenticatedUser> | null;
  activeOrg?: TrpcContext["activeOrg"];
}): TrpcContext {
  const user: AuthenticatedUser =
    overrides?.user === null
      ? (null as unknown as AuthenticatedUser) // explicit unauthenticated
      : ({
          id: 1,
          openId: "test-user",
          email: "test@example.com",
          name: "Test User",
          loginMethod: "manus",
          role: "user",
          currentOrgId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
          ...(overrides?.user ?? {}),
        } as AuthenticatedUser);

  return {
    user: overrides?.user === null ? null : user,
    activeOrg: overrides?.activeOrg ?? null,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("Multi-tenancy foundation", () => {
  describe("orgs router wiring", () => {
    it("appRouter exposes the orgs sub-router", async () => {
      const { appRouter } = await import("./routers");
      const procedures = appRouter._def.procedures as Record<string, unknown>;
      expect(procedures["orgs.list"]).toBeDefined();
      expect(procedures["orgs.current"]).toBeDefined();
      expect(procedures["orgs.setActive"]).toBeDefined();
      expect(procedures["orgs.create"]).toBeDefined();
      expect(procedures["orgs.members"]).toBeDefined();
      expect(procedures["orgs.inviteMember"]).toBeDefined();
    });
  });

  describe("orgProcedure boundary", () => {
    it("stores.list throws UNAUTHORIZED for unauthenticated callers", async () => {
      const { appRouter } = await import("./routers");
      const ctx = buildContext({ user: null });
      const caller = appRouter.createCaller(ctx);
      await expect(caller.stores.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("stores.list throws FORBIDDEN when user has no active org", async () => {
      const { appRouter } = await import("./routers");
      // Authenticated user but the resolver couldn't seat an active org
      // (e.g., DB unavailable during context creation).
      const ctx = buildContext({ activeOrg: null });
      const caller = appRouter.createCaller(ctx);
      await expect(caller.stores.list()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("orgs.setActive — membership enforcement", () => {
    it("rejects switching to an org the caller is not a member of", async () => {
      // Mock the membership lookup to return undefined (no membership)
      vi.doMock("./db", async (importOriginal) => {
        const actual = await importOriginal<typeof import("./db")>();
        return {
          ...actual,
          getOrgMembership: vi.fn().mockResolvedValue(undefined),
        };
      });

      // Re-import after mock so the router picks up the stubbed db
      vi.resetModules();
      const { appRouter } = await import("./routers");

      const ctx = buildContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.orgs.setActive({ orgId: 9999 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      vi.doUnmock("./db");
      vi.resetModules();
    });
  });

  describe("schema", () => {
    it("organizations + org_members tables are exported from schema", async () => {
      const schema = await import("../drizzle/schema");
      expect(schema.organizations).toBeDefined();
      expect(schema.orgMembers).toBeDefined();
    });

    it("stores table has orgId column", async () => {
      const schema = await import("../drizzle/schema");
      // Drizzle exposes columns as direct properties on the table builder
      expect((schema.stores as Record<string, unknown>).orgId).toBeDefined();
    });

    it("users table has currentOrgId column", async () => {
      const schema = await import("../drizzle/schema");
      expect((schema.users as Record<string, unknown>).currentOrgId).toBeDefined();
    });
  });
});
