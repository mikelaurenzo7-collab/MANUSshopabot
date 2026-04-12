/**
 * ShopBOTS — Unified E-Commerce Platform Adapter Interface
 *
 * Every e-commerce platform adapter implements this interface so that
 * The Architect, Merchant, and Social Bot agents can operate across
 * Shopify, WooCommerce, Amazon, Etsy, eBay, TikTok Shop, and Walmart
 * through a single, consistent contract.
 */

// ─── Shared Types ──────────────────────────────────────────────────────────

export interface PlatformProduct {
  platformId: string;
  title: string;
  description?: string;
  priceCents: number;
  comparePriceCents?: number;
  sku?: string;
  imageUrl?: string;
  category?: string;
  stockLevel: number;
  status: "active" | "draft" | "archived";
  url?: string;
  metadata?: Record<string, any>;
}

export interface CreateProductInput {
  title: string;
  description?: string;
  priceCents: number;
  comparePriceCents?: number;
  sku?: string;
  imageUrl?: string;
  category?: string;
  stockLevel?: number;
  metadata?: Record<string, any>;
}

export interface UpdateProductInput {
  title?: string;
  description?: string;
  priceCents?: number;
  comparePriceCents?: number;
  stockLevel?: number;
  status?: "active" | "draft" | "archived";
  metadata?: Record<string, any>;
}

export interface PlatformOrder {
  platformId: string;
  orderNumber: string;
  customerName?: string;
  customerEmail?: string;
  totalCents: number;
  currency: string;
  status: "pending" | "processing" | "fulfilled" | "shipped" | "delivered" | "cancelled" | "refunded";
  fulfillmentStatus: "unfulfilled" | "partial" | "fulfilled";
  lineItems: OrderLineItem[];
  shippingAddress?: ShippingAddress;
  trackingNumber?: string;
  trackingUrl?: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface OrderLineItem {
  productId: string;
  title: string;
  quantity: number;
  priceCents: number;
  sku?: string;
}

export interface ShippingAddress {
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface FulfillmentInput {
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
  notifyCustomer?: boolean;
}

export interface InventoryLevel {
  productId: string;
  sku?: string;
  available: number;
  committed?: number;
  incoming?: number;
}

export interface StoreInfo {
  platformId: string;
  name: string;
  domain?: string;
  currency: string;
  timezone?: string;
  plan?: string;
  status: "active" | "suspended" | "closed";
}

export interface ListParams {
  limit?: number;
  offset?: number;
  page?: number;
  status?: string;
  since?: Date;
}

export interface AdapterCredentials {
  platform: string;
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  apiSecret?: string;
  storeUrl?: string;
  shopDomain?: string;
  sellerId?: string;
  marketplaceId?: string;
  platformAccountId?: string;
  metadata?: Record<string, any>;
}

// ─── Core Adapter Interface ────────────────────────────────────────────────

export interface EcommercePlatformAdapter {
  readonly platform: string;
  readonly platformName: string;

  /** Verify credentials are valid and return store info */
  verifyConnection(credentials: AdapterCredentials): Promise<StoreInfo>;

  /** List products in the store */
  listProducts(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformProduct[]>;

  /** Get a single product by platform ID */
  getProduct(credentials: AdapterCredentials, productId: string): Promise<PlatformProduct>;

  /** Create a new product */
  createProduct(credentials: AdapterCredentials, product: CreateProductInput): Promise<PlatformProduct>;

  /** Update an existing product */
  updateProduct(credentials: AdapterCredentials, productId: string, updates: UpdateProductInput): Promise<PlatformProduct>;

  /** Delete/archive a product */
  deleteProduct(credentials: AdapterCredentials, productId: string): Promise<void>;

  /** List orders */
  listOrders(credentials: AdapterCredentials, params?: ListParams): Promise<PlatformOrder[]>;

  /** Get a single order by platform ID */
  getOrder(credentials: AdapterCredentials, orderId: string): Promise<PlatformOrder>;

  /** Fulfill an order */
  fulfillOrder(credentials: AdapterCredentials, orderId: string, fulfillment: FulfillmentInput): Promise<void>;

  /** Get inventory levels for a product */
  getInventory(credentials: AdapterCredentials, productId: string): Promise<InventoryLevel>;

  /** Update inventory quantity */
  updateInventory(credentials: AdapterCredentials, productId: string, quantity: number): Promise<void>;

  /** Get store information */
  getStoreInfo(credentials: AdapterCredentials): Promise<StoreInfo>;

  /** Health check — verify credentials are still valid without heavy API calls */
  healthCheck(credentials: AdapterCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }>;
}
