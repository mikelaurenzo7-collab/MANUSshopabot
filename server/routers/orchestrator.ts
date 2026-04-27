/**
 * Elite Orchestrator tRPC Router
 *
 * Exposes the elite orchestration engine capabilities:
 * - Unified cross-platform metrics aggregation
 * - Anomaly detection and alerts
 * - Buy Box monitoring (Amazon/eBay/Walmart)
 * - Dynamic pricing engine trigger
 * - Creative velocity A/B optimization trigger
 * - Inventory-aware ad pausing trigger
 * - Dead-letter queue status
 */

import { z } from "zod";
import { orgProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  getUnifiedMetrics,
  detectAnomalies,
  monitorBuyBox,
  runDynamicPricingEngine,
  runCreativeVelocityOptimization,
  pauseAdsForOutOfStockProducts,
  getDLQStatus,
} from "../engine/eliteOrchestrator";

export const orchestratorRouter = router({
  /**
   * Unified cross-platform metrics (revenue, ad spend, ROAS, inventory health).
   * Org-scoped — pulls only the active org's stores + campaigns. A user
   * who's a member of multiple orgs sees only the active one's data.
   */
  unifiedMetrics: orgProcedure
    .input(z.object({
      period: z.enum(["24h", "7d", "30d"]).default("30d"),
    }))
    .query(async ({ ctx, input }) => {
      return getUnifiedMetrics(ctx.user.id, ctx.org.id, input.period);
    }),

  /** Detect anomalies across the active org's stores + ad accounts. */
  anomalies: orgProcedure
    .query(async ({ ctx }) => {
      return detectAnomalies(ctx.user.id, ctx.org.id);
    }),

  /** Buy Box monitoring for the active org. */
  buyBoxStatus: orgProcedure
    .query(async ({ ctx }) => {
      return monitorBuyBox(ctx.user.id, ctx.org.id);
    }),

  /** Manually trigger the dynamic pricing engine for the active org. */
  triggerDynamicPricing: orgProcedure
    .mutation(async ({ ctx }) => {
      const results = await runDynamicPricingEngine(ctx.user.id, ctx.org.id);
      return {
        total: results.length,
        autoApplied: results.filter(r => r.approved).length,
        queuedForApproval: results.filter(r => r.requiresApproval).length,
        results,
      };
    }),

  /** Manually trigger creative velocity A/B optimization for the active org. */
  triggerCreativeVelocity: orgProcedure
    .mutation(async ({ ctx }) => {
      return runCreativeVelocityOptimization(ctx.user.id, ctx.org.id);
    }),

  /** Manually trigger inventory-aware ad pausing for the active org. */
  triggerAdPause: orgProcedure
    .mutation(async ({ ctx }) => {
      return pauseAdsForOutOfStockProducts(ctx.user.id, ctx.org.id);
    }),

  /**
   * Dead-letter queue status — global, not org-scoped (operator concern).
   * Stays on protectedProcedure since it doesn't return any tenant data.
   */
  dlqStatus: protectedProcedure
    .query(async () => {
      return getDLQStatus();
    }),
});
