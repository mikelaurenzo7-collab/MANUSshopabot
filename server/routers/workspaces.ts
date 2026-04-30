/**
 * Workspaces Router — Multi-workspace architecture for per-store isolation.
 * 
 * Each workspace represents an isolated context (usually one per store) with:
 *  - Independent chat history and bot memory
 *  - Workspace-specific integrations (Gmail, Twitter, etc.)
 *  - Custom settings and configurations
 *  - Isolated workflows and automation
 * 
 * This allows users to manage multiple stores/contexts without mixing
 * chat history, integrations, or settings between them.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { orgProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { sanitizeName, sanitizeText } from "../utils/sanitize";

const workspaceTypeEnum = z.enum(["store", "general", "campaign", "channel"]);

const integrationTypeEnum = z.enum([
  // Email
  "gmail", "outlook",
  // Social
  "twitter", "facebook", "instagram", "tiktok", "linkedin", "pinterest",
  "youtube", "snapchat",
  // Messaging
  "slack", "discord", "telegram", "whatsapp",
  // Commerce
  "shopify", "stripe",
  // Marketing / lifecycle
  "mailchimp", "klaviyo", "zapier",
  // Ads
  "google_ads", "meta_ads", "tiktok_ads",
  // Calendar
  "google_calendar", "outlook_calendar",
]);

const memoryTypeEnum = z.enum(["fact", "pattern", "decision", "outcome", "context", "preference"]);

/**
 * Throw NOT_FOUND if the workspace doesn't exist OR doesn't belong to the
 * caller's active org. Centralizes the org-scoping check.
 */
async function requireWorkspaceInOrg(workspaceId: number, orgId: number) {
  const workspace = await db.getWorkspaceById(workspaceId);
  if (!workspace || workspace.orgId !== orgId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
  }
  return workspace;
}

export const workspacesRouter = router({
  /**
   * List all workspaces for the current org
   */
  list: orgProcedure
    .input(z.object({
      includeArchived: z.boolean().optional().default(false),
    }).optional())
    .query(async ({ ctx, input }) => {
      return db.getWorkspacesByOrg(ctx.org.id, input?.includeArchived ?? false);
    }),

  /**
   * Get a single workspace by ID
   */
  get: orgProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return requireWorkspaceInOrg(input.id, ctx.org.id);
    }),

  /**
   * Create a new workspace
   */
  create: orgProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      slug: z.string().min(1).max(100),
      icon: z.string().max(255).optional(),
      color: z.string().max(20).optional(),
      storeId: z.number().optional(),
      workspaceType: workspaceTypeEnum.default("store"),
    }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await db.createWorkspace({
        orgId: ctx.org.id,
        createdByUserId: ctx.user.id,
        name: sanitizeName(input.name, 255),
        description: input.description ? sanitizeText(input.description, 1000) : undefined,
        slug: sanitizeName(input.slug, 100).toLowerCase().replace(/\s+/g, '-'),
        icon: input.icon,
        color: input.color,
        storeId: input.storeId,
        workspaceType: input.workspaceType,
      });

      // Create default settings for the workspace
      await db.getOrCreateWorkspaceSettings(workspace.id);

      return workspace;
    }),

  /**
   * Update workspace details
   */
  update: orgProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(1000).optional(),
      icon: z.string().max(255).optional(),
      color: z.string().max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.id, ctx.org.id);

      const updates: any = {};
      if (input.name) updates.name = sanitizeName(input.name, 255);
      if (input.description !== undefined) updates.description = input.description ? sanitizeText(input.description, 1000) : null;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.color !== undefined) updates.color = input.color;

      await db.updateWorkspace(input.id, updates);
      return { success: true };
    }),

  /**
   * Archive a workspace (soft delete)
   */
  archive: orgProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.id, ctx.org.id);
      await db.archiveWorkspace(input.id);
      return { success: true };
    }),

  /**
   * Get workspace settings
   */
  getSettings: orgProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);
      return db.getOrCreateWorkspaceSettings(input.workspaceId);
    }),

  /**
   * Update workspace settings
   */
  updateSettings: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      botEnabled: z.boolean().optional(),
      autonomyLevel: z.enum(["fully_autonomous", "supervised", "manual"]).optional(),
      requiresApproval: z.boolean().optional(),
      customInstructions: z.string().optional(),
      systemPrompt: z.string().optional(),
      personality: z.string().max(100).optional(),
      notificationsEnabled: z.boolean().optional(),
      notificationChannels: z.array(z.string()).optional(),
      dailyBudgetCents: z.number().optional(),
      approvalThresholdCents: z.number().optional(),
      safetyRules: z.any().optional(),
      enabledFeatures: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);
      
      const { workspaceId, ...updates } = input;
      await db.updateWorkspaceSettings(workspaceId, updates);
      
      return { success: true };
    }),

  /**
   * Get chat messages for a workspace
   */
  getChatMessages: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      limit: z.number().min(1).max(200).default(100),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);
      return db.getWorkspaceChatMessages(input.workspaceId, input.limit, input.offset);
    }),

  /**
   * Send a chat message in a workspace
   */
  sendMessage: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      content: z.string().min(1),
      role: z.enum(["user", "assistant", "system"]).default("user"),
      toolCalls: z.any().optional(),
      relatedWorkflowId: z.number().optional(),
      metadata: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);

      const message = await db.createWorkspaceChatMessage({
        workspaceId: input.workspaceId,
        userId: ctx.user.id,
        role: input.role,
        content: sanitizeText(input.content, 50000),
        toolCalls: input.toolCalls,
        relatedWorkflowId: input.relatedWorkflowId,
        metadata: input.metadata,
      });

      return message;
    }),

  /**
   * List workflows scoped to a workspace (via workspace.storeId).
   *
   * Each workspace usually represents one store, so filtering workflows by
   * the workspace's storeId gives us a workspace-scoped workflow list
   * without needing to backfill workspaceId on every workflow row.
   */
  listWorkflows: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      status: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const workspace = await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);
      const { getWorkflowsByOrg } = await import("../db");
      return getWorkflowsByOrg(ctx.org.id, {
        storeId: workspace.storeId ?? undefined,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * List integrations connected to a workspace
   */
  listIntegrations: orgProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);
      return db.getWorkspaceIntegrations(input.workspaceId);
    }),

  /**
   * Connect an integration to a workspace
   */
  connectIntegration: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      integrationType: integrationTypeEnum,
      accountId: z.string().max(255).optional(),
      accountName: z.string().max(255).optional(),
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
      tokenExpiresAt: z.date().optional(),
      config: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);

      const integration = await db.createWorkspaceIntegration({
        workspaceId: input.workspaceId,
        integrationType: input.integrationType,
        accountId: input.accountId,
        accountName: input.accountName,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        tokenExpiresAt: input.tokenExpiresAt,
        config: input.config,
        connectedByUserId: ctx.user.id,
        enabled: true,
      });

      return integration;
    }),

  /**
   * Update workspace integration
   */
  updateIntegration: orgProcedure
    .input(z.object({
      id: z.number(),
      enabled: z.boolean().optional(),
      config: z.any().optional(),
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
      tokenExpiresAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // First get the integration to check workspace ownership
      const dbClient = await db.getDb();
      if (!dbClient) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      const { workspaceIntegrations } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      const [integration] = await dbClient
        .select()
        .from(workspaceIntegrations)
        .where(eq(workspaceIntegrations.id, input.id));
      
      if (!integration) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Integration not found" });
      }

      await requireWorkspaceInOrg(integration.workspaceId, ctx.org.id);

      const { id, ...updates } = input;
      await db.updateWorkspaceIntegration(id, updates);

      return { success: true };
    }),

  /**
   * Disconnect integration from workspace
   */
  disconnectIntegration: orgProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // First get the integration to check workspace ownership
      const dbClient = await db.getDb();
      if (!dbClient) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      const { workspaceIntegrations } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      const [integration] = await dbClient
        .select()
        .from(workspaceIntegrations)
        .where(eq(workspaceIntegrations.id, input.id));
      
      if (!integration) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Integration not found" });
      }

      await requireWorkspaceInOrg(integration.workspaceId, ctx.org.id);
      await db.deleteWorkspaceIntegration(input.id);

      return { success: true };
    }),

  /**
   * Get workspace memory entries
   */
  getMemory: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      memoryType: memoryTypeEnum.optional(),
      limit: z.number().min(1).max(200).default(100),
    }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);
      return db.getWorkspaceMemory(input.workspaceId, input.memoryType, input.limit);
    }),

  /**
   * Create a memory entry for a workspace
   */
  createMemory: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      memoryType: memoryTypeEnum,
      key: z.string().min(1).max(255),
      value: z.string().min(1),
      confidence: z.number().min(0).max(100).optional(),
      relatedWorkflowId: z.number().optional(),
      relatedMessageId: z.number().optional(),
      tags: z.array(z.string()).optional(),
      expiresAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);

      const memory = await db.createWorkspaceMemory({
        workspaceId: input.workspaceId,
        memoryType: input.memoryType,
        key: sanitizeText(input.key, 255),
        value: sanitizeText(input.value, 10000),
        confidence: input.confidence ?? 50,
        relatedWorkflowId: input.relatedWorkflowId,
        relatedMessageId: input.relatedMessageId,
        tags: input.tags,
        expiresAt: input.expiresAt,
      });

      return memory;
    }),

  /**
   * Update workspace memory
   */
  updateMemory: orgProcedure
    .input(z.object({
      id: z.number(),
      value: z.string().optional(),
      confidence: z.number().min(0).max(100).optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // First get the memory to check workspace ownership
      const dbClient = await db.getDb();
      if (!dbClient) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      const { workspaceMemory } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      const [memory] = await dbClient
        .select()
        .from(workspaceMemory)
        .where(eq(workspaceMemory.id, input.id));
      
      if (!memory) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
      }

      await requireWorkspaceInOrg(memory.workspaceId, ctx.org.id);

      const { id, ...updates } = input;
      await db.updateWorkspaceMemory(id, updates);

      return { success: true };
    }),

  /**
   * Delete workspace memory
   */
  deleteMemory: orgProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // First get the memory to check workspace ownership
      const dbClient = await db.getDb();
      if (!dbClient) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      const { workspaceMemory } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      const [memory] = await dbClient
        .select()
        .from(workspaceMemory)
        .where(eq(workspaceMemory.id, input.id));
      
      if (!memory) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
      }

      await requireWorkspaceInOrg(memory.workspaceId, ctx.org.id);
      await db.deleteWorkspaceMemory(input.id);

      return { success: true };
    }),
});
