/**
 * Shop_a_Bot — Unified E-Commerce Platform Adapter Interface
 *
 * Every e-commerce platform adapter implements this interface so that
 * The Architect, Merchant, and Social Bot agents can operate across
 * Shopify, WooCommerce, Amazon, Etsy, eBay, TikTok Shop, and Walmart
 * through a single, consistent contract.
 */

/**
 * Per-request HTTP timeout for platform adapter calls. Long enough to
 * tolerate slow upstreams (image-heavy product fetches, paginated catalog
 * sweeps) but short enough that a hung connection cannot pin a worker
 * thread or stall a webhook job. The retry policy on top will give us
 * total wall time = ADAPTER_HTTP_TIMEOUT_MS × maxRetries.
 */
export const ADAPTER_HTTP_TIMEOUT_MS = 30_000;

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

// ─── Per-Platform Capability Matrix ────────────────────────────────────────
//
// Each adapter exposes a `getCapabilities()` method returning a typed
// PlatformCapabilities record. Bots use this to:
//   1. Branch their workflow plan on what the platform actually supports
//      (Builder skips theme-scaffolding on platforms that don't have themes,
//      Merchant uses Buy-Box monitoring only on marketplaces, etc.)
//   2. Tune their performance — pull `recommendedBatchSize` to size paginated
//      catalog sweeps, pull `rateLimitTokensPerSec` to set per-platform leaky
//      buckets without hard-coding magic numbers.
//   3. Surface honest copy in the UI ("Coming soon" tile picks language from
//      `strengths`/`limitations` rather than maintaining a parallel doc).
//
// The matrix is the single source of truth for "what does this integration
// do?" — replacing scattered if-platform-is-shopify checks throughout the
// engine layer.
export interface PlatformCapabilities {
  // ── Catalog ────────────────────────────────────────────────────────────
  /** Multi-variant products (size/color/etc.) */
  variants: boolean;
  /** Shopify-style key/value metafields for SEO + custom data */
  metafields: boolean;
  /** Bulk-import via CSV/batch endpoint (vs. one-at-a-time creates) */
  bulkImport: boolean;
  /** Hard limit imposed by the platform for product images */
  maxImagesPerProduct: number;
  /** Categories / collections / sections. true if the platform has any
   *  built-in taxonomy concept the bot can plug products into. */
  categories: boolean;

  // ── Orders + Fulfillment ───────────────────────────────────────────────
  /** Platform pushes events via webhooks (vs. poll-only) */
  webhooks: boolean;
  /** Subset of webhook event types the platform reliably fires */
  webhookEvents: string[];
  /** Bot can mark orders fulfilled programmatically */
  autoFulfillment: boolean;
  /** Bot can fulfill a subset of line items per order */
  partialFulfillment: boolean;
  /** Inventory levels reflect in <1 minute (vs. eventual / hourly) */
  realTimeInventory: boolean;

  // ── Pricing ────────────────────────────────────────────────────────────
  compareAtPrice: boolean;
  bulkPriceUpdate: boolean;
  /** Platform supports its own scheduled-sale primitive (no cron needed) */
  scheduledSale: boolean;

  // ── Performance hints (per-integration tuning) ─────────────────────────
  /** How many products / orders the bot should fetch per page on this
   *  platform — picked to balance latency vs. throughput vs. rate limits. */
  recommendedBatchSize: number;
  /** Sustained rate the bot should aim for. Bots feed this into a leaky
   *  bucket so a burst of activity in one org doesn't drain the entire
   *  platform's rate budget for everyone else. */
  rateLimitTokensPerSec: number;

  // ── Discovery / business model ─────────────────────────────────────────
  /** Where the platform sits in the e-commerce landscape — affects which
   *  bot workflows are even relevant ("storefront" gets store-setup,
   *  "marketplace" gets Buy-Box monitoring). */
  category: "marketplace" | "storefront" | "social_commerce";
  feeStructure: "subscription" | "commission" | "hybrid" | "free";

  // ── Bot-readable summary ───────────────────────────────────────────────
  /** Short bullets the LLM can quote in workflow plans. */
  strengths: string[];
  limitations: string[];
}

// ─── Core Adapter Interface ────────────────────────────────────────────────

export interface EcommercePlatformAdapter {
  readonly platform: string;
  readonly platformName: string;

  /** Per-integration capability + performance matrix. See
   *  PlatformCapabilities — bots branch on this rather than hardcoding
   *  per-platform behavior. */
  getCapabilities(): PlatformCapabilities;

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
