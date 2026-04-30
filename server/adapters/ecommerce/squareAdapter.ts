/**
 * Square adapter — Catalog + Orders + Inventory APIs.
 *
 * Square is unusual: their "store" model is a Location, and a single
 * merchant can have many. Every Catalog object is identified by an
 * encrypted opaque id (e.g. `XYZ123...`). Bots resolve the active
 * locationId from credentials.metadata.locationId; if none is set, the
 * adapter picks the merchant's first ACTIVE location on connect.
 *
 * Square's Catalog API uses upsert semantics — `idempotency_key` is
 * required on every mutation. We derive it from `BB-{op}-{id}-{ts}` so
 * retries inside withRetry never duplicate items.
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
import { randomUUID } from "node:crypto";
import { logger } from "../../utils/logger";

const API_BASE = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-08-21";

export class SquareAdapter implements EcommercePlatformAdapter {
  readonly platform = "square";
  readonly platformName = "Square";

  getCapabilities(): PlatformCapabilities {
    return {
      variants: true,
      metafields: true,
      bulkImport: true,
      maxImagesPerProduct: 10,
      categories: true,
      webhooks: true,
      webhookEvents: [
        "order.created",
        "order.updated",
        "order.fulfillment.updated",
        "inventory.count.updated",
        "catalog.version.updated",
      ],
      autoFulfillment: true,
      partialFulfillment: true,
      realTimeInventory: true,
      compareAtPrice: false,
      bulkPriceUpdate: true,
      scheduledSale: false,
      recommendedBatchSize: 100,
      rateLimitTokensPerSec: 10,
      category: "storefront",
      feeStructure: "commission",
      strengths: [
        "Unifies Square POS + Square Online — inventory stays in sync across in-person and online",
        "Strong webhook coverage on Catalog + Inventory — bots react in real-time",
        "First-class location concept makes multi-location merchants easy",
      ],
      limitations: [
        "Catalog API uses opaque IDs — UI must surface SKU lookups for human operators",
        "No native compare-at price — sale pricing modeled via custom attributes",
        "Square Online theming is limited vs Shopify",
      ],
    };
  }

  private async fetch(
    path: string,
    credentials: AdapterCredentials,
    options?: { method?: string; body?: any },
  ): Promise<any> {
    const { default: axios } = await import("axios");
    await platformRateLimiters.square.acquire();
    return withRetry(async () => {
      try {
        const res = await axios({
          url: `${API_BASE}${path}`,
          method: (options?.method || "GET") as any,
          headers: {
            Authorization: `Bearer ${credentials.accessToken || ""}`,
            "Square-Version": SQUARE_VERSION,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        const sqErr = err.response?.data?.errors?.[0];
        throw new Error(`Square API error: ${sqErr?.detail || sqErr?.code || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1000 });
  }

  private async resolveLocationId(credentials: AdapterCredentials): Promise<string> {
    if (credentials.metadata?.locationId) return credentials.metadata.locationId;
    const data = await this.fetch("/locations", credentials);
    const active = (data.locations || []).find((l: any) => l.status === "ACTIVE") || data.locations?.[0];
    if (!active) throw new Error("Square account has no active locations");
    return active.id;
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const data = await this.fetch("/locations", credentials);
    const loc = (data.locations || []).find((l: any) => l.status === "ACTIVE") || data.locations?.[0];
    return {
      platformId: loc?.merchant_id || credentials.platformAccountId || "square",
      name: loc?.business_name || loc?.name || "Square Merchant",
      domain: loc?.website_url,
      currency: loc?.currency || "USD",
      timezone: loc?.timezone,
      status: loc?.status === "ACTIVE" ? "active" : "suspended",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const limit = params?.limit ?? this.getCapabilities().recommendedBatchSize;
    const data = await this.fetch(`/catalog/list?types=ITEM&limit=${limit}`, credentials);
    return (data.objects || []).map((o: any) => this.mapProduct(o));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.fetch(`/catalog/object/${productId}?include_related_objects=true`, credentials);
    return this.mapProduct(data.object);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    const idempotency_key = `BB-create-${randomUUID()}`;
    const body = {
      idempotency_key,
      object: {
        type: "ITEM",
        id: `#bb-${Date.now()}`,
        item_data: {
          name: product.title,
          description: product.description || "",
          variations: [
            {
              type: "ITEM_VARIATION",
              id: `#bb-var-${Date.now()}`,
              item_variation_data: {
                name: "Default",
                pricing_type: "FIXED_PRICING",
                price_money: { amount: product.priceCents, currency: "USD" },
                sku: product.sku,
                track_inventory: true,
              },
            },
          ],
        },
      },
    };
    const data = await this.fetch("/catalog/object", credentials, { method: "POST", body });
    if (product.imageUrl && data.catalog_object?.id) {
      await this.fetch("/catalog/images", credentials, {
        method: "POST",
        body: {
          idempotency_key: `BB-img-${randomUUID()}`,
          object_id: data.catalog_object.id,
          image: { type: "IMAGE", image_data: { url: product.imageUrl, name: product.title } },
        },
      }).catch((err) =>
        logger.warn("square_image_attach_failed", {
          module: "squareAdapter",
          objectId: data.catalog_object.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    return this.mapProduct(data.catalog_object);
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const current = await this.fetch(`/catalog/object/${productId}`, credentials);
    const obj = current.object;
    const itemData = obj?.item_data || {};
    if (updates.title) itemData.name = updates.title;
    if (updates.description) itemData.description = updates.description;
    if (updates.priceCents !== undefined && itemData.variations?.[0]?.item_variation_data) {
      itemData.variations[0].item_variation_data.price_money = {
        amount: updates.priceCents,
        currency: "USD",
      };
    }
    const body = {
      idempotency_key: `BB-update-${randomUUID()}`,
      object: { ...obj, item_data: itemData },
    };
    const data = await this.fetch("/catalog/object", credentials, { method: "POST", body });
    return this.mapProduct(data.catalog_object);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.fetch(`/catalog/object/${productId}`, credentials, { method: "DELETE" });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const locationId = await this.resolveLocationId(credentials);
    const since = (params?.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString();
    const data = await this.fetch("/orders/search", credentials, {
      method: "POST",
      body: {
        location_ids: [locationId],
        limit: params?.limit ?? 50,
        query: { filter: { date_time_filter: { created_at: { start_at: since } } } },
      },
    });
    return (data.orders || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const data = await this.fetch(`/orders/${orderId}`, credentials);
    return this.mapOrder(data.order);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    const order = await this.fetch(`/orders/${orderId}`, credentials);
    const fulfillments = order.order?.fulfillments || [];
    if (fulfillments.length === 0) {
      // Create a SHIPMENT fulfillment.
      await this.fetch(`/orders/${orderId}`, credentials, {
        method: "PUT",
        body: {
          order: {
            location_id: order.order.location_id,
            version: order.order.version,
            fulfillments: [
              {
                type: "SHIPMENT",
                state: "COMPLETED",
                shipment_details: {
                  carrier: fulfillment.carrier || "USPS",
                  tracking_number: fulfillment.trackingNumber,
                  tracking_url: fulfillment.trackingUrl,
                  shipped_at: new Date().toISOString(),
                },
              },
            ],
          },
        },
      });
      return;
    }
    // Otherwise update the existing fulfillment.
    await this.fetch(`/orders/${orderId}`, credentials, {
      method: "PUT",
      body: {
        order: {
          location_id: order.order.location_id,
          version: order.order.version,
          fulfillments: fulfillments.map((f: any) => ({
            ...f,
            state: "COMPLETED",
            shipment_details: {
              ...f.shipment_details,
              tracking_number: fulfillment.trackingNumber || f.shipment_details?.tracking_number,
              tracking_url: fulfillment.trackingUrl || f.shipment_details?.tracking_url,
              carrier: fulfillment.carrier || f.shipment_details?.carrier,
              shipped_at: new Date().toISOString(),
            },
          })),
        },
      },
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const data = await this.fetch(`/inventory/${productId}`, credentials);
    const counts = data.counts || [];
    const total = counts.reduce((sum: number, c: any) => sum + parseInt(c.quantity || "0"), 0);
    return { productId, available: total };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    const locationId = await this.resolveLocationId(credentials);
    await this.fetch("/inventory/changes/batch-create", credentials, {
      method: "POST",
      body: {
        idempotency_key: `BB-inv-${randomUUID()}`,
        changes: [
          {
            type: "PHYSICAL_COUNT",
            physical_count: {
              catalog_object_id: productId,
              location_id: locationId,
              quantity: String(quantity),
              state: "IN_STOCK",
              occurred_at: new Date().toISOString(),
            },
          },
        ],
      },
    });
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  async healthCheck(credentials: AdapterCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.fetch("/locations", credentials);
      return { healthy: true, message: "Connected", latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, message: err.message || "Health check failed", latencyMs: Date.now() - start };
    }
  }

  private mapProduct(o: any): PlatformProduct {
    if (!o) return { platformId: "", title: "", priceCents: 0, stockLevel: 0, status: "draft" };
    const item = o.item_data || {};
    const variation = item.variations?.[0]?.item_variation_data;
    const price = variation?.price_money?.amount ?? 0;
    return {
      platformId: o.id,
      title: item.name || "Square item",
      description: item.description,
      priceCents: price,
      sku: variation?.sku,
      stockLevel: 0,
      status: o.is_deleted ? "archived" : item.is_archived ? "archived" : "active",
    };
  }

  private mapOrder(o: any): PlatformOrder {
    const fulfillment = o.fulfillments?.[0];
    return {
      platformId: o.id,
      orderNumber: o.id,
      customerName: fulfillment?.shipment_details?.recipient?.display_name,
      customerEmail: fulfillment?.shipment_details?.recipient?.email_address,
      totalCents: o.total_money?.amount ?? 0,
      currency: o.total_money?.currency || "USD",
      status: this.mapStatus(o.state, fulfillment?.state),
      fulfillmentStatus: fulfillment?.state === "COMPLETED" ? "fulfilled" : fulfillment?.state === "PROPOSED" ? "unfulfilled" : "partial",
      lineItems: (o.line_items || []).map((it: any) => ({
        productId: it.catalog_object_id || it.uid,
        title: it.name,
        quantity: parseInt(it.quantity || "1"),
        priceCents: it.base_price_money?.amount ?? 0,
        sku: it.variation_name,
      })),
      shippingAddress: fulfillment?.shipment_details?.recipient?.address ? {
        name: fulfillment.shipment_details.recipient.display_name,
        address1: fulfillment.shipment_details.recipient.address.address_line_1,
        address2: fulfillment.shipment_details.recipient.address.address_line_2,
        city: fulfillment.shipment_details.recipient.address.locality,
        state: fulfillment.shipment_details.recipient.address.administrative_district_level_1,
        zip: fulfillment.shipment_details.recipient.address.postal_code,
        country: fulfillment.shipment_details.recipient.address.country,
      } : undefined,
      trackingNumber: fulfillment?.shipment_details?.tracking_number,
      trackingUrl: fulfillment?.shipment_details?.tracking_url,
      createdAt: new Date(o.created_at || Date.now()),
    };
  }

  private mapStatus(state: string, fulfillmentState?: string): PlatformOrder["status"] {
    if (state === "CANCELED") return "cancelled";
    if (fulfillmentState === "COMPLETED") return "shipped";
    if (state === "COMPLETED") return "delivered";
    if (state === "OPEN") return "processing";
    return "pending";
  }
}
