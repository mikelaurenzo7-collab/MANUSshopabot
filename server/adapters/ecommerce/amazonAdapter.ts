/**
 * Amazon Selling Partner (SP-API) Adapter
 * Uses amazon-sp-api package for SP-API access.
 * Handles listings, orders, inventory, and fulfillment.
 * Rate-limited with exponential backoff on 429 responses.
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
import { withRetry, platformRateLimiters } from "../../utils/rateLimiter";

const limiter = platformRateLimiters.amazon;

export class AmazonAdapter implements EcommercePlatformAdapter {
  readonly platform = "amazon";
  readonly platformName = "Amazon Seller";

  /**
   * Amazon SP-API: highest-volume marketplace, Buy-Box matters more than
   * theme polish. Variants exist (parent/child ASIN), no metafields, FBA
   * inventory propagation lags 5–10 minutes. Rate limits are stringent:
   * 0.0167 req/sec for some endpoints (1/min), much higher for others —
   * we pick a conservative 1 req/sec sustained and lean on the rate
   * limiter's per-endpoint policy. Bots should use Buy-Box monitoring +
   * dynamic pricing as the core value-add here, not store scaffolding.
   */
  getCapabilities(): PlatformCapabilities {
    return {
      variants: true,
      metafields: false,
      bulkImport: true,
      maxImagesPerProduct: 9,
      categories: true,
      webhooks: true,
      webhookEvents: ["ORDER_CHANGE", "ANY_OFFER_CHANGED", "FBA_INVENTORY_AVAILABILITY_CHANGES"],
      autoFulfillment: true,
      partialFulfillment: true,
      realTimeInventory: false,
      compareAtPrice: false,
      bulkPriceUpdate: true,
      scheduledSale: true,
      recommendedBatchSize: 50,
      rateLimitTokensPerSec: 1,
      category: "marketplace",
      feeStructure: "commission",
      strengths: [
        "Buy-Box monitoring + dynamic repricing — biggest single revenue lever",
        "FBA fulfillment integration (Amazon ships, Merchant Bot just routes)",
        "Brand Registry + sponsored ads available via the Advertising API",
        "Massive built-in demand — no organic-traffic dependency",
      ],
      limitations: [
        "No metafields, no theme — Amazon owns the listing presentation",
        "Inventory updates lag 5–10 min on FBA",
        "Rate limits are stringent and per-endpoint; bulk ops via feeds API only",
        "Commission per sale (~15%) — margin needs to clear that floor",
      ],
    };
  }

  private async getClient(credentials: AdapterCredentials) {
    const spApiModule = await import("amazon-sp-api");
    const SellingPartner = (spApiModule as any).default || spApiModule;
    return new SellingPartner({
      region: (credentials.metadata?.region as string) || "na",
      refresh_token: credentials.refreshToken || "",
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: credentials.apiKey || process.env.AMAZON_SP_CLIENT_ID || "",
        SELLING_PARTNER_APP_CLIENT_SECRET: credentials.apiSecret || process.env.AMAZON_SP_CLIENT_SECRET || "",
      },
    });
  }

  /** Rate-limited API call wrapper */
  private async callApi(credentials: AdapterCredentials, fn: (client: any) => Promise<any>): Promise<any> {
    await limiter.acquire();
    const client = await this.getClient(credentials);
    return withRetry(() => fn(client), { maxRetries: 3, initialDelayMs: 1000 });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const result = await this.callApi(credentials, (client) =>
      client.callAPI({
        operation: "getMarketplaceParticipations",
        endpoint: "sellers",
      })
    );
    const participation = result?.[0];
    return {
      platformId: credentials.sellerId || participation?.seller?.sellerId || "amazon",
      name: "Amazon Seller Account",
      domain: "sellercentral.amazon.com",
      currency: "USD",
      status: "active",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    // Default page size pulls from the capability matrix (Amazon: 50)
    // — keeps bot pagination consistent with what the platform handles
    // efficiently. Amazon SP-API rate limits are stringent, so we don't
    // want to over-fetch by default.
    const defaultPageSize = this.getCapabilities().recommendedBatchSize;
    const result = await this.callApi(credentials, (client) =>
      client.callAPI({
        operation: "searchCatalogItems",
        endpoint: "catalogItems",
        query: {
          marketplaceIds: [credentials.marketplaceId || "ATVPDKIKX0DER"],
          keywords: ["*"],
          includedData: ["summaries", "attributes"],
        },
      })
    );
    return (result?.items || []).slice(0, params?.limit || defaultPageSize).map((item: any) => this.mapProduct(item));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const result = await this.callApi(credentials, (client) =>
      client.callAPI({
        operation: "getCatalogItem",
        endpoint: "catalogItems",
        path: { asin: productId },
        query: {
          marketplaceIds: [credentials.marketplaceId || "ATVPDKIKX0DER"],
          includedData: ["summaries", "attributes"],
        },
      })
    );
    return this.mapProduct(result);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    // Use SP-API putListingsItem to create/update a listing
    // This is simpler than feed submissions and works for basic listings
    const marketplaceId = credentials.marketplaceId || "ATVPDKIKX0DER";
    const sellerId = credentials.sellerId || "";
    const sku = product.sku || `sb_${Date.now()}`;

    const priceValue = (product.priceCents ?? 0) / 100;

    await this.callApi(credentials, (client) =>
      client.callAPI({
        operation: "putListingsItem",
        endpoint: "listings",
        path: { sellerId, sku },
        query: { marketplaceIds: [marketplaceId] },
        body: {
          productType: "PRODUCT",
          requirements: "LISTING",
          attributes: {
            item_name: [{ value: product.title }],
            ...(product.description ? { product_description: [{ value: product.description }] } : {}),
            ...(priceValue > 0 ? {
              purchasable_offer: [{
                currency: "USD",
                our_price: [{ schedule: [{ value_with_tax: priceValue }] }],
              }],
            } : {}),
            ...(product.stockLevel !== undefined && product.stockLevel > 0 ? {
              fulfillment_availability: [{
                quantity: product.stockLevel,
                fulfillment_channel_code: "DEFAULT",
              }],
            } : {}),
            ...(product.imageUrl ? { main_product_image_locator: [{ media_location: product.imageUrl }] } : {}),
          },
        },
      })
    );

    return {
      platformId: sku,
      title: product.title,
      description: product.description,
      priceCents: product.priceCents,
      sku,
      imageUrl: product.imageUrl,
      category: product.category,
      stockLevel: product.stockLevel || 0,
      status: "active",
      metadata: { marketplaceId, sellerId, ...product.metadata },
    };
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    if (updates.priceCents !== undefined) {
      const priceValue = updates.priceCents / 100;
      await this.callApi(credentials, (client) =>
        client.callAPI({
          operation: "patchListingsItem",
          endpoint: "listings",
          path: {
            sellerId: credentials.sellerId || "",
            sku: productId,
          },
          query: { marketplaceIds: [credentials.marketplaceId || "ATVPDKIKX0DER"] },
          body: {
            productType: "PRODUCT",
            patches: [{
              op: "replace",
              path: "/attributes/purchasable_offer",
              value: [{ currency: "USD", our_price: [{ schedule: [{ value_with_tax: priceValue }] }] }],
            }],
          },
        })
      );
    }
    return this.getProduct(credentials, productId);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    await this.callApi(credentials, (client) =>
      client.callAPI({
        operation: "deleteListingsItem",
        endpoint: "listings",
        path: {
          sellerId: credentials.sellerId || "",
          sku: productId,
        },
        query: { marketplaceIds: [credentials.marketplaceId || "ATVPDKIKX0DER"] },
      })
    );
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const since = params?.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.callApi(credentials, (client) =>
      client.callAPI({
        operation: "getOrders",
        endpoint: "orders",
        query: {
          MarketplaceIds: [credentials.marketplaceId || "ATVPDKIKX0DER"],
          CreatedAfter: since.toISOString(),
          MaxResultsPerPage: params?.limit || 50,
        },
      })
    );
    return (result?.Orders || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const result = await this.callApi(credentials, (client) =>
      client.callAPI({
        operation: "getOrder",
        endpoint: "orders",
        path: { orderId },
      })
    );
    return this.mapOrder(result);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    // Get order items first
    const itemsResult = await this.callApi(credentials, (client) =>
      client.callAPI({
        operation: "getOrderItems",
        endpoint: "orders",
        path: { orderId },
      })
    );
    const items = itemsResult?.OrderItems || [];

    await this.callApi(credentials, (client) =>
      client.callAPI({
        operation: "submitFeed",
        endpoint: "feeds",
        body: {
          feedType: "POST_ORDER_FULFILLMENT_DATA",
          marketplaceIds: [credentials.marketplaceId || "ATVPDKIKX0DER"],
          inputFeedDocument: JSON.stringify({
            orderId,
            trackingNumber: fulfillment.trackingNumber,
            carrier: fulfillment.carrier || "Other",
            items: items.map((i: any) => ({ orderItemId: i.OrderItemId, quantity: i.QuantityOrdered })),
          }),
        },
      })
    );
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const result = await this.callApi(credentials, (client) =>
      client.callAPI({
        operation: "getInventorySummaries",
        endpoint: "fba/inventory",
        query: {
          details: true,
          granularityType: "Marketplace",
          granularityId: credentials.marketplaceId || "ATVPDKIKX0DER",
          sellerSkus: [productId],
        },
      })
    );
    const summary = result?.inventorySummaries?.[0];
    return {
      productId,
      sku: summary?.sellerSku,
      available: summary?.inventoryDetails?.fulfillableQuantity || 0,
      committed: summary?.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0,
      incoming: summary?.inventoryDetails?.inboundWorkingQuantity || 0,
    };
  }

  async updateInventory(_credentials: AdapterCredentials, _productId: string, _quantity: number): Promise<void> {
    throw new Error("Amazon inventory updates must be done via Seller Central or FBA inbound shipments");
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  private mapProduct(item: any): PlatformProduct {
    const summary = item?.summaries?.[0] || item;
    return {
      platformId: item.asin || String(item.id || ""),
      title: summary.itemName || summary.title || "Unknown Product",
      description: item.attributes?.product_description?.[0]?.value,
      priceCents: 0,
      imageUrl: summary.mainImage?.link,
      category: summary.productType,
      stockLevel: 0,
      status: "active",
    };
  }

  private mapOrder(o: any): PlatformOrder {
    return {
      platformId: o.AmazonOrderId || o.orderId,
      orderNumber: o.AmazonOrderId || o.orderId,
      customerName: o.BuyerInfo?.BuyerName,
      customerEmail: o.BuyerInfo?.BuyerEmail,
      totalCents: Math.round(parseFloat(o.OrderTotal?.Amount || "0") * 100),
      currency: o.OrderTotal?.CurrencyCode || "USD",
      status: this.mapOrderStatus(o.OrderStatus),
      fulfillmentStatus: o.OrderStatus === "Shipped" || o.OrderStatus === "Delivered" ? "fulfilled" : "unfulfilled",
      lineItems: [],
      shippingAddress: o.ShippingAddress ? {
        name: o.ShippingAddress.Name,
        address1: o.ShippingAddress.AddressLine1,
        address2: o.ShippingAddress.AddressLine2,
        city: o.ShippingAddress.City,
        state: o.ShippingAddress.StateOrRegion,
        zip: o.ShippingAddress.PostalCode,
        country: o.ShippingAddress.CountryCode,
      } : undefined,
      createdAt: new Date(o.PurchaseDate || Date.now()),
    };
  }

  private mapOrderStatus(status: string): PlatformOrder["status"] {
    switch (status) {
      case "Pending": return "pending";
      case "Unshipped": return "processing";
      case "PartiallyShipped": return "processing";
      case "Shipped": return "shipped";
      case "Delivered": return "delivered";
      case "Canceled": return "cancelled";
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
