/**
 * Faire adapter — Faire Marketplace API (X-FAIRE-ACCESS-TOKEN auth).
 *
 * Faire is the wholesale marketplace for indie brands. It's not a
 * retail storefront — buyers are retailers placing wholesale POs, so
 * the catalog model uses *products with variants*, and orders carry
 * an `order_number` plus retailer billing/shipping. The Merchant bot
 * monitors order acknowledgement SLAs (Faire requires merchant
 * acknowledgement within 24h or risk auto-cancellation), and the
 * Builder bot uses Faire's brand directory for sourcing leads.
 *
 * Auth: per-brand API token, found in Faire's brand portal under
 * Integrations → API. No OAuth.
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

const API_BASE = "https://www.faire.com/external-api/v2";

export class FaireAdapter implements EcommercePlatformAdapter {
  readonly platform = "faire";
  readonly platformName = "Faire";

  getCapabilities(): PlatformCapabilities {
    return {
      variants: true,
      metafields: false,
      bulkImport: true,
      maxImagesPerProduct: 10,
      categories: true,
      webhooks: true,
      webhookEvents: ["order.created", "order.processed", "order.cancelled"],
      autoFulfillment: true,
      partialFulfillment: true,
      realTimeInventory: true,
      compareAtPrice: false,
      bulkPriceUpdate: false,
      scheduledSale: false,
      recommendedBatchSize: 50,
      rateLimitTokensPerSec: 1,
      category: "marketplace",
      feeStructure: "commission",
      strengths: [
        "Built-in retailer audience — Builder Bot pitches without paid acquisition",
        "Net-60 financing handled by Faire — no retailer credit risk to manage",
        "Order webhooks fire on creation, so Merchant Bot acknowledges within the 24h SLA",
      ],
      limitations: [
        "Wholesale-only — pricing is MSRP × 0.5 by convention; no DTC traffic here",
        "API token (no OAuth); rotating credentials means re-pasting in Settings",
        "Conservative rate limits (~1 req/sec) — bots batch heavily",
      ],
    };
  }

  private apiToken(credentials: AdapterCredentials): string {
    return credentials.apiKey || credentials.metadata?.apiKey || credentials.accessToken || "";
  }

  private async fetch(
    path: string,
    credentials: AdapterCredentials,
    options?: { method?: string; body?: any },
  ): Promise<any> {
    const { default: axios } = await import("axios");
    await platformRateLimiters.faire.acquire();
    return withRetry(async () => {
      try {
        const res = await axios({
          url: `${API_BASE}${path}`,
          method: (options?.method || "GET") as any,
          headers: {
            "X-FAIRE-ACCESS-TOKEN": this.apiToken(credentials),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`Faire API error: ${err.response?.data?.message || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 2000 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    if (!this.apiToken(credentials)) throw new Error("Faire API token missing");
    const data = await this.fetch("/brands/me", credentials);
    return {
      platformId: data?.id || credentials.platformAccountId || "faire",
      name: data?.name || "Faire Brand",
      domain: data?.url ? `faire.com/brand/${data.url_slug || data.id}` : "faire.com",
      currency: data?.currency || "USD",
      status: data?.is_active === false ? "suspended" : "active",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const limit = params?.limit ?? this.getCapabilities().recommendedBatchSize;
    const data = await this.fetch(`/products?limit=${limit}&page=${params?.page || 1}`, credentials);
    return (data.products || []).map((p: any) => this.mapProduct(p));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.fetch(`/products/${productId}`, credentials);
    return this.mapProduct(data?.product || data);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    const data = await this.fetch("/products", credentials, {
      method: "POST",
      body: {
        product: {
          name: product.title,
          description: product.description || "",
          // Faire prices are wholesale (cost-to-retailer); MSRP = 2× by default.
          wholesale_price_cents: product.priceCents,
          retail_price_cents: product.comparePriceCents || product.priceCents * 2,
          sku: product.sku,
          images: product.imageUrl ? [{ url: product.imageUrl }] : [],
          variants: [
            {
              sku: product.sku || `BB-${Date.now()}`,
              wholesale_price_cents: product.priceCents,
              retail_price_cents: product.comparePriceCents || product.priceCents * 2,
              available_quantity: product.stockLevel ?? 0,
            },
          ],
        },
      },
    });
    return this.mapProduct(data?.product || data);
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const body: any = { product: {} };
    if (updates.title) body.product.name = updates.title;
    if (updates.description) body.product.description = updates.description;
    if (updates.priceCents !== undefined) body.product.wholesale_price_cents = updates.priceCents;
    if (updates.comparePriceCents !== undefined) body.product.retail_price_cents = updates.comparePriceCents;
    if (updates.status) body.product.is_active = updates.status === "active";
    const data = await this.fetch(`/products/${productId}`, credentials, { method: "PATCH", body });
    return this.mapProduct(data?.product || data);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.fetch(`/products/${productId}`, credentials, { method: "DELETE" });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const limit = params?.limit ?? 50;
    const since = (params?.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString();
    const data = await this.fetch(`/orders?limit=${limit}&min_created_at=${encodeURIComponent(since)}`, credentials);
    return (data.orders || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const data = await this.fetch(`/orders/${orderId}`, credentials);
    return this.mapOrder(data?.order || data);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    // Faire splits acknowledgement and shipping into two endpoints. We
    // call shipments directly — acknowledgement happens upstream.
    await this.fetch(`/orders/${orderId}/shipments`, credentials, {
      method: "POST",
      body: {
        shipment: {
          tracking_code: fulfillment.trackingNumber,
          tracking_url: fulfillment.trackingUrl,
          carrier: fulfillment.carrier || "USPS",
          shipped_at: new Date().toISOString(),
        },
      },
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const product = await this.getProduct(credentials, productId);
    return { productId, sku: product.sku, available: product.stockLevel };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    await this.fetch(`/products/${productId}/variants`, credentials, {
      method: "PATCH",
      body: { variants: [{ available_quantity: quantity }] },
    });
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  async healthCheck(credentials: AdapterCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    if (!this.apiToken(credentials)) {
      return { healthy: false, message: "Missing Faire API token", latencyMs: 0 };
    }
    try {
      await this.fetch("/brands/me", credentials);
      return { healthy: true, message: "Connected", latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, message: err.message || "Health check failed", latencyMs: Date.now() - start };
    }
  }

  private mapProduct(p: any): PlatformProduct {
    const variant = p?.variants?.[0];
    return {
      platformId: String(p?.id || ""),
      title: p?.name || "Faire product",
      description: p?.description,
      priceCents: variant?.wholesale_price_cents ?? p?.wholesale_price_cents ?? 0,
      comparePriceCents: variant?.retail_price_cents ?? p?.retail_price_cents,
      sku: variant?.sku || p?.sku,
      imageUrl: p?.images?.[0]?.url,
      stockLevel: variant?.available_quantity ?? p?.available_quantity ?? 0,
      status: p?.is_active === false ? "draft" : "active",
      url: p?.url,
    };
  }

  private mapOrder(o: any): PlatformOrder {
    return {
      platformId: String(o?.id || ""),
      orderNumber: o?.display_id || o?.id || "",
      customerName: o?.retailer?.business_name,
      customerEmail: o?.retailer?.email,
      totalCents: o?.payout?.amount_cents ?? o?.total_amount_cents ?? 0,
      currency: o?.payout?.currency || "USD",
      status: this.mapStatus(o?.state),
      fulfillmentStatus: o?.shipped_at ? "fulfilled" : "unfulfilled",
      lineItems: (o?.items || []).map((it: any) => ({
        productId: String(it.product_id),
        title: it.product_name || it.name,
        quantity: it.quantity,
        priceCents: it.unit_price_cents,
        sku: it.sku,
      })),
      shippingAddress: o?.shipping_address ? {
        name: o.shipping_address.name,
        address1: o.shipping_address.address1,
        address2: o.shipping_address.address2,
        city: o.shipping_address.city,
        state: o.shipping_address.state,
        zip: o.shipping_address.postal_code,
        country: o.shipping_address.country,
      } : undefined,
      trackingNumber: o?.shipments?.[0]?.tracking_code,
      trackingUrl: o?.shipments?.[0]?.tracking_url,
      createdAt: new Date(o?.created_at || Date.now()),
      metadata: { acknowledgement_due_at: o?.expected_acknowledgement_by },
    };
  }

  private mapStatus(s: string): PlatformOrder["status"] {
    switch (s) {
      case "PROCESSING": return "processing";
      case "SHIPPED": return "shipped";
      case "DELIVERED": return "delivered";
      case "CANCELED":
      case "CANCELLED": return "cancelled";
      case "REFUNDED": return "refunded";
      case "ACKNOWLEDGED": return "processing";
      default: return "pending";
    }
  }
}
