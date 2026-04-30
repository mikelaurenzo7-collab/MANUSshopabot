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
   *
   * Optionally scoped to a single session. When no `sessionId` is given,
   * returns messages across the whole workspace (legacy behavior, used as
   * a fallback by older clients before the session sidebar shipped).
   */
  getChatMessages: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      sessionId: z.number().optional(),
      limit: z.number().min(1).max(500).default(200),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);
      if (input.sessionId) {
        // Verify the session is in this workspace before returning messages.
        const session = await db.getWorkspaceChatSessionById(input.sessionId);
        if (!session || session.workspaceId !== input.workspaceId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
        }
        return db.getWorkspaceChatSessionMessages(input.sessionId, {
          limit: input.limit,
          offset: input.offset,
        });
      }
      return db.getWorkspaceChatMessages(input.workspaceId, input.limit, input.offset);
    }),

  /**
   * List chat sessions for a workspace (sidebar feed).
   * Adopts any pre-sessions messages into a "Continued from earlier"
   * session on first call so existing history isn't lost.
   */
  listChatSessions: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      includeArchived: z.boolean().optional().default(false),
      limit: z.number().min(1).max(200).default(100),
    }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);
      // One-time backfill of legacy chat messages into a default session.
      await db.adoptOrphanWorkspaceChatMessages(input.workspaceId, ctx.user.id);
      return db.listWorkspaceChatSessions(input.workspaceId, {
        includeArchived: input.includeArchived,
        limit: input.limit,
      });
    }),

  /**
   * Create a new chat session in a workspace ("+ New chat" in the sidebar).
   * The title is optional — it will be auto-derived from the first user
   * message if not provided.
   */
  createChatSession: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      title: z.string().min(1).max(255).optional(),
      summary: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);
      return db.createWorkspaceChatSession({
        workspaceId: input.workspaceId,
        createdByUserId: ctx.user.id,
        title: input.title ? sanitizeName(input.title, 255) : "New chat",
        summary: input.summary ? sanitizeText(input.summary, 500) : undefined,
      });
    }),

  /**
   * Rename a session (sidebar inline edit).
   */
  renameChatSession: orgProcedure
    .input(z.object({
      sessionId: z.number(),
      title: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.getWorkspaceChatSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      await requireWorkspaceInOrg(session.workspaceId, ctx.org.id);
      await db.updateWorkspaceChatSession(input.sessionId, {
        title: sanitizeName(input.title, 255),
      });
      return { success: true };
    }),

  /**
   * Pin or unpin a session (pinned sessions float to the top of the sidebar).
   */
  pinChatSession: orgProcedure
    .input(z.object({ sessionId: z.number(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.getWorkspaceChatSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      await requireWorkspaceInOrg(session.workspaceId, ctx.org.id);
      await db.updateWorkspaceChatSession(input.sessionId, { pinned: input.pinned });
      return { success: true };
    }),

  /**
   * Archive (or unarchive) a session — soft delete that keeps history.
   */
  archiveChatSession: orgProcedure
    .input(z.object({ sessionId: z.number(), archived: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.getWorkspaceChatSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      await requireWorkspaceInOrg(session.workspaceId, ctx.org.id);
      await db.updateWorkspaceChatSession(input.sessionId, {
        archived: input.archived,
        archivedAt: input.archived ? new Date() : null,
      });
      return { success: true };
    }),

  /**
   * Hard-delete a session and all of its messages. Use sparingly —
   * archiveChatSession is the user-facing default in the UI.
   */
  deleteChatSession: orgProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.getWorkspaceChatSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      await requireWorkspaceInOrg(session.workspaceId, ctx.org.id);
      await db.deleteWorkspaceChatSession(input.sessionId);
      return { success: true };
    }),

  /**
   * Send a chat message in a workspace (direct insert, no LLM).
   *
   * For LLM turns the client should use `chat.message` with a sessionId,
   * which auto-persists both sides of the turn. This endpoint stays for
   * legacy callers and for tests that want to insert a single message.
   */
  sendMessage: orgProcedure
    .input(z.object({
      workspaceId: z.number(),
      sessionId: z.number().optional(),
      content: z.string().min(1),
      role: z.enum(["user", "assistant", "system"]).default("user"),
      toolCalls: z.any().optional(),
      relatedWorkflowId: z.number().optional(),
      metadata: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceInOrg(input.workspaceId, ctx.org.id);

      if (input.sessionId) {
        const session = await db.getWorkspaceChatSessionById(input.sessionId);
        if (!session || session.workspaceId !== input.workspaceId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
        }
      }

      const message = await db.createWorkspaceChatMessage({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        userId: ctx.user.id,
        role: input.role,
        content: sanitizeText(input.content, 50000),
        toolCalls: input.toolCalls,
        relatedWorkflowId: input.relatedWorkflowId,
        metadata: input.metadata,
      });

      if (input.sessionId) {
        await db.refreshWorkspaceChatSessionCounters(input.sessionId);
      }

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
