/**
 * CJ Dropshipping Supplier Adapter
 *
 * Authentication: email + password → JWT access token (POST /authentication/getAccessToken)
 * Token TTL: ~24 hours; refreshed automatically on 401.
 * Base URL: https://developers.cjdropshipping.com/api2.0/v1
 *
 * Platform routing:
 *   CJ products are general-merchandise dropshipping → best fit for
 *   eBay, Shopify, WooCommerce, BigCommerce, Amazon, Walmart, Bonanza.
 *   NOT recommended for Etsy (handmade policy) or Faire (wholesale B2B).
 */

import { ENV } from "../../_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CJProduct {
  id: string;
  title: string;
  description: string;
  image: string;
  price: number;       // retail/sale price in USD
  cost: number;        // CJ cost price in USD
  currency: string;
  category: string;
  supplier: "cjdropshipping";
  supplierUrl: string;
  tags: string[];
  rating?: number;
  reviews?: number;
  inStock: boolean;
  variants?: CJVariant[];
}

export interface CJVariant {
  variantId: string;
  variantName: string;
  variantSku: string;
  variantPrice: number;
  variantCostPrice: number;
  variantStock: number;
  variantImage?: string;
}

interface CJTokenResponse {
  code: string;
  message: string;
  data: {
    accessToken: string;
    accessTokenExpiryDate: string;
    refreshToken: string;
    refreshTokenExpiryDate: string;
  };
}

interface CJProductRaw {
  pid: string;
  productNameEn: string;
  productImage: string;
  sellPrice: number;
  productWeight: number;
  categoryName: string;
  productType: string;
  variants?: Array<{
    vid: string;
    variantNameEn: string;
    variantSku: string;
    variantSellPrice: number;
    variantCostPrice: number;
    variantStock: number;
    variantImage?: string;
  }>;
}

interface CJSearchResponse {
  code: string;
  message: string;
  data: {
    list: CJProductRaw[];
    total: number;
    pageNum: number;
    pageSize: number;
  };
}

// ─── Platform Routing ─────────────────────────────────────────────────────────

/**
 * Platforms where CJ Dropshipping products are appropriate.
 * Etsy prohibits mass-produced/dropshipped items in most categories.
 * Faire is wholesale B2B — not applicable.
 */
export const CJ_SUPPORTED_PLATFORMS = [
  "shopify", "ebay", "woocommerce", "bigcommerce",
  "amazon", "walmart", "bonanza", "tiktok_shop", "square",
] as const;

export type CJSupportedPlatform = (typeof CJ_SUPPORTED_PLATFORMS)[number];

export function isCJSupportedPlatform(platform: string): boolean {
  return CJ_SUPPORTED_PLATFORMS.includes(platform.toLowerCase() as CJSupportedPlatform);
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class CJAdapter {
  private readonly baseUrl = "https://developers.cjdropshipping.com/api2.0/v1";
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  // ── Auth ──────────────────────────────────────────────────────────────────

  private async authenticate(): Promise<string> {
    const email = ENV.cjEmail;
    const password = ENV.cjPassword;

    if (!email || !password) {
      throw new Error(
        "CJ Dropshipping credentials not configured. " +
        "Set CJ_EMAIL and CJ_PASSWORD in your project secrets.",
      );
    }

    const response = await fetch(`${this.baseUrl}/authentication/getAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error(`CJ auth failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as CJTokenResponse;
    if (data.code !== "200" || !data.data?.accessToken) {
      throw new Error(`CJ auth error: ${data.message}`);
    }

    this.accessToken = data.data.accessToken;
    this.tokenExpiry = new Date(data.data.accessTokenExpiryDate);
    return this.accessToken;
  }

  private async getToken(): Promise<string> {
    const now = new Date();
    if (
      !this.accessToken ||
      !this.tokenExpiry ||
      this.tokenExpiry.getTime() - now.getTime() < 5 * 60 * 1000
    ) {
      return this.authenticate();
    }
    return this.accessToken;
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const token = await this.getToken();
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const doRequest = async (tok: string) =>
      fetch(url.toString(), {
        headers: {
          "CJ-Access-Token": tok,
          "Content-Type": "application/json",
        },
      });

    let res = await doRequest(token);

    if (res.status === 401) {
      this.accessToken = null;
      const freshToken = await this.getToken();
      res = await doRequest(freshToken);
    }

    if (!res.ok) {
      throw new Error(`CJ API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Product Helpers ───────────────────────────────────────────────────────

  private mapProduct(raw: CJProductRaw): CJProduct {
    const cost = raw.variants?.[0]?.variantCostPrice ?? raw.sellPrice * 0.5;
    const price = raw.variants?.[0]?.variantSellPrice ?? raw.sellPrice;

    return {
      id: raw.pid,
      title: raw.productNameEn,
      description: `${raw.productNameEn} — ${raw.categoryName}. Sourced via CJ Dropshipping with fast worldwide shipping.`,
      image: raw.productImage,
      price,
      cost,
      currency: "USD",
      category: raw.categoryName,
      supplier: "cjdropshipping",
      supplierUrl: `https://app.cjdropshipping.com/product-detail.html?id=${raw.pid}`,
      tags: this.extractTags(raw.productNameEn, raw.categoryName),
      inStock: (raw.variants?.[0]?.variantStock ?? 1) > 0,
      variants: raw.variants?.map((v) => ({
        variantId: v.vid,
        variantName: v.variantNameEn,
        variantSku: v.variantSku,
        variantPrice: v.variantSellPrice,
        variantCostPrice: v.variantCostPrice,
        variantStock: v.variantStock,
        variantImage: v.variantImage,
      })),
    };
  }

  private extractTags(title: string, category: string): string[] {
    const tags = [category.toLowerCase()];
    const words = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    tags.push(...words.slice(0, 4));
    return Array.from(new Set(tags));
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Search CJ Dropshipping catalog by keyword.
   * Returns empty array (not throws) when credentials are missing,
   * so the workflow can fall back to Printful-only gracefully.
   */
  async searchProducts(
    keyword: string,
    limit = 20,
    category?: string,
  ): Promise<CJProduct[]> {
    if (!ENV.cjEmail || !ENV.cjPassword) {
      console.warn("[CJ] Credentials not configured — skipping CJ search");
      return [];
    }

    try {
      const params: Record<string, string> = {
        productNameEn: keyword,
        pageNum: "1",
        pageSize: String(Math.min(limit, 100)),
      };
      if (category) params.categoryName = category;

      const data = await this.get<CJSearchResponse>("/product/list", params);

      if (data.code !== "200" || !data.data?.list) {
        console.warn(`[CJ] Search returned no results: ${data.message}`);
        return [];
      }

      return data.data.list.slice(0, limit).map((p) => this.mapProduct(p));
    } catch (error: any) {
      console.error(`[CJ] searchProducts error: ${error?.message ?? error}`);
      return []; // graceful degradation
    }
  }

  /**
   * Get a single product by ID.
   */
  async getProduct(productId: string): Promise<CJProduct | null> {
    if (!ENV.cjEmail || !ENV.cjPassword) return null;

    try {
      const data = await this.get<{ code: string; message: string; data: CJProductRaw }>(
        "/product/query",
        { pid: productId },
      );

      if (data.code !== "200" || !data.data) return null;
      return this.mapProduct(data.data);
    } catch (error: any) {
      console.error(`[CJ] getProduct error: ${error?.message ?? error}`);
      return null;
    }
  }

  /**
   * Get trending / best-selling products.
   */
  async getTrendingProducts(limit = 20): Promise<CJProduct[]> {
    if (!ENV.cjEmail || !ENV.cjPassword) return [];

    try {
      const data = await this.get<CJSearchResponse>("/product/list", {
        pageNum: "1",
        pageSize: String(Math.min(limit, 100)),
        isSortByOrders: "true",
      });

      if (data.code !== "200" || !data.data?.list) return [];
      return data.data.list.slice(0, limit).map((p) => this.mapProduct(p));
    } catch (error: any) {
      console.error(`[CJ] getTrendingProducts error: ${error?.message ?? error}`);
      return [];
    }
  }

  /**
   * Browse products by category name.
   */
  async browseByCategory(category: string, limit = 20): Promise<CJProduct[]> {
    return this.searchProducts("", limit, category);
  }

  /**
   * Calculate profit margin for a product given a markup percentage.
   */
  calculateMargin(
    product: CJProduct,
    markupPercent = 100,
  ): { retailPrice: number; profit: number; margin: number } {
    const retailPrice = product.cost * (1 + markupPercent / 100);
    const profit = retailPrice - product.cost;
    const margin = (profit / retailPrice) * 100;
    return {
      retailPrice: Math.round(retailPrice * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin: Math.round(margin * 10) / 10,
    };
  }

  /**
   * Check if CJ credentials are configured and working.
   */
  async isAvailable(): Promise<boolean> {
    if (!ENV.cjEmail || !ENV.cjPassword) return false;
    try {
      await this.getToken();
      return true;
    } catch {
      return false;
    }
  }
}

export const cjAdapter = new CJAdapter();
