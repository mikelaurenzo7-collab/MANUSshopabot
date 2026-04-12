/**
 * WooCommerce Platform Adapter
 * Uses @woocommerce/woocommerce-rest-api for REST API v3 access.
 * Connects via Consumer Key + Consumer Secret (API key auth).
 */

import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
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

export class WooCommerceAdapter implements EcommercePlatformAdapter {
  readonly platform = "woocommerce";
  readonly platformName = "WooCommerce";

  private getClient(credentials: AdapterCredentials) {
    const url = credentials.storeUrl || "";
    return new WooCommerceRestApi({
      url: url.startsWith("http") ? url : `https://${url}`,
      consumerKey: credentials.apiKey || "",
      consumerSecret: credentials.apiSecret || "",
      version: "wc/v3",
    });
  }

  async verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo> {
    const api = this.getClient(credentials);
    const response = await api.get("system_status");
    const data = response.data;
    return {
      platformId: data.environment?.site_url || credentials.storeUrl || "unknown",
      name: data.settings?.blog_name || "WooCommerce Store",
      domain: credentials.storeUrl,
      currency: data.settings?.currency || "USD",
      timezone: data.settings?.timezone || undefined,
      status: "active",
    };
  }

  async listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]> {
    const api = this.getClient(credentials);
    const response = await api.get("products", {
      per_page: params?.limit || 50,
      page: params?.page || 1,
      status: params?.status || "publish",
    });
    return (response.data || []).map((p: any) => this.mapProduct(p));
  }

  async getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct> {
    const api = this.getClient(credentials);
    const response = await api.get(`products/${productId}`);
    return this.mapProduct(response.data);
  }

  async createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct> {
    const api = this.getClient(credentials);
    const response = await api.post("products", {
      name: product.title,
      description: product.description,
      regular_price: (product.priceCents / 100).toFixed(2),
      sale_price: product.comparePriceCents ? (product.comparePriceCents / 100).toFixed(2) : undefined,
      sku: product.sku,
      images: product.imageUrl ? [{ src: product.imageUrl }] : [],
      categories: product.category ? [{ name: product.category }] : [],
      manage_stock: true,
      stock_quantity: product.stockLevel || 0,
      status: "draft",
    });
    return this.mapProduct(response.data);
  }

  async updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct> {
    const api = this.getClient(credentials);
    const body: any = {};
    if (updates.title) body.name = updates.title;
    if (updates.description) body.description = updates.description;
    if (updates.priceCents !== undefined) body.regular_price = (updates.priceCents / 100).toFixed(2);
    if (updates.stockLevel !== undefined) body.stock_quantity = updates.stockLevel;
    if (updates.status) body.status = updates.status === "active" ? "publish" : updates.status;
    const response = await api.put(`products/${productId}`, body);
    return this.mapProduct(response.data);
  }

  async deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void> {
    const api = this.getClient(credentials);
    await api.delete(`products/${productId}`, { force: true });
  }

  async listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]> {
    const api = this.getClient(credentials);
    const response = await api.get("orders", {
      per_page: params?.limit || 50,
      page: params?.page || 1,
    });
    return (response.data || []).map((o: any) => this.mapOrder(o));
  }

  async getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder> {
    const api = this.getClient(credentials);
    const response = await api.get(`orders/${orderId}`);
    return this.mapOrder(response.data);
  }

  async fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void> {
    const api = this.getClient(credentials);
    // Update order status to completed + add tracking note
    await api.put(`orders/${orderId}`, {
      status: "completed",
      customer_note: fulfillment.trackingNumber
        ? `Tracking: ${fulfillment.trackingNumber}${fulfillment.carrier ? ` via ${fulfillment.carrier}` : ""}`
        : "Order fulfilled",
    });
  }

  async getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel> {
    const product = await this.getProduct(credentials, productId);
    return {
      productId,
      available: product.stockLevel,
    };
  }

  async updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void> {
    const api = this.getClient(credentials);
    await api.put(`products/${productId}`, {
      manage_stock: true,
      stock_quantity: quantity,
    });
  }

  async getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo> {
    return this.verifyConnection(credentials);
  }

  private mapProduct(p: any): PlatformProduct {
    return {
      platformId: String(p.id),
      title: p.name,
      description: p.description,
      priceCents: Math.round(parseFloat(p.regular_price || p.price || "0") * 100),
      comparePriceCents: p.sale_price ? Math.round(parseFloat(p.sale_price) * 100) : undefined,
      sku: p.sku,
      imageUrl: p.images?.[0]?.src,
      category: p.categories?.[0]?.name,
      stockLevel: p.stock_quantity || 0,
      status: p.status === "publish" ? "active" : p.status === "trash" ? "archived" : "draft",
    };
  }

  private mapOrder(o: any): PlatformOrder {
    return {
      platformId: String(o.id),
      orderNumber: String(o.number),
      customerName: `${o.billing?.first_name || ""} ${o.billing?.last_name || ""}`.trim(),
      customerEmail: o.billing?.email,
      totalCents: Math.round(parseFloat(o.total || "0") * 100),
      currency: o.currency || "USD",
      status: this.mapOrderStatus(o.status),
      fulfillmentStatus: o.status === "completed" ? "fulfilled" : "unfulfilled",
      lineItems: (o.line_items || []).map((li: any) => ({
        productId: String(li.product_id),
        title: li.name,
        quantity: li.quantity,
        priceCents: Math.round(parseFloat(li.price || "0") * 100),
        sku: li.sku,
      })),
      shippingAddress: o.shipping ? {
        name: `${o.shipping.first_name} ${o.shipping.last_name}`.trim(),
        address1: o.shipping.address_1,
        address2: o.shipping.address_2,
        city: o.shipping.city,
        state: o.shipping.state,
        zip: o.shipping.postcode,
        country: o.shipping.country,
      } : undefined,
      createdAt: new Date(o.date_created),
    };
  }

  private mapOrderStatus(status: string): PlatformOrder["status"] {
    switch (status) {
      case "processing": return "processing";
      case "completed": return "fulfilled";
      case "cancelled": return "cancelled";
      case "refunded": return "refunded";
      case "shipped": return "shipped";
      default: return "pending";
    }
  }
}
