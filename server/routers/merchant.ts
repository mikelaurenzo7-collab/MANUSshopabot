import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { orgProcedure, router } from "../_core/trpc";
import { invokeLLM, parseLLMJson } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import * as db from "../db";
import {
  syncProductsFromStore,
  pushProductToStore,
  fulfillOrderOnPlatform,
  checkInventoryAcrossStores,
} from "../engine/platformBridge";
import { getRenderedStoreContext } from "../utils/userContext";
import { sanitizeName, sanitizeText } from "../utils/sanitize";
import {
  requireStoreInOrg,
  requireProductInOrg,
  requireOrderInOrg,
} from "../utils/authz";

export const merchantRouter = router({
  // ─── Inventory ────────────────────────────────────────────────────────
  products: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      return db.getProductsByStore(input.storeId);
    }),

  product: orgProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireProductInOrg(input.id, ctx.org.id);
      return db.getProductById(input.id);
    }),

  updateProduct: orgProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      price: z.number().optional(),
      costPrice: z.number().optional(),
      stockLevel: z.number().optional(),
      lowStockThreshold: z.number().optional(),
      status: z.enum(["draft", "active", "out_of_stock", "archived"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireProductInOrg(input.id, ctx.org.id);
      const { id, ...data } = input;
      await db.updateProduct(id, data);
      return { success: true };
    }),

  lowStockAlerts: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      return db.getLowStockProducts(input.storeId);
    }),

  // ─── Orders & Fulfillment ─────────────────────────────────────────────
  orders: orgProcedure
    .input(z.object({ storeId: z.number(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      return db.getOrdersByStore(input.storeId, input.limit);
    }),

  updateOrder: orgProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "processing", "fulfilled", "shipped", "delivered", "cancelled", "refunded"]).optional(),
      fulfillmentStatus: z.enum(["unfulfilled", "partial", "fulfilled"]).optional(),
      trackingNumber: z.string().max(120).optional(),
      trackingUrl: z.string().url().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireOrderInOrg(input.id, ctx.org.id);
      const { id, ...data } = input;
      await db.updateOrder(id, data);

      if (data.status === "fulfilled" || data.fulfillmentStatus === "fulfilled") {
        await db.createAgentTask({
          agentType: "merchant",
          taskType: "fulfillment",
          title: `Order #${id} fulfilled`,
          description: `Order automatically marked as fulfilled${data.trackingNumber ? ` with tracking: ${data.trackingNumber}` : ""}`,
          status: "completed",
        });
      }

      return { success: true };
    }),

  autoFulfill: orgProcedure
    .input(z.object({
      orderId: z.number(),
      storeId: z.number(),
      trackingNumber: z.string().max(120).optional(),
      trackingUrl: z.string().url().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      await requireOrderInOrg(input.orderId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "merchant",
        taskType: "auto_fulfillment",
        title: `Auto-fulfilling order #${input.orderId}`,
        description: "Merchant agent processing fulfillment via platform adapter",
        status: "running",
        storeId: input.storeId,
      });

      try {
        await db.updateOrder(input.orderId, {
          status: "processing",
          fulfillmentStatus: "partial",
        });

        // Fulfill via the platform adapter (Shopify, WooCommerce, etc.)
        await fulfillOrderOnPlatform(
          input.storeId,
          input.orderId,
          input.trackingNumber,
          input.trackingUrl,
        );

        await db.updateAgentTask(task.id, { status: "completed" });

        await notifyOwner({
          title: "Order Auto-Fulfilled",
          content: `The Merchant Bot fulfilled order #${input.orderId} on the connected platform.`,
        });

        return { success: true };
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  // ─── Platform Bridge: Product Sync & Inventory ────────────────────
  /**
   * Sync products from the connected storefront. Pre-migration this
   * had NO authorization check at all — `syncProducts` accepted any
   * storeId and silently fired the engine. Now gated through
   * requireStoreInOrg so only the active org's stores can be synced.
   */
  syncProducts: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      return syncProductsFromStore(input.storeId, ctx.user.id);
    }),

  pushProduct: orgProcedure
    .input(z.object({ storeId: z.number(), productId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      await requireProductInOrg(input.productId, ctx.org.id);
      return pushProductToStore(input.storeId, input.productId);
    }),

  crossStoreInventory: orgProcedure
    .query(async ({ ctx }) => {
      // checkInventoryAcrossStores still walks by userId — the engine
      // call site is internal and the user's stores in the active org
      // are the same set we want here. Keep the userId arg for now;
      // engine-level org migration is a follow-up.
      return checkInventoryAcrossStores(ctx.user.id);
    }),

  // ─── Pricing Rules ────────────────────────────────────────────────────
  pricingRules: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      return db.getPricingRules(input.storeId);
    }),

  createPricingRule: orgProcedure
    .input(z.object({
      storeId: z.number(),
      name: z.string().min(1).max(200),
      ruleType: z.enum(["margin_target", "competitor_match", "dynamic", "clearance"]),
      config: z.any().optional(),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const result = await db.createPricingRule({ ...input, name: sanitizeName(input.name, 200) });

      await db.createAgentTask({
        agentType: "merchant",
        taskType: "pricing_rule",
        title: `Pricing rule "${input.name}" created`,
        description: `New ${input.ruleType} pricing rule for store #${input.storeId}`,
        status: "completed",
        storeId: input.storeId,
      });

      return result;
    }),

  updatePricingRule: orgProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().max(200).optional(),
      config: z.any().optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rule = await db.getPricingRuleById(input.id);
      if (!rule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pricing rule not found",
        });
      }
      await requireStoreInOrg(rule.storeId, ctx.org.id);
      const { id, ...data } = input;
      await db.updatePricingRule(id, data);
      return { success: true };
    }),

  // ─── AI Pricing Strategy ──────────────────────────────────────────────
  suggestPricing: orgProcedure
    .input(z.object({
      storeId: z.number(),
      productId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await requireStoreInOrg(input.storeId, ctx.org.id);
      const product = await requireProductInOrg(input.productId, ctx.org.id);
      if (product.storeId !== input.storeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Product does not belong to the specified store",
        });
      }

      const task = await db.createAgentTask({
        agentType: "merchant",
        taskType: "pricing_suggestion",
        title: `Pricing analysis for "${product.title}"`,
        description: "AI-generating pricing strategy recommendation",
        status: "running",
        storeId: input.storeId,
      });

      try {
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert e-commerce pricing strategist. Analyze the product and suggest optimal pricing. ${storeContext ? "Use the store context to align with the merchant's existing price tier, margin targets, and competitive position." : ""} Return JSON with:
- suggestedPrice: number (in cents)
- compareAtPrice: number (in cents, for showing "was" price)
- strategy: string (brief strategy name)
- reasoning: string (2-3 sentences explaining the recommendation)
- marginPercent: number (expected profit margin percentage)
- competitivePosition: string (premium/mid-range/value)`
            },
            {
              role: "user",
              content: `${storeContext ? storeContext + "\n\n" : ""}Product: "${product.title}"\nCurrent price: $${(product.price / 100).toFixed(2)}\nCost: $${((product.costPrice ?? 0) / 100).toFixed(2)}\nCategory: ${product.category || "General"}\nDescription: ${product.description || "N/A"}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "pricing_suggestion",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  suggestedPrice: { type: "number" },
                  compareAtPrice: { type: "number" },
                  strategy: { type: "string" },
                  reasoning: { type: "string" },
                  marginPercent: { type: "number" },
                  competitivePosition: { type: "string" },
                },
                required: ["suggestedPrice", "compareAtPrice", "strategy", "reasoning", "marginPercent", "competitivePosition"],
                additionalProperties: false,
              },
            },
          },
        });

        const suggestion = parseLLMJson<any>(llmResult.choices[0].message.content, "merchant.priceOptimization");
        await db.updateAgentTask(task.id, { status: "completed", result: suggestion });

        // Create approval item for high-impact pricing changes — scoped
        // to the store's org so it lands in the right tenant's queue.
        const priceDiff = Math.abs(suggestion.suggestedPrice - product.price);
        if (priceDiff > product.price * 0.2) {
          await db.createApprovalItem({
            orgId: store.orgId,
            agentTaskId: task.id,
            agentType: "merchant",
            actionType: "pricing_change",
            title: `Price change for "${product.title}"`,
            description: `Suggested: $${(suggestion.suggestedPrice / 100).toFixed(2)} (currently $${(product.price / 100).toFixed(2)}). ${suggestion.reasoning}`,
            impact: priceDiff > product.price * 0.5 ? "critical" : "high",
            proposedAction: { productId: product.id, newPrice: suggestion.suggestedPrice, compareAtPrice: suggestion.compareAtPrice },
          });

          await notifyOwner({
            title: "Pricing Approval Needed",
            content: `The Merchant Bot suggests changing "${product.title}" price from $${(product.price / 100).toFixed(2)} to $${(suggestion.suggestedPrice / 100).toFixed(2)}. Approval required.`,
          });
        }

        return suggestion;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  // ─── Demand Forecasting ────────────────────────────────────────────────
  demandForecasting: orgProcedure
    .input(z.object({
      storeId: z.number(),
      forecastPeriod: z.enum(["7_days", "30_days", "90_days"]).default("30_days"),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "merchant",
        taskType: "demand_forecast",
        title: `Demand forecast (${input.forecastPeriod}) for store #${input.storeId}`,
        description: "AI-powered demand prediction and inventory planning",
        status: "running",
        storeId: input.storeId,
      });

      try {
        const products = await db.getProductsByStore(input.storeId);
        const orders = await db.getOrdersByStore(input.storeId);
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a demand forecasting AI for e-commerce. Analyze sales patterns and predict future demand. ${storeContext ? "Use the store context to factor in the merchant's actual revenue velocity, order patterns, and low-stock exposure." : ""} Return JSON with:
- forecasts: array of { productName, currentStock, predictedDemand, recommendedReorder, confidence ("high"|"medium"|"low"), trend ("rising"|"stable"|"declining") }
- seasonalInsights: array of strings
- stockoutRisks: array of { product, daysUntilStockout, urgency ("critical"|"warning"|"safe") }
- overallDemandTrend: string
- recommendations: array of strings`
            },
            {
              role: "user",
              content: `Forecast period: ${input.forecastPeriod}\nProducts: ${products.length}\nRecent orders: ${orders.length}\nProduct data: ${JSON.stringify(products.slice(0, 10).map(p => ({ name: p.title, stock: p.stockLevel, price: p.price })))}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "demand_forecast",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  forecasts: { type: "array", items: { type: "object", properties: { productName: { type: "string" }, currentStock: { type: "number" }, predictedDemand: { type: "number" }, recommendedReorder: { type: "number" }, confidence: { type: "string" }, trend: { type: "string" } }, required: ["productName", "currentStock", "predictedDemand", "recommendedReorder", "confidence", "trend"], additionalProperties: false } },
                  seasonalInsights: { type: "array", items: { type: "string" } },
                  stockoutRisks: { type: "array", items: { type: "object", properties: { product: { type: "string" }, daysUntilStockout: { type: "number" }, urgency: { type: "string" } }, required: ["product", "daysUntilStockout", "urgency"], additionalProperties: false } },
                  overallDemandTrend: { type: "string" },
                  recommendations: { type: "array", items: { type: "string" } },
                },
                required: ["forecasts", "seasonalInsights", "stockoutRisks", "overallDemandTrend", "recommendations"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = parseLLMJson<any>(llmResult.choices[0].message.content, "merchant.demandForecast");
        await db.updateAgentTask(task.id, { status: "completed", result });
        return result;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  // ─── Margin Analyzer ───────────────────────────────────────────────────
  marginAnalyzer: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "merchant",
        taskType: "margin_analysis",
        title: `Margin analysis for store #${input.storeId}`,
        description: "Deep-dive into product margins and profitability",
        status: "running",
        storeId: input.storeId,
      });

      try {
        const products = await db.getProductsByStore(input.storeId);
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a financial analyst specializing in e-commerce unit economics. Analyze product margins and identify profit optimization opportunities. ${storeContext ? "Use the store context to ground your analysis in actual revenue, order volume, and pricing rules already in play." : ""} Return JSON with:
- productMargins: array of { product, revenue (string), cost (string), margin (string), marginPercent (number), status ("healthy"|"warning"|"critical") }
- categoryBreakdown: array of { category, avgMargin (string), totalRevenue (string), recommendation (string) }
- profitLeaks: array of { issue, estimatedLoss (string), fix (string) }
- topPerformers: array of strings (top 5 by margin)
- underperformers: array of strings (bottom 5 by margin)
- overallHealthScore: number (0-100)
- recommendations: array of strings`
            },
            {
              role: "user",
              content: `Products: ${JSON.stringify(products.map(p => ({ name: p.title, price: p.price, cost: p.costPrice, category: p.category, stock: p.stockLevel })))}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "margin_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  productMargins: { type: "array", items: { type: "object", properties: { product: { type: "string" }, revenue: { type: "string" }, cost: { type: "string" }, margin: { type: "string" }, marginPercent: { type: "number" }, status: { type: "string" } }, required: ["product", "revenue", "cost", "margin", "marginPercent", "status"], additionalProperties: false } },
                  categoryBreakdown: { type: "array", items: { type: "object", properties: { category: { type: "string" }, avgMargin: { type: "string" }, totalRevenue: { type: "string" }, recommendation: { type: "string" } }, required: ["category", "avgMargin", "totalRevenue", "recommendation"], additionalProperties: false } },
                  profitLeaks: { type: "array", items: { type: "object", properties: { issue: { type: "string" }, estimatedLoss: { type: "string" }, fix: { type: "string" } }, required: ["issue", "estimatedLoss", "fix"], additionalProperties: false } },
                  topPerformers: { type: "array", items: { type: "string" } },
                  underperformers: { type: "array", items: { type: "string" } },
                  overallHealthScore: { type: "number" },
                  recommendations: { type: "array", items: { type: "string" } },
                },
                required: ["productMargins", "categoryBreakdown", "profitLeaks", "topPerformers", "underperformers", "overallHealthScore", "recommendations"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = parseLLMJson<any>(llmResult.choices[0].message.content, "merchant.profitabilityAnalysis");
        await db.updateAgentTask(task.id, { status: "completed", result });
        return result;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  // ─── Return & Refund Analysis ───────────────────────────────────────────
  returnAnalysis: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "merchant",
        taskType: "return_analysis",
        title: `Return analysis for store #${input.storeId}`,
        description: "Analyzing return patterns and cost impact",
        status: "running",
        storeId: input.storeId,
      });

      try {
        const orders = await db.getOrdersByStore(input.storeId);
        const products = await db.getProductsByStore(input.storeId);
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a returns management specialist for e-commerce. Analyze return patterns and identify root causes. ${storeContext ? "Use the store context to calibrate your analysis against the merchant's actual order volume and product mix." : ""} Return JSON with:
- returnRate: string (overall percentage)
- returnsByReason: array of { reason, count (number), percentage (string), trend (string) }
- problematicProducts: array of { product, returnRate (string), topReason (string), recommendation (string) }
- financialImpact: object { totalRefunds (string), shippingCosts (string), restockingCosts (string), netLoss (string) }
- reductionStrategies: array of { strategy, expectedReduction (string), implementation (string), priority ("high"|"medium"|"low") }
- summary: string`
            },
            {
              role: "user",
              content: `Total orders: ${orders.length}\nRefunded orders: ${orders.filter((o: any) => o.fulfillmentStatus === 'refunded').length}\nProducts: ${products.length}\nOrder data sample: ${JSON.stringify(orders.slice(0, 10).map((o: any) => ({ status: o.status, fulfillment: o.fulfillmentStatus, total: o.totalCents })))}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "return_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  returnRate: { type: "string" },
                  returnsByReason: { type: "array", items: { type: "object", properties: { reason: { type: "string" }, count: { type: "number" }, percentage: { type: "string" }, trend: { type: "string" } }, required: ["reason", "count", "percentage", "trend"], additionalProperties: false } },
                  problematicProducts: { type: "array", items: { type: "object", properties: { product: { type: "string" }, returnRate: { type: "string" }, topReason: { type: "string" }, recommendation: { type: "string" } }, required: ["product", "returnRate", "topReason", "recommendation"], additionalProperties: false } },
                  financialImpact: { type: "object", properties: { totalRefunds: { type: "string" }, shippingCosts: { type: "string" }, restockingCosts: { type: "string" }, netLoss: { type: "string" } }, required: ["totalRefunds", "shippingCosts", "restockingCosts", "netLoss"], additionalProperties: false },
                  reductionStrategies: { type: "array", items: { type: "object", properties: { strategy: { type: "string" }, expectedReduction: { type: "string" }, implementation: { type: "string" }, priority: { type: "string" } }, required: ["strategy", "expectedReduction", "implementation", "priority"], additionalProperties: false } },
                  summary: { type: "string" },
                },
                required: ["returnRate", "returnsByReason", "problematicProducts", "financialImpact", "reductionStrategies", "summary"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = parseLLMJson<any>(llmResult.choices[0].message.content, "merchant.returnAnalysis");
        await db.updateAgentTask(task.id, { status: "completed", result });
        return result;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),
});
