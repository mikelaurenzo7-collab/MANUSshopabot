import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const analyticsRouter = router({
  snapshots: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      days: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ input }) => {
      return db.getAnalyticsSnapshots(input.storeId, input.days);
    }),

  overview: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return db.getDashboardMetrics(input?.storeId);
    }),

  agentPerformance: protectedProcedure.query(async () => {
    return db.getAgentStatusSummary();
  }),
});
