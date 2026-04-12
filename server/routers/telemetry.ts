/**
 * Telemetry Router — exposes agent telemetry data to the dashboard.
 * Read-only queries for viewing action logs, stats, and outcomes.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const telemetryRouter = router({
  /** Get telemetry entries for a specific store */
  byStore: protectedProcedure
    .input(z.object({ storeId: z.number(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      return db.getTelemetryByStore(input.storeId, input.limit);
    }),

  /** Get telemetry entries for a specific agent type */
  byAgent: protectedProcedure
    .input(z.object({
      agentType: z.enum(["architect", "merchant", "social"]),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return db.getTelemetryByAgent(input.agentType, input.limit);
    }),

  /** Get aggregate telemetry stats */
  stats: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }))
    .query(async ({ input }) => {
      return db.getTelemetryStats(input.storeId);
    }),
});
