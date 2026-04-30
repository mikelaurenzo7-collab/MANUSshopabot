/**
 * BigCommerce adapter — Storefront API v3 + V2 hybrid.
 *
 * BigCommerce is the Shopify-equivalent SaaS storefront for mid-market
 * sellers. The store_hash + access token model is unusual: the API base
 * is `https://api.bigcommerce.com/stores/{storeHash}/v3`. Bots resolve
 * the storeHash from credentials.metadata.storeHash (set during the
 * OAuth callback) or fall back to credentials.storeUrl when the hash
 * is encoded in the domain (e.g. `store-{hash}.mybigcommerce.com`).
 *
 * Webhooks are a first-class citizen here — bots subscribe per-store
 * to inventory + order events, so the workflow engine reacts in
 * real-time rather than polling.
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
import { logger } from "../../utils/logger";

export class BigCommerceAdapter implements EcommercePlatformAdapter {
  readonly platform = "bigcommerce";
  readonly platformName = "BigCommerce";

  getCapabilities(): PlatformCapabilities {
    return {
      variants: true,
      metafields: true,
      bulkImport: true,
      maxImagesPerProduct: 25,
      categories: true,
      webhooks: true,
      webhookEvents: [
        "store/order/created",
        "store/order/updated",
        "store/order/statusUpdated",
        "store/product/created",
        "store/product/updated",
        "store/inventory/order/updated",
      ],
      autoFulfillment: true,
      partialFulfillment: true,
      realTimeInventory: true,
      compareAtPrice: true,
      bulkPriceUpdate: true,
      scheduledSale: true,
      recommendedBatchSize: 250,
      rateLimitTokensPerSec: 15,
      category: "storefront",
      feeStructure: "subscription",
      strengths: [
        "Full webhook coverage rivals Shopify — orders + inventory propagate in seconds",
        "Higher API rate limits than Shopify Basic (450 req/30s vs 80/min)",
        "No transaction fee on top of payment processor",
        "Strong B2B + headless-commerce support",
      ],
      limitations: [
        "Smaller theme + app ecosystem than Shopify",
        "Requires storeHash + access token — sellers occasionally lose track of the hash",
      ],
    };
  }

  private storeHash(credentials: AdapterCredentials): string {
    const fromMeta = credentials.metadata?.storeHash;
    if (fromMeta) return fromMeta;
    const url = credentials.storeUrl || credentials.shopDomain || "";
    const match = url.match(/store-([a-z0-9]+)/i);
    if (match) return match[1];
    throw new Error("BigCommerce storeHash required in credentials.metadata.storeHash");
  }

  private base(credentials: AdapterCredentials, version: 2 | 3 = 3): string {
    return `https://api.bigcommerce.com/stores/${this.storeHash(credentials)}/v${version}`;
  }

  private async fetch(
    path: string,
    credentials: AdapterCredentials,
    options?: { method?: string; body?: any; version?: 2 | 3 },
  ): Promise<any> {
    const { default: axios } = await import("axios");
    await platformRateLimiters.bigcommerce.acquire();
    return withRetry(async () => {
      try {
        const res = await axios({
          url: `${this.base(credentials, options?.version ?? 3)}${path}`,
          method: (options?.method || "GET") as any,
          headers: {
            "X-Auth-Token": credentials.accessToken || "",
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`BigCommerce API error: ${err.response?.data?.title || err.response?.data?.message || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1000 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const data = await this.fetch("/store", credentials, { version: 2 });
    return {
      platformId: data.id || this.storeHash(credentials),
      name: data.name || "BigCommerce Store",
      domain: data.secure_url || data.domain,
      currency: data.currency || "USD",
      timezone: data.timezone?.name,
      plan: data.plan_name,
      status: data.status === "live" ? "active" : "suspended",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const limit = params?.limit ?? this.getCapabilities().recommendedBatchSize;
    const data = await this.fetch(
      `/catalog/products?limit=${limit}&page=${params?.page || 1}&include=images`,
      credentials,
    );
    return (data.data || []).map((p: any) => this.mapProduct(p, credentials.storeUrl));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.fetch(`/catalog/products/${productId}?include=images`, credentials);
    return this.mapProduct(data.data, credentials.storeUrl);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    const body: any = {
      name: product.title,
      type: "physical",
      description: product.description || "",
      price: product.priceCents / 100,
      retail_price: product.comparePriceCents ? product.comparePriceCents / 100 : undefined,
      sku: product.sku,
      weight: product.metadata?.weight ?? 0,
      categories: product.category ? [Number(product.category)].filter(Boolean) : [],
      inventory_level: product.stockLevel ?? 0,
      inventory_tracking: "product",
    };
    const data = await this.fetch("/catalog/products", credentials, { method: "POST", body });
    if (product.imageUrl && data.data?.id) {
      // Image attachment is best-effort — the product is already created.
      // A silent failure was masking platform-side issues, so log a warning.
      await this.fetch(`/catalog/products/${data.data.id}/images`, credentials, {
        method: "POST",
        body: { image_url: product.imageUrl, is_thumbnail: true },
      }).catch((err) =>
        logger.warn("bigcommerce_image_attach_failed", {
          module: "bigcommerceAdapter",
          productId: data.data.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    return this.mapProduct(data.data, credentials.storeUrl);
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const body: any = {};
    if (updates.title) body.name = updates.title;
    if (updates.description) body.description = updates.description;
    if (updates.priceCents !== undefined) body.price = updates.priceCents / 100;
    if (updates.comparePriceCents !== undefined) body.retail_price = updates.comparePriceCents / 100;
    if (updates.stockLevel !== undefined) body.inventory_level = updates.stockLevel;
    if (updates.status) body.is_visible = updates.status === "active";
    const data = await this.fetch(`/catalog/products/${productId}`, credentials, { method: "PUT", body });
    return this.mapProduct(data.data, credentials.storeUrl);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.fetch(`/catalog/products/${productId}`, credentials, { method: "DELETE" });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const limit = params?.limit ?? 50;
    const data = await this.fetch(`/orders?limit=${limit}&page=${params?.page || 1}&sort=date_created:desc`, credentials, { version: 2 });
    const orders = Array.isArray(data) ? data : data?.data || [];
    return Promise.all(orders.map((o: any) => this.hydrateOrder(o, credentials)));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const data = await this.fetch(`/orders/${orderId}`, credentials, { version: 2 });
    return this.hydrateOrder(data, credentials);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    const order = await this.fetch(`/orders/${orderId}/products`, credentials, { version: 2 });
    const items = Array.isArray(order) ? order : [];
    await this.fetch(`/orders/${orderId}/shipments`, credentials, {
      version: 2,
      method: "POST",
      body: {
        tracking_number: fulfillment.trackingNumber,
        tracking_carrier: fulfillment.carrier || "auto",
        tracking_link: fulfillment.trackingUrl,
        comments: "Fulfilled by Shop_a_Bot",
        items: items.map((it: any) => ({
          order_product_id: it.id,
          quantity: it.quantity,
        })),
      },
    });
    await this.fetch(`/orders/${orderId}`, credentials, {
      version: 2,
      method: "PUT",
      body: { status_id: 2 },
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const product = await this.getProduct(credentials, productId);
    return { productId, sku: product.sku, available: product.stockLevel };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    await this.fetch(`/catalog/products/${productId}`, credentials, {
      method: "PUT",
      body: { inventory_level: quantity, inventory_tracking: "product" },
    });
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  async healthCheck(credentials: AdapterCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.fetch("/store", credentials, { version: 2 });
      return { healthy: true, message: "Connected", latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, message: err.message || "Health check failed", latencyMs: Date.now() - start };
    }
  }

  private mapProduct(p: any, storeUrl?: string): PlatformProduct {
    const image = p?.images?.[0]?.url_standard || p?.images?.[0]?.url_zoom;
    return {
      platformId: String(p?.id || ""),
      title: p?.name || "BigCommerce product",
      description: p?.description,
      priceCents: Math.round(parseFloat(p?.price || "0") * 100),
      comparePriceCents: p?.retail_price ? Math.round(parseFloat(p.retail_price) * 100) : undefined,
      sku: p?.sku,
      imageUrl: image,
      category: Array.isArray(p?.categories) ? p.categories[0]?.toString() : undefined,
      stockLevel: p?.inventory_level ?? 0,
      status: p?.is_visible === false ? "draft" : "active",
      url: storeUrl && p?.custom_url?.url ? `${storeUrl.replace(/\/$/, "")}${p.custom_url.url}` : undefined,
    };
  }

  private async hydrateOrder(o: any, credentials: AdapterCredentials): Promise<PlatformOrder> {
    const items = await this.fetch(`/orders/${o.id}/products`, credentials, { version: 2 }).catch(() => []);
    const lineItems = (Array.isArray(items) ? items : []).map((it: any) => ({
      productId: String(it.product_id || it.id),
      title: it.name,
      quantity: it.quantity,
      priceCents: Math.round(parseFloat(it.price_inc_tax || it.price_ex_tax || "0") * 100),
      sku: it.sku,
    }));
    return {
      platformId: String(o.id),
      orderNumber: String(o.id),
      customerName: o.billing_address?.first_name ? `${o.billing_address.first_name} ${o.billing_address.last_name}` : undefined,
      customerEmail: o.billing_address?.email,
      totalCents: Math.round(parseFloat(o.total_inc_tax || "0") * 100),
      currency: o.currency_code || "USD",
      status: this.mapStatus(o.status),
      fulfillmentStatus: o.status_id === 2 ? "fulfilled" : o.status_id === 3 ? "partial" : "unfulfilled",
      lineItems,
      shippingAddress: o.shipping_addresses?.[0] ? {
        name: `${o.shipping_addresses[0].first_name || ""} ${o.shipping_addresses[0].last_name || ""}`.trim(),
        address1: o.shipping_addresses[0].street_1,
        address2: o.shipping_addresses[0].street_2,
        city: o.shipping_addresses[0].city,
        state: o.shipping_addresses[0].state,
        zip: o.shipping_addresses[0].zip,
        country: o.shipping_addresses[0].country,
      } : undefined,
      createdAt: new Date(o.date_created || Date.now()),
    };
  }

  private mapStatus(s: string): PlatformOrder["status"] {
    const lower = (s || "").toLowerCase();
    if (lower.includes("shipped")) return "shipped";
    if (lower.includes("complete") || lower.includes("delivered")) return "delivered";
    if (lower.includes("cancel")) return "cancelled";
    if (lower.includes("refund")) return "refunded";
    if (lower.includes("partial")) return "processing";
    if (lower.includes("await") || lower.includes("pending")) return "pending";
    return "processing";
  }
}
