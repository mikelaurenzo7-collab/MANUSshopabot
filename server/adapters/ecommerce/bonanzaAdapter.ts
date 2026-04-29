/**
 * Bonanza adapter — Bonapitit JSON API.
 *
 * Bonanza is a long-tail collectibles marketplace ("the Etsy
 * alternative"). Their public Bonapitit API uses dev_id + cert_id +
 * user_token auth — not OAuth — so credentials live in metadata.
 * Bot use cases: low-volume listings of vintage / collectible /
 * one-of-a-kind items where Etsy's listing fee compounds. Bonanza
 * charges a final-value fee instead of a listing fee.
 *
 * Bonapitit endpoints look RPC-style: `/api_request/std_bonapitit_api`
 * with a `request_name` envelope. We hide that under the same fetch
 * surface as the other adapters so the workflow engine doesn't care.
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

const API_BASE = "https://api.bonanza.com/api_requests";

export class BonanzaAdapter implements EcommercePlatformAdapter {
  readonly platform = "bonanza";
  readonly platformName = "Bonanza";

  getCapabilities(): PlatformCapabilities {
    return {
      variants: false,
      metafields: false,
      bulkImport: true,
      maxImagesPerProduct: 12,
      categories: true,
      webhooks: false,
      webhookEvents: [],
      autoFulfillment: true,
      partialFulfillment: false,
      realTimeInventory: false,
      compareAtPrice: false,
      bulkPriceUpdate: true,
      scheduledSale: false,
      recommendedBatchSize: 50,
      rateLimitTokensPerSec: 1,
      category: "marketplace",
      feeStructure: "commission",
      strengths: [
        "No listing fees — only a final-value fee on sale (~3.5% + Google Shopping tier)",
        "Auto-syndicates listings to Google Shopping at the higher tier",
        "Low competition for vintage / collectibles categories",
      ],
      limitations: [
        "RPC-style Bonapitit API — no webhooks, polling-only",
        "Requires dev_id + cert_id + user_token (not OAuth) — manual rotation",
        "Lower order volume than eBay / Etsy — bots use it as a long-tail surface",
      ],
    };
  }

  private creds(credentials: AdapterCredentials): { devId: string; certId: string; userToken: string } {
    return {
      devId: credentials.metadata?.devId || credentials.apiKey || "",
      certId: credentials.metadata?.certId || credentials.apiSecret || "",
      userToken: credentials.metadata?.userToken || credentials.accessToken || "",
    };
  }

  private async call(
    requestName: string,
    body: any,
    credentials: AdapterCredentials,
  ): Promise<any> {
    const { default: axios } = await import("axios");
    const { devId, certId, userToken } = this.creds(credentials);
    if (!devId || !certId || !userToken) {
      throw new Error("Bonanza requires dev_id + cert_id + user_token in credentials.metadata");
    }
    await platformRateLimiters.bonanza.acquire();
    return withRetry(async () => {
      try {
        const res = await axios.post(
          `${API_BASE}/std_bonapitit_api/${requestName}`,
          {
            requester_credentials: {
              dev_id: devId,
              cert_id: certId,
              user_token: userToken,
            },
            ...body,
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: ADAPTER_HTTP_TIMEOUT_MS,
          },
        );
        if (res.data?.ack === "Failure") {
          throw new Error(res.data?.errors?.[0]?.long_message || "Bonanza request failed");
        }
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`Bonanza API error: ${err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 2000 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const data = await this.call("get_user_profile", {}, credentials);
    const user = data?.user || {};
    return {
      platformId: String(user.user_id || credentials.platformAccountId || "bonanza"),
      name: user.booth_name || user.username || "Bonanza Booth",
      domain: user.booth_url || "bonanza.com",
      currency: user.currency || "USD",
      status: user.status === "active" ? "active" : "suspended",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const data = await this.call("get_user_items", {
      pagination: { page: params?.page || 1, per_page: params?.limit ?? this.getCapabilities().recommendedBatchSize },
    }, credentials);
    return (data?.items || []).map((it: any) => this.mapProduct(it));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.call("get_item", { item_id: productId }, credentials);
    return this.mapProduct(data?.item || data);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    const data = await this.call("add_item", {
      item: {
        title: product.title,
        description: product.description || product.title,
        price: (product.priceCents / 100).toFixed(2),
        quantity: product.stockLevel ?? 1,
        sku: product.sku,
        category_id: product.category,
        photos: product.imageUrl ? [{ url: product.imageUrl }] : [],
      },
    }, credentials);
    return this.mapProduct(data?.item || data);
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const item: any = { item_id: productId };
    if (updates.title) item.title = updates.title;
    if (updates.description) item.description = updates.description;
    if (updates.priceCents !== undefined) item.price = (updates.priceCents / 100).toFixed(2);
    if (updates.stockLevel !== undefined) item.quantity = updates.stockLevel;
    if (updates.status) item.status = updates.status === "active" ? "active" : "ended";
    const data = await this.call("revise_item", { item }, credentials);
    return this.mapProduct(data?.item || { item_id: productId, ...item });
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.call("end_item", { item_id: productId, ending_reason: "lost_or_broken" }, credentials);
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const since = (params?.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString();
    const data = await this.call("get_orders", {
      pagination: { page: params?.page || 1, per_page: params?.limit ?? 50 },
      time_filter: { from: since, to: new Date().toISOString() },
    }, credentials);
    return (data?.orders || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const data = await this.call("get_order", { order_id: orderId }, credentials);
    return this.mapOrder(data?.order || data);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    await this.call("complete_sale", {
      order_id: orderId,
      shipped: true,
      shipment_tracking_details: {
        carrier: fulfillment.carrier || "USPS",
        tracking_number: fulfillment.trackingNumber,
        shipped_time: new Date().toISOString(),
      },
    }, credentials);
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const product = await this.getProduct(credentials, productId);
    return { productId, sku: product.sku, available: product.stockLevel };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    await this.call("revise_item", { item: { item_id: productId, quantity } }, credentials);
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  async healthCheck(credentials: AdapterCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    const { devId, certId, userToken } = this.creds(credentials);
    if (!devId || !certId || !userToken) {
      return { healthy: false, message: "Missing dev_id / cert_id / user_token", latencyMs: 0 };
    }
    try {
      await this.call("get_user_profile", {}, credentials);
      return { healthy: true, message: "Connected", latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, message: err.message || "Health check failed", latencyMs: Date.now() - start };
    }
  }

  private mapProduct(it: any): PlatformProduct {
    return {
      platformId: String(it?.item_id || ""),
      title: it?.title || "Bonanza item",
      description: it?.description,
      priceCents: Math.round(parseFloat(it?.price || "0") * 100),
      sku: it?.sku,
      imageUrl: it?.photos?.[0]?.url || it?.primary_photo_url,
      category: it?.category_id ? String(it.category_id) : undefined,
      stockLevel: it?.quantity ?? 1,
      status: it?.status === "active" ? "active" : it?.status === "ended" ? "archived" : "draft",
      url: it?.url,
    };
  }

  private mapOrder(o: any): PlatformOrder {
    return {
      platformId: String(o?.order_id || ""),
      orderNumber: String(o?.order_id || ""),
      customerName: o?.buyer?.username,
      customerEmail: o?.buyer?.email,
      totalCents: Math.round(parseFloat(o?.total_amount || "0") * 100),
      currency: o?.currency || "USD",
      status: o?.status === "shipped" ? "shipped" : o?.status === "complete" ? "delivered" : o?.status === "cancelled" ? "cancelled" : "processing",
      fulfillmentStatus: o?.shipped ? "fulfilled" : "unfulfilled",
      lineItems: (o?.items || []).map((li: any) => ({
        productId: String(li.item_id),
        title: li.title,
        quantity: li.quantity || 1,
        priceCents: Math.round(parseFloat(li.unit_price || "0") * 100),
        sku: li.sku,
      })),
      shippingAddress: o?.shipping_address,
      trackingNumber: o?.tracking_number,
      createdAt: new Date(o?.created_at || Date.now()),
    };
  }
}
