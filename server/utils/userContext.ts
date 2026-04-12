import * as db from "../db";

export interface StoreContext {
  storeName: string;
  platform: string;
  productCount: number;
  topProducts: Array<{ title: string; price: number; costPrice: number | null; category: string | null; status: string }>;
  orderCount: number;
  recentOrderStatuses: Record<string, number>;
  totalRevenueCents: number;
  avgOrderValueCents: number;
  lowStockCount: number;
  nicheHistory: string[];
  activeCampaigns: number;
  connectedSocials: number;
  pricingRuleCount: number;
  seoKeywordCount: number;
}

/**
 * Build a compact context snapshot of a user's store for LLM prompt injection.
 * Keeps data volume small (top-5 products, last-50 orders summary) to fit
 * within token budgets while giving bots real user-specific intelligence.
 */
export async function getStoreContext(storeId: number): Promise<StoreContext | null> {
  const store = await db.getStoreById(storeId);
  if (!store) return null;

  const [products, orders, nicheReports, campaigns, pricingRules, seoKeywords] = await Promise.all([
    db.getProductsByStore(storeId),
    db.getOrdersByStore(storeId, 50),
    db.getNicheReports(storeId),
    db.getAdCampaigns(storeId),
    db.getPricingRules(storeId),
    db.getSeoKeywords(storeId),
  ]);

  // Summarise order statuses
  const recentOrderStatuses: Record<string, number> = {};
  let totalRevenueCents = 0;
  for (const o of orders) {
    const s = (o as any).status ?? "unknown";
    recentOrderStatuses[s] = (recentOrderStatuses[s] ?? 0) + 1;
    totalRevenueCents += Number((o as any).totalAmount ?? (o as any).totalCents ?? 0);
  }

  // Low-stock count
  const lowStockCount = products.filter(
    (p: any) => p.stockLevel != null && p.lowStockThreshold != null && p.stockLevel <= p.lowStockThreshold,
  ).length;

  // Extract niche keywords studied before
  const nicheHistory = (nicheReports ?? [])
    .filter((r: any) => r.status === "completed")
    .map((r: any) => r.keyword as string)
    .slice(0, 10);

  // Top 5 products by price (proxy for "hero" products)
  const sorted = [...products].sort((a: any, b: any) => (b.price ?? 0) - (a.price ?? 0));
  const topProducts = sorted.slice(0, 5).map((p: any) => ({
    title: p.title,
    price: p.price,
    costPrice: p.costPrice,
    category: p.category,
    status: p.status,
  }));

  return {
    storeName: store.name ?? "Unknown",
    platform: (store as any).platform ?? "unknown",
    productCount: products.length,
    topProducts,
    orderCount: orders.length,
    recentOrderStatuses,
    totalRevenueCents,
    avgOrderValueCents: orders.length > 0 ? Math.round(totalRevenueCents / orders.length) : 0,
    lowStockCount,
    nicheHistory,
    activeCampaigns: campaigns.filter((c: any) => c.status === "active").length,
    connectedSocials: 0, // filled per-user if needed
    pricingRuleCount: pricingRules.length,
    seoKeywordCount: seoKeywords.length,
  };
}

/**
 * Render the store context into a concise prompt fragment that can be
 * prepended to any LLM system message. Stays under ~300 tokens.
 */
export function renderStoreContext(ctx: StoreContext): string {
  const topProds = ctx.topProducts
    .map((p) => `  - ${p.title} ($${(p.price / 100).toFixed(2)}, cost $${((p.costPrice ?? 0) / 100).toFixed(2)}, ${p.status})`)
    .join("\n");

  const orderBreakdown = Object.entries(ctx.recentOrderStatuses)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  return `
=== USER STORE CONTEXT ===
Store: "${ctx.storeName}" on ${ctx.platform}
Products: ${ctx.productCount} total (${ctx.lowStockCount} low-stock)
Top products:
${topProds || "  (none yet)"}
Orders (last 50): ${ctx.orderCount} — ${orderBreakdown || "none"}
Revenue: $${(ctx.totalRevenueCents / 100).toFixed(2)} | AOV: $${(ctx.avgOrderValueCents / 100).toFixed(2)}
Previous niches researched: ${ctx.nicheHistory.length > 0 ? ctx.nicheHistory.join(", ") : "none"}
Active ad campaigns: ${ctx.activeCampaigns} | Pricing rules: ${ctx.pricingRuleCount} | SEO keywords tracked: ${ctx.seoKeywordCount}
=== END CONTEXT ===

Use this context to personalise your response to the user's specific store, products, and performance. Reference their actual data.`.trim();
}

/**
 * One-shot helper: fetch + render for a storeId. Returns empty string if store not found.
 */
export async function getRenderedStoreContext(storeId: number): Promise<string> {
  const ctx = await getStoreContext(storeId);
  if (!ctx) return "";
  return renderStoreContext(ctx);
}
