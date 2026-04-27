/**
 * Workflow Graph & Execution Override Router
 *
 * Phase 1: Real-time visual node graph support.
 * Provides endpoints for:
 * - Fetching live workflow/task state for the ReactFlow canvas
 * - Pausing, resuming, and overriding bot decisions
 * - Managing workflow pause points
 */

import { z } from "zod";
import { orgProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const workflowGraphRouter = router({
  /**
   * Live state snapshot: all active workflows + tasks for the active org,
   * formatted as nodes and edges for the ReactFlow canvas.
   */
  liveState: orgProcedure.query(async ({ ctx }) => {
    const stores = await db.getStoresByOrg(ctx.org.id);
    const storeIds = stores.map((s: any) => s.id);

    // Gather recent tasks across all stores (last 100)
    const allTasks: any[] = [];
    for (const sid of storeIds.slice(0, 10)) {
      const tasks = await db.getAgentTasks({ storeId: sid, limit: 30 });
      allTasks.push(...tasks);
    }

    // Build nodes: one per bot type + one per active task
    const botNodes = [
      { id: "architect", type: "botNode", position: { x: 100, y: 200 }, data: { label: "Architect Bot", status: "idle", agentType: "architect" } },
      { id: "merchant", type: "botNode", position: { x: 400, y: 100 }, data: { label: "Merchant Bot", status: "idle", agentType: "merchant" } },
      { id: "social", type: "botNode", position: { x: 400, y: 300 }, data: { label: "Social Bot", status: "idle", agentType: "social" } },
    ];

    // Mark bots as active if they have running tasks
    for (const task of allTasks) {
      const bot = botNodes.find(b => b.data.agentType === task.agentType);
      if (bot && (task.status === "running" || task.status === "pending_approval")) {
        bot.data.status = "active";
      }
    }

    // Task nodes
    const taskNodes = allTasks.slice(0, 25).map((t: any, i: number) => ({
      id: `task-${t.id}`,
      type: "taskNode",
      position: { x: 700, y: 40 + i * 50 },
      data: {
        label: t.title || t.taskType,
        status: t.status,
        agentType: t.agentType,
        taskId: t.id,
        canOverride: t.status === "pending_approval" || t.status === "running",
      },
    }));

    // Edges: bot → task
    const edges = taskNodes.map(tn => ({
      id: `e-${tn.data.agentType}-${tn.id}`,
      source: tn.data.agentType,
      target: tn.id,
      animated: tn.data.status === "running",
      style: { stroke: tn.data.status === "pending_approval" ? "#f59e0b" : "#6366f1" },
    }));

    // Cross-bot edges from bot events
    const recentEvents = await db.getPendingBotEvents(50);
    const processedEvents = recentEvents.filter((e: any) => e.status === "processed");
    for (const evt of processedEvents.slice(0, 10)) {
      if (evt.fromBot && evt.toBot) {
        edges.push({
          id: `cross-${evt.id}`,
          source: evt.fromBot,
          target: evt.toBot,
          animated: false,
          style: { stroke: "#10b981" },
        });
      }
    }

    return { nodes: [...botNodes, ...taskNodes], edges };
  }),

  /**
   * Pause a running task — inserts an override record and updates status.
   */
  pauseTask: protectedProcedure
    .input(z.object({ taskId: z.number(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      await db.createExecutionOverride({
        agentTaskId: input.taskId,
        overriddenByUserId: ctx.user.id,
        actionTaken: "paused",
        reason: input.reason || "Manual pause from dashboard",
      });
      await db.updateAgentTask(input.taskId, { status: "pending_approval" });
      return { success: true };
    }),

  /**
   * Resume a paused task.
   */
  resumeTask: protectedProcedure
    .input(z.object({ taskId: z.number(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      await db.createExecutionOverride({
        agentTaskId: input.taskId,
        overriddenByUserId: ctx.user.id,
        actionTaken: "resumed",
        reason: input.reason || "Manual resume from dashboard",
      });
      await db.updateAgentTask(input.taskId, { status: "running" });
      return { success: true };
    }),

  /**
   * Cancel/override a task entirely.
   */
  cancelTask: protectedProcedure
    .input(z.object({ taskId: z.number(), reason: z.string().max(500) }))
    .mutation(async ({ ctx, input }) => {
      await db.createExecutionOverride({
        agentTaskId: input.taskId,
        overriddenByUserId: ctx.user.id,
        actionTaken: "cancelled",
        reason: input.reason,
      });
      await db.updateAgentTask(input.taskId, { status: "rejected" });
      return { success: true };
    }),

  /**
   * History of overrides for audit trail.
   */
  overrideHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ input }) => {
      return db.getRecentOverrides(input?.limit ?? 50);
    }),

  /**
   * Manage pause points for workflows.
   */
  addPausePoint: protectedProcedure
    .input(z.object({
      workflowId: z.number(),
      stepId: z.number(),
      pauseReason: z.string().max(500),
      overrideRequired: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const id = await db.createPausePoint(input);
      return { id };
    }),

  getPausePoints: protectedProcedure
    .input(z.object({ workflowId: z.number() }))
    .query(async ({ input }) => {
      return db.getPausePointsByWorkflow(input.workflowId);
    }),
});
