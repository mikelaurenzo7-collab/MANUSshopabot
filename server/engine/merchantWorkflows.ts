/**
 * The Merchant Bot — Workflow Definitions
 * 
 * Workflows:
 * 1. inventory_audit — Cross-store inventory analysis, low stock alerts, restock recommendations
 * 2. pricing_optimization — Dynamic pricing analysis and margin optimization
 * 3. fulfillment_automation — Order processing and fulfillment pipeline
 * 4. competitor_analysis — Price comparison and market positioning
 */

import { registerWorkflow, type WorkflowStepDefinition, type StepContext } from "./workflowEngine";
import { getEcommerceCapabilityMatrix } from "../adapters/ecommerce";
import { composeSystemPrompt } from "./sharedPrompts";

// ─── Inventory Audit Workflow ──────────────────────────────────────────────

registerWorkflow("inventory_audit", (input): WorkflowStepDefinition[] => {
  const scope = input.scope ?? "all_stores";
  // Platform-aware tuning: when input.platform is supplied, the LLM
  // sees inventory primitives the platform actually exposes —
  // realTimeInventory (poll vs. push), recommendedBatchSize for the
  // sweep, partialFulfillment for restock routing. Without this hint
  // the bot defaults to "poll every store every 5 min" which is
  // wasteful on Shopify (real-time webhooks already populate stock)
  // and insufficient on Amazon (FBA inventory lags ~5–10 min).
  const platform = (input.platform as string | undefined)?.toLowerCase();
  const caps = platform ? getEcommerceCapabilityMatrix()[platform] : undefined;
  const inventoryBrief = caps
    ? `\n\nPlatform: ${platform}.\n` +
      `- Real-time inventory: ${caps.realTimeInventory ? "yes — webhooks push stock changes" : "NO — propagation lags 5-10 min on this platform"}\n` +
      `- Recommended sweep batch size: ${caps.recommendedBatchSize}\n` +
      `- Partial fulfillment: ${caps.partialFulfillment ? "yes" : "no — restock orders fulfill all-or-nothing"}\n` +
      `- Bulk price update: ${caps.bulkPriceUpdate ? "yes — clearance markdowns can run platform-side" : "no — bot must update items one-at-a-time"}`
    : "";

  return [
    {
      stepType: "analysis",
      title: "Stock Level Analysis",
      description: caps
        ? `Analyzing inventory for ${platform} (capability-tuned)`
        : "Analyzing current inventory levels across all connected stores",
      input: {
        analysisPrompt: `Perform a comprehensive inventory audit:
1. Identify all products below their low-stock threshold
2. Calculate days-of-stock remaining based on recent sales velocity
3. Flag products that are overstocked (>90 days supply)
4. Identify products with zero sales in the last 30 days
5. Calculate total inventory value at cost and retail${inventoryBrief}

Provide specific restock quantities for low-stock items and clearance recommendations for dead stock. Where the platform supports bulk-price updates, recommend clearance markdowns the bot can apply in one sweep; where it doesn't, recommend a manual ladder.`,
        data: { scope, platform: platform ?? null, requestedAt: new Date().toISOString() },
      },
    },
    {
      stepType: "llm_call",
      title: "Restock Recommendations",
      description: "Generating optimal restock quantities and timing",
      input: {
        useClaudeDirect: true,
        cacheSystemPrompt: true,
        effort: "high",
        adaptiveThinking: true,
        systemPrompt: composeSystemPrompt(
          caps
            ? `You are an inventory management expert. Optimize stock levels to minimize carrying costs while preventing stockouts. Platform context: ${caps.strengths.slice(0, 2).join("; ")}.`
            : "You are an inventory management expert. Optimize stock levels to minimize carrying costs while preventing stockouts.",
        ),
        userPrompt: `Based on the inventory audit, generate restock recommendations:
1. Priority restock list (items that will stock out within 7 days)
2. Standard restock list (items below threshold but not critical)
3. Suggested order quantities based on sales velocity
4. Estimated restock cost
5. Recommended suppliers for each item
6. Optimal reorder timing

Return as JSON with keys: criticalRestocks, standardRestocks, totalEstimatedCost, recommendations`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "restock_plan",
            strict: true,
            schema: {
              type: "object",
              properties: {
                criticalRestocks: { type: "array", items: { type: "object", properties: { product: { type: "string" }, currentStock: { type: "number" }, recommendedOrder: { type: "number" }, estimatedCost: { type: "string" }, urgency: { type: "string" } }, required: ["product", "currentStock", "recommendedOrder", "estimatedCost", "urgency"], additionalProperties: false } },
                standardRestocks: { type: "array", items: { type: "object", properties: { product: { type: "string" }, currentStock: { type: "number" }, recommendedOrder: { type: "number" }, estimatedCost: { type: "string" } }, required: ["product", "currentStock", "recommendedOrder", "estimatedCost"], additionalProperties: false } },
                totalEstimatedCost: { type: "string" },
                recommendations: { type: "array", items: { type: "string" } },
              },
              required: ["criticalRestocks", "standardRestocks", "totalEstimatedCost", "recommendations"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "Inventory Audit Complete",
      description: "Sending inventory audit results and restock alerts",
      input: {
        title: "Inventory Audit Complete",
        message: "The Merchant has completed a full inventory audit. Review restock recommendations in your dashboard.",
        agentType: "merchant",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Pricing Optimization Workflow ─────────────────────────────────────────

registerWorkflow("pricing_optimization", (input): WorkflowStepDefinition[] => {
  const targetMargin = input.targetMargin ?? 40;
  const strategy = input.strategy ?? "margin_target";
  // Platform-aware tuning. compareAtPrice is the primary "show a strikethrough"
  // primitive — Shopify, eBay, WooCommerce, TikTok Shop support it. Amazon
  // and Etsy don't (Amazon owns its strike-through display, Etsy uses sales).
  // The Merchant Bot uses this to gate which adjustment recipes are even
  // viable on the target platform — recommending a compareAt strikeout on
  // Amazon would just generate noise the bot can't act on.
  const platform = (input.platform as string | undefined)?.toLowerCase();
  const caps = platform ? getEcommerceCapabilityMatrix()[platform] : undefined;
  const platformGuard = caps
    ? `\n\nPlatform: ${platform}. The Merchant Bot can act on these primitives here:\n` +
      `- Direct price update: yes\n` +
      `- Strikethrough / "compare-at" pricing: ${caps.compareAtPrice ? "yes" : "NO — skip strikethrough recipes; use Amazon's automated repricer or Etsy's native sale instead"}\n` +
      `- Bulk price update API: ${caps.bulkPriceUpdate ? "yes" : "no — recommend manual ladder"}\n` +
      `- Native scheduled sale primitive: ${caps.scheduledSale ? "yes" : "no — bot's own cron is the path"}\n` +
      `- Fee structure: ${caps.feeStructure} (${caps.category}). When recommending margin floors, account for ${caps.feeStructure === "commission" ? "platform commission ~10-15% on top of payment processing" : caps.feeStructure === "subscription" ? "subscription cost amortized over volume" : "no platform commission — full margin retained"}.`
    : "";

  return [
    {
      stepType: "llm_call",
      title: "Price Analysis",
      description: caps
        ? `Analyzing pricing for ${platform} with ${targetMargin}% target margin using ${strategy} strategy (platform-tuned)`
        : `Analyzing pricing with ${targetMargin}% target margin using ${strategy} strategy`,
      input: {
        useClaudeDirect: true,
        cacheSystemPrompt: true,
        effort: "high",
        adaptiveThinking: true,
        systemPrompt: composeSystemPrompt(
          "You are a pricing strategist for e-commerce. You maximize revenue while maintaining competitive positioning. Apply the FEE-STRUCTURE AWARENESS rule from the platform preamble when recommending margin floors.",
        ),
        userPrompt: `Analyze the current product pricing and recommend optimizations:

Strategy: ${strategy}
Target Margin: ${targetMargin}%${platformGuard}

For each product category, provide:
1. Current average margin
2. Recommended price adjustments (specific dollar amounts)
3. Competitor price comparison
4. Elasticity assessment (will customers accept the new price?)
5. Expected revenue impact

Also identify:
- Products priced too low (leaving money on the table)
- Products priced too high (losing sales to competitors)
- Bundle opportunities for higher AOV
- Seasonal pricing adjustments needed

Return as JSON with keys: categoryAnalysis, priceAdjustments, bundleOpportunities, seasonalAdjustments, expectedRevenueImpact`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "pricing_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                categoryAnalysis: { type: "array", items: { type: "object", properties: { category: { type: "string" }, currentMargin: { type: "string" }, recommendedMargin: { type: "string" }, adjustment: { type: "string" } }, required: ["category", "currentMargin", "recommendedMargin", "adjustment"], additionalProperties: false } },
                priceAdjustments: { type: "array", items: { type: "object", properties: { product: { type: "string" }, currentPrice: { type: "string" }, recommendedPrice: { type: "string" }, reason: { type: "string" } }, required: ["product", "currentPrice", "recommendedPrice", "reason"], additionalProperties: false } },
                bundleOpportunities: { type: "array", items: { type: "object", properties: { products: { type: "array", items: { type: "string" } }, bundlePrice: { type: "string" }, savings: { type: "string" } }, required: ["products", "bundlePrice", "savings"], additionalProperties: false } },
                seasonalAdjustments: { type: "array", items: { type: "string" } },
                expectedRevenueImpact: { type: "string" },
              },
              required: ["categoryAnalysis", "priceAdjustments", "bundleOpportunities", "seasonalAdjustments", "expectedRevenueImpact"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Approve Price Changes",
      description: "Review and approve recommended price adjustments before they are applied",
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Pricing Optimized",
      description: "Price optimization analysis complete",
      input: {
        title: "Pricing Optimization Complete",
        message: `The Merchant has analyzed your pricing with a ${targetMargin}% target margin. Review recommended adjustments.`,
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Fulfillment Automation Workflow ───────────────────────────────────────

registerWorkflow("fulfillment_automation", (input): WorkflowStepDefinition[] => {
  const orderId = input.orderId ?? "batch";
  // Platform-aware fulfillment guard. The bot's rollback path differs per
  // platform (Shopify can revert fulfillments via API, Etsy/eBay can't,
  // Amazon FBA owns the box once it's labeled). Surfacing this lets the
  // analysis step decide whether the workflow is safe to auto-run vs.
  // requires an approval gate.
  const platform = (input.platform as string | undefined)?.toLowerCase();
  const caps = platform ? getEcommerceCapabilityMatrix()[platform] : undefined;
  const fulfillmentBrief = caps
    ? `\nPlatform: ${platform}.\n` +
      `- Auto-fulfillment API: ${caps.autoFulfillment ? "supported" : "NOT supported — bot must hand off to manual queue"}\n` +
      `- Partial fulfillment: ${caps.partialFulfillment ? "supported" : "all-or-nothing — bot fulfills the entire order or none"}\n` +
      `- Rollback risk: ${caps.autoFulfillment ? "moderate (most platforms accept fulfillment-cancel API)" : "high (manual reversal required)"}\n` +
      `- Recommended batch size for fulfillment sweeps: ${caps.recommendedBatchSize}`
    : "";

  return [
    {
      stepType: "analysis",
      title: "Order Validation",
      description: caps
        ? `Validating order for ${platform} fulfillment (capability-aware)`
        : "Validating order details, stock availability, and shipping feasibility",
      input: {
        analysisPrompt: `Validate the order for fulfillment:
1. Verify all items are in stock
2. Check shipping address validity
3. Verify payment status
4. Calculate optimal shipping method and cost
5. Check for fraud indicators
6. Determine if any items need special handling${fulfillmentBrief}

Return: validation status, any issues found, recommended shipping method, estimated delivery date, and whether this fulfillment can safely auto-execute or requires manual review (based on the platform's auto-fulfillment + rollback capabilities).`,
        data: { orderId, platform: platform ?? null, capabilities: caps ?? null },
      },
      rollback: async (_ctx: StepContext, _output: unknown) => {
        // Validation is read-only — no side effects to undo
        console.log(`[Rollback] Order validation for ${orderId} — no side effects to undo`);
      },
    },
    {
      stepType: "store_action",
      title: "Process Fulfillment",
      description: "Initiating order fulfillment with the supplier",
      input: {
        action: "fulfill_order",
        orderId,
        steps: ["update_status_processing", "notify_supplier", "generate_shipping_label", "update_tracking"],
      },
      rollback: async (ctx: StepContext, output: unknown) => {
        // Attempt to revert order status back to unfulfilled
        console.log(`[Rollback] Reverting fulfillment for order ${orderId} on store ${ctx.storeId}`);
        // Note: Not all platforms support fulfillment cancellation.
        // This logs the rollback attempt for manual intervention.
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: `⚠️ Fulfillment Rollback: Order ${orderId}`,
          content: `A workflow failure triggered a rollback for order ${orderId}. The fulfillment may need manual review on the platform. Output: ${JSON.stringify(output).slice(0, 200)}`,
        });
      },
    },
    {
      stepType: "notification",
      title: "Fulfillment Initiated",
      description: "Order is being processed and shipped",
      input: {
        title: `Order Fulfillment Initiated`,
        message: `The Merchant has automatically processed order ${orderId} for fulfillment. Tracking information will be updated once available.`,
        agentType: "merchant",
        notificationType: "success",
      },
      // Notification rollback: no side effects to undo (notification already sent)
    },
  ];
});

// ─── Competitor Analysis Workflow ──────────────────────────────────────────

registerWorkflow("competitor_analysis", (input): WorkflowStepDefinition[] => {
  const niche = input.niche ?? "general";
  // Surface the platform's commercial primitives to the LLM so the
  // counter-strategy is grounded in what the merchant can actually
  // do. On a commission-fee marketplace (Amazon ~15%) the
  // recommendation set is different from a subscription storefront
  // (Shopify) — the LLM needs to know which surface it's planning for.
  const platform = (input.platform as string | undefined)?.toLowerCase();
  const caps = platform ? getEcommerceCapabilityMatrix()[platform] : undefined;
  const competitiveBrief = caps
    ? `\n\nPlatform context: ${platform} (${caps.category}, ${caps.feeStructure} fees).\n` +
      `Strengths the merchant can leverage: ${caps.strengths.slice(0, 3).join("; ")}.\n` +
      `Constraints to design counter-strategy around: ${caps.limitations.slice(0, 2).join("; ")}.\n` +
      `Pricing primitives available: ${caps.compareAtPrice ? "compare-at strikethrough; " : ""}${caps.bulkPriceUpdate ? "bulk price update; " : ""}${caps.scheduledSale ? "native scheduled sales" : "bot-side cron only"}.`
    : "";

  return [
    {
      stepType: "llm_call",
      title: "Competitor Identification",
      description: caps
        ? `Identifying top competitors in the ${niche} space (${platform}-aware)`
        : `Identifying top competitors in the ${niche} space`,
      input: {
        // Opts into the platform-wide preamble + caching. The
        // preamble carries the Marketing Moat directive + integration
        // capability primer; the workflow-specific tail focuses on
        // the platform-specific competitor angle.
        useClaudeDirect: true,
        cacheSystemPrompt: true,
        effort: "high",
        adaptiveThinking: true,
        systemPrompt: composeSystemPrompt(
          caps
            ? `You are a competitive intelligence analyst specializing in e-commerce. Provide detailed, actionable competitor analysis. ${platform === "amazon" ? "On Amazon, competition centers on Buy-Box wins and review velocity, not storefront polish." : platform === "etsy" ? "On Etsy, competition centers on tag/section optimization and craftsmanship signals, not paid distribution." : platform ? `On ${platform}, prioritize the platform's distinctive surfaces.` : ""}`
            : "You are a competitive intelligence analyst specializing in e-commerce. Provide detailed, actionable competitor analysis.",
        ),
        userPrompt: `Conduct a competitive analysis for the "${niche}" e-commerce niche:

1. Identify the top 10 competitors (both direct and indirect)
2. For each competitor, analyze:
   - Estimated monthly revenue
   - Product range and pricing strategy
   - Marketing channels used
   - Unique selling propositions
   - Strengths and weaknesses
3. Identify the biggest competitive gaps/opportunities
4. Recommend a counter-strategy for each major competitor — only recommend tactics the merchant's platform actually supports per the brief below
5. Suggest pricing positions relative to competitors${competitiveBrief}

Return as structured JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "competitor_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                competitors: { type: "array", items: { type: "object", properties: { name: { type: "string" }, estimatedRevenue: { type: "string" }, productRange: { type: "string" }, pricingStrategy: { type: "string" }, marketingChannels: { type: "array", items: { type: "string" } }, strengths: { type: "array", items: { type: "string" } }, weaknesses: { type: "array", items: { type: "string" } } }, required: ["name", "estimatedRevenue", "productRange", "pricingStrategy", "marketingChannels", "strengths", "weaknesses"], additionalProperties: false } },
                gaps: { type: "array", items: { type: "string" } },
                counterStrategies: { type: "array", items: { type: "object", properties: { competitor: { type: "string" }, strategy: { type: "string" } }, required: ["competitor", "strategy"], additionalProperties: false } },
                pricingPosition: { type: "string" },
                summary: { type: "string" },
              },
              required: ["competitors", "gaps", "counterStrategies", "pricingPosition", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "Competitor Analysis Complete",
      description: "Competitive intelligence report ready",
      input: {
        title: `Competitor Analysis: ${niche}`,
        message: `The Merchant has completed a competitive analysis for the "${niche}" niche. Review the intelligence report.`,
        agentType: "merchant",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Supply Chain Intelligence Workflow ───────────────────────────────────────

registerWorkflow("supply_chain_intelligence", (input): WorkflowStepDefinition[] => {
  const scope = input.scope ?? "all_stores";
  return [
    {
      stepType: "llm_call",
      title: "Supplier Performance Analysis",
      description: "Evaluating supplier reliability, lead times, and cost efficiency",
      input: {
        useClaudeDirect: true,
        cacheSystemPrompt: true,
        effort: "high",
        adaptiveThinking: true,
        systemPrompt: composeSystemPrompt(
          "You are a supply chain optimization expert for e-commerce. You've managed logistics for brands doing $50M+ in annual revenue.",
        ),
        userPrompt: `Conduct a comprehensive supply chain intelligence analysis:

1. Supplier Scorecard:
   - Reliability score (on-time delivery rate)
   - Quality score (defect/return rate by supplier)
   - Cost competitiveness (price vs. market average)
   - Communication responsiveness
   - Minimum order quantities and flexibility
   
2. Lead Time Optimization:
   - Current average lead times by supplier
   - Bottleneck identification
   - Recommended buffer stock levels
   - Express shipping cost-benefit analysis
   
3. Cost Reduction Opportunities:
   - Volume discount thresholds
   - Alternative supplier recommendations
   - Consolidation opportunities (fewer suppliers, larger orders)
   - Shipping route optimization
   
4. Risk Assessment:
   - Single-source dependency risks
   - Geographic concentration risks
   - Seasonal capacity constraints
   - Currency/tariff exposure
   
5. Automation Opportunities:
   - Auto-reorder triggers
   - Predictive demand forecasting integration
   - Supplier API integration possibilities

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "supply_chain_intelligence",
            strict: true,
            schema: {
              type: "object",
              properties: {
                supplierScorecard: { type: "array", items: { type: "object", properties: { supplier: { type: "string" }, reliabilityScore: { type: "number" }, qualityScore: { type: "number" }, costScore: { type: "number" }, overallGrade: { type: "string" }, recommendation: { type: "string" } }, required: ["supplier", "reliabilityScore", "qualityScore", "costScore", "overallGrade", "recommendation"], additionalProperties: false } },
                leadTimeOptimization: { type: "object", properties: { averageLeadTime: { type: "string" }, bottlenecks: { type: "array", items: { type: "string" } }, bufferRecommendations: { type: "string" }, expressShippingROI: { type: "string" } }, required: ["averageLeadTime", "bottlenecks", "bufferRecommendations", "expressShippingROI"], additionalProperties: false },
                costReductions: { type: "array", items: { type: "object", properties: { opportunity: { type: "string" }, estimatedSavings: { type: "string" }, implementation: { type: "string" } }, required: ["opportunity", "estimatedSavings", "implementation"], additionalProperties: false } },
                risks: { type: "array", items: { type: "object", properties: { risk: { type: "string" }, severity: { type: "string" }, mitigation: { type: "string" } }, required: ["risk", "severity", "mitigation"], additionalProperties: false } },
                automationOpportunities: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
              required: ["supplierScorecard", "leadTimeOptimization", "costReductions", "risks", "automationOpportunities", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "Supply Chain Report Ready",
      description: "Supply chain intelligence analysis complete",
      input: {
        title: "Supply Chain Intelligence Report",
        message: "The Merchant has completed a full supply chain analysis with supplier scorecards, cost reduction opportunities, and risk assessments.",
        agentType: "merchant",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Profit & Loss Analysis Workflow ─────────────────────────────────────────

registerWorkflow("profit_loss_analysis", (input): WorkflowStepDefinition[] => {
  const period = input.period ?? "last_30_days";
  return [
    {
      stepType: "analysis",
      title: "Revenue & Cost Aggregation",
      description: `Aggregating financial data for ${period}`,
      input: {
        analysisPrompt: `Compile a comprehensive profit & loss analysis for ${period}:
1. Total revenue by store and product category
2. Cost of goods sold (COGS) breakdown
3. Shipping costs and fulfillment expenses
4. Platform fees (Shopify, Etsy, payment processing)
5. Marketing spend by channel
6. Return/refund costs
7. Net profit by store and overall`,
        data: { period },
      },
    },
    {
      stepType: "llm_call",
      title: "Financial Intelligence Report",
      description: "Generating actionable financial insights and projections",
      input: {
        useClaudeDirect: true,
        cacheSystemPrompt: true,
        effort: "high",
        adaptiveThinking: true,
        systemPrompt: composeSystemPrompt(
          "You are a CFO-level financial analyst for e-commerce businesses. You turn raw financial data into strategic decisions.",
        ),
        userPrompt: `Based on the financial data, generate a comprehensive P&L intelligence report:

1. Profitability Analysis:
   - Gross margin by product/category
   - Net margin after all expenses
   - Contribution margin per unit
   - Break-even analysis per product
   
2. Revenue Trends:
   - Growth rate (week-over-week, month-over-month)
   - Revenue per visitor
   - Average order value trends
   - Customer lifetime value estimate
   
3. Cost Optimization:
   - Highest cost centers
   - Cost-per-acquisition by channel
   - Shipping cost as % of revenue
   - Platform fee optimization opportunities
   
4. Cash Flow Projections:
   - 30/60/90 day cash flow forecast
   - Inventory investment requirements
   - Marketing budget recommendations
   
5. Strategic Recommendations:
   - Products to scale (high margin, growing demand)
   - Products to cut (low margin, declining)
   - Pricing adjustments for profitability
   - Marketing budget reallocation

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "profit_loss_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                profitability: { type: "object", properties: { grossMargin: { type: "string" }, netMargin: { type: "string" }, topProducts: { type: "array", items: { type: "string" } }, bottomProducts: { type: "array", items: { type: "string" } } }, required: ["grossMargin", "netMargin", "topProducts", "bottomProducts"], additionalProperties: false },
                revenueTrends: { type: "object", properties: { growthRate: { type: "string" }, revenuePerVisitor: { type: "string" }, averageOrderValue: { type: "string" }, customerLifetimeValue: { type: "string" } }, required: ["growthRate", "revenuePerVisitor", "averageOrderValue", "customerLifetimeValue"], additionalProperties: false },
                costOptimization: { type: "array", items: { type: "object", properties: { area: { type: "string" }, currentCost: { type: "string" }, recommendation: { type: "string" }, estimatedSavings: { type: "string" } }, required: ["area", "currentCost", "recommendation", "estimatedSavings"], additionalProperties: false } },
                cashFlowForecast: { type: "object", properties: { thirtyDay: { type: "string" }, sixtyDay: { type: "string" }, ninetyDay: { type: "string" } }, required: ["thirtyDay", "sixtyDay", "ninetyDay"], additionalProperties: false },
                strategicRecommendations: { type: "array", items: { type: "object", properties: { recommendation: { type: "string" }, impact: { type: "string" }, timeline: { type: "string" } }, required: ["recommendation", "impact", "timeline"], additionalProperties: false } },
                summary: { type: "string" },
              },
              required: ["profitability", "revenueTrends", "costOptimization", "cashFlowForecast", "strategicRecommendations", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "P&L Report Ready",
      description: "Profit & Loss analysis complete with projections",
      input: {
        title: "Profit & Loss Report Ready",
        message: "The Merchant has completed a comprehensive P&L analysis with cash flow projections and strategic recommendations.",
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Customer Segmentation Workflow ──────────────────────────────────────────

registerWorkflow("customer_segmentation", (input): WorkflowStepDefinition[] => {
  const scope = input.scope ?? "all_stores";
  return [
    {
      stepType: "llm_call",
      title: "Customer Behavior Analysis",
      description: "Analyzing customer purchase patterns and segmentation",
      input: {
        useClaudeDirect: true,
        cacheSystemPrompt: true,
        effort: "high",
        adaptiveThinking: true,
        systemPrompt: composeSystemPrompt(
          "You are a customer analytics expert specializing in e-commerce. You use RFM analysis, cohort analysis, and behavioral segmentation to drive retention and revenue.",
        ),
        userPrompt: `Generate a comprehensive customer segmentation analysis:

1. RFM Segmentation (Recency, Frequency, Monetary):
   - Champions: High value, frequent, recent buyers
   - Loyal Customers: Regular purchasers
   - Potential Loyalists: Recent customers with growth potential
   - At-Risk: Previously active, declining engagement
   - Lost: No activity in 90+ days
   - New Customers: First purchase in last 30 days
   
2. Behavioral Segments:
   - Bargain Hunters (only buy on sale)
   - Brand Loyalists (repeat same products)
   - Explorers (try different categories)
   - One-and-Done (single purchase, never return)
   - High-Value (top 10% by LTV)
   
3. For Each Segment:
   - Estimated size (% of customer base)
   - Average order value
   - Purchase frequency
   - Recommended marketing strategy
   - Retention tactics
   - Predicted lifetime value
   
4. Actionable Campaigns:
   - Win-back campaign for At-Risk/Lost segments
   - Upsell campaign for Loyal/Champions
   - Welcome series optimization for New Customers
   - VIP program design for High-Value
   
5. Churn Prediction:
   - Early warning signals
   - Intervention triggers
   - Automated retention flows

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "customer_segmentation",
            strict: true,
            schema: {
              type: "object",
              properties: {
                rfmSegments: { type: "array", items: { type: "object", properties: { segment: { type: "string" }, size: { type: "string" }, avgOrderValue: { type: "string" }, frequency: { type: "string" }, marketingStrategy: { type: "string" }, retentionTactic: { type: "string" }, predictedLTV: { type: "string" } }, required: ["segment", "size", "avgOrderValue", "frequency", "marketingStrategy", "retentionTactic", "predictedLTV"], additionalProperties: false } },
                behavioralSegments: { type: "array", items: { type: "object", properties: { segment: { type: "string" }, characteristics: { type: "string" }, size: { type: "string" }, strategy: { type: "string" } }, required: ["segment", "characteristics", "size", "strategy"], additionalProperties: false } },
                campaigns: { type: "array", items: { type: "object", properties: { name: { type: "string" }, targetSegment: { type: "string" }, channel: { type: "string" }, message: { type: "string" }, expectedImpact: { type: "string" } }, required: ["name", "targetSegment", "channel", "message", "expectedImpact"], additionalProperties: false } },
                churnPrediction: { type: "object", properties: { warningSignals: { type: "array", items: { type: "string" } }, interventionTriggers: { type: "array", items: { type: "string" } }, automatedFlows: { type: "array", items: { type: "string" } } }, required: ["warningSignals", "interventionTriggers", "automatedFlows"], additionalProperties: false },
                summary: { type: "string" },
              },
              required: ["rfmSegments", "behavioralSegments", "campaigns", "churnPrediction", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Review Segmentation & Campaigns",
      description: "Review customer segments and proposed campaigns before activation",
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Customer Segmentation Complete",
      description: "Customer analysis and campaign recommendations ready",
      input: {
        title: "Customer Segmentation Complete",
        message: "The Merchant has completed customer segmentation with RFM analysis, behavioral segments, and targeted campaign recommendations.",
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});


// ─── Margin Guard Audit ─────────────────────────────────────────────────────
//
// Scans every active product in a store, joins it with the most recent
// pricing rule (if any), and flags products that are selling below
// cost OR within a configurable margin floor. This is the bot
// equivalent of an accountant's "your top SKU is losing money on every
// unit" alert — direct revenue protection.
//
// Surfaces actionable proposals (raise price by X to hit floor, pause
// the listing, or ignore if below threshold) as approval items so a
// human signs off before the Merchant Bot ships price changes.

registerWorkflow("margin_guard_audit", (input): WorkflowStepDefinition[] => {
  const minMarginPct = input.minMarginPct ?? 15; // 15% default floor
  const includePaused = input.includePaused ?? false;
  return [
    {
      stepType: "data_transform",
      title: "Pull products + cost data",
      description: "Loading active products and cost prices for the store",
      input: {
        operation: "load_margin_audit_dataset",
        minMarginPct,
        includePaused,
      },
    },
    {
      stepType: "llm_call",
      title: "Margin analysis",
      description: `Identify SKUs below ${minMarginPct}% margin floor`,
      input: {
        systemPrompt: `You are a precision-pricing analyst. Given a list of products with their sell price and cost price, identify any product whose margin is below the minimum floor. For each flagged product, propose either:
  • RAISE_PRICE: raise to hit the floor (give exact target price)
  • PAUSE_LISTING: when raising would price out of market
  • LIQUIDATE: when stock is high and margin is unsalvageable

Be precise. Always include the math.`,
        userPrompt: `Audit margins. Minimum floor: ${minMarginPct}%. Use the dataset from the previous step. Return JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "margin_audit",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: {
                  type: "object",
                  properties: {
                    productsAudited: { type: "number" },
                    productsBelowFloor: { type: "number" },
                    estimatedMonthlyLossUsd: { type: "number" },
                  },
                  required: ["productsAudited", "productsBelowFloor", "estimatedMonthlyLossUsd"],
                  additionalProperties: false,
                },
                flaggedProducts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      productId: { type: "number" },
                      title: { type: "string" },
                      currentPriceUsd: { type: "number" },
                      costPriceUsd: { type: "number" },
                      currentMarginPct: { type: "number" },
                      action: { type: "string", enum: ["RAISE_PRICE", "PAUSE_LISTING", "LIQUIDATE"] },
                      proposedPriceUsd: { type: "number" },
                      reasoning: { type: "string" },
                    },
                    required: ["productId", "title", "currentPriceUsd", "costPriceUsd", "currentMarginPct", "action", "proposedPriceUsd", "reasoning"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["summary", "flaggedProducts"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Review flagged products",
      description: "Owner approves or rejects each proposed margin-fix action",
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Margin Guard report ready",
      input: {
        title: "Margin Guard scan complete",
        message: "Review the flagged SKUs in your Approvals queue.",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Velocity Restock Predictor ─────────────────────────────────────────────
//
// Static low-stock thresholds are blunt — a SKU that sells 50/day at
// stockLevel=20 is in crisis; a SKU that sells 1/week at stockLevel=20
// has months of runway. This workflow computes per-SKU sales velocity
// from the order stream over a rolling window, projects days-of-cover
// remaining, and surfaces SKUs that will stock out before their lead
// time clears.
//
// Output is a prioritized restock plan: which SKU, how many units to
// reorder, when the PO should fire, and the projected stockout date
// if no action is taken. Routes through an approval gate.

registerWorkflow("velocity_restock_predictor", (input): WorkflowStepDefinition[] => {
  const lookbackDays = input.lookbackDays ?? 30;
  const supplierLeadTimeDays = input.supplierLeadTimeDays ?? 14;
  const safetyStockDays = input.safetyStockDays ?? 7;
  return [
    {
      stepType: "data_transform",
      title: "Compute sales velocity per SKU",
      description: `Calculating units-sold-per-day over the last ${lookbackDays} days`,
      input: {
        operation: "compute_sales_velocity",
        lookbackDays,
      },
    },
    {
      stepType: "llm_call",
      title: "Restock plan",
      description: `Project stockout dates and recommend reorder quantities`,
      input: {
        systemPrompt: `You are a supply-chain analyst. Given per-SKU sales velocity, current stock, supplier lead time, and a safety-stock buffer, produce a prioritized restock plan. Be precise — show the math for each recommendation, never guess.`,
        userPrompt: `Build a restock plan from the velocity data in the previous step.\n\nParameters:\n- Supplier lead time: ${supplierLeadTimeDays} days\n- Safety stock buffer: ${safetyStockDays} days\n\nFor each at-risk SKU, compute:\n- daysOfCoverRemaining (currentStock / dailyVelocity)\n- projectedStockoutDate\n- recommendedReorderQty (covers velocity × (leadTime + safetyStock + lookback/2 expected variance))\n- urgency: "critical" (stockout < leadTime), "warning" (stockout < leadTime + safetyStock), "watch" (stockout < 60 days)\n- estimatedRevenueAtRiskUsd (if SKU stocks out)\n\nReturn JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "restock_plan",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: {
                  type: "object",
                  properties: {
                    skusAnalyzed: { type: "number" },
                    skusAtRisk: { type: "number" },
                    estimatedRevenueAtRiskUsd: { type: "number" },
                  },
                  required: ["skusAnalyzed", "skusAtRisk", "estimatedRevenueAtRiskUsd"],
                  additionalProperties: false,
                },
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      productId: { type: "number" },
                      title: { type: "string" },
                      currentStock: { type: "number" },
                      dailyVelocity: { type: "number" },
                      daysOfCoverRemaining: { type: "number" },
                      projectedStockoutDate: { type: "string" },
                      recommendedReorderQty: { type: "number" },
                      urgency: { type: "string", enum: ["critical", "warning", "watch"] },
                      estimatedRevenueAtRiskUsd: { type: "number" },
                      reasoning: { type: "string" },
                    },
                    required: ["productId", "title", "currentStock", "dailyVelocity", "daysOfCoverRemaining", "projectedStockoutDate", "recommendedReorderQty", "urgency", "estimatedRevenueAtRiskUsd", "reasoning"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["summary", "recommendations"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Approve restock plan",
      description: "Owner reviews recommended POs before they fire to suppliers",
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Restock plan ready",
      input: {
        title: "Velocity-based restock plan ready",
        message: "Review the recommended POs in your Approvals queue.",
        agentType: "merchant",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});

/**
 * store_optimization_sweep — the magnum opus Merchant workflow.
 *
 * The "Make my existing store demonstrably better" pipeline. For
 * operators who already have GMV, products, and orders. Composes
 * five existing analyses into one workflow that audits, recommends
 * concrete changes, and routes high-impact actions through the
 * approval queue before applying them.
 *
 * Flow: sync → inventory health → margin guard → pricing change-set
 *   → approval gate → top-N listing rewrites → summary.
 *
 * Activation: connected store with products. Recommended for the
 * "operating" stage in the recommender.
 */
registerWorkflow("store_optimization_sweep", (input): WorkflowStepDefinition[] => {
  const focusSku = input.focusSku ? String(input.focusSku) : undefined;
  const topN = Math.max(3, Math.min(10, Number(input.topN ?? 5)));

  return [
    {
      stepType: "store_action",
      title: "Sync products from store",
      description: "Pulling the current catalog from your connected platform",
      input: { action: "sync_products" },
    },
    {
      stepType: "analysis",
      title: "Inventory health",
      description: "Stock-level sweep — what to restock, what to discontinue",
      input: {
        analysisPrompt: `Analyze the synced product list for inventory health. Identify:
1. SKUs at risk of stockout (current stock below 7-day velocity)
2. Dead stock (no sales in 30+ days)
3. Restock recommendations with estimated reorder qty
4. Margin-weighted priority — focus on the products that move the needle.${focusSku ? `\n\nGive special attention to SKU ${focusSku}.` : ""}
Return as a structured report.`,
      },
    },
    {
      stepType: "analysis",
      title: "Margin guard",
      description: "Flagging SKUs selling below your margin floor",
      input: {
        analysisPrompt: `Run a margin-floor audit on every active SKU. For each at-risk product, return:
- current price, cost, margin %
- proposed new price that hits target margin
- expected weekly revenue change at projected sales velocity
- confidence (low/medium/high)
Recommend a clear go/no-go on each.`,
      },
    },
    {
      stepType: "llm_call",
      title: "Pricing optimization",
      description: "Per-SKU price recommendations with revenue projections",
      input: {
        useClaudeDirect: true,
        cacheSystemPrompt: true,
        effort: "high",
        adaptiveThinking: true,
        systemPrompt: composeSystemPrompt(
          `You are a pricing strategist. You read margin reports and propose specific, actionable price changes that hit a target margin without killing volume. You always show the dollar-impact estimate.`,
        ),
        userPrompt: `Based on the prior margin guard + inventory analysis, propose a concrete pricing change-set. For each affected SKU return: { sku, currentPriceCents, proposedPriceCents, reason, weeklyRevenueDeltaCents }. Group changes by impact tier (high / medium / low). Return JSON with { changes: [...], totalEstimatedWeeklyDeltaCents }.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "pricing_changeset",
            strict: true,
            schema: {
              type: "object",
              properties: {
                changes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      sku: { type: "string" },
                      currentPriceCents: { type: "integer" },
                      proposedPriceCents: { type: "integer" },
                      reason: { type: "string" },
                      weeklyRevenueDeltaCents: { type: "integer" },
                      impactTier: { type: "string" },
                    },
                    required: ["sku", "currentPriceCents", "proposedPriceCents", "reason", "weeklyRevenueDeltaCents", "impactTier"],
                    additionalProperties: false,
                  },
                },
                totalEstimatedWeeklyDeltaCents: { type: "integer" },
              },
              required: ["changes", "totalEstimatedWeeklyDeltaCents"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Approve pricing change-set",
      description: "Review the proposed price changes — dollar-impact estimate is in the prior step's output",
      requiresApproval: true,
    },
    {
      stepType: "llm_call",
      title: "Rewrite underperforming listings",
      description: `Builder Bot rewrites the top ${topN} underperformers — better titles, descriptions, SEO keywords`,
      input: {
        useClaudeDirect: true,
        cacheSystemPrompt: true,
        effort: "high",
        systemPrompt: composeSystemPrompt(
          `You are a senior e-commerce copywriter. You rewrite product listings for conversion — better titles, benefit-led descriptions, natural SEO keyword integration. Match the brand voice you can infer from the existing catalog.`,
        ),
        userPrompt: `Rewrite ${topN} underperforming listings from the prior context (products with low view-to-purchase ratio or sub-par titles). Return JSON with { rewrites: [ { sku, originalTitle, optimizedTitle, optimizedDescription, bulletPoints: string[], seoKeywords: string[] } ] }.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "listing_rewrites",
            strict: true,
            schema: {
              type: "object",
              properties: {
                rewrites: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      sku: { type: "string" },
                      originalTitle: { type: "string" },
                      optimizedTitle: { type: "string" },
                      optimizedDescription: { type: "string" },
                      bulletPoints: { type: "array", items: { type: "string" } },
                      seoKeywords: { type: "array", items: { type: "string" } },
                    },
                    required: ["sku", "originalTitle", "optimizedTitle", "optimizedDescription", "bulletPoints", "seoKeywords"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["rewrites"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "Optimization sweep complete",
      description: "Inventory audited. Margins flagged. Pricing approved. Top listings rewritten.",
      input: {
        title: "Store optimization sweep — complete",
        message: `Merchant Bot finished a full optimization sweep. Inventory health, margin guard, pricing change-set, and ${topN} listing rewrites are ready in the Activity feed. Approved pricing changes apply on the next sync; listing rewrites land as drafts for review.`,
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});
