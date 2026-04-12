/**
 * Beast Bots — E-Commerce Platform Adapter Registry
 *
 * The central factory that returns the correct adapter for any platform.
 * All three agents (Architect, Merchant, Social Bot) use this registry
 * to get a platform-specific adapter and call it through the unified interface.
 *
 * Usage:
 *   const adapter = getEcommerceAdapter("shopify");
 *   const products = await adapter.listProducts(credentials);
 */

export * from "./types";
export { ShopifyAdapter } from "./shopifyAdapter";
export { WooCommerceAdapter } from "./woocommerceAdapter";
export { AmazonAdapter } from "./amazonAdapter";
export { EtsyAdapter } from "./etsyAdapter";
export { EbayAdapter } from "./ebayAdapter";
export { TikTokShopAdapter } from "./tiktokShopAdapter";
export { WalmartAdapter } from "./walmartAdapter";

import type { EcommercePlatformAdapter } from "./types";
import { ShopifyAdapter } from "./shopifyAdapter";
import { WooCommerceAdapter } from "./woocommerceAdapter";
import { AmazonAdapter } from "./amazonAdapter";
import { EtsyAdapter } from "./etsyAdapter";
import { EbayAdapter } from "./ebayAdapter";
import { TikTokShopAdapter } from "./tiktokShopAdapter";
import { WalmartAdapter } from "./walmartAdapter";

// Singleton instances per platform (adapters are stateless)
const adapters: Record<string, EcommercePlatformAdapter> = {
  shopify: new ShopifyAdapter(),
  woocommerce: new WooCommerceAdapter(),
  amazon: new AmazonAdapter(),
  etsy: new EtsyAdapter(),
  ebay: new EbayAdapter(),
  tiktok_shop: new TikTokShopAdapter(),
  walmart: new WalmartAdapter(),
};

/**
 * Get the platform adapter for a given platform identifier.
 * Throws if the platform is not supported.
 */
export function getEcommerceAdapter(platform: string): EcommercePlatformAdapter {
  const adapter = adapters[platform.toLowerCase()];
  if (!adapter) {
    throw new Error(
      `Unsupported e-commerce platform: "${platform}". ` +
      `Supported platforms: ${Object.keys(adapters).join(", ")}`
    );
  }
  return adapter;
}

/**
 * List all supported platform identifiers.
 */
export const SUPPORTED_ECOMMERCE_PLATFORMS = Object.keys(adapters);

export function getSupportedPlatforms(): string[] {
  return SUPPORTED_ECOMMERCE_PLATFORMS;
}

/**
 * Build AdapterCredentials from a platform_credentials DB record.
 * Normalizes the DB schema into the adapter interface format.
 */
export function buildCredentials(record: {
  platform: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  platformAccountId?: string | null;
  metadata?: any;
}, storeRecord?: {
  platformDomain?: string | null;
  platformStoreId?: string | null;
}) {
  const meta = typeof record.metadata === "string"
    ? JSON.parse(record.metadata)
    : record.metadata || {};

  return {
    platform: record.platform,
    accessToken: record.accessToken || undefined,
    refreshToken: record.refreshToken || undefined,
    platformAccountId: record.platformAccountId || undefined,
    apiKey: meta.apiKey || meta.consumerKey || meta.clientId || undefined,
    apiSecret: meta.apiSecret || meta.consumerSecret || meta.clientSecret || undefined,
    storeUrl: storeRecord?.platformDomain || meta.storeUrl || undefined,
    shopDomain: storeRecord?.platformDomain || meta.shopDomain || undefined,
    sellerId: meta.sellerId || undefined,
    marketplaceId: meta.marketplaceId || undefined,
    metadata: meta,
  };
}
export * from "../eliteExtensions";
