/**
 * StockX adapter — Seller API v2 (OAuth 2.0).
 *
 * StockX is a bid/ask resale marketplace — sneakers, streetwear,
 * watches, collectibles. Sellers don't create freeform listings; they
 * pick an existing canonical product (variant = size) and post an
 * "ask" (selling price). When a buyer's bid matches an ask, the trade
 * executes and StockX handles authentication + shipping logistics.
 *
 * That model breaks the standard `createProduct` contract: bots can't
 * invent a new SKU on StockX, only post asks against existing
 * catalog items. We surface that mismatch by:
 *   - `createProduct` posts an ASK against a known StockX productId
 *     (the productId field doubles as the StockX product UUID)
 *   - `updateProduct` updates the ask price
 *   - `listProducts` returns the seller's active asks
 *   - `deleteProduct` deletes (cancels) an ask
 * The Builder bot's workflow planner already branches on
 * `category === "marketplace"` and skips theme-scaffolding for these
 * surfaces, so this asymmetry is invisible upstream.
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

const API_BASE = "https://api.stockx.com/v2";

export class StockXAdapter implements EcommercePlatformAdapter {
  readonly platform = "stockx";
  readonly platformName = "StockX";

  getCapabilities(): PlatformCapabilities {
    return {
      variants: true,
      metafields: false,
      bulkImport: false,
      maxImagesPerProduct: 1,
      categories: true,
      webhooks: true,
      webhookEvents: ["order.created", "order.shipped", "order.completed", "ask.deleted"],
      autoFulfillment: false,
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
        "Verified-authentic resale = premium pricing for sneakers / streetwear / watches",
        "StockX handles authentication + shipping — sellers ship to StockX, not the buyer",
        "Bid/ask order book = transparent market pricing the bot can monitor",
      ],
      limitations: [
        "Sellers post asks against existing catalog only — no freeform listings",
        "Transaction fee + payment processing fee both apply (~10–13% combined)",
        "API access is tier-gated — small sellers see lower rate limits",
      ],
    };
  }

  private async fetch(
    path: string,
    credentials: AdapterCredentials,
    options?: { method?: string; body?: any },
  ): Promise<any> {
    const { default: axios } = await import("axios");
    await platformRateLimiters.stockx.acquire();
    return withRetry(async () => {
      try {
        const res = await axios({
          url: `${API_BASE}${path}`,
          method: (options?.method || "GET") as any,
          headers: {
            Authorization: `Bearer ${credentials.accessToken || ""}`,
            "x-api-key": credentials.apiKey || credentials.metadata?.apiKey || "",
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`StockX API error: ${err.response?.data?.message || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 2000 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const data = await this.fetch("/selling/listings?limit=1", credentials);
    return {
      platformId: credentials.platformAccountId || "stockx",
      name: "StockX Seller",
      domain: "stockx.com",
      currency: "USD",
      status: "active",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const limit = params?.limit ?? this.getCapabilities().recommendedBatchSize;
    const data = await this.fetch(`/selling/listings?limit=${limit}&page=${params?.page || 1}`, credentials);
    return (data.listings || []).map((l: any) => this.mapListing(l));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.fetch(`/selling/listings/${productId}`, credentials);
    return this.mapListing(data?.listing || data);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    // StockX-specific: input must carry productId + variantId in metadata.
    const variantId = product.metadata?.variantId;
    const productUuid = product.metadata?.stockxProductId;
    if (!variantId || !productUuid) {
      throw new Error(
        "StockX createProduct requires metadata.stockxProductId + metadata.variantId (size). " +
          "Use the catalog-search endpoint upstream to resolve these before calling createProduct.",
      );
    }
    const data = await this.fetch("/selling/listings", credentials, {
      method: "POST",
      body: {
        amount: product.priceCents / 100,
        variantId,
        productId: productUuid,
        currencyCode: "USD",
        // ASK = listing on StockX. Default to GTC (good-til-cancelled) — the
        // StockX UI surfaces this as "I want to sell this for $X".
        active: true,
      },
    });
    return this.mapListing(data?.listing || data);
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const body: any = {};
    if (updates.priceCents !== undefined) body.amount = updates.priceCents / 100;
    if (updates.status) body.active = updates.status === "active";
    const data = await this.fetch(`/selling/listings/${productId}`, credentials, { method: "PATCH", body });
    return this.mapListing(data?.listing || data);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.fetch(`/selling/listings/${productId}`, credentials, { method: "DELETE" });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const limit = params?.limit ?? 50;
    const data = await this.fetch(`/selling/orders?limit=${limit}&page=${params?.page || 1}`, credentials);
    return (data.orders || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const data = await this.fetch(`/selling/orders/${orderId}`, credentials);
    return this.mapOrder(data?.order || data);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    // StockX fulfillment = mark the seller's outbound-to-StockX shipment.
    await this.fetch(`/selling/orders/${orderId}/shipments`, credentials, {
      method: "POST",
      body: {
        carrier: fulfillment.carrier || "USPS",
        trackingNumber: fulfillment.trackingNumber,
        shippedAt: new Date().toISOString(),
      },
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const product = await this.getProduct(credentials, productId);
    return { productId, sku: product.sku, available: product.stockLevel };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    // StockX listings are 1:1 — quantity > 1 means we duplicate the ask.
    if (quantity === 0) {
      await this.deleteProduct(credentials, productId);
    }
    // Otherwise, no-op — the ask quantity is implicit.
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  async healthCheck(credentials: AdapterCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    if (!credentials.accessToken) {
      return { healthy: false, message: "Missing StockX access token", latencyMs: 0 };
    }
    try {
      await this.fetch("/selling/listings?limit=1", credentials);
      return { healthy: true, message: "Connected", latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, message: err.message || "Health check failed", latencyMs: Date.now() - start };
    }
  }

  private mapListing(l: any): PlatformProduct {
    if (!l) return { platformId: "", title: "", priceCents: 0, stockLevel: 0, status: "draft" };
    return {
      platformId: String(l.id || l.listingId || ""),
      title: l.product?.name || l.product?.title || "StockX listing",
      description: l.product?.description,
      priceCents: Math.round(parseFloat(l.amount || l.price || "0") * 100),
      sku: l.product?.styleId || l.product?.sku,
      imageUrl: l.product?.image?.imageUrl || l.product?.imageUrl,
      category: l.product?.category,
      stockLevel: l.active === false ? 0 : 1,
      status: l.active === false ? "archived" : "active",
      url: l.product?.urlKey ? `https://stockx.com/${l.product.urlKey}` : undefined,
      metadata: {
        stockxProductId: l.product?.uuid || l.productId,
        variantId: l.variantId,
        size: l.variant?.size,
      },
    };
  }

  private mapOrder(o: any): PlatformOrder {
    return {
      platformId: String(o?.id || o?.orderNumber || ""),
      orderNumber: o?.orderNumber || String(o?.id || ""),
      totalCents: Math.round(parseFloat(o?.amount || o?.payout?.amount || "0") * 100),
      currency: o?.currencyCode || "USD",
      status: this.mapStatus(o?.status),
      fulfillmentStatus: o?.status === "SHIPPED" || o?.status === "RECEIVED" ? "fulfilled" : "unfulfilled",
      lineItems: o?.product
        ? [{
            productId: String(o.product.uuid || o.product.id || ""),
            title: o.product.name || o.product.title || "StockX item",
            quantity: 1,
            priceCents: Math.round(parseFloat(o.amount || "0") * 100),
            sku: o.product.styleId,
          }]
        : [],
      trackingNumber: o?.shipping?.trackingNumber,
      createdAt: new Date(o?.createdAt || Date.now()),
    };
  }

  private mapStatus(s: string): PlatformOrder["status"] {
    switch (s) {
      case "CREATED": return "pending";
      case "SHIPPED": return "shipped";
      case "RECEIVED":
      case "AUTHENTICATED": return "processing";
      case "COMPLETED": return "delivered";
      case "CANCELED":
      case "CANCELLED": return "cancelled";
      default: return "pending";
    }
  }
}
