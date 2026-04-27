/**
 * Tests for the Stripe tRPC router — exercising the public/protected
 * boundary and input validation. We do NOT touch real Stripe APIs here;
 * the tests target authentication, plan ID validation, and the public
 * `getPlans` listing used to render the landing page pricing grid.
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "stripe-test-user",
    email: "stripe@beastbots.com",
    name: "Stripe Test",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("stripe router", () => {
  describe("getPlans", () => {
    it("is callable without authentication (landing page consumer)", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      const plans = await caller.stripe.getPlans();
      expect(Array.isArray(plans)).toBe(true);
      const ids = plans.map((p: { id: string }) => p.id).sort();
      expect(ids).toEqual(["growth", "pro", "scale", "starter"]);
    });

    it("returns plans with the public-facing fields the landing page needs", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      const plans = await caller.stripe.getPlans();
      for (const plan of plans) {
        expect(plan).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          priceCents: expect.any(Number),
        });
        expect(Array.isArray(plan.features)).toBe(true);
      }
    });
  });

  describe("getSubscription", () => {
    it("rejects unauthenticated callers", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(caller.stripe.getSubscription()).rejects.toThrow();
    });
  });

  describe("createCheckoutSession", () => {
    it("rejects unauthenticated callers", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(
        caller.stripe.createCheckoutSession({
          planId: "growth",
          origin: "https://example.com",
        }),
      ).rejects.toThrow();
    });

    it("rejects invalid plan IDs (zod input validation)", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.stripe.createCheckoutSession({
          // @ts-expect-error — intentionally invalid to exercise zod
          planId: "enterprise",
          origin: "https://example.com",
        }),
      ).rejects.toThrow();
    });

    it("rejects non-URL origins (zod input validation)", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.stripe.createCheckoutSession({
          planId: "growth",
          origin: "not-a-url",
        }),
      ).rejects.toThrow();
    });
  });

  describe("createBillingPortalSession", () => {
    it("rejects unauthenticated callers", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(
        caller.stripe.createBillingPortalSession({ origin: "https://example.com" }),
      ).rejects.toThrow();
    });
  });
});
