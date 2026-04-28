/**
 * Shop_a_Bot — Tool Connectors Router
 *
 * Surfaces the cross-cutting tool integrations (Google Sheets, GA4,
 * Klaviyo, ShipStation, Postscript, Printful, Judge.me, Gorgias) used
 * by the Architect, Merchant, and Social bots.
 *
 * Two connection types:
 *   - oauth   → Google Sheets, GA4 (reuse existing Google OAuth app)
 *   - api_key → Klaviyo, ShipStation, Postscript, Printful, Judge.me, Gorgias
 *
 * Records are stored in the same `platform_credentials` table used by
 * the e-commerce router. The `platform` column doubles as the tool id.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { orgProcedure, protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import * as db from "../db";
import { getToolAdapter, buildToolCredentials, SUPPORTED_TOOL_CONNECTORS } from "../adapters/tools";
import type { BotDomain, ToolCategory } from "../adapters/tools/types";
import { BOTS } from "@shared/bots";

interface ApiKeyField {
  key: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  type?: "text" | "password";
  required?: boolean;
}

interface ToolConnectorConfig {
  name: string;
  icon: string;
  color: string;
  category: ToolCategory;
  bots: ReadonlyArray<BotDomain>;
  description: string;
  capabilities: ReadonlyArray<string>;
  whereToFind: string;
  connectionType: "oauth" | "api_key";
  /** OAuth scopes (oauth tools only). */
  oauthScopes?: string;
  /** Self-serve API key fields (api_key tools only). */
  fields?: ApiKeyField[];
}

const TOOL_CONNECTORS: Record<string, ToolConnectorConfig> = {
  google_sheets: {
    name: "Google Sheets",
    icon: "📊",
    color: "#0F9D58",
    category: "data",
    bots: ["architect", "merchant", "social"],
    description: "Read/write spreadsheets — sync catalogs, log events, share P&L tabs with the bots.",
    capabilities: ["Catalog sync", "Order/event logging", "Supplier price lists", "Scheduled exports"],
    whereToFind: "Click Connect to sign in with Google. We only read sheets you explicitly grant.",
    connectionType: "oauth",
    oauthScopes: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email",
  },
  google_analytics: {
    name: "Google Analytics 4",
    icon: "📈",
    color: "#F9AB00",
    category: "analytics",
    bots: ["architect", "merchant", "social"],
    description: "Pull session, conversion, and revenue metrics straight from GA4 properties.",
    capabilities: ["Channel attribution", "Top landing pages", "Revenue by source", "Conversion paths"],
    whereToFind: "Click Connect to sign in with the Google account that owns your GA4 property.",
    connectionType: "oauth",
    oauthScopes: "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/userinfo.email",
  },
  klaviyo: {
    name: "Klaviyo",
    icon: "💌",
    color: "#5C50C6",
    category: "marketing",
    bots: ["merchant", "social"],
    description: "Sync segments, trigger flows, and send broadcasts driven by merchant-bot insights.",
    capabilities: ["Segment sync", "Abandoned-cart flows", "Profile upserts", "Broadcast sends"],
    whereToFind: "Klaviyo dashboard → Settings → API Keys → Create Private API Key (Full Access).",
    connectionType: "api_key",
    fields: [
      { key: "apiKey", label: "Private API Key", placeholder: "pk_•••", type: "password", required: true, helpText: "Starts with pk_" },
    ],
  },
  shipstation: {
    name: "ShipStation",
    icon: "📦",
    color: "#0072CE",
    category: "logistics",
    bots: ["merchant"],
    description: "Live multi-carrier rates, label generation, and tracking — feeds real margin data.",
    capabilities: ["Rate shopping", "Label printing", "Tracking sync", "Cost-of-shipping in margin calcs"],
    whereToFind: "ShipStation → Account → API Settings → Generate API Keys.",
    connectionType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "apiSecret", label: "API Secret", type: "password", required: true },
    ],
  },
  postscript: {
    name: "Postscript",
    icon: "📱",
    color: "#FF5C35",
    category: "messaging",
    bots: ["social", "merchant"],
    description: "SMS broadcasts, abandoned-cart texts, and back-in-stock alerts orchestrated by the Social bot.",
    capabilities: ["SMS broadcasts", "Abandoned-cart texts", "Restock alerts", "Keyword campaigns"],
    whereToFind: "Postscript dashboard → Settings → API → Generate Token.",
    connectionType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key (Bearer Token)", type: "password", required: true },
    ],
  },
  printful: {
    name: "Printful",
    icon: "👕",
    color: "#0E1116",
    category: "fulfillment",
    bots: ["merchant"],
    description: "Print-on-demand catalog sync and automated order routing for POD stores.",
    capabilities: ["POD product sync", "Auto-fulfill orders", "Production ETAs", "Cost reconciliation"],
    whereToFind: "Printful → Stores → API Access → Create Private API Token.",
    connectionType: "api_key",
    fields: [
      { key: "apiKey", label: "Private API Token", type: "password", required: true },
    ],
  },
  judgeme: {
    name: "Judge.me",
    icon: "⭐",
    color: "#FF642F",
    category: "reviews",
    bots: ["merchant", "social"],
    description: "Pull reviews, triage low-star feedback, and surface UGC for the Social bot to repost.",
    capabilities: ["Review insights", "Auto-replies", "UGC for content", "Quality drop detection"],
    whereToFind: "Judge.me → Settings → General → Private API Token. Plus your shop domain (acme.myshopify.com).",
    connectionType: "api_key",
    fields: [
      { key: "apiKey", label: "Private API Token", type: "password", required: true },
      { key: "shopDomain", label: "Shop Domain", placeholder: "acme.myshopify.com", required: true },
    ],
  },
  gorgias: {
    name: "Gorgias",
    icon: "🎧",
    color: "#1B66FF",
    category: "support",
    bots: ["merchant"],
    description: "Triage tickets by intent, auto-answer order-status questions, and escalate refunds.",
    capabilities: ["Ticket triage", "Auto-replies", "Refund/return routing", "Order context bridging"],
    whereToFind: "Gorgias → Settings → REST API. You'll need your subdomain, login email, and API key.",
    connectionType: "api_key",
    fields: [
      { key: "subdomain", label: "Subdomain", placeholder: "acme (from acme.gorgias.com)", required: true },
      { key: "email", label: "Login Email", placeholder: "you@store.com", required: true },
      { key: "apiKey", label: "API Key", type: "password", required: true },
    ],
  },
};

export const TOOL_CONNECTOR_IDS = Object.keys(TOOL_CONNECTORS);

export const toolsRouter = router({
  /** List all tool connectors with auth + capability metadata. */
  list: protectedProcedure.query(() => {
    return Object.entries(TOOL_CONNECTORS).map(([id, t]) => ({
      id,
      name: t.name,
      icon: t.icon,
      color: t.color,
      category: t.category,
      bots: t.bots,
      description: t.description,
      capabilities: t.capabilities,
      whereToFind: t.whereToFind,
      connectionType: t.connectionType,
      fields: t.fields,
    }));
  }),

  /** Org's currently connected tool credentials. */
  listConnected: orgProcedure.query(async ({ ctx }) => {
    const all = await db.getPlatformCredentialsByOrg(ctx.org.id);
    return (all || []).filter((c: any) => SUPPORTED_TOOL_CONNECTORS.includes(c.platform));
  }),

  /**
   * Group tools by bot — the canonical "what does each bot have?" view.
   * Returns one entry per bot with its connected + available tools so
   * the UI (and any future LLM tool-selection) can answer the question
   * with one round-trip. Org-scoped: only the active org's connected
   * credentials are surfaced.
   */
  byBot: orgProcedure.query(async ({ ctx }) => {
    const connectedRecords = await db.getPlatformCredentialsByOrg(ctx.org.id);
    const connectedSet = new Set(
      (connectedRecords || [])
        .filter((c: any) => SUPPORTED_TOOL_CONNECTORS.includes(c.platform))
        .map((c: any) => c.platform),
    );
    const allTools = Object.entries(TOOL_CONNECTORS).map(([id, t]) => ({
      id,
      name: t.name,
      icon: t.icon,
      color: t.color,
      category: t.category,
      bots: t.bots,
      description: t.description,
      capabilities: t.capabilities,
      whereToFind: t.whereToFind,
      fields: t.fields,
      connectionType: t.connectionType,
      connected: connectedSet.has(id),
    }));

    return BOTS.map((bot) => {
      const tools = allTools.filter((t) => t.bots.includes(bot.id));
      return {
        bot: {
          id: bot.id,
          name: bot.name,
          tagline: bot.tagline,
          description: bot.description,
          color: bot.color,
          iconName: bot.iconName,
        },
        toolCount: tools.length,
        connectedCount: tools.filter((t) => t.connected).length,
        tools,
      };
    });
  }),

  /** Connect an api_key tool. */
  connectWithApiKey: protectedProcedure
    .input(
      z.object({
        tool: z.string(),
        credentials: z.record(z.string(), z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const config = TOOL_CONNECTORS[input.tool];
      if (!config) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown tool: ${input.tool}` });
      }
      if (config.connectionType !== "api_key") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${config.name} uses OAuth — call generateOAuthUrl instead.`,
        });
      }

      // Validate required fields are present.
      for (const field of config.fields || []) {
        if (field.required && !input.credentials[field.key]) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${field.label} is required` });
        }
      }

      // Verify the credential against the live API before saving.
      const adapter = getToolAdapter(input.tool);
      const probeCreds = buildToolCredentials({
        platform: input.tool,
        metadata: input.credentials,
      });
      const health = await adapter.verifyConnection(probeCreds);
      if (!health.healthy) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Could not verify ${config.name}: ${health.message}`,
        });
      }

      const orgId = ctx.user.currentOrgId
        ?? (await db.ensurePersonalOrg(ctx.user.id)).id;
      const cred = await db.createPlatformCredential({
        orgId,
        userId: ctx.user.id,
        platform: input.tool,
        accessToken: JSON.stringify(input.credentials),
        status: "active",
        metadata: input.credentials,
      });

      await db.createAgentTask({
        agentType: "architect",
        taskType: "tool_connected",
        title: `Connected ${config.name}${health.accountLabel ? ` — ${health.accountLabel}` : ""}`,
        description: `${config.name} is now available to ${config.bots.join(", ")} bot${config.bots.length > 1 ? "s" : ""}.`,
        status: "completed",
      });

      return { credentialId: cred.id, accountLabel: health.accountLabel };
    }),

  /** Generate Google OAuth URL for Sheets / GA4. */
  generateOAuthUrl: protectedProcedure
    .input(z.object({ tool: z.string(), origin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const config = TOOL_CONNECTORS[input.tool];
      if (!config) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown tool: ${input.tool}` });
      }
      if (config.connectionType !== "oauth") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${config.name} uses an API key, not OAuth.` });
      }

      const clientId = ENV.googleClientId;
      if (!clientId) {
        return {
          url: null,
          tool: input.tool,
          message: `Google OAuth requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Add them in Settings → Secrets and reconnect.`,
          setupRequired: true,
        };
      }

      const crypto = await import("crypto");
      const state = crypto.randomBytes(24).toString("hex");
      const redirectUri = `${input.origin}/api/tools/oauth/callback`;
      const scopes = config.oauthScopes || "";

      const url =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${state}` +
        `&access_type=offline&prompt=consent&include_granted_scopes=true`;

      await db.createOAuthStateToken({
        state,
        flowType: "tool",
        userId: ctx.user.id,
        platform: input.tool,
        origin: input.origin,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      return { url, tool: input.tool, message: null, setupRequired: false };
    }),

  /** Disconnect a tool credential. */
  disconnect: orgProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cred = await db.getPlatformCredentialById(input.id);
      if (!cred || cred.orgId !== ctx.org.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Credential not found" });
      }
      if (!SUPPORTED_TOOL_CONNECTORS.includes(cred.platform)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a tool connector" });
      }
      await db.deletePlatformCredential(input.id);
      const config = TOOL_CONNECTORS[cred.platform];
      await db.createAgentTask({
        agentType: "architect",
        taskType: "tool_disconnected",
        title: `Disconnected ${config?.name || cred.platform}`,
        status: "completed",
      });
      return { success: true };
    }),

  /** Re-run a connector's verifyConnection (used by the Health refresh button). */
  checkHealth: orgProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cred = await db.getPlatformCredentialById(input.id);
      if (!cred || cred.orgId !== ctx.org.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Credential not found" });
      }
      if (!SUPPORTED_TOOL_CONNECTORS.includes(cred.platform)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a tool connector" });
      }
      const adapter = getToolAdapter(cred.platform);
      const credentials = buildToolCredentials({
        platform: cred.platform,
        accessToken: cred.accessToken,
        refreshToken: cred.refreshToken,
        metadata: cred.metadata,
      });
      const health = await adapter.healthCheck(credentials);
      await db.updatePlatformCredential(input.id, {
        lastHealthCheck: new Date(),
        status: health.healthy ? "active" : "error",
      });
      return health;
    }),
});
