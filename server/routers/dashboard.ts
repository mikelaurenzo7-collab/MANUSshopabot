import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const dashboardRouter = router({
  metrics: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return db.getDashboardMetrics(input?.storeId);
    }),

  agentStatus: protectedProcedure.query(async () => {
    return db.getAgentStatusSummary();
  }),

  recentOrders: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ input }) => {
      return db.getRecentOrders(input?.limit ?? 10);
    }),

  recentActivity: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ input }) => {
      return db.getAgentTasks({ limit: input?.limit ?? 10 });
    }),
});
