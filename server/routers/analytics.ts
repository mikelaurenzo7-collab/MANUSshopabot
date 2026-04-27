import { z } from "zod";
import { orgProcedure, router } from "../_core/trpc";
import * as db from "../db";

/**
 * Analytics router — org-scoped throughout. Pre-migration these
 * procedures used `protectedProcedure` and accepted a raw `storeId`
 * with no ownership check, leaking cross-tenant data via guessed IDs.
 */
export const analyticsRouter = router({
  snapshots: orgProcedure
    .input(z.object({
      storeId: z.number(),
      days: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      return db.getAnalyticsSnapshotsForOrg(ctx.org.id, input.storeId, input.days);
    }),

  overview: orgProcedure
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return db.getDashboardMetricsForOrg(ctx.org.id, input?.storeId);
    }),

  agentPerformance: orgProcedure.query(async ({ ctx }) => {
    return db.getAgentStatusSummaryByOrg(ctx.org.id);
  }),
});
