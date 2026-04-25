/**
 * SHOPaBOT — Bot Chat Router
 *
 * Conversational AI interface. Each bot (architect/merchant/social) has
 * its own personality and context-injection strategy. Messages from the
 * client include the full conversation history so the LLM can maintain
 * continuity across turns.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getRenderedStoreContext } from "../utils/userContext";
import * as db from "../db";

const BOT_SYSTEM_PROMPTS: Record<string, string> = {
  architect: `You are the SHOPaBOT Builder Bot — an expert e-commerce store architect, niche researcher, and product sourcer.
Your role is to help the user discover profitable niches, source winning products, build high-converting stores, and grow their catalogue.
Be specific, data-driven, and action-oriented. Reference the user's actual store data when available.
When you suggest workflows or actions the user can take inside SHOPaBOT, mention them clearly (e.g. "You can launch a Niche Research workflow from the Builder Bot page").
Keep responses concise unless a detailed breakdown is explicitly requested.`,

  merchant: `You are the SHOPaBOT Merchant Bot — an expert e-commerce operations manager specialising in inventory, fulfilment, pricing, and supply chain.
Your role is to help the user optimise stock levels, automate order fulfilment, set smart pricing rules, manage suppliers, and maximise profitability.
Be analytical, proactive about risks (low stock, slow-moving inventory), and direct in your recommendations.
Reference the user's actual store metrics, products, and order data when available.
When you suggest automated actions (e.g. pricing rules, restock alerts), explain exactly what to configure inside SHOPaBOT.`,

  social: `You are the SHOPaBOT Social Bot — an expert digital marketer specialising in paid ads, organic social, email campaigns, and brand growth.
Your role is to help the user craft high-converting ad copy, plan content calendars, analyse campaign performance, and drive revenue through social channels.
Be creative, trend-aware, and performance-focused. Use the user's store and campaign data to personalise recommendations.
When you suggest actions (e.g. launching an ad campaign, scheduling posts), explain how to do it inside SHOPaBOT's Social Bot page.`,
};

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

export const chatRouter = router({
  /**
   * Send a message to the selected bot and receive a response.
   * The client sends the full conversation history (excluding system msg).
   */
  message: protectedProcedure
    .input(z.object({
      agentType: z.enum(["architect", "merchant", "social"]),
      messages: z.array(MessageSchema).min(1).max(50),
      storeId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const systemBase = BOT_SYSTEM_PROMPTS[input.agentType];

      // Inject live store context when a store is selected
      let storeContext = "";
      if (input.storeId) {
        storeContext = await getRenderedStoreContext(input.storeId);
      } else {
        // Fall back: attach a lightweight summary of ALL user stores
        const stores = await db.getStoresByUser(ctx.user.id);
        if (stores.length > 0) {
          const storeList = stores
            .map((s: any) => `  - "${s.name}" on ${s.platform} (${s.status})`)
            .join("\n");
          storeContext = `\n=== USER STORES ===\n${storeList}\n===================`;
        }
      }

      const systemContent = storeContext
        ? `${systemBase}\n\n${storeContext}`
        : systemBase;

      const llmMessages = [
        { role: "system" as const, content: systemContent },
        ...input.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const result = await invokeLLM({ messages: llmMessages, maxTokens: 1024 });

      const reply = result.choices?.[0]?.message?.content;

      if (!reply || typeof reply !== "string") {
        throw new Error("Empty response from AI");
      }

      return { reply };
    }),

  /**
   * Fetch the user's stores so the Chat page can populate the store selector.
   */
  stores: protectedProcedure.query(async ({ ctx }) => {
    return db.getStoresByUser(ctx.user.id);
  }),
});
