/**
 * Printful Supplier Adapter
 *
 * Authentication: Bearer token (PRINTFUL_API_TOKEN)
 * Base URL: https://api.printful.com
 *
 * Platform routing:
 *   Printful is print-on-demand → best fit for Etsy, Shopify, WooCommerce,
 *   BigCommerce, eBay, TikTok Shop, Faire (curated goods).
 *   Works on most platforms — Printful has native integrations with Shopify,
 *   Etsy, eBay, WooCommerce, BigCommerce, TikTok Shop.
 *
 * Printful Catalog API:
 *   GET /catalog/products          — list all catalog products
 *   GET /catalog/products/:id      — get single product with variants
 *   GET /catalog/variants/:id      — get variant details
 *
 * Note: The catalog endpoint returns ALL products (300+). We filter by keyword
 * client-side since the API doesn't support server-side keyword search.
 * We cache the catalog in memory for 1 hour to avoid hammering the API.
 */

import { ENV } from "../../_core/env";
import { logger } from "../../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrintfulProduct {
  id: number;
  title: string;
  description: string;
  image: string;
  price: number;        // base price in USD (lowest variant)
  currency: string;
  supplier: "printful";
  supplierUrl: string;
  category: string;
  tags: string[];
  variants?: PrintfulVariant[];
  techniques?: string[];  // e.g. ["DTG", "Embroidery"]
}

export interface PrintfulVariant {
  id: number;
  name: string;
  size?: string;
  color?: string;
  price: number;
  currency: string;
  inStock: boolean;
  image?: string;
}

interface PrintfulCatalogItem {
  id: number;
  main_category_id: number;
  type: string;
  type_name: string;
  title: string;
  brand: string | null;
  model: string;
  image: string;
  variant_count: number;
  currency: string;
  options: Array<{ id: string; title: string; type: string; values: Record<string, string> }>;
  dimensions: Record<string, string> | null;
  is_discontinued: boolean;
  avg_fulfillment_time: number | null;
  description: string;
  techniques: Array<{ key: string; display_name: string; is_default: boolean }>;
  files: Array<{ id: string; type: string; title: string; additional_price: string | null }>;
  variants: Array<{
    id: number;
    catalog_product_id: number;
    name: string;
    size: string;
    color: string;
    color_code: string;
    color_code2: string | null;
    image: string;
    price: string;
    in_stock: boolean;
    availability_regions: Record<string, string>;
    availability_status: Array<{ region: string; status: string }>;
    material: Array<{ name: string; percentage: number }>;
  }>;
}

interface PrintfulCatalogResponse {
  code: number;
  result: PrintfulCatalogItem[];
  extra: unknown[];
  paging: { total: number; offset: number; limit: number };
}

// ─── Platform Routing ─────────────────────────────────────────────────────────

/**
 * Platforms where Printful (POD) products are appropriate.
 */
export const PRINTFUL_SUPPORTED_PLATFORMS = [
  "shopify", "etsy", "ebay", "woocommerce", "bigcommerce",
  "tiktok_shop", "faire", "bonanza", "square",
] as const;

export type PrintfulSupportedPlatform = (typeof PRINTFUL_SUPPORTED_PLATFORMS)[number];

export function isPrintfulSupportedPlatform(platform: string): boolean {
  return PRINTFUL_SUPPORTED_PLATFORMS.includes(platform.toLowerCase() as PrintfulSupportedPlatform);
}

// ─── Category → Keyword mapping ───────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  apparel: ["t-shirt", "hoodie", "sweatshirt", "tank", "polo", "jacket", "leggings"],
  accessories: ["hat", "cap", "beanie", "bag", "tote", "backpack", "fanny"],
  home: ["mug", "pillow", "blanket", "poster", "canvas", "frame", "towel"],
  stationery: ["notebook", "journal", "sticker", "card", "calendar"],
  kids: ["onesie", "kids", "youth", "baby", "toddler"],
  pet: ["dog", "cat", "pet", "collar", "bandana"],
};

function getCategoryFromKeyword(keyword: string): string {
  const kw = keyword.toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => kw.includes(w))) return cat;
  }
  return "apparel"; // default
}

// ─── Catalog Cache ────────────────────────────────────────────────────────────

let catalogCache: PrintfulCatalogItem[] | null = null;
let catalogCacheExpiry: number = 0;
const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class PrintfulAdapter {
  private readonly baseUrl = "https://api.printful.com";

  private get token(): string {
    return ENV.printfulApiToken;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  // ── Catalog Cache ─────────────────────────────────────────────────────────

  /**
   * Fetch and cache the full Printful catalog.
   * The catalog has ~300+ products; we cache it to avoid repeated API calls.
   */
  private async getCatalog(): Promise<PrintfulCatalogItem[]> {
    const now = Date.now();
    if (catalogCache && now < catalogCacheExpiry) {
      return catalogCache;
    }

    if (!this.token) {
      throw new Error("Printful API token not configured. Set PRINTFUL_API_TOKEN in secrets.");
    }

    // Fetch in pages of 100
    const allProducts: PrintfulCatalogItem[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const res = await fetch(
        `${this.baseUrl}/catalog/products?limit=${limit}&offset=${offset}`,
        { headers: this.headers },
      );

      if (!res.ok) {
        throw new Error(`Printful catalog error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as PrintfulCatalogResponse;
      allProducts.push(...data.result);

      if (allProducts.length >= data.paging.total || data.result.length < limit) {
        break;
      }
      offset += limit;
    }

    catalogCache = allProducts;
    catalogCacheExpiry = now + CATALOG_CACHE_TTL_MS;
    return allProducts;
  }

  // ── Product Helpers ───────────────────────────────────────────────────────

  private mapProduct(item: PrintfulCatalogItem): PrintfulProduct {
    const prices = item.variants
      .map((v) => parseFloat(v.price))
      .filter((p) => !isNaN(p) && p > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

    return {
      id: item.id,
      title: item.title,
      description: item.description || `${item.title} — premium print-on-demand product by Printful.`,
      image: item.image,
      price: minPrice,
      currency: item.currency || "USD",
      supplier: "printful",
      supplierUrl: `https://www.printful.com/products/${item.id}`,
      category: this.mapCategory(item.type_name),
      tags: this.extractTags(item.title, item.type_name),
      techniques: item.techniques?.map((t) => t.display_name) ?? [],
      variants: item.variants.slice(0, 10).map((v) => ({
        id: v.id,
        name: v.name,
        size: v.size,
        color: v.color,
        price: parseFloat(v.price) || 0,
        currency: item.currency || "USD",
        inStock: v.in_stock,
        image: v.image,
      })),
    };
  }

  private mapCategory(typeName: string): string {
    const tn = typeName.toLowerCase();
    if (tn.includes("shirt") || tn.includes("hoodie") || tn.includes("apparel") || tn.includes("sweatshirt")) return "apparel";
    if (tn.includes("mug") || tn.includes("home") || tn.includes("pillow") || tn.includes("blanket")) return "home";
    if (tn.includes("hat") || tn.includes("cap") || tn.includes("bag") || tn.includes("accessory")) return "accessories";
    if (tn.includes("poster") || tn.includes("canvas") || tn.includes("art") || tn.includes("print")) return "wall art";
    if (tn.includes("sticker") || tn.includes("notebook") || tn.includes("journal")) return "stationery";
    if (tn.includes("kids") || tn.includes("baby") || tn.includes("youth")) return "kids";
    return typeName;
  }

  private extractTags(title: string, typeName: string): string[] {
    const tags = [typeName.toLowerCase()];
    const words = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2);
    tags.push(...words.slice(0, 4));
    return Array.from(new Set(tags));
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Search Printful catalog by keyword.
   * Fetches full catalog (cached) and filters client-side.
   * Returns empty array (not throws) when token is missing.
   */
  async searchProducts(keyword: string, limit = 20): Promise<PrintfulProduct[]> {
    if (!this.token) {
      logger.warn("printful_credentials_missing", {
        module: "printfulAdapter",
        action: "search_skipped",
      });
      return [];
    }

    try {
      const catalog = await this.getCatalog();
      const kw = keyword.toLowerCase();

      // Score each product by relevance
      const scored = catalog
        .filter((item) => !item.is_discontinued)
        .map((item) => {
          const titleMatch = item.title.toLowerCase().includes(kw) ? 3 : 0;
          const typeMatch = item.type_name.toLowerCase().includes(kw) ? 2 : 0;
          const descMatch = (item.description || "").toLowerCase().includes(kw) ? 1 : 0;
          // Also check category keyword mapping
          const catKeywords = CATEGORY_KEYWORDS[getCategoryFromKeyword(kw)] ?? [];
          const catMatch = catKeywords.some((w) => item.title.toLowerCase().includes(w)) ? 1 : 0;
          return { item, score: titleMatch + typeMatch + descMatch + catMatch };
        })
        .filter((s) => s.score > 0 || kw === "" || kw === "trending" || kw === "general")
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // If no keyword matches, return top products by variant count (popularity proxy)
      if (scored.length === 0) {
        return catalog
          .filter((item) => !item.is_discontinued)
          .sort((a, b) => b.variant_count - a.variant_count)
          .slice(0, limit)
          .map((item) => this.mapProduct(item));
      }

      return scored.map((s) => this.mapProduct(s.item));
    } catch (error: any) {
      logger.error("printful_search_failed", {
        module: "printfulAdapter",
        error: error?.message ?? String(error),
      });
      return [];
    }
  }

  /**
   * Get a single product by ID with full variant details.
   */
  async getProduct(productId: number): Promise<PrintfulProduct | null> {
    if (!this.token) return null;

    try {
      const res = await fetch(`${this.baseUrl}/catalog/products/${productId}`, {
        headers: this.headers,
      });

      if (!res.ok) return null;

      const data = (await res.json()) as { code: number; result: { product: PrintfulCatalogItem; variants: PrintfulCatalogItem["variants"] } };
      if (data.code !== 200 || !data.result?.product) return null;

      const item = { ...data.result.product, variants: data.result.variants };
      return this.mapProduct(item);
    } catch (error: any) {
      logger.error("printful_get_product_failed", {
        module: "printfulAdapter",
        error: error?.message ?? String(error),
      });
      return null;
    }
  }

  /**
   * Get trending products (most popular by variant count).
   */
  async getTrendingProducts(limit = 20): Promise<PrintfulProduct[]> {
    if (!this.token) return [];

    try {
      const catalog = await this.getCatalog();
      return catalog
        .filter((item) => !item.is_discontinued)
        .sort((a, b) => b.variant_count - a.variant_count)
        .slice(0, limit)
        .map((item) => this.mapProduct(item));
    } catch (error: any) {
      logger.error("printful_trending_failed", {
        module: "printfulAdapter",
        error: error?.message ?? String(error),
      });
      return [];
    }
  }

  /**
   * Browse products by category.
   */
  async browseByCategory(category: string, limit = 20): Promise<PrintfulProduct[]> {
    return this.searchProducts(category, limit);
  }

  /**
   * Check if Printful is configured and available.
   */
  async isAvailable(): Promise<boolean> {
    return !!this.token;
  }

  /**
   * Clear the catalog cache (useful for testing).
   */
  clearCache(): void {
    catalogCache = null;
    catalogCacheExpiry = 0;
  }
}

export const printfulAdapter = new PrintfulAdapter();
