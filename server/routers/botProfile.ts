import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { boundedJsonBlob } from "../utils/boundedJson";
import {
  getBotProfile,
  upsertBotProfile,
  getBotMemory,
  addBotMemory,
  getBotSchedules,
  upsertBotSchedule,
  getBotSafetyRules,
  addBotSafetyRule,
  getBotExecutionHistory,
  logBotExecution,
} from "../db";
import { TRPCError } from "@trpc/server";
import { sanitizeName, sanitizeMultiline } from "../utils/sanitize";

const AgentType = z.enum(["architect", "merchant", "social"]);
const MemoryType = z.enum(["fact", "pattern", "decision", "outcome", "context"]);
const TriggerType = z.enum(["cron", "interval", "manual", "event"]);
const RuleType = z.enum(["spending_limit", "price_limit", "action_restriction", "approval_required", "rate_limit"]);

export const botProfileRouter = router({
  // Get bot profile
  getProfile: protectedProcedure
    .input(z.object({ agentType: AgentType }))
    .query(async ({ ctx, input }: any) => {
      const profile = await getBotProfile(ctx.user.id, input.agentType);
      return profile || null;
    }),

  // Update bot profile
  updateProfile: protectedProcedure
    .input(
      z.object({
        agentType: AgentType,
        name: z.string().optional(),
        description: z.string().optional(),
        systemPrompt: z.string().optional(),
        customInstructions: z.string().optional(),
        personality: z.string().optional(),
        autonomyLevel: z.enum(["fully_autonomous", "supervised", "manual"]).optional(),
        requiresApproval: z.boolean().optional(),
        approvalThreshold: z.string().optional(),
        memoryEnabled: z.boolean().optional(),
        memoryType: z.enum(["short_term", "long_term", "hybrid"]).optional(),
        memoryMaxItems: z.number().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }: any) => {
      const { agentType, ...updateData } = input;
      if (updateData.name) updateData.name = sanitizeName(updateData.name, 100);
      if (updateData.description) updateData.description = sanitizeMultiline(updateData.description, 500);
      if (updateData.systemPrompt) updateData.systemPrompt = sanitizeMultiline(updateData.systemPrompt, 5000);
      if (updateData.customInstructions) updateData.customInstructions = sanitizeMultiline(updateData.customInstructions, 5000);
      if (updateData.personality) updateData.personality = sanitizeMultiline(updateData.personality, 1000);
      const profileId = await upsertBotProfile({
        userId: ctx.user.id,
        agentType,
        ...updateData,
      });
      return { id: profileId, agentType };
    }),

  // Get bot memory
  getMemory: protectedProcedure
    .input(z.object({ agentType: AgentType, limit: z.number().optional() }))
    .query(async ({ ctx, input }: any) => {
      const profile = await getBotProfile(ctx.user.id, input.agentType);
      if (!profile) return [];
      return getBotMemory(profile.id, input.limit || 50);
    }),

  // Add memory entry
  addMemory: protectedProcedure
    .input(
      z.object({
        agentType: AgentType,
        memoryType: MemoryType,
        key: z.string(),
        value: z.string(),
        confidence: z.number().min(0).max(100).optional(),
        tags: z.array(z.string()).optional(),
        relatedWorkflowId: z.number().optional(),
        relatedStoreId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }: any) => {
      const profile = await getBotProfile(ctx.user.id, input.agentType);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Bot profile not found" });

      const memoryId = await addBotMemory({
        botProfileId: profile.id,
        userId: ctx.user.id,
        memoryType: input.memoryType,
        key: sanitizeName(input.key, 200),
        value: sanitizeMultiline(input.value, 2000),
        confidence: input.confidence || 50,
        tags: input.tags ? JSON.stringify(input.tags) : undefined,
        relatedWorkflowId: input.relatedWorkflowId,
        relatedStoreId: input.relatedStoreId,
      } as any);
      return { id: memoryId };
    }),

  // Get bot schedules
  getSchedules: protectedProcedure
    .input(z.object({ agentType: AgentType }))
    .query(async ({ ctx, input }: any) => {
      const profile = await getBotProfile(ctx.user.id, input.agentType);
      if (!profile) return [];
      return getBotSchedules(profile.id);
    }),

  // Create/update schedule
  upsertSchedule: protectedProcedure
    .input(
      z.object({
        agentType: AgentType,
        id: z.number().optional(),
        name: z.string(),
        description: z.string().optional(),
        taskType: z.string(),
        triggerType: TriggerType,
        cronExpression: z.string().optional(),
        intervalSeconds: z.number().optional(),
        eventType: z.string().optional(),
        taskInput: boundedJsonBlob().optional(),
        targetStoreIds: z.array(z.number()).optional(),
        maxConcurrent: z.number().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }: any) => {
      const profile = await getBotProfile(ctx.user.id, input.agentType);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Bot profile not found" });

      const scheduleId = await upsertBotSchedule({
        id: input.id,
        botProfileId: profile.id,
        userId: ctx.user.id,
        name: sanitizeName(input.name, 100),
        description: input.description ? sanitizeMultiline(input.description, 500) : undefined,
        taskType: input.taskType,
        triggerType: input.triggerType,
        cronExpression: input.cronExpression || undefined,
        intervalSeconds: input.intervalSeconds || undefined,
        eventType: input.eventType || undefined,
        taskInput: input.taskInput ? JSON.stringify(input.taskInput) : undefined,
        targetStoreIds: input.targetStoreIds ? JSON.stringify(input.targetStoreIds) : undefined,
        maxConcurrent: input.maxConcurrent || 1,
        enabled: input.enabled !== false,
      } as any);
      return { id: scheduleId };
    }),

  // Get safety rules
  getSafetyRules: protectedProcedure
    .input(z.object({ agentType: AgentType }))
    .query(async ({ ctx, input }: any) => {
      const profile = await getBotProfile(ctx.user.id, input.agentType);
      if (!profile) return [];
      return getBotSafetyRules(profile.id);
    }),

  // Add safety rule
  addSafetyRule: protectedProcedure
    .input(
      z.object({
        agentType: AgentType,
        name: z.string(),
        description: z.string().optional(),
        ruleType: RuleType,
        condition: boundedJsonBlob(),
        action: z.enum(["block", "warn", "approve_required", "log"]).optional(),
        appliesToWorkflows: z.array(z.string()).optional(),
        appliesToStores: z.array(z.number()).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }: any) => {
      const profile = await getBotProfile(ctx.user.id, input.agentType);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Bot profile not found" });

      const ruleId = await addBotSafetyRule({
        botProfileId: profile.id,
        userId: ctx.user.id,
        name: sanitizeName(input.name, 100),
        description: input.description ? sanitizeMultiline(input.description, 500) : undefined,
        ruleType: input.ruleType,
        condition: JSON.stringify(input.condition),
        action: input.action || "warn",
        appliesToWorkflows: input.appliesToWorkflows ? JSON.stringify(input.appliesToWorkflows) : undefined,
        appliesToStores: input.appliesToStores ? JSON.stringify(input.appliesToStores) : undefined,
        enabled: input.enabled !== false,
      } as any);
      return { id: ruleId };
    }),

  // Get execution history
  getExecutionHistory: protectedProcedure
    .input(z.object({ agentType: AgentType, limit: z.number().optional() }))
    .query(async ({ ctx, input }: any) => {
      const profile = await getBotProfile(ctx.user.id, input.agentType);
      if (!profile) return [];
      return getBotExecutionHistory(profile.id, input.limit || 50);
    }),
});
