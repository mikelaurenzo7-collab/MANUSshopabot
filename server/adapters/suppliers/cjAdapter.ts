import { ENV } from "../../_core/env";

export interface CJProduct {
  id: string;
  title: string;
  description: string;
  image: string;
  price: number;
  cost: number;
  currency: string;
  category: string;
  supplier: "cjdropshipping";
  supplierUrl: string;
  tags: string[];
  rating?: number;
  reviews?: number;
  inStock: boolean;
}

export interface CJSearchResponse {
  code: number;
  msg: string;
  data: {
    products: Array<{
      productId: string;
      productTitle: string;
      productImg: string;
      salePrice: number;
      costPrice: number;
      productCategory: string;
      productRating?: number;
      productReviews?: number;
      stock: number;
    }>;
  };
}

/**
 * CJ Dropshipping Supplier Adapter
 * Searches real dropshipping products from CJ Dropshipping catalog
 * Uses API key authentication
 */
export class CJAdapter {
  private apiKey: string;
  private baseUrl = "https://api.cjdropshipping.com/v2";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || ENV.cjApiKey;
  }

  /**
   * Search CJ Dropshipping catalog by keyword
   */
  async searchProducts(keyword: string, limit = 20, category?: string): Promise<CJProduct[]> {
    if (!this.apiKey) {
      throw new Error("CJ Dropshipping API key not configured");
    }

    try {
      const params = new URLSearchParams({
        keyword,
        pageSize: Math.min(limit, 100).toString(),
        pageNo: "1",
        ...(category && { category }),
      });

      const response = await fetch(`${this.baseUrl}/products/search?${params}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`CJ API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as CJSearchResponse;

      if (data.code !== 0 || !data.data?.products) {
        throw new Error(`CJ API error: ${data.msg}`);
      }

      return data.data.products.map((product) => ({
        id: product.productId,
        title: product.productTitle,
        description: `CJ Dropshipping product - ${product.productCategory}`,
        image: product.productImg,
        price: product.salePrice,
        cost: product.costPrice,
        currency: "USD",
        category: product.productCategory,
        supplier: "cjdropshipping" as const,
        supplierUrl: `https://www.cjdropshipping.com/product/${product.productId}`,
        tags: this.extractTags(product.productTitle, product.productCategory),
        rating: product.productRating,
        reviews: product.productReviews,
        inStock: product.stock > 0,
      }));
    } catch (error) {
      console.error("[CJ] Search error:", error);
      throw error;
    }
  }

  /**
   * Get product details by ID
   */
  async getProduct(productId: string): Promise<CJProduct | null> {
    if (!this.apiKey) {
      throw new Error("CJ Dropshipping API key not configured");
    }

    try {
      const response = await fetch(`${this.baseUrl}/products/${productId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { code: number; data: { product: CJSearchResponse["data"]["products"][0] } };

      if (data.code !== 0 || !data.data?.product) {
        return null;
      }

      const product = data.data.product;

      return {
        id: product.productId,
        title: product.productTitle,
        description: `CJ Dropshipping product - ${product.productCategory}`,
        image: product.productImg,
        price: product.salePrice,
        cost: product.costPrice,
        currency: "USD",
        category: product.productCategory,
        supplier: "cjdropshipping" as const,
        supplierUrl: `https://www.cjdropshipping.com/product/${product.productId}`,
        tags: this.extractTags(product.productTitle, product.productCategory),
        rating: product.productRating,
        reviews: product.productReviews,
        inStock: product.stock > 0,
      };
    } catch (error) {
      console.error("[CJ] Get product error:", error);
      return null;
    }
  }

  /**
   * Browse products by category
   */
  async browseByCategory(category: string, limit = 20): Promise<CJProduct[]> {
    if (!this.apiKey) {
      throw new Error("CJ Dropshipping API key not configured");
    }

    try {
      const params = new URLSearchParams({
        category,
        pageSize: Math.min(limit, 100).toString(),
        pageNo: "1",
      });

      const response = await fetch(`${this.baseUrl}/products/category?${params}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`CJ API error: ${response.status}`);
      }

      const data = (await response.json()) as CJSearchResponse;

      if (data.code !== 0 || !data.data?.products) {
        throw new Error(`CJ API error: ${data.msg}`);
      }

      return data.data.products.map((product) => ({
        id: product.productId,
        title: product.productTitle,
        description: `CJ Dropshipping product - ${product.productCategory}`,
        image: product.productImg,
        price: product.salePrice,
        cost: product.costPrice,
        currency: "USD",
        category: product.productCategory,
        supplier: "cjdropshipping" as const,
        supplierUrl: `https://www.cjdropshipping.com/product/${product.productId}`,
        tags: this.extractTags(product.productTitle, product.productCategory),
        rating: product.productRating,
        reviews: product.productReviews,
        inStock: product.stock > 0,
      }));
    } catch (error) {
      console.error("[CJ] Browse category error:", error);
      throw error;
    }
  }

  /**
   * Get trending/best-selling products
   */
  async getTrendingProducts(limit = 20): Promise<CJProduct[]> {
    if (!this.apiKey) {
      throw new Error("CJ Dropshipping API key not configured");
    }

    try {
      const params = new URLSearchParams({
        sort: "sales",
        pageSize: Math.min(limit, 100).toString(),
        pageNo: "1",
      });

      const response = await fetch(`${this.baseUrl}/products/trending?${params}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`CJ API error: ${response.status}`);
      }

      const data = (await response.json()) as CJSearchResponse;

      if (data.code !== 0 || !data.data?.products) {
        throw new Error(`CJ API error: ${data.msg}`);
      }

      return data.data.products.map((product) => ({
        id: product.productId,
        title: product.productTitle,
        description: `CJ Dropshipping product - ${product.productCategory}`,
        image: product.productImg,
        price: product.salePrice,
        cost: product.costPrice,
        currency: "USD",
        category: product.productCategory,
        supplier: "cjdropshipping" as const,
        supplierUrl: `https://www.cjdropshipping.com/product/${product.productId}`,
        tags: this.extractTags(product.productTitle, product.productCategory),
        rating: product.productRating,
        reviews: product.productReviews,
        inStock: product.stock > 0,
      }));
    } catch (error) {
      console.error("[CJ] Trending products error:", error);
      throw error;
    }
  }

  /**
   * Calculate profit margin
   */
  calculateMargin(product: CJProduct, markupPercent = 100): { retailPrice: number; profit: number; margin: number } {
    const retailPrice = product.cost * (1 + markupPercent / 100);
    const profit = retailPrice - product.cost;
    const margin = (profit / retailPrice) * 100;
    return { retailPrice, profit, margin };
  }

  private extractTags(title: string, category: string): string[] {
    const tags = [category];
    const keywords = title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    tags.push(...keywords.slice(0, 3));
    return Array.from(new Set(tags));
  }
}

export const cjAdapter = new CJAdapter();
