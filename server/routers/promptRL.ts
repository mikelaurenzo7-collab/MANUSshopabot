/**
 * Prompt Reinforcement Learning Router
 *
 * Phase 4: Network-wide A/B testing of LLM system prompts.
 * Manages prompt variants, tracks invocation metrics, and promotes
 * the top-performing variant based on real conversion data.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const promptRLRouter = router({
  /**
   * List all prompt variants, optionally filtered by agent type.
   */
  listVariants: protectedProcedure
    .input(z.object({ agentType: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return db.listPromptVariants(input?.agentType);
    }),

  /**
   * Create a new prompt variant for A/B testing.
   */
  createVariant: protectedProcedure
    .input(z.object({
      agentType: z.enum(["architect", "merchant", "social"]),
      taskType: z.string().min(1).max(100),
      variantName: z.string().min(1).max(50),
      promptTemplate: z.string().min(10),
      activate: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const id = await db.createPromptVariant({
        agentType: input.agentType,
        taskType: input.taskType,
        variantName: input.variantName,
        promptTemplate: input.promptTemplate,
        isActive: input.activate,
      });
      return { id };
    }),

  /**
   * Fetch the currently active prompt for a given agent + task.
   * This is what the bot routers call before invoking the LLM.
   */
  getActivePrompt: protectedProcedure
    .input(z.object({
      agentType: z.string(),
      taskType: z.string(),
    }))
    .query(async ({ input }) => {
      return db.getActivePromptVariant(input.agentType, input.taskType);
    }),

  /**
   * Promote a variant to "active" — deactivates all siblings.
   */
  promoteVariant: protectedProcedure
    .input(z.object({ variantId: z.number() }))
    .mutation(async ({ input }) => {
      await db.promotePromptVariant(input.variantId);
      return { success: true };
    }),

  /**
   * Record that a prompt variant was used (invocation tracking).
   * Called by the bot routers after each LLM call.
   */
  recordInvocation: protectedProcedure
    .input(z.object({
      variantId: z.number(),
      storeId: z.number().nullable(),
      converted: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      await db.recordPromptInvocation(input.variantId, input.storeId, input.converted);
      return { success: true };
    }),

  /**
   * Record a conversion event (order placed, ad clicked, etc.)
   * attributed to a specific prompt variant.
   */
  recordConversion: protectedProcedure
    .input(z.object({
      variantId: z.number(),
      storeId: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      await db.recordPromptInvocation(input.variantId, input.storeId, true);
      return { success: true };
    }),

  /**
   * Get metrics for a specific variant.
   */
  variantMetrics: protectedProcedure
    .input(z.object({ variantId: z.number() }))
    .query(async ({ input }) => {
      return db.getPromptMetricsByVariant(input.variantId);
    }),

  /**
   * Evaluate all variants for a given agent+task and return the winner.
   * This is the "RL Evaluator" — finds the statistically best prompt.
   */
  evaluateBest: protectedProcedure
    .input(z.object({
      agentType: z.string(),
      taskType: z.string(),
    }))
    .query(async ({ input }) => {
      const best = await db.getTopPerformingVariant(input.agentType, input.taskType);
      return best || null;
    }),

  /**
   * Auto-promote: evaluate and promote the best variant in one call.
   * This is designed to be called by the job queue on a schedule.
   */
  autoPromote: protectedProcedure
    .input(z.object({
      agentType: z.string(),
      taskType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const best = await db.getTopPerformingVariant(input.agentType, input.taskType);
      if (best) {
        await db.promotePromptVariant(best.id);
        return { promoted: true, variantId: best.id, variantName: best.variantName };
      }
      return { promoted: false, reason: "No variant with sufficient sample size (min 10 invocations)" };
    }),

  /**
   * Dashboard summary: metrics for all variants of a given agent+task.
   */
  dashboard: protectedProcedure
    .input(z.object({
      agentType: z.string(),
      taskType: z.string(),
    }))
    .query(async ({ input }) => {
      const variants = await db.listPromptVariants(input.agentType);
      const filtered = variants.filter((v: any) => v.taskType === input.taskType);
      const results = [];
      for (const v of filtered) {
        const metrics = await db.getPromptMetricsByVariant(v.id);
        const totalInvocations = metrics.reduce((sum: number, m: any) => sum + (m.invocations ?? 0), 0);
        const totalConversions = metrics.reduce((sum: number, m: any) => sum + (m.conversions ?? 0), 0);
        results.push({
          ...v,
          totalInvocations,
          totalConversions,
          conversionRate: totalInvocations > 0 ? Math.round(totalConversions / totalInvocations * 100) : 0,
        });
      }
      return results;
    }),
});
