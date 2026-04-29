/**
 * Depop adapter — Partner API v2.
 *
 * Depop is Gen-Z's vintage/streetwear marketplace. Their public Partner
 * API (partnerapi.depop.com) is approved per-app; sellers using a
 * third-party tool authenticate via OAuth. Most sellers are one-of-one
 * (single quantity per listing), so the bot treats stockLevel = 1
 * unless the listing explicitly says otherwise.
 *
 * The adapter intentionally degrades gracefully when running against an
 * environment without the Partner API allowlist: every method routes
 * through `fetch()`, which surfaces auth errors as adapter errors that
 * the workflow engine can catch and queue for human review.
 */

import {
  EcommercePlatformAdapter,
  AdapterCredentials,
  PlatformCapabilities,
  PlatformProduct,
  CreateProductInput,
  UpdateProductInput,
  PlatformOrder,
  StoreInfo,
  ListParams,
  FulfillmentInput,
  InventoryLevel,
} from "./types";
import { ADAPTER_HTTP_TIMEOUT_MS } from "./types";
import { withRetry, platformRateLimiters } from "../../utils/rateLimiter";

const API_BASE = "https://partnerapi.depop.com/v2";

export class DepopAdapter implements EcommercePlatformAdapter {
  readonly platform = "depop";
  readonly platformName = "Depop";

  getCapabilities(): PlatformCapabilities {
    return {
      variants: false,
      metafields: false,
      bulkImport: false,
      maxImagesPerProduct: 4,
      categories: true,
      webhooks: true,
      webhookEvents: ["order.created", "order.shipped", "listing.sold"],
      autoFulfillment: true,
      partialFulfillment: false,
      realTimeInventory: true,
      compareAtPrice: false,
      bulkPriceUpdate: false,
      scheduledSale: false,
      recommendedBatchSize: 50,
      rateLimitTokensPerSec: 10,
      category: "marketplace",
      feeStructure: "commission",
      strengths: [
        "Built-in Gen-Z audience for vintage / streetwear / Y2K niches",
        "One-of-one listings — no inventory complexity, no oversells",
        "Hashtags drive discovery — Builder Bot's caption SEO matters here",
      ],
      limitations: [
        "10% Depop fee + payment processing — high relative to Shopify",
        "Partner API allowlist required; not every seller has access",
        "No variants or bulk update — bot creates listings one at a time",
      ],
    };
  }

  private async fetch(
    path: string,
    credentials: AdapterCredentials,
    options?: { method?: string; body?: any },
  ): Promise<any> {
    const { default: axios } = await import("axios");
    await platformRateLimiters.depop.acquire();
    return withRetry(async () => {
      try {
        const res = await axios({
          url: `${API_BASE}${path}`,
          method: (options?.method || "GET") as any,
          headers: {
            Authorization: `Bearer ${credentials.accessToken || ""}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`Depop API error: ${err.response?.data?.message || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1000 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const data = await this.fetch("/shops/me", credentials);
    return {
      platformId: String(data.shop_id || credentials.platformAccountId || "depop"),
      name: data.username || data.shop_name || "Depop Shop",
      domain: data.username ? `depop.com/${data.username}` : "depop.com",
      currency: data.currency || "USD",
      status: "active",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const limit = params?.limit ?? this.getCapabilities().recommendedBatchSize;
    const data = await this.fetch(`/listings?limit=${limit}&offset=${((params?.page || 1) - 1) * limit}`, credentials);
    return (data.listings || []).map((l: any) => this.mapProduct(l));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.fetch(`/listings/${productId}`, credentials);
    return this.mapProduct(data);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    const data = await this.fetch("/listings", credentials, {
      method: "POST",
      body: {
        title: product.title,
        description: product.description || product.title,
        price: { amount: (product.priceCents / 100).toFixed(2), currency: "USD" },
        category: product.category,
        condition: product.metadata?.condition || "good",
        images: product.imageUrl ? [{ url: product.imageUrl }] : [],
        quantity: product.stockLevel ?? 1,
      },
    });
    return this.mapProduct(data);
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const body: any = {};
    if (updates.title) body.title = updates.title;
    if (updates.description) body.description = updates.description;
    if (updates.priceCents !== undefined) {
      body.price = { amount: (updates.priceCents / 100).toFixed(2), currency: "USD" };
    }
    if (updates.stockLevel !== undefined) body.quantity = updates.stockLevel;
    if (updates.status) body.state = updates.status === "active" ? "active" : "draft";
    const data = await this.fetch(`/listings/${productId}`, credentials, { method: "PATCH", body });
    return this.mapProduct(data);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.fetch(`/listings/${productId}`, credentials, { method: "DELETE" });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const limit = params?.limit ?? 50;
    const since = (params?.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString();
    const data = await this.fetch(`/orders?limit=${limit}&since=${encodeURIComponent(since)}`, credentials);
    return (data.orders || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const data = await this.fetch(`/orders/${orderId}`, credentials);
    return this.mapOrder(data);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    await this.fetch(`/orders/${orderId}/ship`, credentials, {
      method: "POST",
      body: {
        carrier: fulfillment.carrier || "USPS",
        tracking_number: fulfillment.trackingNumber,
        tracking_url: fulfillment.trackingUrl,
        notify_buyer: fulfillment.notifyCustomer ?? true,
      },
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const product = await this.getProduct(credentials, productId);
    return { productId, sku: product.sku, available: product.stockLevel };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    await this.fetch(`/listings/${productId}`, credentials, {
      method: "PATCH",
      body: { quantity },
    });
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  async healthCheck(credentials: AdapterCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.fetch("/shops/me", credentials);
      return { healthy: true, message: "Connected", latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, message: err.message || "Health check failed", latencyMs: Date.now() - start };
    }
  }

  private mapProduct(l: any): PlatformProduct {
    const price = l.price?.amount ?? l.price;
    return {
      platformId: String(l.id || l.listing_id || ""),
      title: l.title || "Depop listing",
      description: l.description,
      priceCents: Math.round(parseFloat(price || "0") * 100),
      sku: l.sku,
      imageUrl: l.images?.[0]?.url || l.image_url,
      category: l.category,
      stockLevel: l.quantity ?? 1,
      status: l.state === "sold" ? "archived" : l.state === "active" ? "active" : "draft",
      url: l.username ? `https://depop.com/${l.username}/${l.id}` : undefined,
      metadata: { condition: l.condition, brand: l.brand, hashtags: l.hashtags },
    };
  }

  private mapOrder(o: any): PlatformOrder {
    return {
      platformId: String(o.id || o.order_id),
      orderNumber: o.order_number || String(o.id),
      customerName: o.buyer?.username,
      customerEmail: o.buyer?.email,
      totalCents: Math.round(parseFloat(o.total?.amount || o.total || "0") * 100),
      currency: o.total?.currency || "USD",
      status: this.mapStatus(o.status),
      fulfillmentStatus: o.shipped_at ? "fulfilled" : "unfulfilled",
      lineItems: (o.items || []).map((it: any) => ({
        productId: String(it.listing_id),
        title: it.title || "Depop listing",
        quantity: 1,
        priceCents: Math.round(parseFloat(it.price?.amount || it.price || "0") * 100),
      })),
      shippingAddress: o.shipping_address,
      trackingNumber: o.tracking?.number,
      trackingUrl: o.tracking?.url,
      createdAt: new Date(o.created_at || Date.now()),
      metadata: { rawStatus: o.status },
    };
  }

  private mapStatus(s: string): PlatformOrder["status"] {
    switch (s) {
      case "paid": return "processing";
      case "shipped": return "shipped";
      case "delivered": return "delivered";
      case "cancelled": return "cancelled";
      case "refunded": return "refunded";
      default: return "pending";
    }
  }
}
