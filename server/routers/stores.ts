import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { orgProcedure, protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import * as db from "../db";
import axios from "axios";
import { optimizeProductImage } from "../utils/imageOptimizer";
import { sanitizeName, sanitizeText } from "../utils/sanitize";
import { getStoreLimit } from "../stripe/products";

const platformEnum = z.enum(["shopify", "woocommerce", "amazon", "etsy", "ebay", "tiktok_shop", "walmart"]);

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
      const completedOrders = recentOrders.filter((o: any) => o.status !== "cancelled");
      const todayOrders = completedOrders.filter((o: any) => new Date(o.createdAt).getTime() > now - day);
      const todayRevenue = todayOrders.reduce((acc: number, o: any) => acc + (o.totalCents || 0), 0) / 100;

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
          todayRevenue: parseFloat(todayRevenue.toFixed(2)),
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
        const response = await axios.get(input.imageUrl, { responseType: "arraybuffer" });
        const imageBuffer = Buffer.from(response.data);
        const result = await optimizeProductImage(
          imageBuffer,
          `${input.storeId}/${input.productId || "product"}`
        );
        return result;
      } catch (err: any) {
        // Log full error server-side, but never leak details to the client
        console.error("[stores.optimizeProductImage] failed", {
          storeId: input.storeId,
          imageUrl: input.imageUrl,
          message: err?.message,
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

  supportedPlatforms: protectedProcedure.query(() => {
    return [
      { id: "shopify", name: "Shopify", icon: "🛍️", color: "#96BF48", description: "Full store management via Admin API & OAuth", oauthSupported: true, capabilities: ["products", "orders", "fulfillment", "themes", "customers", "analytics"] },
      { id: "woocommerce", name: "WooCommerce", icon: "🌐", color: "#96588A", description: "Complete store control via REST API", oauthSupported: false, capabilities: ["products", "orders", "customers", "coupons", "settings", "reports"] },
      { id: "amazon", name: "Amazon", icon: "📦", color: "#FF9900", description: "Seller management via SP-API", oauthSupported: false, capabilities: ["listings", "orders", "fulfillment", "reports", "advertising"] },
      { id: "etsy", name: "Etsy", icon: "🧡", color: "#F1641E", description: "Shop management via Open API v3", oauthSupported: false, capabilities: ["listings", "orders", "inventory", "reviews", "shipping"] },
      { id: "ebay", name: "eBay", icon: "🔨", color: "#E53238", description: "Seller tools via REST APIs", oauthSupported: false, capabilities: ["listings", "orders", "marketing", "analytics", "fulfillment"] },
      { id: "tiktok_shop", name: "TikTok Shop", icon: "🎵", color: "#000000", description: "Social commerce via Open API", oauthSupported: false, capabilities: ["products", "orders", "fulfillment", "promotions"] },
      { id: "walmart", name: "Walmart", icon: "🏪", color: "#0071CE", description: "Marketplace via Seller API", oauthSupported: false, capabilities: ["products", "orders", "inventory", "pricing", "reports"] },
    ];
  }),
});
