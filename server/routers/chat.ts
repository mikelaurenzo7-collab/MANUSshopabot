/**
 * Shop_a_Bot — Bot Chat Router (v2 — Agentic with Function Calling)
 *
 * Each bot (architect/merchant/social) is now a TOOL-CALLING agent.
 * When the user says "build my store" or "run pricing optimization",
 * the bot calls the appropriate tool (launch_workflow, get_store_status,
 * etc.) and reports back what it actually DID — not what the user should
 * go do manually.
 *
 * Tool execution happens server-side so the bot can confirm success/failure
 * before replying to the user.
 */

import { z } from "zod";
import { orgProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getRenderedStoreContext } from "../utils/userContext";
import * as db from "../db";
import { launchWorkflow } from "../engine/workflowEngine";
import { getUserByOpenId } from "../db";

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
            description: "The workflow type to launch. Options: niche_research, product_sourcing, catalog_generation, store_setup, complete_store_buildout, inventory_audit, pricing_optimization, fulfillment_automation, ad_campaign_creation, social_posting",
            enum: [
              "niche_research",
              "product_sourcing",
              "catalog_generation",
              "store_setup",
              "complete_store_buildout",
              "inventory_audit",
              "pricing_optimization",
              "fulfillment_automation",
              "ad_campaign_creation",
              "social_posting",
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
  niche_research: "global",
  product_sourcing: "global",
  catalog_generation: "global",
  store_setup: "specific_store",
  complete_store_buildout: "specific_store",
  inventory_audit: "all_stores",
  pricing_optimization: "all_stores",
  fulfillment_automation: "all_stores",
  ad_campaign_creation: "global",
  social_posting: "global",
};

const AGENT_TYPE_MAP: Record<string, "architect" | "merchant" | "social"> = {
  niche_research: "architect",
  product_sourcing: "architect",
  catalog_generation: "architect",
  store_setup: "architect",
  complete_store_buildout: "architect",
  inventory_audit: "merchant",
  pricing_optimization: "merchant",
  fulfillment_automation: "merchant",
  ad_campaign_creation: "social",
  social_posting: "social",
};

// ─── System prompts ─────────────────────────────────────────────────────────

const BOT_SYSTEM_PROMPTS: Record<string, string> = {
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
- User: "Create an ad campaign for my store" → You call launch_workflow(ad_campaign_creation) and execute it.
- User: "Post to social media" → You call launch_workflow(social_posting) and execute it.
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
        const isFounder = dbUser.email === "mlaurenzo8@gmail.com" || dbUser.email === "mikelaurenzo7@gmail.com";
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

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err: any) {
    console.error(`[Chat Tool Error] ${toolName}:`, err);
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
    .input(z.object({
      agentType: z.enum(["architect", "merchant", "social"]),
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

      // Build message array for the LLM
      const llmMessages: Array<{ role: string; content: string }> = [
        { role: "system", content: systemContent },
        ...input.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      // First LLM call — may produce tool calls
      const firstResult = await invokeLLM({
        messages: llmMessages as any,
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

      // Execute all tool calls in sequence
      const toolsUsed: string[] = [];
      const toolResultMessages: Array<any> = [
        {
          role: "assistant" as const,
          content: typeof firstMessage.content === "string" ? firstMessage.content : "",
          tool_calls: firstMessage.tool_calls,
        },
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
        } as any);
      }

      // Second LLM call — synthesize tool results into a natural reply
      const finalMessages = [
        { role: "system", content: systemContent },
        ...input.messages.map((m) => ({ role: m.role, content: m.content })),
        ...toolResultMessages,
      ];

      const finalResult = await invokeLLM({
        messages: finalMessages as any,
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
