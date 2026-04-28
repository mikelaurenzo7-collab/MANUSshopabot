/**
 * Shopify Platform Adapter
 * Uses @shopify/shopify-api official SDK for Admin API access.
 * Handles products, orders, inventory, and fulfillment.
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

export class ShopifyAdapter implements EcommercePlatformAdapter {
  readonly platform = "shopify";
  readonly platformName = "Shopify";

  /**
   * Shopify is the most capable storefront integration we ship — full
   * webhook coverage, GraphQL bulk operations, native theme system,
   * metafields for SEO. Highest throughput on a modern Shopify Plus
   * plan; we target 4 req/s as a safe sustained rate (the platform
   * burst limit is 40 calls per app per minute, ~0.66/s sustained, but
   * GraphQL cost-based limits give more headroom for the bulk ops the
   * bots prefer).
   */
  getCapabilities(): PlatformCapabilities {
    return {
      variants: true,
      metafields: true,
      bulkImport: true,
      maxImagesPerProduct: 250,
      categories: true,
      webhooks: true,
      webhookEvents: [
        "orders/create",
        "orders/updated",
        "orders/fulfilled",
        "products/create",
        "products/update",
        "inventory_levels/update",
        "app/uninstalled",
      ],
      autoFulfillment: true,
      partialFulfillment: true,
      realTimeInventory: true,
      compareAtPrice: true,
      bulkPriceUpdate: true,
      scheduledSale: true,
      recommendedBatchSize: 250,
      rateLimitTokensPerSec: 4,
      category: "storefront",
      feeStructure: "subscription",
      strengths: [
        "Full webhook coverage — orders + inventory propagate in seconds",
        "GraphQL bulk operations for catalog sweeps without rate-limit pain",
        "Native theme + metafield system for SEO-tuned storefronts",
        "Auto-fulfillment with carrier-level tracking",
      ],
      limitations: [
        "Subscription fees scale with plan; not a fit for true zero-cost MVPs",
        "Custom checkout requires Shopify Plus",
      ],
    };
  }

  private buildHeaders(credentials: AdapterCredentials) {
    return {
      "X-Shopify-Access-Token": credentials.accessToken || "",
      "Content-Type": "application/json",
    };
  }

  private baseUrl(credentials: AdapterCredentials) {
    const shop = credentials.shopDomain || credentials.storeUrl || "";
    const domain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${domain}/admin/api/2024-01`;
  }

  private async shopifyFetch(url: string, headers: Record<string, string>, options?: { method?: string; body?: string }) {
    const { default: axios } = await import("axios");
    await platformRateLimiters.shopify.acquire();
    return withRetry(async () => {
      try {
        const response = await axios({
          url,
          headers,
          method: (options?.method || "GET") as any,
          data: options?.body ? JSON.parse(options.body) : undefined,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return response.data;
      } catch (err: any) {
        // Re-throw with status for rate limiter detection
        if (err.response?.status === 429) throw err;
        const msg = err.response?.data?.errors || err.message;
        throw new Error(`Shopify API error: ${JSON.stringify(msg)}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1000 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const data = await this.shopifyFetch(
      `${this.baseUrl(credentials)}/shop.json`,
      this.buildHeaders(credentials)
    );
    const shop = data.shop;
    return {
      platformId: String(shop.id),
      name: shop.name,
      domain: shop.domain,
      currency: shop.currency,
      timezone: shop.timezone,
      plan: shop.plan_name,
      status: "active",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    // Default page size pulls from the capability matrix's
    // `recommendedBatchSize` (250 for Shopify) so paginated catalog
    // sweeps run in 1 round-trip instead of 5 when the caller didn't
    // pass an explicit limit. Capped at Shopify's hard ceiling of 250.
    const defaultPageSize = this.getCapabilities().recommendedBatchSize;
    const limit = Math.min(params?.limit || defaultPageSize, 250);
    const offset = params?.offset || 0;
    const allProducts: PlatformProduct[] = [];

    let cursor: string | undefined;
    let hasMore = true;
    let pageCount = 0;
    const maxPages = Math.ceil((params?.limit || defaultPageSize) / 250);
    
    while (hasMore && pageCount < maxPages) {
      const url = new URL(`${this.baseUrl(credentials)}/products.json`);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("status", params?.status || "active");
      if (cursor) url.searchParams.set("cursor", cursor);
      
      const data = await this.shopifyFetch(url.toString(), this.buildHeaders(credentials));
      const products = (data.products || []).map((p: any) => this.mapProduct(p));
      allProducts.push(...products);
      
      // Check for pagination link in response
      cursor = data.cursor;
      hasMore = !!cursor && allProducts.length < (params?.limit || 50);
      pageCount++;
    }
    
    return allProducts.slice(offset, offset + (params?.limit || 50));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.shopifyFetch(
      `${this.baseUrl(credentials)}/products/${productId}.json`,
      this.buildHeaders(credentials)
    );
    return this.mapProduct(data.product);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    const body = {
      product: {
        title: product.title,
        body_html: product.description,
        variants: [{
          price: (product.priceCents / 100).toFixed(2),
          compare_at_price: product.comparePriceCents ? (product.comparePriceCents / 100).toFixed(2) : undefined,
          sku: product.sku,
          inventory_quantity: product.stockLevel || 0,
        }],
        images: product.imageUrl ? [{ src: product.imageUrl }] : [],
        product_type: product.category,
        status: "draft",
      },
    };
    const data = await this.shopifyFetch(
      `${this.baseUrl(credentials)}/products.json`,
      this.buildHeaders(credentials),
      { method: "POST", body: JSON.stringify(body) }
    );
    return this.mapProduct(data.product);
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const body: any = { product: {} };
    if (updates.title) body.product.title = updates.title;
    if (updates.description) body.product.body_html = updates.description;
    if (updates.status) body.product.status = updates.status;
    if (updates.priceCents !== undefined) {
      body.product.variants = [{ price: (updates.priceCents / 100).toFixed(2) }];
    }
    const data = await this.shopifyFetch(
      `${this.baseUrl(credentials)}/products/${productId}.json`,
      this.buildHeaders(credentials),
      { method: "PUT", body: JSON.stringify(body) }
    );
    return this.mapProduct(data.product);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.shopifyFetch(
      `${this.baseUrl(credentials)}/products/${productId}.json`,
      this.buildHeaders(credentials),
      { method: "DELETE" }
    );
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const limit = params?.limit || 50;
    const data = await this.shopifyFetch(
      `${this.baseUrl(credentials)}/orders.json?limit=${limit}&status=any`,
      this.buildHeaders(credentials)
    );
    return (data.orders || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const data = await this.shopifyFetch(
      `${this.baseUrl(credentials)}/orders/${orderId}.json`,
      this.buildHeaders(credentials)
    );
    return this.mapOrder(data.order);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    // Check if order is already fulfilled (idempotency)
    const orderData = await this.shopifyFetch(
      `${this.baseUrl(credentials)}/orders/${orderId}.json`,
      this.buildHeaders(credentials)
    );
    
    const order = orderData.order;
    if (order?.fulfillment_status === "fulfilled" || order?.fulfillment_status === "partially_fulfilled") {
      console.warn(`Order ${orderId} is already fulfilled. Skipping duplicate fulfillment.`);
      return; // Idempotent: skip if already fulfilled
    }

    const body = {
      fulfillment: {
        tracking_number: fulfillment.trackingNumber,
        tracking_url: fulfillment.trackingUrl,
        tracking_company: fulfillment.carrier,
        notify_customer: fulfillment.notifyCustomer ?? true,
      },
    };
    await this.shopifyFetch(
      `${this.baseUrl(credentials)}/orders/${orderId}/fulfillments.json`,
      this.buildHeaders(credentials),
      { method: "POST", body: JSON.stringify(body) }
    );
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const product = await this.getProduct(credentials, productId);
    return {
      productId,
      available: product.stockLevel,
    };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    // Get the variant ID first
    const data = await this.shopifyFetch(
      `${this.baseUrl(credentials)}/products/${productId}.json`,
      this.buildHeaders(credentials)
    );
    const variantId = data.product?.variants?.[0]?.inventory_item_id;
    if (!variantId) throw new Error("Could not find inventory item for product");

    // Get location ID
    const locData = await this.shopifyFetch(
      `${this.baseUrl(credentials)}/locations.json`,
      this.buildHeaders(credentials)
    );
    const locationId = locData.locations?.[0]?.id;
    if (!locationId) throw new Error("No location found for inventory update");

    await this.shopifyFetch(
      `${this.baseUrl(credentials)}/inventory_levels/set.json`,
      this.buildHeaders(credentials),
      {
        method: "POST",
        body: JSON.stringify({ location_id: locationId, inventory_item_id: variantId, available: quantity }),
      }
    );
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  private mapProduct(p: any): PlatformProduct {
    const variant = p.variants?.[0] || {};
    return {
      platformId: String(p.id),
      title: p.title,
      description: p.body_html,
      priceCents: Math.round(parseFloat(variant.price || "0") * 100),
      comparePriceCents: variant.compare_at_price ? Math.round(parseFloat(variant.compare_at_price) * 100) : undefined,
      sku: variant.sku,
      imageUrl: p.images?.[0]?.src,
      category: p.product_type,
      stockLevel: variant.inventory_quantity || 0,
      status: p.status === "active" ? "active" : p.status === "archived" ? "archived" : "draft",
      url: p.handle ? `https://${p.handle}.myshopify.com/products/${p.handle}` : undefined,
    };
  }

  private mapOrder(o: any): PlatformOrder {
    return {
      platformId: String(o.id),
      orderNumber: String(o.order_number || o.name),
      customerName: o.customer ? `${o.customer.first_name} ${o.customer.last_name}`.trim() : undefined,
      customerEmail: o.email,
      totalCents: Math.round(parseFloat(o.total_price || "0") * 100),
      currency: o.currency || "USD",
      status: this.mapOrderStatus(o.financial_status),
      fulfillmentStatus: o.fulfillment_status === "fulfilled" ? "fulfilled" : o.fulfillment_status === "partial" ? "partial" : "unfulfilled",
      lineItems: (o.line_items || []).map((li: any) => ({
        productId: String(li.product_id),
        title: li.title,
        quantity: li.quantity,
        priceCents: Math.round(parseFloat(li.price || "0") * 100),
        sku: li.sku,
      })),
      shippingAddress: o.shipping_address ? {
        name: o.shipping_address.name,
        address1: o.shipping_address.address1,
        address2: o.shipping_address.address2,
        city: o.shipping_address.city,
        state: o.shipping_address.province,
        zip: o.shipping_address.zip,
        country: o.shipping_address.country_code,
      } : undefined,
      trackingNumber: o.fulfillments?.[0]?.tracking_number,
      trackingUrl: o.fulfillments?.[0]?.tracking_url,
      createdAt: new Date(o.created_at),
    };
  }

  private mapOrderStatus(financialStatus: string): PlatformOrder["status"] {
    switch (financialStatus) {
      case "paid": return "processing";
      case "refunded": return "refunded";
      case "voided": return "cancelled";
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
