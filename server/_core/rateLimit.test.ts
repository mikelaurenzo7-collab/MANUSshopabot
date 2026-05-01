/**
 * Tests for the per-procedure tRPC rate limiter.
 *
 * The express-level workflow limiter sits at /api/trpc/workflows but tRPC
 * URLs are dot-separated (/api/trpc/workflows.launch), so the express
 * middleware never matched and rate-limiting was effectively disabled.
 * The tRPC-chain limiter here is the actual enforcement point.
 *
 * Locks in:
 *   - Counter is per (bucket, userId) — different users don't collide.
 *   - Over-limit throws TRPCError with code TOO_MANY_REQUESTS.
 *   - Anonymous users (no ctx.user) bucket together but still limit.
 *
 * We exercise the middleware via the real tRPC chain (initTRPC + procedure)
 * because the middleware object isn't a directly-callable function.
 */
import { describe, expect, it } from "vitest";
import { initTRPC, TRPCError } from "@trpc/server";
import { rateLimit } from "./trpc";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create();

function makeProc(bucket: string, max: number) {
  // Use a direct procedure so we don't depend on auth middleware. The
  // bucket name is randomized per call so independent tests don't share
  // counter state across the global Map in trpc.ts.
  const limiter = rateLimit({ bucket, windowMs: 60_000, max });
  return t.procedure.use(limiter).query(() => "ok");
}

function ctxFor(userId: number | string | null): TrpcContext {
  return {
    user: userId == null ? null : ({ id: userId } as any),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

async function call(proc: ReturnType<typeof makeProc>, userId: number | string | null) {
  const router = t.router({ ping: proc });
  const caller = router.createCaller(ctxFor(userId));
  return caller.ping();
}

describe("rateLimit middleware", () => {
  it("allows up to `max` requests in the window", async () => {
    const proc = makeProc(`under_${Date.now()}`, 3);
    for (let i = 0; i < 3; i++) {
      await expect(call(proc, 42)).resolves.toBe("ok");
    }
  });

  it("throws TOO_MANY_REQUESTS once the limit is exceeded", async () => {
    const proc = makeProc(`over_${Date.now()}`, 2);
    await call(proc, 7);
    await call(proc, 7);
    await expect(call(proc, 7)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("buckets independently per userId", async () => {
    const proc = makeProc(`per_user_${Date.now()}`, 1);
    await call(proc, 100);
    // Different user — should still be allowed.
    await expect(call(proc, 200)).resolves.toBe("ok");
    // Same user as first call — should be rejected.
    await expect(call(proc, 100)).rejects.toBeInstanceOf(TRPCError);
  });

  it("anonymous callers (no ctx.user) share an `anon` bucket", async () => {
    const proc = makeProc(`anon_${Date.now()}`, 1);
    await call(proc, null);
    await expect(call(proc, null)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
