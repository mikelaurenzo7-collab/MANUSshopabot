/**
 * Etsy Platform Adapter
 * Uses Etsy Open API v3 REST endpoints directly via axios.
 * OAuth 2.0 with PKCE for authentication.
 */

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
  PlatformCapabilities,
} from "./types";
import { ADAPTER_HTTP_TIMEOUT_MS } from "./types";
import { withRetry, platformRateLimiters } from "../../utils/rateLimiter";

const ETSY_API_BASE = "https://openapi.etsy.com/v3";

export class EtsyAdapter implements EcommercePlatformAdapter {
  readonly platform = "etsy";
  readonly platformName = "Etsy";

  /**
   * Etsy: handmade / vintage marketplace. Strong in tags + sections,
   * weak in variants (inventory via attributes only). No webhooks —
   * receipts propagate via polling. Auto-fulfillment supported but
   * platform expects manual ship confirmation for most flows.
   */
  getCapabilities(): PlatformCapabilities {
    return {
      variants: true,
      metafields: false,
      bulkImport: false,
      maxImagesPerProduct: 10,
      categories: true,
      webhooks: false,
      webhookEvents: [],
      autoFulfillment: true,
      partialFulfillment: false,
      realTimeInventory: true,
      compareAtPrice: false,
      bulkPriceUpdate: false,
      scheduledSale: true,
      recommendedBatchSize: 25,
      rateLimitTokensPerSec: 10,
      category: "marketplace",
      feeStructure: "hybrid",
      strengths: [
        "Tags + sections drive 60%+ of discovery — Builder Bot's SEO sweet spot",
        "High-margin handmade / vintage / personalized niches",
        "Built-in audience for craft + gift verticals",
      ],
      limitations: [
        "No webhooks — orders polled every 5 min instead of pushed",
        "$0.20 listing fee + 6.5% transaction fee + payment processing",
        "Variants constrained to product attributes (no arbitrary metafields)",
      ],
    };
  }

  private async fetch(path: string, credentials: AdapterCredentials, options?: { method?: string; body?: any }) {
    const { default: axios } = await import("axios");
    await platformRateLimiters.etsy.acquire();
    return withRetry(async () => {
      try {
        const response = await axios({
          url: `${ETSY_API_BASE}${path}`,
          method: (options?.method || "GET") as any,
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "x-api-key": credentials.apiKey || "",
            "Content-Type": "application/json",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return response.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`Etsy API error: ${err.response?.data?.error_description || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1000 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const data = await this.fetch("/application/openapi-ping", credentials);
    const shopId = credentials.metadata?.shopId || credentials.platformAccountId;
    if (shopId) {
      const shop = await this.fetch(`/application/shops/${shopId}`, credentials);
      return {
        platformId: String(shop.shop_id),
        name: shop.shop_name,
        domain: `etsy.com/shop/${shop.shop_name}`,
        currency: shop.currency_code || "USD",
        status: shop.is_vacation ? "suspended" : "active",
      };
    }
    return {
      platformId: "etsy",
      name: "Etsy Shop",
      domain: "etsy.com",
      currency: "USD",
      status: "active",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const shopId = credentials.metadata?.shopId || credentials.platformAccountId;
    if (!shopId) throw new Error("Etsy shopId required in credentials metadata");
    const data = await this.fetch(
      `/application/shops/${shopId}/listings/active?limit=${params?.limit || 50}&offset=${((params?.page || 1) - 1) * (params?.limit || 50)}`,
      credentials
    );
    return (data.results || []).map((l: any) => this.mapProduct(l));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.fetch(`/application/listings/${productId}`, credentials);
    return this.mapProduct(data);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    const shopId = credentials.metadata?.shopId || credentials.platformAccountId;
    if (!shopId) throw new Error("Etsy shopId required");
    const data = await this.fetch(`/application/shops/${shopId}/listings`, credentials, {
      method: "POST",
      body: {
        title: product.title,
        description: product.description || product.title,
        price: product.priceCents / 100,
        quantity: product.stockLevel || 1,
        who_made: "i_did",
        when_made: "made_to_order",
        taxonomy_id: 1,
        state: "draft",
        images: product.imageUrl ? [{ url: product.imageUrl }] : [],
      },
    });
    return this.mapProduct(data);
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const body: any = {};
    if (updates.title) body.title = updates.title;
    if (updates.description) body.description = updates.description;
    if (updates.priceCents !== undefined) body.price = updates.priceCents / 100;
    if (updates.stockLevel !== undefined) body.quantity = updates.stockLevel;
    if (updates.status) body.state = updates.status === "active" ? "active" : "inactive";
    const data = await this.fetch(`/application/listings/${productId}`, credentials, { method: "PATCH", body });
    return this.mapProduct(data);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.fetch(`/application/listings/${productId}`, credentials, { method: "DELETE" });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const shopId = credentials.metadata?.shopId || credentials.platformAccountId;
    if (!shopId) throw new Error("Etsy shopId required");
    const data = await this.fetch(
      `/application/shops/${shopId}/receipts?limit=${params?.limit || 50}&offset=${((params?.page || 1) - 1) * (params?.limit || 50)}`,
      credentials
    );
    return (data.results || []).map((r: any) => this.mapOrder(r));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const shopId = credentials.metadata?.shopId || credentials.platformAccountId;
    if (!shopId) throw new Error("Etsy shopId required");
    const data = await this.fetch(`/application/shops/${shopId}/receipts/${orderId}`, credentials);
    return this.mapOrder(data);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    const shopId = credentials.metadata?.shopId || credentials.platformAccountId;
    if (!shopId) throw new Error("Etsy shopId required");
    // Validate tracking number format (alphanumeric, 6-40 chars)
    if (fulfillment.trackingNumber) {
      const cleaned = fulfillment.trackingNumber.trim();
      if (cleaned.length < 6 || cleaned.length > 40) {
        throw new Error(`Invalid tracking number length (${cleaned.length}). Must be 6-40 characters.`);
      }
      if (!/^[A-Za-z0-9]+$/.test(cleaned)) {
        throw new Error("Tracking number must contain only alphanumeric characters.");
      }
    }
    // Validate carrier name
    const validCarriers = ["usps", "ups", "fedex", "dhl", "canada-post", "royal-mail", "other"];
    const carrier = (fulfillment.carrier || "other").toLowerCase();
    await this.fetch(`/application/shops/${shopId}/receipts/${orderId}/tracking`, credentials, {
      method: "POST",
      body: {
        tracking_code: fulfillment.trackingNumber?.trim(),
        carrier_name: validCarriers.includes(carrier) ? carrier : "other",
        send_bcc: fulfillment.notifyCustomer ?? true,
      },
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const data = await this.fetch(`/application/listings/${productId}/inventory`, credentials);
    const quantity = data.products?.[0]?.offerings?.[0]?.quantity || 0;
    return { productId, available: quantity };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    await this.fetch(`/application/listings/${productId}`, credentials, {
      method: "PATCH",
      body: { quantity },
    });
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  private mapProduct(l: any): PlatformProduct {
    return {
      platformId: String(l.listing_id),
      title: l.title,
      description: l.description,
      priceCents: Math.round((l.price?.amount || 0) / (l.price?.divisor || 1) * 100),
      sku: l.sku?.[0],
      imageUrl: l.images?.[0]?.url_fullxfull,
      category: l.taxonomy_path?.[0],
      stockLevel: l.quantity || 0,
      status: l.state === "active" ? "active" : l.state === "sold_out" ? "archived" : "draft",
      url: l.url,
    };
  }

  private mapOrder(r: any): PlatformOrder {
    return {
      platformId: String(r.receipt_id),
      orderNumber: String(r.receipt_id),
      customerName: r.name,
      customerEmail: r.buyer_email,
      totalCents: Math.round((r.grandtotal?.amount || 0) / (r.grandtotal?.divisor || 1) * 100),
      currency: r.grandtotal?.currency_code || "USD",
      status: r.status === "completed" ? "fulfilled" : r.status === "cancelled" ? "cancelled" : "processing",
      fulfillmentStatus: r.is_shipped ? "fulfilled" : "unfulfilled",
      lineItems: (r.transactions || []).map((t: any) => ({
        productId: String(t.listing_id),
        title: t.title,
        quantity: t.quantity,
        priceCents: Math.round((t.price?.amount || 0) / (t.price?.divisor || 1) * 100),
      })),
      shippingAddress: r.formatted_address ? {
        name: r.name,
        address1: r.first_line,
        address2: r.second_line,
        city: r.city,
        state: r.state,
        zip: r.zip,
        country: r.country_iso,
      } : undefined,
      createdAt: new Date((r.create_timestamp || Date.now() / 1000) * 1000),
    };
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
