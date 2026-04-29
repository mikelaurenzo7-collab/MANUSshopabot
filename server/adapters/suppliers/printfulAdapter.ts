import { ENV } from "../../_core/env";

export interface PrintfulProduct {
  id: number;
  title: string;
  description: string;
  image: string;
  price: number;
  currency: string;
  availableSizes?: string[];
  availableColors?: string[];
  printAreas?: string[];
  supplier: "printful";
  supplierUrl: string;
  category: string;
  tags: string[];
}

export interface PrintfulCatalogItem {
  id: number;
  title: string;
  description: string;
  image: string;
  category: string;
  variants: Array<{
    id: number;
    title: string;
    price: number;
    currency: string;
  }>;
}

/**
 * Printful Supplier Adapter
 * Searches the Printful print-on-demand catalog for products
 * Uses OAuth token for authentication
 */
export class PrintfulAdapter {
  private token: string;
  private baseUrl = "https://api.printful.com";

  constructor(token?: string) {
    this.token = token || ENV.printfulApiToken;
  }

  /**
   * Search Printful catalog by keyword
   */
  async searchProducts(keyword: string, limit = 20): Promise<PrintfulProduct[]> {
    if (!this.token) {
      throw new Error("Printful API token not configured");
    }

    try {
      // Printful catalog endpoint
      const response = await fetch(`${this.baseUrl}/catalog/products?limit=${limit}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Printful API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { data: PrintfulCatalogItem[] };

      // Filter by keyword and transform to PrintfulProduct
      return data.data
        .filter((item) => item.title.toLowerCase().includes(keyword.toLowerCase()) || item.description.toLowerCase().includes(keyword.toLowerCase()))
        .slice(0, limit)
        .map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          image: item.image,
          price: item.variants[0]?.price || 0,
          currency: item.variants[0]?.currency || "USD",
          supplier: "printful" as const,
          supplierUrl: `https://www.printful.com/products/${item.id}`,
          category: item.category,
          tags: this.extractTags(item.title, item.category),
        }));
    } catch (error) {
      console.error("[Printful] Search error:", error);
      throw error;
    }
  }

  /**
   * Get product details by ID
   */
  async getProduct(productId: number): Promise<PrintfulProduct | null> {
    if (!this.token) {
      throw new Error("Printful API token not configured");
    }

    try {
      const response = await fetch(`${this.baseUrl}/catalog/products/${productId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { data: PrintfulCatalogItem };
      const item = data.data;

      return {
        id: item.id,
        title: item.title,
        description: item.description,
        image: item.image,
        price: item.variants[0]?.price || 0,
        currency: item.variants[0]?.currency || "USD",
        supplier: "printful" as const,
        supplierUrl: `https://www.printful.com/products/${item.id}`,
        category: item.category,
        tags: this.extractTags(item.title, item.category),
      };
    } catch (error) {
      console.error("[Printful] Get product error:", error);
      return null;
    }
  }

  /**
   * Browse products by category
   */
  async browseByCategory(category: string, limit = 20): Promise<PrintfulProduct[]> {
    if (!this.token) {
      throw new Error("Printful API token not configured");
    }

    try {
      const response = await fetch(`${this.baseUrl}/catalog/products?category=${encodeURIComponent(category)}&limit=${limit}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Printful API error: ${response.status}`);
      }

      const data = (await response.json()) as { data: PrintfulCatalogItem[] };

      return data.data.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        image: item.image,
        price: item.variants[0]?.price || 0,
        currency: item.variants[0]?.currency || "USD",
        supplier: "printful" as const,
        supplierUrl: `https://www.printful.com/products/${item.id}`,
        category: item.category,
        tags: this.extractTags(item.title, item.category),
      }));
    } catch (error) {
      console.error("[Printful] Browse category error:", error);
      throw error;
    }
  }

  /**
   * Get trending/featured products
   */
  async getTrendingProducts(limit = 20): Promise<PrintfulProduct[]> {
    if (!this.token) {
      throw new Error("Printful API token not configured");
    }

    try {
      const response = await fetch(`${this.baseUrl}/catalog/products?sort=trending&limit=${limit}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Printful API error: ${response.status}`);
      }

      const data = (await response.json()) as { data: PrintfulCatalogItem[] };

      return data.data.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        image: item.image,
        price: item.variants[0]?.price || 0,
        currency: item.variants[0]?.currency || "USD",
        supplier: "printful" as const,
        supplierUrl: `https://www.printful.com/products/${item.id}`,
        category: item.category,
        tags: this.extractTags(item.title, item.category),
      }));
    } catch (error) {
      console.error("[Printful] Trending products error:", error);
      throw error;
    }
  }

  private extractTags(title: string, category: string): string[] {
    const tags = [category];
    const keywords = title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    tags.push(...keywords.slice(0, 3));
    return Array.from(new Set(tags));
  }
}

export const printfulAdapter = new PrintfulAdapter();
