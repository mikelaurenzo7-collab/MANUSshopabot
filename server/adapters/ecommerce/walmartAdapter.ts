/**
 * Walmart Marketplace Platform Adapter
 * Uses Walmart Seller API via axios with Client ID + Client Secret auth.
 * Token-based auth: exchange credentials for Bearer token.
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
import { withRetry } from "../../utils/rateLimiter";

const WALMART_API_BASE = "https://marketplace.walmartapis.com/v3";

export class WalmartAdapter implements EcommercePlatformAdapter {
  readonly platform = "walmart";
  readonly platformName = "Walmart Marketplace";

  /**
   * Walmart Marketplace: invitation-only marketplace with WFS (Walmart
   * Fulfillment Services) for Prime-equivalent shipping. Lower commission
   * than Amazon (6–15% vs 15%) but stricter approval. Feeds API for bulk
   * ops; no real-time webhooks but item/order feeds give near-real-time
   * status. Variants supported. No metafields.
   */
  getCapabilities(): PlatformCapabilities {
    return {
      variants: true,
      metafields: false,
      bulkImport: true,
      maxImagesPerProduct: 8,
      categories: true,
      webhooks: false,
      webhookEvents: [],
      autoFulfillment: true,
      partialFulfillment: true,
      realTimeInventory: false,
      compareAtPrice: false,
      bulkPriceUpdate: true,
      scheduledSale: true,
      recommendedBatchSize: 100,
      rateLimitTokensPerSec: 5,
      category: "marketplace",
      feeStructure: "commission",
      strengths: [
        "Lower commission than Amazon (6–15% by category vs flat 15%)",
        "WFS (Walmart Fulfillment Services) gives Prime-equivalent shipping",
        "Less seller saturation than Amazon — Buy-Box wins are easier",
      ],
      limitations: [
        "Invitation-only — sellers need approval before listing",
        "No webhooks; bot polls feed-status endpoints for state changes",
        "Stricter content guidelines than Amazon — higher rejection rate",
      ],
    };
  }

  private async getAccessToken(credentials: AdapterCredentials): Promise<string> {
    const { default: axios } = await import("axios");
    const clientId = credentials.apiKey || "";
    const clientSecret = credentials.apiSecret || "";
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await axios.post(
      "https://marketplace.walmartapis.com/v3/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "WM_SVC.NAME": "Walmart Marketplace",
          "WM_QOS.CORRELATION_ID": `bb-${Date.now()}`,
        },
        timeout: ADAPTER_HTTP_TIMEOUT_MS,
      }
    );
    return response.data.access_token;
  }

  private async fetch(path: string, credentials: AdapterCredentials, options?: { method?: string; body?: any; query?: Record<string, string> }) {
    const { default: axios } = await import("axios");
    const token = credentials.accessToken || await this.getAccessToken(credentials);
    const queryString = options?.query ? `?${new URLSearchParams(options.query).toString()}` : "";

    return withRetry(async () => {
      try {
        const response = await axios({
          url: `${WALMART_API_BASE}${path}${queryString}`,
          method: (options?.method || "GET") as any,
          headers: {
            Authorization: `Bearer ${token}`,
            "WM_SVC.NAME": "Walmart Marketplace",
            "WM_QOS.CORRELATION_ID": `bb-${Date.now()}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return response.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`Walmart API error: ${err.response?.data?.errors?.[0]?.message || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 2000 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const data = await this.fetch("/feeds", credentials, { query: { feedType: "ITEM", limit: "1" } });
    return {
      platformId: credentials.platformAccountId || credentials.apiKey || "walmart",
      name: "Walmart Marketplace Account",
      domain: "walmart.com",
      currency: "USD",
      status: "active",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const data = await this.fetch("/items", credentials, {
      query: {
        limit: String(params?.limit || 50),
        offset: String(((params?.page || 1) - 1) * (params?.limit || 50)),
      },
    });
    return (data?.ItemResponse || []).map((item: any) => this.mapProduct(item));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const data = await this.fetch(`/items/${productId}`, credentials);
    return this.mapProduct(data);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    // Walmart uses feed-based item submission
    const feedBody = {
      MPItemFeedHeader: { version: "4.2", requestId: `bb-${Date.now()}`, requestBatchId: `bb-batch-${Date.now()}` },
      MPItem: [{
        processMode: "REPLACE",
        sku: product.sku || `BB-${Date.now()}`,
        productIdentifiers: { productIdType: "GTIN", productId: product.metadata?.gtin || "00000000000000" },
        MPItemAndShippingTemplateAssociation: [{ ShippingTemplateId: "SHIP_BY_SELLER_TEMPLATE" }],
        MPProduct: {
          productName: product.title,
          productCategory: product.category || "Electronics",
          price: { currency: "USD", amount: (product.priceCents / 100).toFixed(2) },
          ShortDescription: product.description?.substring(0, 500),
        },
      }],
    };

    await this.fetch("/feeds", credentials, {
      method: "POST",
      query: { feedType: "MP_ITEM" },
      body: feedBody,
    });

    return {
      platformId: product.sku || `draft_${Date.now()}`,
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
    if (updates.priceCents !== undefined) {
      await this.fetch("/prices", credentials, {
        method: "PUT",
        body: {
          sku: productId,
          pricing: [{
            currentPriceType: "BASE",
            currentPrice: { currency: "USD", amount: (updates.priceCents / 100).toFixed(2) },
          }],
        },
      });
    }
    return this.getProduct(credentials, productId);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.fetch(`/items/${productId}`, credentials, { method: "DELETE" });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const data = await this.fetch("/orders", credentials, {
      query: {
        limit: String(params?.limit || 50),
        createdStartDate: (params?.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString(),
      },
    });
    return (data?.list?.elements?.order || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const data = await this.fetch(`/orders/${orderId}`, credentials);
    return this.mapOrder(data?.order || data);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    // Get order lines first
    const order = await this.getOrder(credentials, orderId);
    await this.fetch(`/orders/${orderId}/shipping`, credentials, {
      method: "POST",
      body: {
        orderShipment: {
          orderLines: {
            orderLine: order.lineItems.map(li => ({
              lineNumber: li.productId,
              orderLineStatuses: {
                orderLineStatus: [{
                  status: "Shipped",
                  statusQuantity: { unitOfMeasurement: "EACH", amount: String(li.quantity) },
                  trackingInfo: {
                    shipDateTime: new Date().toISOString(),
                    carrierName: { carrier: fulfillment.carrier || "UPS" },
                    trackingNumber: fulfillment.trackingNumber || "",
                  },
                }],
              },
            })),
          },
        },
      },
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const data = await this.fetch(`/inventory`, credentials, {
      query: { sku: productId },
    });
    return {
      productId,
      sku: productId,
      available: data?.quantity?.amount || 0,
    };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    await this.fetch("/inventory", credentials, {
      method: "PUT",
      query: { sku: productId },
      body: {
        sku: productId,
        quantity: { unit: "EACH", amount: quantity },
        fulfillmentLagTime: 1,
      },
    });
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  private mapProduct(item: any): PlatformProduct {
    return {
      platformId: item.sku || String(item.itemId || ""),
      title: item.productName || item.itemName || "Walmart Item",
      description: item.shortDescription,
      priceCents: Math.round(parseFloat(item.price?.amount || item.salePrice || "0") * 100),
      sku: item.sku,
      imageUrl: item.images?.[0]?.url,
      category: item.productCategory,
      stockLevel: item.inventoryCount || 0,
      status: item.publishedStatus === "PUBLISHED" ? "active" : "draft",
    };
  }

  private mapOrder(o: any): PlatformOrder {
    const lines = o.orderLines?.orderLine || [];
    return {
      platformId: o.purchaseOrderId,
      orderNumber: o.customerOrderId || o.purchaseOrderId,
      customerName: o.shippingInfo?.postalAddress?.name,
      customerEmail: o.customerEmailId,
      totalCents: Math.round(parseFloat(o.orderTotal?.amount || "0") * 100),
      currency: o.orderTotal?.currency || "USD",
      status: this.mapOrderStatus(o.orderLines?.orderLine?.[0]?.orderLineStatuses?.orderLineStatus?.[0]?.status),
      fulfillmentStatus: o.shippingInfo?.estimatedDeliveryDate ? "fulfilled" : "unfulfilled",
      lineItems: lines.map((li: any) => ({
        productId: li.item?.sku || li.lineNumber,
        title: li.item?.productName || "Item",
        quantity: parseInt(li.orderLineQuantity?.amount || "1"),
        priceCents: Math.round(parseFloat(li.charges?.charge?.[0]?.chargeAmount?.amount || "0") * 100),
        sku: li.item?.sku,
      })),
      shippingAddress: o.shippingInfo?.postalAddress ? {
        name: o.shippingInfo.postalAddress.name,
        address1: o.shippingInfo.postalAddress.address1,
        address2: o.shippingInfo.postalAddress.address2,
        city: o.shippingInfo.postalAddress.city,
        state: o.shippingInfo.postalAddress.state,
        zip: o.shippingInfo.postalAddress.postalCode,
        country: o.shippingInfo.postalAddress.country,
      } : undefined,
      createdAt: new Date(o.orderDate || Date.now()),
    };
  }

  private mapOrderStatus(status: string): PlatformOrder["status"] {
    switch (status) {
      case "Created": return "pending";
      case "Acknowledged": return "processing";
      case "Shipped": return "shipped";
      case "Delivered": return "delivered";
      case "Cancelled": return "cancelled";
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
