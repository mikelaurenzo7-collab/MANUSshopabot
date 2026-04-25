/**
 * TikTok Shop Platform Adapter
 * Uses TikTok Shop Open Platform REST API via axios.
 * OAuth-based authentication with app_key + access_token.
 */

import crypto from "crypto";
import { withRetry, platformRateLimiters } from "../../utils/rateLimiter";
import type {
  EcommercePlatformAdapter,
  AdapterCredentials,
  PlatformProduct,
  CreateProductInput,
  UpdateProductInput,
  PlatformOrder,
  FulfillmentInput,
  InventoryLevel,
  StoreInfo,
  ListParams,
} from "./types";
import { ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const TIKTOK_SHOP_BASE = "https://open-api.tiktokglobalshop.com";

export class TikTokShopAdapter implements EcommercePlatformAdapter {
  readonly platform = "tiktok_shop";
  readonly platformName = "TikTok Shop";

  private sign(path: string, params: Record<string, string>, appSecret: string): string {
    const sortedParams = Object.keys(params).sort().map(k => `${k}${params[k]}`).join("");
    const toSign = `${appSecret}${path}${sortedParams}${appSecret}`;
    return crypto.createHmac("sha256", appSecret).update(toSign).digest("hex");
  }

  private async fetch(path: string, credentials: AdapterCredentials, options?: { method?: string; body?: any; query?: Record<string, string> }) {
    const { default: axios } = await import("axios");
    const appKey = credentials.apiKey || "";
    const appSecret = credentials.apiSecret || "";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const shopCipher = credentials.metadata?.shopCipher || "";

    const queryParams: Record<string, string> = {
      app_key: appKey,
      timestamp,
      access_token: credentials.accessToken || "",
      shop_cipher: shopCipher,
      ...options?.query,
    };

    const sign = this.sign(path, queryParams, appSecret);
    const queryString = new URLSearchParams({ ...queryParams, sign }).toString();

    await platformRateLimiters.tiktok.acquire();
    return withRetry(async () => {
      try {
        const response = await axios({
          url: `${TIKTOK_SHOP_BASE}${path}?${queryString}`,
          method: (options?.method || "GET") as any,
          headers: { "Content-Type": "application/json" },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        if (response.data.code !== 0) {
          throw new Error(`TikTok Shop API error: ${response.data.message}`);
        }
        return response.data.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`TikTok Shop API error: ${err.response?.data?.message || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1000 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const data = await this.fetch("/api/shop/get_authorized_shop", credentials);
    const shop = data?.shop_list?.[0] || {};
    return {
      platformId: shop.shop_id || "tiktok_shop",
      name: shop.shop_name || "TikTok Shop",
      domain: "shop.tiktok.com",
      currency: shop.region || "USD",
      status: "active",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const data = await this.fetch("/api/products/search", credentials, {
      method: "POST",
      body: {
        page_size: params?.limit || 50,
        page_number: params?.page || 1,
      },
    });
    return (data?.products || []).map((p: any) => this.mapProduct(p));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.fetch(`/api/products/details`, credentials, {
      query: { product_id: productId },
    });
    return this.mapProduct(data?.product || {});
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    const data = await this.fetch("/api/products", credentials, {
      method: "POST",
      body: {
        product_name: product.title,
        description: product.description,
        skus: [{
          price: { original_price: (product.priceCents / 100).toFixed(2) },
          stock_infos: [{ available_stock: product.stockLevel || 0 }],
          seller_sku: product.sku,
        }],
        images: product.imageUrl ? [{ url: product.imageUrl }] : [],
        category_id: product.metadata?.categoryId || "0",
      },
    });
    return {
      platformId: data?.product_id || `draft_${Date.now()}`,
      title: product.title,
      description: product.description,
      priceCents: product.priceCents,
      sku: product.sku,
      imageUrl: product.imageUrl,
      category: product.category,
      stockLevel: product.stockLevel || 0,
      status: "draft",
    };
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const body: any = { product_id: productId };
    if (updates.title) body.product_name = updates.title;
    if (updates.description) body.description = updates.description;
    if (updates.priceCents !== undefined) {
      body.skus = [{ price: { original_price: (updates.priceCents / 100).toFixed(2) } }];
    }
    await this.fetch("/api/products", credentials, { method: "PUT", body });
    return this.getProduct(credentials, productId);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.fetch("/api/products", credentials, {
      method: "DELETE",
      body: { product_ids: [productId] },
    });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const data = await this.fetch("/api/orders/search", credentials, {
      method: "POST",
      body: {
        page_size: params?.limit || 50,
        page_number: params?.page || 1,
      },
    });
    return (data?.order_list || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const data = await this.fetch("/api/orders/detail/query", credentials, {
      method: "POST",
      body: { order_id_list: [orderId] },
    });
    return this.mapOrder(data?.order_list?.[0] || {});
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    await this.fetch("/api/fulfillment/rts", credentials, {
      method: "POST",
      body: {
        order_id: orderId,
        tracking_number: fulfillment.trackingNumber,
        provider_id: fulfillment.carrier || "OTHER",
      },
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const product = await this.getProduct(credentials, productId);
    return { productId, available: product.stockLevel };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    await this.fetch("/api/products/stocks", credentials, {
      method: "PUT",
      body: {
        product_id: productId,
        skus: [{ stock_infos: [{ available_stock: quantity }] }],
      },
    });
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  private mapProduct(p: any): PlatformProduct {
    const sku = p.skus?.[0] || {};
    return {
      platformId: String(p.product_id || ""),
      title: p.product_name || "TikTok Product",
      description: p.description,
      priceCents: Math.round(parseFloat(sku.price?.original_price || "0") * 100),
      sku: sku.seller_sku,
      imageUrl: p.images?.[0]?.url,
      stockLevel: sku.stock_infos?.[0]?.available_stock || 0,
      status: p.status === "ACTIVATE" ? "active" : "draft",
    };
  }

  private mapOrder(o: any): PlatformOrder {
    return {
      platformId: o.order_id,
      orderNumber: o.order_id,
      customerName: o.recipient_address?.name,
      totalCents: Math.round(parseFloat(o.payment?.total_amount || "0") * 100),
      currency: o.currency || "USD",
      status: this.mapOrderStatus(o.order_status),
      fulfillmentStatus: o.fulfillment_type === "FULFILLED" ? "fulfilled" : "unfulfilled",
      lineItems: (o.item_list || []).map((li: any) => ({
        productId: li.product_id,
        title: li.product_name,
        quantity: li.quantity,
        priceCents: Math.round(parseFloat(li.sale_price || "0") * 100),
        sku: li.seller_sku,
      })),
      shippingAddress: o.recipient_address ? {
        name: o.recipient_address.name,
        address1: o.recipient_address.address_line1,
        address2: o.recipient_address.address_line2,
        city: o.recipient_address.city,
        state: o.recipient_address.state,
        zip: o.recipient_address.zipcode,
        country: o.recipient_address.region_code,
      } : undefined,
      createdAt: new Date((o.create_time || Date.now() / 1000) * 1000),
    };
  }

  private mapOrderStatus(status: string): PlatformOrder["status"] {
    switch (status) {
      case "UNPAID": return "pending";
      case "ON_HOLD": return "processing";
      case "AWAITING_SHIPMENT": return "processing";
      case "AWAITING_COLLECTION": return "processing";
      case "IN_TRANSIT": return "shipped";
      case "DELIVERED": return "delivered";
      case "COMPLETED": return "fulfilled";
      case "CANCELLED": return "cancelled";
      default: return "pending";
    }
  }

  async healthCheck(credentials: AdapterCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.verifyConnection(credentials);
      return { healthy: true, message: "Connection verified", latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, message: err.message || "Connection failed", latencyMs: Date.now() - start };
    }
  }
}
