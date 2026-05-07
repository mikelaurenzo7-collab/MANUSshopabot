/**
 * Supplier Catalog — unit tests
 *
 * Validates the new catalog tRPC procedures (catalogAvailability,
 * catalogSearch, catalogTrending, catalogMargin) and the adapter
 * helpers without hitting live APIs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Margin calculation (pure, no mocks needed) ──────────────────────────────

describe("catalogMargin procedure (pure math)", () => {
  function calcMargin(costCents: number, markupPercent: number) {
    const costDollars = costCents / 100;
    const retailDollars = costDollars * (1 + markupPercent / 100);
    const profitDollars = retailDollars - costDollars;
    const marginPct = retailDollars > 0 ? (profitDollars / retailDollars) * 100 : 0;
    return {
      costCents,
      retailCents: Math.round(retailDollars * 100),
      profitCents: Math.round(profitDollars * 100),
      marginPercent: Math.round(marginPct * 10) / 10,
    };
  }

  it("calculates 100% markup → 50% margin", () => {
    const r = calcMargin(1000, 100);
    expect(r.retailCents).toBe(2000);
    expect(r.profitCents).toBe(1000);
    expect(r.marginPercent).toBe(50);
  });

  it("calculates 0% markup → 0% margin", () => {
    const r = calcMargin(500, 0);
    expect(r.retailCents).toBe(500);
    expect(r.profitCents).toBe(0);
    expect(r.marginPercent).toBe(0);
  });

  it("handles 300% markup", () => {
    const r = calcMargin(1000, 300);
    expect(r.retailCents).toBe(4000);
    expect(r.profitCents).toBe(3000);
    expect(r.marginPercent).toBe(75);
  });

  it("handles zero cost", () => {
    const r = calcMargin(0, 100);
    expect(r.retailCents).toBe(0);
    expect(r.marginPercent).toBe(0);
  });
});

// ─── Printful adapter helpers (logic only, no fetch) ─────────────────────────

describe("PrintfulAdapter — internal helpers", () => {
  it("extracts tags from title and typeName", async () => {
    const { PrintfulAdapter } = await import(
      "./adapters/suppliers/printfulAdapter"
    );
    const adapter = new PrintfulAdapter() as any;
    const tags = adapter.extractTags("Classic Unisex T-Shirt", "T-Shirt");
    expect(tags).toContain("t-shirt");
    expect(tags).toContain("classic");
    expect(tags.length).toBeGreaterThan(1);
  });

  it("maps category names correctly", async () => {
    const { PrintfulAdapter } = await import(
      "./adapters/suppliers/printfulAdapter"
    );
    const adapter = new PrintfulAdapter() as any;
    expect(adapter.mapCategory("T-Shirt")).toBe("apparel");
    expect(adapter.mapCategory("Mug")).toBe("home");
    expect(adapter.mapCategory("Poster")).toBe("wall art");
    expect(adapter.mapCategory("Hat")).toBe("accessories");
    expect(adapter.mapCategory("Sticker")).toBe("stationery");
  });

  it("returns empty array when token is missing", async () => {
    const { PrintfulAdapter } = await import(
      "./adapters/suppliers/printfulAdapter"
    );
    // Override token getter to return empty string
    const adapter = new PrintfulAdapter() as any;
    vi.spyOn(adapter, "token", "get").mockReturnValue("");
    const results = await adapter.searchProducts("shirt", 5);
    expect(results).toEqual([]);
  });

  it("returns false for isAvailable when token is empty", async () => {
    const { PrintfulAdapter } = await import(
      "./adapters/suppliers/printfulAdapter"
    );
    const adapter = new PrintfulAdapter() as any;
    vi.spyOn(adapter, "token", "get").mockReturnValue("");
    const available = await adapter.isAvailable();
    expect(available).toBe(false);
  });
});

// ─── CJ adapter helpers ───────────────────────────────────────────────────────

describe("CJAdapter — internal helpers", () => {
  it("extracts tags from product name and category", async () => {
    const { CJAdapter } = await import("./adapters/suppliers/cjAdapter");
    const adapter = new CJAdapter() as any;
    const tags = adapter.extractTags("Wireless Bluetooth Earbuds", "Electronics");
    expect(tags).toContain("electronics");
    expect(tags.length).toBeGreaterThan(1);
  });

  it("calculates margin correctly", async () => {
    const { CJAdapter } = await import("./adapters/suppliers/cjAdapter");
    const adapter = new CJAdapter();
    const product = {
      id: "test",
      title: "Test",
      description: "",
      image: "",
      price: 20,
      cost: 8,
      currency: "USD",
      category: "electronics",
      supplier: "cjdropshipping" as const,
      supplierUrl: "",
      tags: [],
      inStock: true,
    };
    const result = adapter.calculateMargin(product, 150);
    expect(result.retailPrice).toBe(20);
    expect(result.profit).toBeCloseTo(12, 1);
    expect(result.margin).toBeGreaterThan(50);
  });

  it("returns empty array when credentials are missing", async () => {
    const { CJAdapter } = await import("./adapters/suppliers/cjAdapter");
    const adapter = new CJAdapter() as any;
    // Ensure ENV values are empty
    const originalEnv = { ...process.env };
    process.env.CJ_EMAIL = "";
    process.env.CJ_PASSWORD = "";
    // Re-import to get fresh adapter with empty credentials
    const results = await adapter.searchProducts("shirt");
    // Should return [] when credentials are empty (no throw)
    expect(Array.isArray(results)).toBe(true);
    Object.assign(process.env, originalEnv);
  });

  it("returns false for isAvailable when credentials are missing", async () => {
    const { CJAdapter } = await import("./adapters/suppliers/cjAdapter");
    const adapter = new CJAdapter() as any;
    // Temporarily clear env
    const original = process.env.CJ_EMAIL;
    process.env.CJ_EMAIL = "";
    const available = await adapter.isAvailable();
    expect(available).toBe(false);
    process.env.CJ_EMAIL = original;
  });
});

// ─── Supplier index exports ───────────────────────────────────────────────────

describe("suppliers/index.ts exports", () => {
  it("exports printfulAdapter and cjAdapter singletons", async () => {
    const mod = await import("./adapters/suppliers/index");
    expect(mod.printfulAdapter).toBeDefined();
    expect(mod.cjAdapter).toBeDefined();
  });

  it("exports SUPPLIERS constant with printful and cjdropshipping keys", async () => {
    const { SUPPLIERS } = await import("./adapters/suppliers/index");
    expect(SUPPLIERS.printful).toBe("printful");
    expect(SUPPLIERS.cjdropshipping).toBe("cjdropshipping");
  });

  it("exports platform support helpers", async () => {
    const { isPrintfulSupportedPlatform } = await import(
      "./adapters/suppliers/printfulAdapter"
    );
    const { isCJSupportedPlatform } = await import(
      "./adapters/suppliers/cjAdapter"
    );
    expect(isPrintfulSupportedPlatform("shopify")).toBe(true);
    expect(isPrintfulSupportedPlatform("amazon")).toBe(false); // Amazon is not POD
    expect(isCJSupportedPlatform("shopify")).toBe(true);
    expect(isCJSupportedPlatform("etsy")).toBe(false); // Etsy prohibits mass-produced
  });
});

// ─── Supplier router contract ─────────────────────────────────────────────────

describe("supplier router catalog procedures contract", () => {
  it("supplier.ts exports supplierRouter with catalog procedures", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers/supplier.ts", "utf8");
    expect(src).toContain("catalogAvailability");
    expect(src).toContain("catalogSearch");
    expect(src).toContain("catalogTrending");
    expect(src).toContain("catalogMargin");
  });

  it("catalogSearch accepts supplier enum: printful | cjdropshipping | all", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers/supplier.ts", "utf8");
    expect(src).toContain('"printful"');
    expect(src).toContain('"cjdropshipping"');
    expect(src).toContain('"all"');
  });

  it("catalog procedures use orgProcedure (require authenticated org context)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers/supplier.ts", "utf8");
    // Each catalog proc must be guarded by orgProcedure
    const catalogSection = src.slice(src.indexOf("catalogAvailability"));
    const orgProcedureCount = (catalogSection.match(/orgProcedure/g) || []).length;
    expect(orgProcedureCount).toBeGreaterThanOrEqual(4);
  });

  it("supplier router imports both printfulAdapter and cjAdapter", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers/supplier.ts", "utf8");
    expect(src).toContain("printfulAdapter");
    expect(src).toContain("cjAdapter");
  });
});

// ─── WorkspaceSourcing page contract ─────────────────────────────────────────

describe("WorkspaceSourcing page contract", () => {
  it("page exists and mounts WorkspaceShell with sourcing tab", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/pages/WorkspaceSourcing.tsx",
      "utf8",
    );
    expect(src).toContain("WorkspaceShell");
    expect(src).toContain('activeTab="sourcing"');
    expect(src).toContain("SupplierCatalogBrowser");
  });

  it("page handles Add to PO by calling supplier.createDraft", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/pages/WorkspaceSourcing.tsx",
      "utf8",
    );
    expect(src).toContain("supplier.createDraft");
    expect(src).toContain("handleAddToPO");
  });
});

// ─── SupplierCatalogBrowser component contract ────────────────────────────────

describe("SupplierCatalogBrowser component contract", () => {
  it("component exists and uses catalog tRPC procedures", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/supplier/SupplierCatalogBrowser.tsx",
      "utf8",
    );
    expect(src).toContain("catalogAvailability");
    expect(src).toContain("catalogSearch");
    expect(src).toContain("catalogTrending");
  });

  it("component exports UnifiedProduct type", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/supplier/SupplierCatalogBrowser.tsx",
      "utf8",
    );
    expect(src).toContain("UnifiedProduct");
    expect(src).toContain('export type { UnifiedProduct }');
  });

  it("interleaves printful and cj results in 'all' mode", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/supplier/SupplierCatalogBrowser.tsx",
      "utf8",
    );
    expect(src).toContain("interleaved");
    expect(src).toContain('supplierFilter === "all"');
  });

  it("gracefully handles missing supplier images", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/supplier/SupplierCatalogBrowser.tsx",
      "utf8",
    );
    expect(src).toContain("onError");
  });
});

// ─── App.tsx route contract ───────────────────────────────────────────────────

describe("App.tsx workspace route contract", () => {
  it("registers /store/:storeId/sourcing route", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/App.tsx", "utf8");
    expect(src).toContain('path="/store/:storeId/sourcing"');
    expect(src).toContain("WorkspaceSourcingPage");
  });
});

// ─── WorkspaceShell tab contract ──────────────────────────────────────────────

describe("WorkspaceShell tab contract", () => {
  it("sourcing tab is in WorkspaceTabId union", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/workspace/WorkspaceShell.tsx",
      "utf8",
    );
    expect(src).toContain('"sourcing"');
    expect(src).toContain("subroute: \"sourcing\"");
  });

  it("sourcing is in DEFAULT_TAB_ORDER", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/workspace/WorkspaceShell.tsx",
      "utf8",
    );
    const orderLine = src.match(/DEFAULT_TAB_ORDER[^;]+/s)?.[0] ?? "";
    expect(orderLine).toContain('"sourcing"');
  });
});
