import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import * as db from "../db";

const platformEnum = z.enum(["shopify", "woocommerce", "amazon", "etsy", "ebay", "tiktok_shop", "walmart"]);

export const storesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getStoresByUser(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.id);
      if (!store || store.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }
      return store;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      platform: platformEnum.default("shopify"),
      platformDomain: z.string().max(255).optional(),
      niche: z.string().max(255).optional(),
      currency: z.string().max(10).default("USD"),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.createStore({
        userId: ctx.user.id,
        name: input.name,
        platform: input.platform,
        platformDomain: input.platformDomain,
        niche: input.niche,
        currency: input.currency,
        status: "setup",
      });
      await db.createAgentTask({
        agentType: "architect",
        taskType: "store_creation",
        title: `Store "${input.name}" created on ${input.platform}`,
        description: `New ${input.platform} store created with niche: ${input.niche || "Not specified"}`,
        status: "completed",
        storeId: result.id,
      });
      return result;
    }),

  update: protectedProcedure
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
      // Ownership check
      const store = await db.getStoreById(input.id);
      if (!store || store.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }
      const { id, ...data } = input;
      await db.updateStore(id, data);
      return { success: true };
    }),

  // Generate Shopify OAuth URL for connecting a user's Shopify store
  shopifyOAuthUrl: protectedProcedure
    .input(z.object({
      shopDomain: z.string().min(1).max(255),
      storeId: z.number(),
      origin: z.string(),
      returnTo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify store ownership
      const store = await db.getStoreById(input.storeId);
      if (!store || store.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }

      const clientId = ENV.shopifyPartnerClientId;
      if (!clientId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Shopify Partner credentials not configured" });
      }

      // Clean shop domain
      let shop = input.shopDomain.trim().toLowerCase();
      if (!shop.includes(".")) shop = `${shop}.myshopify.com`;
      shop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");

      const scopes = [
        "read_products", "write_products",
        "read_orders", "write_orders",
        "read_customers",
        "read_inventory", "write_inventory",
        "read_fulfillments", "write_fulfillments",
        "read_analytics",
        "read_themes", "write_themes",
        "read_content", "write_content",
      ].join(",");

      // Use the Express install route which handles nonce generation and stores storeId
      const returnToParam = input.returnTo ? `&returnTo=${encodeURIComponent(input.returnTo)}` : '';
      const installUrl = `${input.origin}/api/shopify/install?shop=${encodeURIComponent(shop)}&storeId=${input.storeId}${returnToParam}`;

      // Update store with the shop domain
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
