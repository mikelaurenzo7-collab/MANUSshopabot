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
import { protectedProcedure, router } from "../_core/trpc";
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
   * Unified cross-platform metrics (revenue, ad spend, ROAS, inventory health)
   */
  unifiedMetrics: protectedProcedure
    .input(z.object({
      period: z.enum(["24h", "7d", "30d"]).default("30d"),
    }))
    .query(async ({ ctx, input }) => {
      return getUnifiedMetrics(ctx.user.id, input.period);
    }),

  /**
   * Detect anomalies across all stores and ad accounts
   */
  anomalies: protectedProcedure
    .query(async ({ ctx }) => {
      return detectAnomalies(ctx.user.id);
    }),

  /**
   * Buy Box monitoring for Amazon, eBay, Walmart
   */
  buyBoxStatus: protectedProcedure
    .query(async ({ ctx }) => {
      return monitorBuyBox(ctx.user.id);
    }),

  /**
   * Manually trigger the dynamic pricing engine
   */
  triggerDynamicPricing: protectedProcedure
    .mutation(async ({ ctx }) => {
      const results = await runDynamicPricingEngine(ctx.user.id);
      return {
        total: results.length,
        autoApplied: results.filter(r => r.approved).length,
        queuedForApproval: results.filter(r => r.requiresApproval).length,
        results,
      };
    }),

  /**
   * Manually trigger creative velocity A/B optimization
   */
  triggerCreativeVelocity: protectedProcedure
    .mutation(async ({ ctx }) => {
      return runCreativeVelocityOptimization(ctx.user.id);
    }),

  /**
   * Manually trigger inventory-aware ad pausing
   */
  triggerAdPause: protectedProcedure
    .mutation(async ({ ctx }) => {
      return pauseAdsForOutOfStockProducts(ctx.user.id);
    }),

  /**
   * Dead-letter queue status
   */
  dlqStatus: protectedProcedure
    .query(async () => {
      return getDLQStatus();
    }),
});
