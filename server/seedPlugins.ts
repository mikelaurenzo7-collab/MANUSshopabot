/**
 * Seed default first-party plugins into bot_plugins table.
 * Called once at server startup — idempotent (skips if plugins already exist).
 */
import * as db from "./db";
import { logger } from "./utils/logger";

const DEFAULT_PLUGINS = [
  {
    pluginName: "Customer Support Bot",
    version: "1.0.0",
    description: "Automated customer support triaging. Routes tickets by sentiment, auto-replies to common questions, and escalates complex issues to your inbox.",
    author: "Shop_a_Bot",
    category: "support",
    iconUrl: null,
    webhookConfig: { events: ["order.created", "order.refund_requested"] },
    eventTypes: ["ticket.created", "ticket.updated", "ticket.resolved"],
    status: "active" as const,
  },
  {
    pluginName: "Email Marketing (Klaviyo)",
    version: "1.0.0",
    description: "Sync customer segments to Klaviyo. Auto-trigger abandoned cart flows, post-purchase upsells, and win-back campaigns based on bot intelligence.",
    author: "Shop_a_Bot",
    category: "marketing",
    iconUrl: null,
    webhookConfig: { events: ["order.created", "cart.abandoned"] },
    eventTypes: ["segment.synced", "flow.triggered", "campaign.sent"],
    status: "active" as const,
  },
  {
    pluginName: "Review Manager (Judge.me)",
    version: "1.0.0",
    description: "Automated review collection and response. Sends post-purchase review requests, responds to negative reviews with AI, and surfaces insights.",
    author: "Shop_a_Bot",
    category: "reviews",
    iconUrl: null,
    webhookConfig: { events: ["order.fulfilled"] },
    eventTypes: ["review.requested", "review.received", "review.responded"],
    status: "active" as const,
  },
  {
    pluginName: "Shipping Optimizer",
    version: "1.0.0",
    description: "Compare shipping rates across carriers in real-time. Auto-select the cheapest option per order, generate labels, and push tracking to customers.",
    author: "Shop_a_Bot",
    category: "logistics",
    iconUrl: null,
    webhookConfig: { events: ["order.created", "order.fulfilled"] },
    eventTypes: ["rate.compared", "label.generated", "tracking.pushed"],
    status: "active" as const,
  },
  {
    pluginName: "Inventory Forecaster",
    version: "1.0.0",
    description: "ML-powered demand forecasting. Predicts stockout dates, suggests reorder quantities, and auto-generates purchase orders before you run out.",
    author: "Shop_a_Bot",
    category: "inventory",
    iconUrl: null,
    webhookConfig: { events: ["inventory.low", "order.created"] },
    eventTypes: ["forecast.generated", "reorder.suggested", "po.auto_created"],
    status: "active" as const,
  },
  {
    pluginName: "Social Proof Widget",
    version: "1.0.0",
    description: "Real-time purchase notifications and trust badges for your storefront. Shows recent sales, visitor counts, and low-stock urgency to boost conversions.",
    author: "Shop_a_Bot",
    category: "conversion",
    iconUrl: null,
    webhookConfig: { events: ["order.created"] },
    eventTypes: ["notification.displayed", "widget.clicked"],
    status: "active" as const,
  },
  {
    pluginName: "Returns & Exchanges",
    version: "1.0.0",
    description: "Self-service returns portal. Customers initiate returns/exchanges without contacting support. Auto-generates return labels and processes refunds.",
    author: "Shop_a_Bot",
    category: "support",
    iconUrl: null,
    webhookConfig: { events: ["order.fulfilled", "return.requested"] },
    eventTypes: ["return.initiated", "return.approved", "refund.processed"],
    status: "active" as const,
  },
  {
    pluginName: "Cross-Sell Engine",
    version: "1.0.0",
    description: "AI-powered product recommendations. Analyzes purchase patterns to suggest bundles, frequently-bought-together items, and post-purchase upsells.",
    author: "Shop_a_Bot",
    category: "conversion",
    iconUrl: null,
    webhookConfig: { events: ["order.created", "cart.updated"] },
    eventTypes: ["recommendation.generated", "bundle.suggested", "upsell.shown"],
    status: "active" as const,
  },
];

export async function seedDefaultPlugins() {
  try {
    const existing = await db.listPlugins();
    if (existing && existing.length > 0) {
      // Plugins already seeded — skip
      return { seeded: false, count: existing.length };
    }
    let count = 0;
    for (const plugin of DEFAULT_PLUGINS) {
      await db.createPlugin(plugin);
      count++;
    }
    return { seeded: true, count };
  } catch (err) {
    logger.error("seed_plugins_failed", {
      module: "seedPlugins",
      error: err instanceof Error ? err.message : String(err),
    });
    return { seeded: false, count: 0, error: String(err) };
  }
}
