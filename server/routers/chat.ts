/**
 * Shop_a_Bot — Bot Chat Router (v2 — Agentic with Function Calling)
 *
 * The Store Bot is a TOOL-CALLING agent that can execute builder,
 * merchant, and social workflows while keeping the UI centered on one
 * per-store workspace.
 * When the user says "build my store" or "run pricing optimization",
 * the bot calls the appropriate tool (launch_workflow, get_store_status,
 * etc.) and reports back what it actually DID — not what the user should
 * go do manually.
 *
 * Tool execution happens server-side so the bot can confirm success/failure
 * before replying to the user.
 */

import { z } from "zod";
import { llmRateLimit, orgProcedure, router } from "../_core/trpc";
import { isFounderEmail } from "../_core/founder";
import { invokeLLM, type Message as LLMMessage } from "../_core/llm";
import { getRenderedStoreContext } from "../utils/userContext";
import * as db from "../db";
import { launchWorkflow } from "../engine/workflowEngine";
import { getUserByOpenId } from "../db";
import { logger } from "../utils/logger";

// ─── Tool definitions (sent to the LLM) ────────────────────────────────────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "launch_workflow",
      description: "Launch a bot workflow to actually execute an action (niche research, product sourcing, store buildout, catalog generation, inventory audit, pricing optimization, etc.). Call this whenever the user asks you to DO something — don't just describe what they should do.",
      parameters: {
        type: "object",
        properties: {
          workflowType: {
            type: "string",
            description: "The workflow type to launch. Use exact names: niche_research, product_sourcing, catalog_generation, store_setup, complete_store_buildout, brand_identity_kit, brand_audit, product_optimization, competitor_pricing_scan, autonomous_competitor_stalker, multi_store_expansion, inventory_audit, pricing_optimization, fulfillment_automation, competitor_analysis, supply_chain_intelligence, profit_loss_analysis, customer_segmentation, margin_guard_audit, velocity_restock_predictor, store_optimization_sweep, autonomous_repricer, ad_campaign, social_content, seo_audit, email_flow, product_creative, brand_content, viral_trend_detector, autonomous_trend_hunter",
            enum: [
              // Architect workflows
              "niche_research",
              "product_sourcing",
              "catalog_generation",
              "store_setup",
              "complete_store_buildout",
              "brand_identity_kit",
              "brand_audit",
              "product_optimization",
              "competitor_pricing_scan",
              "autonomous_competitor_stalker",
              "multi_store_expansion",
              // Merchant workflows
              "inventory_audit",
              "pricing_optimization",
              "fulfillment_automation",
              "competitor_analysis",
              "supply_chain_intelligence",
              "profit_loss_analysis",
              "customer_segmentation",
              "margin_guard_audit",
              "velocity_restock_predictor",
              "store_optimization_sweep",
              "autonomous_repricer",
              // Social workflows
              "ad_campaign",
              "social_content",
              "seo_audit",
              "email_flow",
              "product_creative",
              "brand_content",
              "viral_trend_detector",
              "autonomous_trend_hunter",
            ],
          },
          title: {
            type: "string",
            description: "Human-readable title for this workflow run (e.g. 'Niche Research: Eco-Friendly Kitchen')",
          },
          input: {
            type: "object",
            description: "Workflow-specific parameters. For niche_research: { keyword }. For product_sourcing: { niche, targetProducts }. For catalog_generation: { keyword, productCount }. For complete_store_buildout: { niche, storeName, productCount }. For pricing_optimization: { targetMargin, strategy, niche }. For inventory_audit: { scope }.",
          },
          storeId: {
            type: "number",
            description: "The store ID to run this workflow against. Required for store-specific workflows. Omit for global workflows.",
          },
        },
        required: ["workflowType", "title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_store_status",
      description: "Get the current status of the user's connected stores — products, orders, recent workflows, and health.",
      parameters: {
        type: "object",
        properties: {
          storeId: {
            type: "number",
            description: "Specific store ID to check. Omit to get all stores.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "approve_workflow",
      description: "Approve or reject a workflow that is paused at an approval gate. Use this when the user says 'approve', 'reject', 'looks good', 'proceed', 'stop the workflow', etc. First call list_recent_workflows to find the awaiting_approval workflow ID.",
      parameters: {
        type: "object",
        properties: {
          workflowId: {
            type: "number",
            description: "The workflow ID to approve or reject.",
          },
          approved: {
            type: "boolean",
            description: "true to approve (continue the workflow), false to reject (stop it).",
          },
          note: {
            type: "string",
            description: "Optional note explaining the decision.",
          },
        },
        required: ["workflowId", "approved"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_products",
      description: "Get the product catalog for a store — titles, prices, stock levels, and status.",
      parameters: {
        type: "object",
        properties: {
          storeId: {
            type: "number",
            description: "The store ID to get products for.",
          },
        },
        required: ["storeId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_recent_workflows",
      description: "List the user's recent workflow runs and their status (completed, running, failed, awaiting_approval).",
      parameters: {
        type: "object",
        properties: {
          agentType: {
            type: "string",
            enum: ["architect", "merchant", "social"],
            description: "Filter by bot type.",
          },
          limit: {
            type: "number",
            description: "Number of workflows to return (default 5).",
          },
        },
        additionalProperties: false,
      },
    },
  },
];

// ─── Agent type → workflow scope mapping ────────────────────────────────────

const AGENT_WORKFLOW_SCOPE: Record<string, "specific_store" | "all_stores" | "global"> = {
  // Architect
  niche_research: "global",
  product_sourcing: "global",
  catalog_generation: "global",
  store_setup: "specific_store",
  complete_store_buildout: "specific_store",
  brand_identity_kit: "global",
  brand_audit: "specific_store",
  product_optimization: "specific_store",
  competitor_pricing_scan: "global",
  autonomous_competitor_stalker: "global",
  multi_store_expansion: "global",
  // Merchant
  inventory_audit: "all_stores",
  pricing_optimization: "all_stores",
  fulfillment_automation: "all_stores",
  competitor_analysis: "all_stores",
  supply_chain_intelligence: "global",
  profit_loss_analysis: "all_stores",
  customer_segmentation: "all_stores",
  margin_guard_audit: "all_stores",
  velocity_restock_predictor: "all_stores",
  store_optimization_sweep: "all_stores",
  autonomous_repricer: "all_stores",
  // Social
  ad_campaign: "global",
  social_content: "global",
  seo_audit: "global",
  email_flow: "global",
  product_creative: "global",
  brand_content: "global",
  viral_trend_detector: "global",
  autonomous_trend_hunter: "global",
};

const AGENT_TYPE_MAP: Record<string, "architect" | "merchant" | "social"> = {
  // Architect
  niche_research: "architect",
  product_sourcing: "architect",
  catalog_generation: "architect",
  store_setup: "architect",
  complete_store_buildout: "architect",
  brand_identity_kit: "architect",
  brand_audit: "architect",
  product_optimization: "architect",
  competitor_pricing_scan: "architect",
  autonomous_competitor_stalker: "architect",
  multi_store_expansion: "architect",
  // Merchant
  inventory_audit: "merchant",
  pricing_optimization: "merchant",
  fulfillment_automation: "merchant",
  competitor_analysis: "merchant",
  supply_chain_intelligence: "merchant",
  profit_loss_analysis: "merchant",
  customer_segmentation: "merchant",
  margin_guard_audit: "merchant",
  velocity_restock_predictor: "merchant",
  store_optimization_sweep: "merchant",
  autonomous_repricer: "merchant",
  // Social
  ad_campaign: "social",
  social_content: "social",
  seo_audit: "social",
  email_flow: "social",
  product_creative: "social",
  brand_content: "social",
  viral_trend_detector: "social",
  autonomous_trend_hunter: "social",
};

// ─── System prompts ─────────────────────────────────────────────────────────

const BOT_SYSTEM_PROMPTS: Record<string, string> = {
  store: `You are Shop_a_Bot — one all-encompassing autonomous e-commerce operator for the user's active store workspace.

**CRITICAL: You are an EXECUTOR, not an advisor. When the user asks you to do something, you DO it using your tools. You do NOT give instructions for the user to follow manually unless the user asks for a general explanation.**

You combine four roles in one bot:
- Store builder: guide users from zero, including users without a Shopify account, through account creation, niche validation, brand identity, product sourcing, catalog generation, and complete store buildout.
- Existing-store operator: inspect connected stores, products, workflows, pricing, inventory, fulfillment, margins, and cross-store performance.
- Social expert: create ads, content calendars, SEO improvements, product creatives, brand content, trend detection, and email flows for every store stage.
- Workspace memory: keep answers scoped to the selected store when store context is present; otherwise reason across all stores.

Use the right workflow regardless of legacy category:
- Starting from nothing → niche_research, brand_identity_kit, product_sourcing, catalog_generation, complete_store_buildout. If they do not have Shopify yet, explain the Shopify account/store creation step briefly, then launch the best preparatory workflow you can.
- Improving an existing store → store_optimization_sweep, product_optimization, inventory_audit, pricing_optimization, margin_guard_audit, fulfillment_automation, competitor_analysis.
- Marketing/social → ad_campaign, social_content, seo_audit, email_flow, product_creative, brand_content, viral_trend_detector, autonomous_trend_hunter.
- Status/results → get_store_status, get_products, list_recent_workflows.

After calling a tool, tell the user exactly what you launched/found — workflow ID, target store, what it will do, and where the results will appear. Be specific and confident.`,

  architect: `You are the Shop_a_Bot Builder Bot — an autonomous e-commerce store builder and product sourcer.

**CRITICAL: You are an EXECUTOR, not an advisor. When the user asks you to do something, you DO it using your tools. You do NOT give instructions for the user to follow manually.**

Examples:
- User: "Research the eco-friendly kitchen niche" → You call launch_workflow(niche_research, {keyword: "eco-friendly kitchen"}) and report what you launched.
- User: "Build my store for pet accessories" → You call launch_workflow(complete_store_buildout, {niche: "pet accessories", storeName: "..."}) and report back.
- User: "Source products for my store" → You call launch_workflow(product_sourcing, {niche: "..."}) and execute it.
- User: "What's the status of my store?" → You call get_store_status() and report the real data.

After calling a tool, tell the user exactly what you launched/found — workflow ID, what it will do, how long it takes. Be specific and confident.

Only give advice (without calling a tool) when the user is asking a general question that doesn't require an action (e.g. "what is dropshipping?").`,

  merchant: `You are the Shop_a_Bot Merchant Bot — an autonomous e-commerce operations manager.

**CRITICAL: You are an EXECUTOR, not an advisor. When the user asks you to do something, you DO it using your tools.**

Examples:
- User: "Audit my inventory" → You call launch_workflow(inventory_audit) and report what you launched.
- User: "Optimize my pricing" → You call launch_workflow(pricing_optimization, {targetMargin: 40}) and execute it.
- User: "What's running right now?" → You call list_recent_workflows() and report the real data.

After calling a tool, tell the user exactly what you launched/found. Be specific and confident.`,

  social: `You are the Shop_a_Bot Social Bot — an autonomous digital marketing manager.

**CRITICAL: You are an EXECUTOR, not an advisor. When the user asks you to do something, you DO it using your tools.**

Examples:
- User: "Create an ad campaign for my store" → You call launch_workflow(ad_campaign) and execute it.
- User: "Post to social media" → You call launch_workflow(social_content) and execute it.
- User: "Run an SEO audit" → You call launch_workflow(seo_audit) and execute it.
- User: "Detect viral trends" → You call launch_workflow(viral_trend_detector) and execute it.
- User: "Create email flows" → You call launch_workflow(email_flow) and execute it.
- User: "What campaigns are running?" → You call list_recent_workflows({agentType: "social"}) and report real data.

After calling a tool, tell the user exactly what you launched/found. Be specific and confident.`,
};

// ─── Tool execution ─────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolArgs: Record<string, any>,
  ctx: { userId: number; orgId: number; openId: string },
): Promise<string> {
  try {
    if (toolName === "launch_workflow") {
      const { workflowType, title, input: workflowInput = {}, storeId } = toolArgs;

      // Subscription check
      const dbUser = await getUserByOpenId(ctx.openId);
      if (dbUser) {
        const isFounder = isFounderEmail(dbUser.email, { reason: "chat_subscription_gate" });
        const isSubscribed = isFounder || dbUser.stripeSubscriptionStatus === "active" || dbUser.stripeSubscriptionStatus === "trialing";
        if (!isSubscribed) {
          return JSON.stringify({
            error: "subscription_required",
            message: "A paid plan is required to launch workflows. Please upgrade at /settings.",
          });
        }
      }

      const agentType = AGENT_TYPE_MAP[workflowType] ?? "architect";
      const scope = AGENT_WORKFLOW_SCOPE[workflowType] ?? "global";

      const workflowId = await launchWorkflow(
        ctx.userId,
        {
          agentType,
          workflowType,
          title,
          description: `Launched via ${agentType} chat`,
          scope,
          storeId: storeId ?? undefined,
          input: workflowInput,
          steps: [],
        },
        { orgId: ctx.orgId },
      );

      return JSON.stringify({
        success: true,
        workflowId,
        workflowType,
        agentType,
        title,
        message: `Workflow launched successfully. ID: ${workflowId}. You can track progress in the Workflows tab.`,
      });
    }

    if (toolName === "get_store_status") {
      const { storeId } = toolArgs;
      if (storeId) {
        const store = await db.getStoreById(storeId);
        if (!store || store.orgId !== ctx.orgId) {
          return JSON.stringify({ error: "Store not found or access denied" });
        }
        const context = await getRenderedStoreContext(storeId);
        return context || JSON.stringify({ store, message: "Store found but no detailed context available" });
      } else {
        const stores = await db.getStoresByOrg(ctx.orgId);
        return JSON.stringify({
          stores: stores.map((s: any) => ({
            id: s.id,
            name: s.name,
            platform: s.platform,
            domain: s.platformDomain,
            status: s.status,
          })),
          count: stores.length,
        });
      }
    }

    if (toolName === "list_recent_workflows") {
      const { agentType, limit = 5 } = toolArgs;
      const workflows = await db.getWorkflowsByOrg(ctx.orgId, {
        agentType,
        limit,
      });
      return JSON.stringify({
        workflows: (workflows || []).map((w: any) => ({
          id: w.id,
          type: w.workflowType,
          title: w.title,
          status: w.status,
          agentType: w.agentType,
          createdAt: w.createdAt,
        })),
        count: (workflows || []).length,
      });
    }

    if (toolName === "approve_workflow") {
      const { workflowId, approved, note } = toolArgs;
      const workflow = await db.getWorkflowById(workflowId);
      if (!workflow || workflow.orgId !== ctx.orgId) {
        return JSON.stringify({ error: "Workflow not found or access denied" });
      }
      if (workflow.status !== "awaiting_approval") {
        return JSON.stringify({ error: `Workflow ${workflowId} is not awaiting approval (status: ${workflow.status})` });
      }
      // Find the awaiting step
      const steps = await db.getWorkflowSteps(workflowId);
      const awaitingStep = steps.find((s: any) => s.status === "awaiting_approval" || s.approvalStatus === "pending");
      if (!awaitingStep) {
        return JSON.stringify({ error: "No awaiting approval step found" });
      }
      const { resumeWorkflow } = await import("../engine/workflowEngine");
      await resumeWorkflow(workflowId, awaitingStep.id, approved, note);
      return JSON.stringify({
        success: true,
        workflowId,
        decision: approved ? "approved" : "rejected",
        message: approved
          ? `Workflow ${workflowId} approved — continuing execution.`
          : `Workflow ${workflowId} rejected and stopped.`,
      });
    }

    if (toolName === "get_products") {
      const { storeId } = toolArgs;
      const store = await db.getStoreById(storeId);
      if (!store || store.orgId !== ctx.orgId) {
        return JSON.stringify({ error: "Store not found or access denied" });
      }
      // Chat context — fetch only what we render (slice to 20 below).
      // Without an explicit limit a store with 10k+ products dragged
      // megabytes through every chat turn before the slice happened.
      const prods = await db.getProductsByStore(storeId, 50);
      return JSON.stringify({
        storeId,
        storeName: store.name,
        productCount: prods.length,
        products: prods.slice(0, 20).map((p: any) => ({
          id: p.id,
          title: p.title,
          price: p.price ? `$${(p.price / 100).toFixed(2)}` : "N/A",
          status: p.status,
          stock: p.stockLevel,
          category: p.category,
        })),
        note: prods.length > 20 ? `Showing first 20 of ${prods.length} products` : undefined,
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err: any) {
    logger.error("chat_tool_failed", {
      module: "chat",
      toolName,
      error: err instanceof Error ? err.message : String(err),
    });
    return JSON.stringify({ error: err.message || "Tool execution failed" });
  }
}

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

export const chatRouter = router({
  /**
   * Send a message to the selected bot and receive a response.
   * The bot can call tools (launch_workflow, get_store_status, etc.)
   * and will report back what it actually executed.
   */
  message: orgProcedure
    .use(llmRateLimit)
    .input(z.object({
      // `store` is the canonical UI path. Legacy bot values remain accepted
      // so older bookmarks, tests, and embedded callers do not break while
      // the workflow engine still stores its internal build/operate/social lanes.
      agentType: z.enum(["store", "architect", "merchant", "social"]),
      messages: z.array(MessageSchema).min(1).max(50),
      storeId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const systemBase = BOT_SYSTEM_PROMPTS[input.agentType];

      // Inject live store context
      let storeContext = "";
      if (input.storeId) {
        const store = await db.getStoreById(input.storeId);
        if (store && store.orgId === ctx.org.id) {
          storeContext = await getRenderedStoreContext(input.storeId);
        }
      } else {
        const stores = await db.getStoresByOrg(ctx.org.id);
        if (stores.length > 0) {
          const storeList = stores
            .map((s: any) => `  - ID:${s.id} "${s.name}" on ${s.platform} (${s.status}) domain:${s.platformDomain}`)
            .join("\n");
          storeContext = `\n=== USER STORES ===\n${storeList}\n===================\nUse these store IDs when launching store-specific workflows.`;
        }
      }

      const systemContent = storeContext
        ? `${systemBase}\n\n${storeContext}`
        : systemBase;

      // Build message array for the LLM. Typing the array as
      // `LLMMessage[]` lets TypeScript catch role-typo or
      // missing-field bugs at compile time instead of swallowing
      // them via `as any` and shipping garbage to the model.
      const llmMessages: LLMMessage[] = [
        { role: "system", content: systemContent },
        ...input.messages.map((m): LLMMessage => ({ role: m.role, content: m.content })),
      ];

      // First LLM call — may produce tool calls
      const firstResult = await invokeLLM({
        messages: llmMessages,
        tools: TOOLS,
        tool_choice: "auto",
        maxTokens: 1024,
      });

      const firstChoice = firstResult.choices?.[0];
      if (!firstChoice) throw new Error("Empty response from AI");

      const firstMessage = firstChoice.message;

      // If no tool calls, return the text reply directly
      if (!firstMessage.tool_calls || firstMessage.tool_calls.length === 0) {
        const reply = firstMessage.content;
        if (!reply || typeof reply !== "string") throw new Error("Empty response from AI");
        return { reply, toolsUsed: [] };
      }

      // Execute all tool calls in sequence. The array gets the
      // `assistant` reply containing the tool_calls array, then a
      // `tool` message per result. Both shapes are Message-compatible
      // (the underlying Anthropic / OpenAI surface accepts the
      // tool_calls + tool_call_id fields).
      const toolsUsed: string[] = [];
      const toolResultMessages: LLMMessage[] = [
        {
          role: "assistant",
          content: typeof firstMessage.content === "string" ? firstMessage.content : "",
          // The wider Message type doesn't model `tool_calls` directly,
          // so we attach it via the looser any-bag. The strict typing
          // below catches bugs in the per-tool shape.
          ...({ tool_calls: firstMessage.tool_calls } as object),
        } as LLMMessage,
      ];

      for (const toolCall of firstMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, any> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          toolArgs = {};
        }

        toolsUsed.push(toolName);

        const toolResult = await executeTool(toolName, toolArgs, {
          userId: ctx.user.id,
          orgId: ctx.org.id,
          openId: ctx.user.openId,
        });

        toolResultMessages.push({
          role: "tool",
          content: toolResult,
          tool_call_id: toolCall.id,
          name: toolName,
        });
      }

      // Second LLM call — synthesize tool results into a natural reply
      const finalMessages: LLMMessage[] = [
        { role: "system", content: systemContent },
        ...input.messages.map((m): LLMMessage => ({ role: m.role, content: m.content })),
        ...toolResultMessages,
      ];

      const finalResult = await invokeLLM({
        messages: finalMessages,
        maxTokens: 1024,
      });

      const reply = finalResult.choices?.[0]?.message?.content;
      if (!reply || typeof reply !== "string") throw new Error("Empty response from AI");

      return { reply, toolsUsed };
    }),

  /**
   * Fetch the active org's stores so the Chat page can populate the store selector.
   */
  stores: orgProcedure.query(async ({ ctx }) => {
    return db.getStoresByOrg(ctx.org.id);
  }),
});
