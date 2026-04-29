/**
 * Reverb adapter — Reverb API (Bearer token, OAuth or personal access).
 *
 * Reverb is the music-gear marketplace owned by Etsy. Bots use it for
 * vintage instruments, pedals, and pro audio — categories where eBay
 * authentication is weak and Reverb's specialist audience is willing
 * to pay a premium.
 *
 * The API is JSON-API-style with `Accept: application/hal+json` and
 * heavy use of HATEOAS `_links`. We read the canonical `id` and
 * `slug` for routing but ignore the link envelope for simplicity.
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

const API_BASE = "https://api.reverb.com/api";

export class ReverbAdapter implements EcommercePlatformAdapter {
  readonly platform = "reverb";
  readonly platformName = "Reverb";

  getCapabilities(): PlatformCapabilities {
    return {
      variants: false,
      metafields: true,
      bulkImport: true,
      maxImagesPerProduct: 25,
      categories: true,
      webhooks: true,
      webhookEvents: ["order.created", "order.shipped", "listing.sold", "listing.updated"],
      autoFulfillment: true,
      partialFulfillment: false,
      realTimeInventory: true,
      compareAtPrice: false,
      bulkPriceUpdate: true,
      scheduledSale: false,
      recommendedBatchSize: 50,
      rateLimitTokensPerSec: 1,
      category: "marketplace",
      feeStructure: "commission",
      strengths: [
        "Specialist audience — guitars, pedals, synths, pro audio willing to pay premium",
        "Reverb Bump (paid promotion) integrates with the sales API for ROAS tracking",
        "OfferList API lets bots auto-respond to lowball offers within margin guardrails",
      ],
      limitations: [
        "Music gear only — bot category planner must enforce category guardrails",
        "5% selling fee + payment processing — high vs. eBay's 4.55%",
        "Slugs change when titles change — bots cache the canonical id, not the URL",
      ],
    };
  }

  private token(credentials: AdapterCredentials): string {
    return credentials.accessToken || credentials.apiKey || credentials.metadata?.apiKey || "";
  }

  private async fetch(
    path: string,
    credentials: AdapterCredentials,
    options?: { method?: string; body?: any },
  ): Promise<any> {
    const { default: axios } = await import("axios");
    await platformRateLimiters.reverb.acquire();
    return withRetry(async () => {
      try {
        const res = await axios({
          url: `${API_BASE}${path}`,
          method: (options?.method || "GET") as any,
          headers: {
            Authorization: `Bearer ${this.token(credentials)}`,
            "Content-Type": "application/hal+json",
            Accept: "application/hal+json",
            "Accept-Version": "3.0",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        const msg = err.response?.data?.message || err.response?.data?.errors?.[0]?.message || err.message;
        throw new Error(`Reverb API error: ${msg}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1500 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const data = await this.fetch("/my/account", credentials);
    return {
      platformId: String(data?.id || credentials.platformAccountId || "reverb"),
      name: data?.shop?.name || data?.first_name || "Reverb Shop",
      domain: data?.shop?.slug ? `reverb.com/shop/${data.shop.slug}` : "reverb.com",
      currency: data?.shop?.default_currency || "USD",
      status: data?.shop?.status === "active" ? "active" : "suspended",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const limit = params?.limit ?? this.getCapabilities().recommendedBatchSize;
    const data = await this.fetch(
      `/my/listings?per_page=${limit}&page=${params?.page || 1}&state=${params?.status || "all"}`,
      credentials,
    );
    return (data.listings || []).map((l: any) => this.mapListing(l));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.fetch(`/my/listings/${productId}`, credentials);
    return this.mapListing(data);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    const body: any = {
      make: product.metadata?.make || "",
      model: product.metadata?.model || product.title,
      title: product.title,
      description: product.description || "",
      price: { amount: (product.priceCents / 100).toFixed(2), currency: "USD" },
      condition: { uuid: product.metadata?.conditionUuid || "ae4d9114-1bd7-4ec5-a4ba-6653af5ac84d" /* Excellent */ },
      categories: product.category ? [{ uuid: product.category }] : [],
      photos: product.imageUrl ? [{ url: product.imageUrl }] : [],
      inventory: product.stockLevel ?? 1,
      has_inventory: true,
      sku: product.sku,
      shipping_profile_id: product.metadata?.shippingProfileId,
      publish: product.metadata?.publish !== false,
    };
    const data = await this.fetch("/my/listings", credentials, { method: "POST", body });
    return this.mapListing(data?.listing || data);
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const body: any = {};
    if (updates.title) body.title = updates.title;
    if (updates.description) body.description = updates.description;
    if (updates.priceCents !== undefined) {
      body.price = { amount: (updates.priceCents / 100).toFixed(2), currency: "USD" };
    }
    if (updates.stockLevel !== undefined) body.inventory = updates.stockLevel;
    if (updates.status) {
      body.state = updates.status === "active" ? "live" : "draft";
    }
    const data = await this.fetch(`/my/listings/${productId}`, credentials, { method: "PUT", body });
    return this.mapListing(data?.listing || data);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.fetch(`/my/listings/${productId}`, credentials, { method: "DELETE" });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const limit = params?.limit ?? 50;
    const data = await this.fetch(
      `/my/orders/selling/all?per_page=${limit}&page=${params?.page || 1}`,
      credentials,
    );
    return (data.orders || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const data = await this.fetch(`/my/orders/selling/${orderId}`, credentials);
    return this.mapOrder(data?.order || data);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    await this.fetch(`/my/orders/selling/${orderId}/ship`, credentials, {
      method: "POST",
      body: {
        provider: fulfillment.carrier || "ups",
        tracking_number: fulfillment.trackingNumber,
        send_notification: fulfillment.notifyCustomer ?? true,
      },
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const product = await this.getProduct(credentials, productId);
    return { productId, sku: product.sku, available: product.stockLevel };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    await this.fetch(`/my/listings/${productId}`, credentials, {
      method: "PUT",
      body: { inventory: quantity, has_inventory: true },
    });
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  async healthCheck(credentials: AdapterCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    if (!this.token(credentials)) {
      return { healthy: false, message: "Missing Reverb token", latencyMs: 0 };
    }
    try {
      await this.fetch("/my/account", credentials);
      return { healthy: true, message: "Connected", latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, message: err.message || "Health check failed", latencyMs: Date.now() - start };
    }
  }

  private mapListing(l: any): PlatformProduct {
    if (!l) return { platformId: "", title: "", priceCents: 0, stockLevel: 0, status: "draft" };
    return {
      platformId: String(l.id || ""),
      title: l.title || `${l.make || ""} ${l.model || ""}`.trim() || "Reverb listing",
      description: l.description,
      priceCents: Math.round(parseFloat(l.price?.amount || "0") * 100),
      sku: l.sku,
      imageUrl: l.photos?.[0]?._links?.full?.href || l.photos?.[0]?.url,
      category: l.categories?.[0]?.uuid,
      stockLevel: l.inventory ?? 1,
      status: l.state?.slug === "live" ? "active" : l.state?.slug === "sold" ? "archived" : "draft",
      url: l._links?.web?.href,
      metadata: { make: l.make, model: l.model, condition: l.condition?.display_name, year: l.year },
    };
  }

  private mapOrder(o: any): PlatformOrder {
    return {
      platformId: String(o?.id || o?.order_number || ""),
      orderNumber: o?.order_number || String(o?.id || ""),
      customerName: o?.buyer?.name,
      customerEmail: o?.buyer?.email,
      totalCents: Math.round(parseFloat(o?.total?.amount || "0") * 100),
      currency: o?.total?.currency || "USD",
      status: this.mapStatus(o?.status),
      fulfillmentStatus: o?.shipped_at ? "fulfilled" : "unfulfilled",
      lineItems: o?.product
        ? [{
            productId: String(o.product.id || ""),
            title: o.product.title || "Reverb item",
            quantity: 1,
            priceCents: Math.round(parseFloat(o.product.price?.amount || o.amount_product?.amount || "0") * 100),
            sku: o.product.sku,
          }]
        : [],
      shippingAddress: o?.shipping_address ? {
        name: o.shipping_address.name,
        address1: o.shipping_address.street_address,
        address2: o.shipping_address.extended_address,
        city: o.shipping_address.locality,
        state: o.shipping_address.region,
        zip: o.shipping_address.postal_code,
        country: o.shipping_address.country_code,
      } : undefined,
      trackingNumber: o?.shipping?.tracking_number,
      trackingUrl: o?.shipping?.tracking_url,
      createdAt: new Date(o?.created_at || Date.now()),
    };
  }

  private mapStatus(s: string): PlatformOrder["status"] {
    switch (s) {
      case "ordered":
      case "payment_pending": return "pending";
      case "payment_received":
      case "picked_up": return "processing";
      case "shipped": return "shipped";
      case "received":
      case "completed": return "delivered";
      case "refunded": return "refunded";
      case "cancelled":
      case "canceled": return "cancelled";
      default: return "pending";
    }
  }
}
