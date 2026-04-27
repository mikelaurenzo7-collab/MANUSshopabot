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
