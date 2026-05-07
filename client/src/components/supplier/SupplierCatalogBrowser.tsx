/**
 * SupplierCatalogBrowser — browse and search Printful + CJ Dropshipping
 * products directly from the workspace without running a full workflow.
 *
 * Layout:
 *  ┌─ toolbar: keyword search · supplier filter · category ──────────┐
 *  │ Trending | Search Results                                        │
 *  ├──────────────────────────────────────────────────────────────────┤
 *  │ Product grid — image · title · price · supplier badge · margin  │
 *  └──────────────────────────────────────────────────────────────────┘
 *
 * Gracefully handles unconfigured suppliers by showing a setup nudge
 * rather than empty grids.
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Search,
  TrendingUp,
  Package,
  Tag,
  ExternalLink,
  Loader2,
  AlertCircle,
  ShoppingCart,
  Sparkles,
  Filter,
  DollarSign,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ─────────────────────────────────────────────────────────────────

type SupplierFilter = "all" | "printful" | "cjdropshipping";
type ViewMode = "trending" | "search";

interface UnifiedProduct {
  id: string;
  title: string;
  description: string;
  image: string;
  priceCents: number;
  costCents?: number;
  currency: string;
  category: string;
  supplier: "printful" | "cjdropshipping";
  supplierUrl: string;
  tags: string[];
  inStock?: boolean;
  techniques?: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function formatPrice(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function calcMargin(priceCents: number, costCents: number): number {
  if (costCents <= 0 || priceCents <= 0) return 0;
  return Math.round(((priceCents - costCents) / priceCents) * 1000) / 10;
}

const SUPPLIER_LABEL: Record<string, string> = {
  printful: "Printful",
  cjdropshipping: "CJ Dropshipping",
};

const SUPPLIER_COLOR: Record<string, string> = {
  printful: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  cjdropshipping: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const CATEGORIES = [
  "All",
  "Apparel",
  "Accessories",
  "Home & Living",
  "Electronics",
  "Beauty",
  "Toys",
  "Sports",
  "Pet",
  "Stationery",
];

// ─── Sub-components ────────────────────────────────────────────────────────

function ProductCard({
  product,
  onAddToPO,
}: {
  product: UnifiedProduct;
  onAddToPO?: (product: UnifiedProduct) => void;
}) {
  const margin =
    product.costCents != null
      ? calcMargin(product.priceCents, product.costCents)
      : null;

  return (
    <div className="group flex flex-col rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-200 overflow-hidden">
      {/* Product image */}
      <div className="relative w-full aspect-square bg-white/[0.03] overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-10 h-10 text-white/10" />
          </div>
        )}

        {/* Supplier badge — top-left */}
        <div className="absolute top-2 left-2">
          <span
            className={`text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${SUPPLIER_COLOR[product.supplier]}`}
          >
            {SUPPLIER_LABEL[product.supplier]}
          </span>
        </div>

        {/* External link — top-right */}
        <a
          href={product.supplierUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-2 right-2 w-6 h-6 rounded bg-black/60 text-white/50 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title="View on supplier site"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Product info */}
      <div className="flex flex-col gap-1.5 p-3 flex-1">
        <p
          className="text-[11px] font-semibold text-white/90 leading-tight line-clamp-2"
          title={product.title}
        >
          {product.title}
        </p>

        <div className="flex items-center justify-between mt-auto pt-1.5">
          <div>
            <p className="text-[13px] font-bold text-white">
              {formatPrice(product.priceCents)}
            </p>
            {product.costCents != null && (
              <p className="text-[9px] text-white/40 font-mono">
                Cost {formatPrice(product.costCents)}
              </p>
            )}
          </div>

          {margin !== null && margin > 0 && (
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                margin >= 40
                  ? "bg-emerald-500/15 text-emerald-300"
                  : margin >= 20
                    ? "bg-amber-500/15 text-amber-300"
                    : "bg-white/[0.05] text-white/40"
              }`}
            >
              {margin}% margin
            </span>
          )}
        </div>

        {/* Techniques / tags */}
        {product.techniques && product.techniques.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {product.techniques.slice(0, 2).map((t) => (
              <span
                key={t}
                className="text-[8px] font-mono text-white/30 bg-white/[0.03] border border-white/[0.06] px-1.5 py-0.5 rounded"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Add to PO button */}
        {onAddToPO && (
          <button
            onClick={() => onAddToPO(product)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 h-7 rounded-md border border-white/[0.08] bg-white/[0.03] hover:bg-violet-500/10 hover:border-violet-500/30 text-white/50 hover:text-violet-300 text-[10px] font-mono font-bold uppercase tracking-wider transition-all opacity-0 group-hover:opacity-100"
          >
            <ShoppingCart className="w-3 h-3" />
            Add to PO
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ available }: { available: { printful: boolean; cjdropshipping: boolean } }) {
  const noneConfigured = !available.printful && !available.cjdropshipping;

  if (noneConfigured) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-amber-400/60" />
        </div>
        <div>
          <p className="font-mono text-sm font-bold text-white/50 uppercase tracking-widest">
            Suppliers not configured
          </p>
          <p className="font-mono text-[11px] text-white/30 mt-2 max-w-xs">
            Add <code className="text-amber-300/70">PRINTFUL_API_TOKEN</code> or{" "}
            <code className="text-amber-300/70">CJ_EMAIL</code> +{" "}
            <code className="text-amber-300/70">CJ_PASSWORD</code> to your Manus secrets to
            browse supplier catalogs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Package className="w-10 h-10 text-white/10" />
      <p className="font-mono text-sm text-white/30">No products found — try a different keyword.</p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

interface SupplierCatalogBrowserProps {
  /** Called when user clicks "Add to PO" on a product. */
  onAddToPO?: (product: UnifiedProduct) => void;
  /** Show compact header (no description blurb). */
  compact?: boolean;
}

export function SupplierCatalogBrowser({ onAddToPO, compact }: SupplierCatalogBrowserProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("trending");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<SupplierFilter>("all");
  const [category, setCategory] = useState("All");

  // Debounce keyword for search
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
      if (keyword.trim()) setViewMode("search");
    }, 400);
    return () => clearTimeout(id);
  }, [keyword]);

  const availabilityQuery = trpc.supplier.catalogAvailability.useQuery(undefined, {
    staleTime: 60_000,
  });

  const trendingQuery = trpc.supplier.catalogTrending.useQuery(
    { supplier: supplierFilter, limit: 20 },
    { enabled: viewMode === "trending", staleTime: 5 * 60_000 },
  );

  const searchQuery = trpc.supplier.catalogSearch.useQuery(
    {
      keyword: debouncedKeyword,
      supplier: supplierFilter,
      limit: 24,
      category: category !== "All" ? category.toLowerCase() : undefined,
    },
    {
      enabled: viewMode === "search" && debouncedKeyword.length > 0,
      staleTime: 2 * 60_000,
    },
  );

  const activeQuery = viewMode === "trending" ? trendingQuery : searchQuery;
  const isLoading = activeQuery.isFetching;

  const products = useCallback((): UnifiedProduct[] => {
    const data = activeQuery.data;
    if (!data) return [];

    const results: UnifiedProduct[] = [];

    for (const p of data.printful ?? []) {
      results.push({
        id: `printful-${p.id}`,
        title: p.title,
        description: p.description,
        image: p.image,
        priceCents: toCents(p.price),
        currency: p.currency,
        category: p.category,
        supplier: "printful",
        supplierUrl: p.supplierUrl,
        tags: p.tags,
        techniques: p.techniques,
        inStock: true,
      });
    }

    for (const p of data.cjdropshipping ?? []) {
      results.push({
        id: `cj-${p.id}`,
        title: p.title,
        description: p.description,
        image: p.image,
        priceCents: toCents(p.price),
        costCents: toCents(p.cost),
        currency: p.currency,
        category: p.category,
        supplier: "cjdropshipping",
        supplierUrl: p.supplierUrl,
        tags: p.tags,
        inStock: p.inStock,
      });
    }

    // Interleave printful and CJ for "all" view so neither dominates
    if (supplierFilter === "all") {
      const pf = results.filter((p) => p.supplier === "printful");
      const cj = results.filter((p) => p.supplier === "cjdropshipping");
      const interleaved: UnifiedProduct[] = [];
      const max = Math.max(pf.length, cj.length);
      for (let i = 0; i < max; i++) {
        if (pf[i]) interleaved.push(pf[i]);
        if (cj[i]) interleaved.push(cj[i]);
      }
      return interleaved;
    }

    return results;
  }, [activeQuery.data, supplierFilter])();

  const availability = availabilityQuery.data ?? { printful: false, cjdropshipping: false };

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setDebouncedKeyword(keyword.trim());
    if (keyword.trim()) setViewMode("search");
  }

  function handleTrending() {
    setViewMode("trending");
    setKeyword("");
    setDebouncedKeyword("");
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      {!compact && (
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="font-mono text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Package className="w-4 h-4 text-violet-400" />
              Supplier Catalog
            </h2>
            <p className="font-mono text-[10px] text-white/40 mt-0.5">
              Browse Printful and CJ Dropshipping products — no workflow required.
            </p>
          </div>

          {/* Supplier availability pills */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {[
              { key: "printful", label: "Printful" },
              { key: "cjdropshipping", label: "CJ" },
            ].map(({ key, label }) => (
              <span
                key={key}
                className={`text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                  availability[key as keyof typeof availability]
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-white/[0.03] text-white/25 border-white/[0.06]"
                }`}
              >
                {label}{" "}
                {availability[key as keyof typeof availability] ? "✓" : "✗"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3 border-b border-white/[0.06]">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 min-w-[200px] flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search products… (t-shirts, mugs, electronics)"
              className="pl-8 h-8 text-[11px] font-mono bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/25 focus:border-violet-500/40"
            />
          </div>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-[10px] font-mono border border-white/[0.08] hover:bg-white/[0.06]"
          >
            Search
          </Button>
        </form>

        {/* Trending toggle */}
        <button
          onClick={handleTrending}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wide transition-all ${
            viewMode === "trending"
              ? "bg-violet-500/10 border-violet-500/30 text-violet-300"
              : "border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          <TrendingUp className="w-3 h-3" />
          Trending
        </button>

        {/* Supplier filter */}
        <Select
          value={supplierFilter}
          onValueChange={(v) => setSupplierFilter(v as SupplierFilter)}
        >
          <SelectTrigger className="h-8 w-40 text-[10px] font-mono bg-white/[0.03] border-white/[0.08] text-white/70">
            <Filter className="w-3 h-3 mr-1 text-white/30" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface-overlay border-white/10 text-xs font-mono">
            <SelectItem value="all">All Suppliers</SelectItem>
            <SelectItem value="printful">Printful only</SelectItem>
            <SelectItem value="cjdropshipping">CJ Dropshipping only</SelectItem>
          </SelectContent>
        </Select>

        {/* Category filter */}
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 w-36 text-[10px] font-mono bg-white/[0.03] border-white/[0.08] text-white/70">
            <Tag className="w-3 h-3 mr-1 text-white/30" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface-overlay border-white/10 text-xs font-mono max-h-60 overflow-y-auto">
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Refresh */}
        <button
          onClick={() => activeQuery.refetch()}
          disabled={isLoading}
          className="h-8 w-8 flex items-center justify-center rounded-md border border-white/[0.08] text-white/40 hover:text-white hover:bg-white/[0.04] transition-all disabled:opacity-30"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-white/[0.04]">
        <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">
          {viewMode === "trending" ? "Trending picks" : `Results for "${debouncedKeyword}"`}
        </span>
        {isLoading && <Loader2 className="w-3 h-3 animate-spin text-white/30" />}
        {!isLoading && products.length > 0 && (
          <span className="font-mono text-[9px] text-white/20">
            {products.length} product{products.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Product grid ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading && products.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse">
                <div className="aspect-square bg-white/[0.04] rounded-t-xl" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-white/[0.04] rounded w-3/4" />
                  <div className="h-3 bg-white/[0.04] rounded w-1/2" />
                  <div className="h-4 bg-white/[0.06] rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <EmptyState available={availability} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onAddToPO={onAddToPO} />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer — sourcing tip ─────────────────────────────────────────── */}
      <div className="px-5 py-2.5 border-t border-white/[0.05] flex items-center gap-2">
        <Sparkles className="w-3 h-3 text-violet-400/50 shrink-0" />
        <p className="font-mono text-[9px] text-white/20 leading-relaxed">
          Products shown are real supplier inventory. Use "Launch Workflow" in the Builder to auto-source,
          enrich, and push to your store. CJ margin shows at 100% markup — adjust per niche.
        </p>
      </div>
    </div>
  );
}

export type { UnifiedProduct };
