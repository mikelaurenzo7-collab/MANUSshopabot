import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { dashboardRouter } from "./routers/dashboard";
import { storesRouter } from "./routers/stores";
import { architectRouter } from "./routers/architect";
import { merchantRouter } from "./routers/merchant";
import { socialRouter } from "./routers/social";
import { activityRouter } from "./routers/activity";
import { analyticsRouter } from "./routers/analytics";
import { connectorsRouter } from "./routers/connectors";
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
import { profitBotRouter } from "./routers/profitBot";
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
  profitBot: profitBotRouter,

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

  // Approval Queue — admin only for reviewing decisions
  approvals: router({
    pending: protectedProcedure.query(async () => {
      return db.getPendingApprovals();
    }),
    all: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
      .query(async ({ input }) => {
        return db.getAllApprovals(input?.limit ?? 50);
      }),
    review: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["approved", "rejected"]),
        reviewNote: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateApproval(input.id, {
          status: input.status,
          reviewNote: input.reviewNote,
        });
        return { success: true };
      }),
  }),

  // Bot Configuration — admin only
  botConfig: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getBotConfigs(ctx.user.id);
    }),
    upsert: adminProcedure
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
