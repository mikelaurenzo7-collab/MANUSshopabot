import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, orgProcedure, orgAdminProcedure, router } from "./_core/trpc";
import { dashboardRouter } from "./routers/dashboard";
import { storesRouter } from "./routers/stores";
import { architectRouter } from "./routers/architect";
import { merchantRouter } from "./routers/merchant";
import { socialRouter } from "./routers/social";
import { activityRouter } from "./routers/activity";
import { analyticsRouter } from "./routers/analytics";
import { connectorsRouter } from "./routers/connectors";
import { toolsRouter } from "./routers/tools";
import { workflowRouter } from "./routers/workflows";
import { telemetryRouter } from "./routers/telemetry";
import { diagnosticsRouter } from "./routers/diagnostics";
import { healthRouter } from "./routers/health";
import { orchestratorRouter } from "./routers/orchestrator";
import { workflowGraphRouter } from "./routers/workflowGraph";
import { pluginRouter } from "./routers/pluginStore";
import { supplierRouter } from "./routers/supplier";
import { promptRLRouter } from "./routers/promptRL";
import { stripeRouter } from "./routers/stripe";
import { botProfileRouter } from "./routers/botProfile";
import { gmailBotRouter } from "./routers/gmailBot";
import { queueHealthRouter } from "./routers/queueHealth";
import { chatRouter } from "./routers/chat";
import { lifecycleRouter } from "./routers/lifecycle";
import { orgsRouter } from "./routers/orgs";
import { workspacesRouter } from "./routers/workspaces";
import { resumeWorkflow, cancelWorkflow } from "./engine/workflowEngine";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    /**
     * Mark the calling user as having completed the onboarding wizard.
     * The OnboardingGuard reads this server-side timestamp instead of
     * a localStorage flag, so the redirect respects real state across
     * devices and can't be bypassed by clearing storage.
     */
    completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
      await db.markUserOnboarded(ctx.user.id);
      return { success: true, onboardedAt: new Date() } as const;
    }),
  }),

  // Feature routers
  dashboard: dashboardRouter,
  stores: storesRouter,
  architect: architectRouter,
  merchant: merchantRouter,
  social: socialRouter,
  activity: activityRouter,
  analytics: analyticsRouter,
  connectors: connectorsRouter,
  tools: toolsRouter,
  workflows: workflowRouter,
  telemetry: telemetryRouter,
  diagnostics: diagnosticsRouter,
  health: healthRouter,
  orchestrator: orchestratorRouter,
  workflowGraph: workflowGraphRouter,
  plugins: pluginRouter,
  supplier: supplierRouter,
  promptRL: promptRLRouter,
  stripe: stripeRouter,
  botProfile: botProfileRouter,
  gmailBot: gmailBotRouter,
  queueHealth: queueHealthRouter,
  chat: chatRouter,
  lifecycle: lifecycleRouter,
  orgs: orgsRouter,
  workspaces: workspacesRouter,

  // Notifications — scoped to current user
  notifications: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
      .query(async ({ ctx, input }) => {
        return db.getNotifications(ctx.user.id, input?.limit ?? 50);
      }),
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return db.getUnreadNotificationCount(ctx.user.id);
    }),
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Ownership check: only mark your own notifications as read
        const notification = await db.getNotificationById(input.id);
        if (!notification || notification.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your notification" });
        }
        await db.markNotificationRead(input.id);
        return { success: true };
      }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await db.markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),
  }),

  // Approval Queue — scoped to the active organization. Each approval
  // row carries `orgId` (migration 0023); listing must filter by it
  // so an approval from Org A never surfaces in Org B's queue.
  approvals: router({
    pending: orgProcedure.query(async ({ ctx }) => {
      return db.getPendingApprovalsByOrg(ctx.org.id);
    }),
    all: orgProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
      .query(async ({ ctx, input }) => {
        return db.getAllApprovalsByOrg(ctx.org.id, input?.limit ?? 50);
      }),
    review: orgAdminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["approved", "rejected"]),
        reviewNote: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify the approval belongs to the active org before mutating it.
        const orgApprovals = await db.getAllApprovalsByOrg(ctx.org.id, 500);
        const item = orgApprovals.find((a: any) => a.id === input.id);
        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Approval not found" });
        }

        // 1. Update the approval_queue row
        await db.updateApproval(input.id, {
          status: input.status,
          reviewNote: input.reviewNote,
        });

        // 2. If the approval item has a linked workflow, resume or cancel it
        const proposed = item?.proposedAction as { workflowId?: number; stepId?: number } | null;

        if (proposed?.workflowId && proposed?.stepId) {
          try {
            await resumeWorkflow(
              proposed.workflowId,
              proposed.stepId,
              input.status === "approved",
              input.reviewNote,
            );
          } catch (err: any) {
            // Workflow may have already been resolved — log but don't fail the mutation
            console.warn(`[Approvals] resumeWorkflow(${proposed.workflowId}) skipped:`, err.message);
          }
        }

        return { success: true };
      }),
  }),

  // Bot Configuration — per-organization. Owner/admin can edit.
  botConfig: router({
    list: orgProcedure.query(async ({ ctx }) => {
      return db.getBotConfigsByOrg(ctx.org.id);
    }),
    upsert: orgAdminProcedure
      .input(z.object({
        agentType: z.enum(["architect", "merchant", "social"]),
        enabled: z.boolean().optional(),
        autoApprove: z.boolean().optional(),
        autonomyLevel: z.enum(["fully_autonomous", "supervised", "manual"]).optional(),
        maxBudgetCents: z.number().optional(),
        config: z.any().optional(),
        // Priority 3: granular safety thresholds — now persisted to DB
        lowStockThreshold: z.number().int().min(0).max(10000).optional(),
        approvalRequired: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.upsertBotConfig({
          orgId: ctx.org.id,
          userId: ctx.user.id,
          agentType: input.agentType,
          enabled: input.enabled,
          autoApprove: input.autoApprove,
          autonomyLevel: input.autonomyLevel,
          maxBudgetCents: input.maxBudgetCents,
          config: input.config,
          lowStockThreshold: input.lowStockThreshold,
          approvalRequired: input.approvalRequired ?? false,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
