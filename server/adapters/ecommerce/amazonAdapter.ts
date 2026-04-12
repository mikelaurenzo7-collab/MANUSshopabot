/**
 * Amazon Selling Partner (SP-API) Adapter
 * Uses amazon-sp-api package for SP-API access.
 * Handles listings, orders, inventory, and fulfillment.
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
} from "./types";

export class AmazonAdapter implements EcommercePlatformAdapter {
  readonly platform = "amazon";
  readonly platformName = "Amazon Seller";

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

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const client = await this.getClient(credentials);
    const result = await client.callAPI({
      operation: "getMarketplaceParticipations",
      endpoint: "sellers",
    });
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
    const client = await this.getClient(credentials);
    const result = await client.callAPI({
      operation: "searchCatalogItems",
      endpoint: "catalogItems",
      query: {
        marketplaceIds: [credentials.marketplaceId || "ATVPDKIKX0DER"],
        keywords: ["*"],
        includedData: ["summaries", "attributes"],
      },
    });
    return (result?.items || []).slice(0, params?.limit || 50).map((item: any) => this.mapProduct(item));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const client = await this.getClient(credentials);
    const result = await client.callAPI({
      operation: "getCatalogItem",
      endpoint: "catalogItems",
      path: { asin: productId },
      query: {
        marketplaceIds: [credentials.marketplaceId || "ATVPDKIKX0DER"],
        includedData: ["summaries", "attributes"],
      },
    });
    return this.mapProduct(result);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    // Amazon product creation requires complex feed submissions
    // For now, return a structured draft that can be submitted via Seller Central
    return {
      platformId: `draft_${Date.now()}`,
      title: product.title,
      description: product.description,
      priceCents: product.priceCents,
      sku: product.sku,
      imageUrl: product.imageUrl,
      category: product.category,
      stockLevel: product.stockLevel || 0,
      status: "draft",
      metadata: { note: "Submit via Amazon Seller Central or Feeds API", ...product.metadata },
    };
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    // Price updates via Listings API
    if (updates.priceCents !== undefined) {
      const client = await this.getClient(credentials);
      await client.callAPI({
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
            value: [{ currency: "USD", our_price: [{ schedule: [{ value_with_tax: updates.priceCents / 100 }] }] }],
          }],
        },
      });
    }
    return this.getProduct(credentials, productId);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    const client = await this.getClient(credentials);
    await client.callAPI({
      operation: "deleteListingsItem",
      endpoint: "listings",
      path: {
        sellerId: credentials.sellerId || "",
        sku: productId,
      },
      query: { marketplaceIds: [credentials.marketplaceId || "ATVPDKIKX0DER"] },
    });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const client = await this.getClient(credentials);
    const since = params?.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await client.callAPI({
      operation: "getOrders",
      endpoint: "orders",
      query: {
        MarketplaceIds: [credentials.marketplaceId || "ATVPDKIKX0DER"],
        CreatedAfter: since.toISOString(),
        MaxResultsPerPage: params?.limit || 50,
      },
    });
    return (result?.Orders || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const client = await this.getClient(credentials);
    const result = await client.callAPI({
      operation: "getOrder",
      endpoint: "orders",
      path: { orderId },
    });
    return this.mapOrder(result);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    const client = await this.getClient(credentials);
    // Get order items first
    const itemsResult = await client.callAPI({
      operation: "getOrderItems",
      endpoint: "orders",
      path: { orderId },
    });
    const items = itemsResult?.OrderItems || [];

    await client.callAPI({
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
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const client = await this.getClient(credentials);
    const result = await client.callAPI({
      operation: "getInventorySummaries",
      endpoint: "fba/inventory",
      query: {
        details: true,
        granularityType: "Marketplace",
        granularityId: credentials.marketplaceId || "ATVPDKIKX0DER",
        sellerSkus: [productId],
      },
    });
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
    // Amazon FBA inventory is managed by Amazon; MFN sellers update via feeds
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
      priceCents: 0, // Price comes from listings, not catalog
      imageUrl: summary.mainImage?.link,
      category: summary.productType,
      stockLevel: 0, // Requires separate inventory call
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
}
