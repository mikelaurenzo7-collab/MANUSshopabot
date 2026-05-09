import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { orgProcedure, protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import * as db from "../db";
import axios from "axios";
import { optimizeProductImage } from "../utils/imageOptimizer";
import { safeImageFetch, SsrfBlockedError } from "../utils/safeFetch";
import { sanitizeName, sanitizeText } from "../utils/sanitize";
import { getStoreLimit } from "../stripe/products";
import { logger } from "../utils/logger";

const platformEnum = z.enum([
  // Original 7
  "shopify", "woocommerce", "amazon", "etsy", "ebay", "tiktok_shop", "walmart",
  // Sprint 27 expansion
  "depop", "bigcommerce", "square", "faire", "bonanza", "stockx", "reverb",
]);

/**
 * Throw NOT_FOUND if the store doesn't exist OR doesn't belong to the
 * caller's active org. Centralizes the org-scoping check that every
 * single-store mutation needs.
 */
async function requireStoreInOrg(storeId: number, orgId: number) {
  const store = await db.getStoreById(storeId);
  if (!store || store.orgId !== orgId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  }
  return store;
}

export const storesRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    return db.getStoresByOrg(ctx.org.id);
  }),

  get: orgProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return requireStoreInOrg(input.id, ctx.org.id);
    }),

  create: orgProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      platform: platformEnum.default("shopify"),
      platformDomain: z.string().max(255).optional(),
      niche: z.string().max(255).optional(),
      currency: z.string().max(10).default("USD"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Plan-tier cap enforcement. Look up the org's owner to read the
      // active plan — `users.stripePlan`. Per-org billing is a future
      // pass; until then, the org owner's plan governs the org's caps.
      const org = await db.getOrgById(ctx.org.id);
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }
      const owner = await db.getUserById(org.ownerId);
      const limit = getStoreLimit(owner?.stripePlan ?? null);
      const currentCount = await db.getStoreCountForOrg(ctx.org.id);
      if (currentCount >= limit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            limit === Infinity
              ? "Unable to create store — please retry."
              : `You've reached your plan's store limit (${limit}). Upgrade to add more stores.`,
        });
      }

      const result = await db.withTransaction(async (tx) => {
        const createdStore = await db.createStore({
          orgId: ctx.org.id,
          userId: ctx.user.id,
          name: sanitizeName(input.name, 255),
          platform: input.platform,
          platformDomain: input.platformDomain ? sanitizeText(input.platformDomain, 255) : undefined,
          niche: input.niche ? sanitizeText(input.niche, 255) : undefined,
          currency: input.currency,
          status: "setup",
        }, tx);
        await db.createAgentTask({
          agentType: "architect",
          taskType: "store_creation",
          title: `Store "${input.name}" created on ${input.platform}`,
          description: `New ${input.platform} store created with niche: ${input.niche || "Not specified"}`,
          status: "completed",
          storeId: createdStore.id,
        }, tx);
        return createdStore;
      });
      return result;
    }),

  update: orgProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      platformDomain: z.string().max(255).optional(),
      platformAccessToken: z.string().optional(),
      platformStoreId: z.string().max(255).optional(),
      niche: z.string().max(255).optional(),
      status: z.enum(["setup", "active", "paused", "archived"]).optional(),
      currency: z.string().max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.id, ctx.org.id);
      const { id, ...data } = input;
      const sanitized = {
        ...data,
        ...(data.name ? { name: sanitizeName(data.name, 255) } : {}),
        ...(data.niche ? { niche: sanitizeText(data.niche, 255) } : {}),
        ...(data.platformDomain ? { platformDomain: sanitizeText(data.platformDomain, 255) } : {}),
      };
      await db.updateStore(id, sanitized);
      return { success: true };
    }),

  // ─── Deep Store Data Procedures ────────────────────────────────────────────

  /** Products for a store — from DB (synced by bots) */
  products: orgProcedure
    .input(z.object({
      storeId: z.number(),
      limit: z.number().min(1).max(100).default(50),
      search: z.string().optional(),
      status: z.enum(["all", "active", "draft", "archived", "low_stock", "out_of_stock"]).default("all"),
    }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const allProducts = await db.getProductsByStore(input.storeId);
      let filtered = allProducts;

      if (input.search) {
        const q = input.search.toLowerCase();
        filtered = filtered.filter((p: any) =>
          p.title?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
        );
      }
      if (input.status !== "all") {
        filtered = filtered.filter((p: any) => {
          if (input.status === "low_stock") return p.stockLevel !== null && p.lowStockThreshold !== null && p.stockLevel <= p.lowStockThreshold && p.stockLevel > 0;
          if (input.status === "out_of_stock") return p.stockLevel !== null && p.stockLevel <= 0;
          return p.status === input.status;
        });
      }
      return filtered.slice(0, input.limit);
    }),

  /** Orders for a store — from DB */
  orders: orgProcedure
    .input(z.object({
      storeId: z.number(),
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["all", "pending", "processing", "shipped", "delivered", "cancelled", "refunded"]).default("all"),
    }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const allOrders = await db.getOrdersByStore(input.storeId, 200);
      let filtered = allOrders;
      if (input.status !== "all") {
        filtered = filtered.filter((o: any) => o.status === input.status || o.fulfillmentStatus === input.status);
      }
      return filtered.slice(0, input.limit);
    }),

  /** Revenue summary — aggregated from orders in DB */
  revenueSummary: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const store = await requireStoreInOrg(input.storeId, ctx.org.id);
      const allOrders = await db.getOrdersByStore(input.storeId, 500);
      const now = Date.now();
      const day = 86400000;

      const completedOrders = allOrders.filter((o: any) =>
        o.status !== "cancelled" && o.status !== "refunded"
      );

      const todayOrders = completedOrders.filter((o: any) =>
        new Date(o.createdAt).getTime() > now - day
      );
      const weekOrders = completedOrders.filter((o: any) =>
        new Date(o.createdAt).getTime() > now - 7 * day
      );
      const monthOrders = completedOrders.filter((o: any) =>
        new Date(o.createdAt).getTime() > now - 30 * day
      );

      const sum = (orders: any[]) => orders.reduce((acc: number, o: any) => acc + (o.totalCents || 0), 0) / 100;
      const aov = monthOrders.length > 0 ? sum(monthOrders) / monthOrders.length : 0;

      // Build 30-day daily revenue chart data
      const dailyRevenue: { date: string; revenue: number; orders: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const dayStart = now - (i + 1) * day;
        const dayEnd = now - i * day;
        const dayOrders = completedOrders.filter((o: any) => {
          const t = new Date(o.createdAt).getTime();
          return t >= dayStart && t < dayEnd;
        });
        const date = new Date(dayEnd);
        dailyRevenue.push({
          date: `${date.getMonth() + 1}/${date.getDate()}`,
          revenue: parseFloat(sum(dayOrders).toFixed(2)),
          orders: dayOrders.length,
        });
      }

      // Top products by revenue
      const productRevMap: Record<string, number> = {};
      completedOrders.forEach((o: any) => {
        if (o.items) {
          try {
            const items = typeof o.items === "string" ? JSON.parse(o.items) : o.items;
            if (Array.isArray(items)) {
              items.forEach((item: any) => {
                const name = item.title || item.name || "Unknown";
                productRevMap[name] = (productRevMap[name] || 0) + (item.price || 0) * (item.quantity || 1);
              });
            }
          } catch {}
        }
      });
      const topProducts = Object.entries(productRevMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, revenue]) => ({ name, revenue: parseFloat(revenue.toFixed(2)) }));

      const refundedCount = allOrders.filter((o: any) => o.status === "refunded" || o.fulfillmentStatus === "refunded").length;
      const refundRate = allOrders.length > 0 ? ((refundedCount / allOrders.length) * 100).toFixed(1) : "0.0";

      return {
        today: parseFloat(sum(todayOrders).toFixed(2)),
        week: parseFloat(sum(weekOrders).toFixed(2)),
        month: parseFloat(sum(monthOrders).toFixed(2)),
        todayOrders: todayOrders.length,
        weekOrders: weekOrders.length,
        monthOrders: monthOrders.length,
        totalOrders: allOrders.length,
        aov: parseFloat(aov.toFixed(2)),
        refundRate,
        dailyRevenue,
        topProducts,
        currency: store.currency || "USD",
      };
    }),

  /** Bot activity for a store — from agentTasks table */
  botActivity: orgProcedure
    .input(z.object({
      storeId: z.number(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      return db.getAgentTasks({ storeId: input.storeId, limit: input.limit });
    }),

  /** Overview — combines store info + key metrics in one call */
  overview: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const store = await requireStoreInOrg(input.storeId, ctx.org.id);
      const [allProducts, recentOrders, recentTasks] = await Promise.all([
        db.getProductsByStore(input.storeId),
        db.getOrdersByStore(input.storeId, 50),
        db.getAgentTasks({ storeId: input.storeId, limit: 5 }),
      ]);

      const now = Date.now();
      const day = 86400000;
      const week = day * 7;
      const completedOrders = recentOrders.filter((o: any) => o.status !== "cancelled");
      const todayOrders = completedOrders.filter((o: any) => new Date(o.createdAt).getTime() > now - day);
      // Week + last-week buckets so the workspace overview can show
      // "Orders this week vs last week" with real data instead of
      // hand-shaped curves. We re-key these on the same cancelled-
      // exclusion as `todayOrders` for consistency.
      const weekOrders = completedOrders.filter((o: any) => {
        const ts = new Date(o.createdAt).getTime();
        return ts > now - week;
      });
      const lastWeekOrders = completedOrders.filter((o: any) => {
        const ts = new Date(o.createdAt).getTime();
        return ts <= now - week && ts > now - 2 * week;
      });
      const todayRevenueDollars = todayOrders.reduce((acc: number, o: any) => acc + (o.totalCents || 0), 0) / 100;
      const weekRevenueCents = weekOrders.reduce((acc: number, o: any) => acc + (o.totalCents || 0), 0);

      const activeProducts = allProducts.filter((p: any) => p.status === "active" || !p.status).length;
      const lowStockProducts = allProducts.filter((p: any) =>
        p.stockLevel !== null && p.lowStockThreshold !== null && p.stockLevel <= p.lowStockThreshold
      ).length;
      const outOfStockProducts = allProducts.filter((p: any) =>
        p.stockLevel !== null && p.stockLevel <= 0
      ).length;

      // Top product by stock or recent creation
      const topProduct = allProducts[0] || null;

      return {
        store,
        metrics: {
          totalProducts: allProducts.length,
          activeProducts,
          lowStockProducts,
          outOfStockProducts,
          totalOrders: recentOrders.length,
          todayOrders: todayOrders.length,
          todayRevenue: parseFloat(todayRevenueDollars.toFixed(2)),
          weekOrders: weekOrders.length,
          lastWeekOrders: lastWeekOrders.length,
          weekRevenueCents,
        },
        topProduct,
        recentActivity: recentTasks,
        lastOrder: recentOrders[0] || null,
      };
    }),

  /**
   * Optimize a product image — resize to thumbnail/medium/large, convert to WebP, upload to S3.
   * Returns CDN URLs for all sizes plus savings stats.
   */
  optimizeProductImage: orgProcedure
    .input(z.object({
      storeId: z.number(),
      imageUrl: z.string().url(),
      productId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      try {
        // Fetch the image buffer from the URL, then pass Buffer to the optimizer
        // SSRF-guarded fetch: blocks file://, private IPs (incl. cloud-metadata),
        // oversized payloads, and applies a 10s timeout.
        const imageBuffer = await safeImageFetch(input.imageUrl);
        const result = await optimizeProductImage(
          imageBuffer,
          `${input.storeId}/${input.productId || "product"}`
        );
        return result;
      } catch (err: any) {
        // SSRF block surfaces as a user-fixable BAD_REQUEST so the operator
        // knows their URL was rejected (vs an opaque server error).
        if (err instanceof SsrfBlockedError) {
          logger.warn("stores_optimize_product_image_ssrf_blocked", {
            module: "stores",
            storeId: input.storeId,
            error: err.message,
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Image URL was rejected — must be a publicly reachable HTTPS URL.",
          });
        }
        // Log full error server-side, but never leak details to the client
        logger.error("stores_optimize_product_image_failed", {
          module: "stores",
          storeId: input.storeId,
          imageUrl: input.imageUrl,
          error: err?.message,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Image optimization failed. Please try again or contact support.",
        });
      }
    }),

  // ─── Shopify OAuth ──────────────────────────────────────────────────────────

  shopifyOAuthUrl: orgProcedure
    .input(z.object({
      shopDomain: z.string().min(1).max(255),
      storeId: z.number(),
      origin: z.string(),
      returnTo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);

      const clientId = ENV.shopifyPartnerClientId;
      if (!clientId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Shopify Partner credentials not configured" });
      }

      let shop = input.shopDomain.trim().toLowerCase();
      if (!shop.includes(".")) shop = `${shop}.myshopify.com`;
      shop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");

      const returnToParam = input.returnTo ? `&returnTo=${encodeURIComponent(input.returnTo)}` : '';
      const installUrl = `${input.origin}/api/shopify/install?shop=${encodeURIComponent(shop)}&storeId=${input.storeId}${returnToParam}`;

      await db.updateStore(input.storeId, { platformDomain: shop });
      return { url: installUrl, shop };
    }),

  /**
   * Health Score — 0–100 composite score for a single store.
   *
   * Five components (max points in parens):
   *   Catalog quality  (30) — % of active products with images, descriptions, pricing
   *   Bot activity     (25) — workflows run in the last 30 days + success rate
   *   Inventory health (20) — out-of-stock and low-stock rates
   *   Channels         (15) — connected social / ad accounts
   *   Order velocity   (10) — non-cancelled orders in the last 30 days
   *
   * Grade scale: S ≥ 90 · A ≥ 80 · B ≥ 70 · C ≥ 60 · D ≥ 50 · F < 50
   */
  healthScore: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);

      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [allProducts, recentOrders, recentWorkflows, socialAccounts] = await Promise.all([
        db.getProductsByStore(input.storeId),
        db.getOrdersByStore(input.storeId, 100),
        db.getWorkflowsByOrg(ctx.org.id, { storeId: input.storeId, limit: 50 }),
        db.getSocialAccountsByOrg(ctx.org.id),
      ]);

      // Active products include both published ("active") and in-progress
      // ("draft") — drafts count against catalog quality, which is
      // intentional: an unmissed-image draft still hurts the store.
      const scorableProducts = (allProducts as any[]).filter(
        (p) => p.status !== "archived",
      );
      const total = scorableProducts.length;

      const tips: string[] = [];

      // ── 1. Catalog quality (0–30) ────────────────────────────────────
      let catalogScore = 0;
      if (total === 0) {
        tips.push("Add your first products to unlock catalog scoring");
      } else {
        const withImage = scorableProducts.filter((p) => !!p.imageUrl).length;
        const withDesc = scorableProducts.filter(
          (p) => typeof p.description === "string" && p.description.length > 50,
        ).length;
        const withPrice = scorableProducts.filter((p) => Number(p.price) > 0).length;

        const imgScore = Math.round((withImage / total) * 10);
        const descScore = Math.round((withDesc / total) * 10);
        const priceScore = Math.round((withPrice / total) * 10);
        catalogScore = imgScore + descScore + priceScore;

        if (imgScore < 7)
          tips.push(
            `Add images to ${total - withImage} product${total - withImage > 1 ? "s" : ""}`,
          );
        else if (descScore < 7)
          tips.push(
            `Write descriptions for ${total - withDesc} product${total - withDesc > 1 ? "s" : ""}`,
          );
      }

      // ── 2. Bot activity (0–25) ───────────────────────────────────────
      const recentWfs = (recentWorkflows as any[]).filter(
        (w) => w.createdAt && new Date(w.createdAt).getTime() >= since30d.getTime(),
      );
      const completedWfs = recentWfs.filter((w) => w.status === "completed");
      const wfCountScore = Math.min(recentWfs.length * 3, 20);
      const wfSuccessBonus =
        recentWfs.length > 0 && completedWfs.length / recentWfs.length >= 0.7 ? 5 : 0;
      const botScore = wfCountScore + wfSuccessBonus;

      if (recentWfs.length === 0)
        tips.push("Run your first workflow — Store Bot is ready to activate");
      else if (recentWfs.length < 4)
        tips.push("Run more workflows to maximize your bot activity score");

      // ── 3. Inventory health (0–20) ───────────────────────────────────
      let inventoryScore = 10; // neutral when no products exist yet
      if (total > 0) {
        const oos = (allProducts as any[]).filter(
          (p) => p.stockLevel !== null && Number(p.stockLevel) <= 0,
        ).length;
        const lowStock = (allProducts as any[]).filter(
          (p) =>
            p.stockLevel !== null &&
            p.lowStockThreshold !== null &&
            Number(p.stockLevel) > 0 &&
            Number(p.stockLevel) <= Number(p.lowStockThreshold),
        ).length;
        const oosScore = Math.round((1 - oos / total) * 10);
        const lowScore = Math.round((1 - Math.min(lowStock, total) / total) * 10);
        inventoryScore = oosScore + lowScore;

        if (oos > 0)
          tips.push(
            `Restock ${oos} out-of-stock product${oos > 1 ? "s" : ""}`,
          );
        else if (lowStock > 0)
          tips.push(
            `${lowStock} product${lowStock > 1 ? "s are" : " is"} running low — reorder soon`,
          );
      }

      // ── 4. Channels connected (0–15) ────────────────────────────────
      const socialCount = (socialAccounts as any[]).length;
      const socialScore = Math.min(socialCount * 5, 10);
      const channelBonus = socialCount >= 2 ? 5 : 0;
      const channelScore = socialScore + channelBonus;

      if (socialCount === 0)
        tips.push("Connect a social channel to enable Social Bot automation");

      // ── 5. Order velocity (0–10) ─────────────────────────────────────
      const activeOrders30d = (recentOrders as any[]).filter(
        (o) =>
          o.createdAt &&
          new Date(o.createdAt).getTime() >= since30d.getTime() &&
          o.status !== "cancelled",
      );
      const orderScore = Math.min(activeOrders30d.length, 10);

      const score = catalogScore + botScore + inventoryScore + channelScore + orderScore;
      const grade =
        score >= 90 ? "S"
        : score >= 80 ? "A"
        : score >= 70 ? "B"
        : score >= 60 ? "C"
        : score >= 50 ? "D"
        : "F";

      return {
        score,
        grade,
        components: [
          { key: "catalog",   label: "Catalog quality",  score: catalogScore,   max: 30 },
          { key: "bot",       label: "Bot activity",     score: botScore,       max: 25 },
          { key: "inventory", label: "Inventory health", score: inventoryScore, max: 20 },
          { key: "channels",  label: "Channels",         score: channelScore,   max: 15 },
          { key: "orders",    label: "Order velocity",   score: orderScore,     max: 10 },
        ],
        tips: tips.slice(0, 3),
        meta: {
          totalProducts: total,
          recentWorkflows: recentWfs.length,
          socialChannels: socialCount,
          ordersLast30d: activeOrders30d.length,
        },
      };
    }),

  supportedPlatforms: protectedProcedure.query(() => {
    return [
      { id: "shopify", name: "Shopify", icon: "🛍️", color: "#96BF48", description: "Full store management via Admin API & OAuth", oauthSupported: true, capabilities: ["products", "orders", "fulfillment", "themes", "customers", "analytics"] },
      { id: "woocommerce", name: "WooCommerce", icon: "🌐", color: "#96588A", description: "Complete store control via REST API", oauthSupported: false, capabilities: ["products", "orders", "customers", "coupons", "settings", "reports"] },
      { id: "amazon", name: "Amazon", icon: "📦", color: "#FF9900", description: "Seller management via SP-API", oauthSupported: false, capabilities: ["listings", "orders", "fulfillment", "reports", "advertising"] },
      { id: "etsy", name: "Etsy", icon: "🧡", color: "#F1641E", description: "Shop management via Open API v3", oauthSupported: true, capabilities: ["listings", "orders", "inventory", "reviews", "shipping"] },
      { id: "ebay", name: "eBay", icon: "🔨", color: "#E53238", description: "Seller tools via REST APIs", oauthSupported: true, capabilities: ["listings", "orders", "marketing", "analytics", "fulfillment"] },
      { id: "tiktok_shop", name: "TikTok Shop", icon: "🎵", color: "#000000", description: "Social commerce via Open API", oauthSupported: true, capabilities: ["products", "orders", "fulfillment", "promotions"] },
      { id: "walmart", name: "Walmart", icon: "🏪", color: "#0071CE", description: "Marketplace via Seller API", oauthSupported: false, capabilities: ["products", "orders", "inventory", "pricing", "reports"] },
      // Sprint 27 expansion — vintage/POD/wholesale/specialty marketplaces
      { id: "depop", name: "Depop", icon: "👗", color: "#00D084", description: "Gen-Z vintage + streetwear marketplace", oauthSupported: true, capabilities: ["listings", "orders", "inventory", "shipping"] },
      { id: "bigcommerce", name: "BigCommerce", icon: "🛒", color: "#003366", description: "Mid-market storefront on a managed SaaS", oauthSupported: true, capabilities: ["products", "orders", "customers", "inventory"] },
      { id: "square", name: "Square Online", icon: "⬜", color: "#3E4348", description: "Square POS + Online Store with shared catalog", oauthSupported: true, capabilities: ["catalog", "orders", "inventory", "payments"] },
      { id: "faire", name: "Faire", icon: "🏪", color: "#6B5B95", description: "Wholesale marketplace for indie brands", oauthSupported: false, capabilities: ["orders", "inventory", "wholesale"] },
      { id: "bonanza", name: "Bonanza", icon: "🎪", color: "#FF6B35", description: "Long-tail collectibles marketplace (Bonapitit API)", oauthSupported: false, capabilities: ["listings", "orders", "inventory"] },
      { id: "stockx", name: "StockX", icon: "📈", color: "#000000", description: "Bid/ask resale marketplace for sneakers + streetwear", oauthSupported: true, capabilities: ["listings", "orders", "resale"] },
      { id: "reverb", name: "Reverb", icon: "🎸", color: "#2E7D32", description: "Music gear marketplace — connect via Personal Access Token", oauthSupported: false, capabilities: ["listings", "orders", "inventory"] },
    ];
  }),
});
