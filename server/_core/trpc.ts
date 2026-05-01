import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { ActiveOrg, TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * Procedure that requires both an authenticated user AND an active
 * organization context. Use for any data scoped to a tenant — stores,
 * workflows, integrations, billing, members, etc.
 *
 * On success, `ctx.org` is a non-null `ActiveOrg` with the user's role
 * already verified; downstream code can read it without re-querying.
 *
 * Throws FORBIDDEN if the user has no org context, which only happens
 * when the resolver in `context.ts` failed to provision a personal org
 * (e.g. the database was unavailable).
 */
const requireOrg = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (!ctx.activeOrg) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No organization context — please sign in again.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      org: ctx.activeOrg satisfies ActiveOrg,
    },
  });
});

export const orgProcedure = t.procedure.use(requireOrg);

/**
 * Procedure that requires the user to be an owner OR admin of the
 * active org. Use for org settings, member invites, deletions.
 */
const requireOrgAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (!ctx.activeOrg) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No organization context." });
  }
  if (ctx.activeOrg.role !== "owner" && ctx.activeOrg.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action requires owner or admin permissions.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      org: ctx.activeOrg satisfies ActiveOrg,
    },
  });
});

export const orgAdminProcedure = t.procedure.use(requireOrgAdmin);

/**
 * Per-procedure tRPC rate limit, keyed on `userId:bucketName`.
 *
 * Why this exists: the express-level workflow rate limiter sits at
 * `/api/trpc/workflows`, but tRPC's HTTP layout uses dot-separated paths
 * (`/api/trpc/workflows.launch`), so the express middleware NEVER matches
 * and effectively disables rate limiting on LLM-heavy mutations. This
 * lives inside the tRPC chain instead, so cost-blowout protection is
 * actually enforced.
 *
 * Usage:
 *   export const myRouter = router({
 *     expensiveLLMOp: orgProcedure
 *       .use(llmRateLimit)
 *       .input(...)
 *       .mutation(...),
 *   });
 */
const _rateBuckets = new Map<string, { count: number; windowStart: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of Array.from(_rateBuckets.entries())) {
    if (now - v.windowStart > 5 * 60_000) _rateBuckets.delete(k);
  }
}, 5 * 60_000).unref?.();

export function rateLimit(opts: { bucket: string; windowMs: number; max: number }) {
  return t.middleware(async ({ ctx, next }) => {
    const userId = (ctx as any).user?.id ?? "anon";
    const key = `${opts.bucket}:${userId}`;
    const now = Date.now();
    const bucket = _rateBuckets.get(key);
    if (!bucket || now - bucket.windowStart > opts.windowMs) {
      _rateBuckets.set(key, { count: 1, windowStart: now });
      return next();
    }
    bucket.count++;
    if (bucket.count > opts.max) {
      const retryAfter = Math.ceil((bucket.windowStart + opts.windowMs - now) / 1000);
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded for ${opts.bucket}. Try again in ${retryAfter}s.`,
      });
    }
    return next();
  });
}

/** Pre-configured limiter for LLM-backed mutations (costly + slow). */
export const llmRateLimit = rateLimit({ bucket: "llm", windowMs: 60_000, max: 20 });

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
