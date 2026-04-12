/**
 * The Merchant Agent — Workflow Definitions
 * 
 * Workflows:
 * 1. inventory_audit — Cross-store inventory analysis, low stock alerts, restock recommendations
 * 2. pricing_optimization — Dynamic pricing analysis and margin optimization
 * 3. fulfillment_automation — Order processing and fulfillment pipeline
 * 4. competitor_analysis — Price comparison and market positioning
 */

import { registerWorkflow, type WorkflowStepDefinition } from "./workflowEngine";

// ─── Inventory Audit Workflow ──────────────────────────────────────────────

registerWorkflow("inventory_audit", (input): WorkflowStepDefinition[] => {
  const scope = input.scope ?? "all_stores";
  return [
    {
      stepType: "analysis",
      title: "Stock Level Analysis",
      description: "Analyzing current inventory levels across all connected stores",
      input: {
        analysisPrompt: `Perform a comprehensive inventory audit:
1. Identify all products below their low-stock threshold
2. Calculate days-of-stock remaining based on recent sales velocity
3. Flag products that are overstocked (>90 days supply)
4. Identify products with zero sales in the last 30 days
5. Calculate total inventory value at cost and retail

Provide specific restock quantities for low-stock items and clearance recommendations for dead stock.`,
        data: { scope, requestedAt: new Date().toISOString() },
      },
    },
    {
      stepType: "llm_call",
      title: "Restock Recommendations",
      description: "Generating optimal restock quantities and timing",
      input: {
        systemPrompt: "You are an inventory management expert. Optimize stock levels to minimize carrying costs while preventing stockouts.",
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
  return [
    {
      stepType: "llm_call",
      title: "Price Analysis",
      description: `Analyzing pricing with ${targetMargin}% target margin using ${strategy} strategy`,
      input: {
        systemPrompt: "You are a pricing strategist for e-commerce. You maximize revenue while maintaining competitive positioning.",
        userPrompt: `Analyze the current product pricing and recommend optimizations:

Strategy: ${strategy}
Target Margin: ${targetMargin}%

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
  return [
    {
      stepType: "analysis",
      title: "Order Validation",
      description: "Validating order details, stock availability, and shipping feasibility",
      input: {
        analysisPrompt: `Validate the order for fulfillment:
1. Verify all items are in stock
2. Check shipping address validity
3. Verify payment status
4. Calculate optimal shipping method and cost
5. Check for fraud indicators
6. Determine if any items need special handling

Return: validation status, any issues found, recommended shipping method, estimated delivery date.`,
        data: { orderId },
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
    },
  ];
});

// ─── Competitor Analysis Workflow ──────────────────────────────────────────

registerWorkflow("competitor_analysis", (input): WorkflowStepDefinition[] => {
  const niche = input.niche ?? "general";
  return [
    {
      stepType: "llm_call",
      title: "Competitor Identification",
      description: `Identifying top competitors in the ${niche} space`,
      input: {
        systemPrompt: "You are a competitive intelligence analyst specializing in e-commerce. Provide detailed, actionable competitor analysis.",
        userPrompt: `Conduct a competitive analysis for the "${niche}" e-commerce niche:

1. Identify the top 10 competitors (both direct and indirect)
2. For each competitor, analyze:
   - Estimated monthly revenue
   - Product range and pricing strategy
   - Marketing channels used
   - Unique selling propositions
   - Strengths and weaknesses
3. Identify the biggest competitive gaps/opportunities
4. Recommend a counter-strategy for each major competitor
5. Suggest pricing positions relative to competitors

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
