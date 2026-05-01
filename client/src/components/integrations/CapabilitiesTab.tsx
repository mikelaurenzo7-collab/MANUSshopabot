/**
 * CapabilitiesTab.tsx — per-store capability matrix.
 *
 * Shows what each connected store can / can't do. Reads the live
 * `connectors.capabilityMatrix` endpoint (which lazy-pulls each
 * adapter's `getCapabilities()` so this view stays in sync with
 * actual adapter behavior, no parallel doc to drift).
 *
 * Layout: one card per connected platform. Inside each card, a
 * grid of capability rows — green check = supported, grey dash =
 * not supported, with a hover-tooltip explaining the field.
 *
 * Surfaces friction BEFORE workflows fail. A user looking at their
 * Etsy listing card immediately sees "no auto-fulfillment" instead
 * of discovering it 3 clicks deep into a failed workflow.
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  Minus,
  Sparkles,
  AlertTriangle,
  ShoppingBag,
  Share2,
  Webhook,
  Package,
  DollarSign,
  Zap,
  Gauge,
  Hash,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getBrand, type PlatformBrand } from "@/lib/platformBrand";

function hexToRgbTriple(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function tileVars(brand: PlatformBrand): React.CSSProperties {
  return {
    ["--tile-color" as any]: hexToRgbTriple(brand.color),
    ["--tile-accent" as any]: hexToRgbTriple(brand.accent),
  };
}

type CapabilityRow = {
  label: string;
  description: string;
  icon: typeof Check;
  /** Either a boolean (supported / not) or a string for raw values like "10 images". */
  value: boolean | string | number;
};

function CapabilityIndicator({ value }: { value: boolean | string | number }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-label="Supported" />
    ) : (
      <Minus className="h-3.5 w-3.5 text-white/30 shrink-0" aria-label="Not supported" />
    );
  }
  return (
    <span className="font-mono text-[10px] text-cyan-300 shrink-0">{String(value)}</span>
  );
}

function CapabilityCard({
  platform,
  label,
  caps,
  isConnected,
}: {
  platform: string;
  label: string;
  caps: any;
  icon?: typeof Check;
  isConnected: boolean;
}) {
  if (!caps) return null;
  const brand = getBrand(platform);

  const rows: CapabilityRow[] = [
    { label: "Variants", description: "Multi-variant products (size, color, etc.)", icon: Package, value: caps.variants },
    { label: "Metafields", description: "Custom key/value data for SEO + tagging", icon: Hash, value: caps.metafields },
    { label: "Bulk import", description: "Batch product creation via CSV / API", icon: Sparkles, value: caps.bulkImport },
    { label: "Categories", description: "Built-in taxonomy / collections", icon: Hash, value: caps.categories },
    { label: "Webhooks", description: "Real-time event push (vs. poll-only)", icon: Webhook, value: caps.webhooks },
    { label: "Auto-fulfill", description: "Bot can mark orders fulfilled programmatically", icon: Zap, value: caps.autoFulfillment },
    { label: "Partial fulfill", description: "Fulfill a subset of order line items", icon: Zap, value: caps.partialFulfillment },
    { label: "Real-time inv.", description: "Inventory updates reflect in <1 minute", icon: Gauge, value: caps.realTimeInventory },
    { label: "Compare-at price", description: "Display strikethrough original price", icon: DollarSign, value: caps.compareAtPrice },
    { label: "Bulk pricing", description: "Update many SKUs in one request", icon: DollarSign, value: caps.bulkPriceUpdate },
    { label: "Scheduled sales", description: "Native scheduled discount primitive", icon: DollarSign, value: caps.scheduledSale },
    { label: "Max images", description: "Hard ceiling for images per product", icon: Package, value: caps.maxImagesPerProduct ?? "—" },
    { label: "Batch size", description: "Recommended page size for fetches", icon: Gauge, value: caps.recommendedBatchSize ?? "—" },
    { label: "Rate limit", description: "Sustainable requests per second", icon: Gauge, value: `${caps.rateLimitTokensPerSec ?? "—"}/s` },
  ];

  return (
    <div className="platform-tile p-4 flex flex-col gap-3" style={tileVars(brand)}>
      <span className="platform-tile-ribbon" />
      <span className="platform-tile-seam" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="platform-tile-icon-halo text-2xl leading-none">{brand.icon}</div>
          <div className="min-w-0">
            <div className="text-sm font-heading font-semibold tracking-tight text-white truncate">{label}</div>
            {caps.category && (
              <div className="text-[10px] text-white/60 capitalize">
                {caps.category.replace(/_/g, " ")} · {caps.feeStructure}
              </div>
            )}
          </div>
        </div>
        {isConnected ? (
          <Badge className="platform-connected-dot text-[10px] px-1.5 py-0.5 rounded-full font-medium">
            Connected
          </Badge>
        ) : (
          <Badge className="bg-white/[0.04] text-white/45 border-white/10 text-[10px]">
            Available
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {rows.map((row) => (
          <TooltipProvider key={row.label} delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-[11px] cursor-help">
                  <CapabilityIndicator value={row.value} />
                  <span className="text-white/60 truncate">{row.label}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[220px]">
                {row.description}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {caps.strengths && caps.strengths.length > 0 && (
        <div className="border-t border-white/5 pt-2">
          <p className="text-[9px] uppercase tracking-widest text-emerald-400/80 font-bold mb-1">
            Strengths
          </p>
          <ul className="space-y-0.5">
            {caps.strengths.slice(0, 3).map((s: string, i: number) => (
              <li key={i} className="text-[10px] text-white/65 flex gap-1.5">
                <span className="text-emerald-400 mt-0.5">▸</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {caps.limitations && caps.limitations.length > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-widest text-amber-400/80 font-bold mb-1 flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> Limitations
          </p>
          <ul className="space-y-0.5">
            {caps.limitations.slice(0, 3).map((l: string, i: number) => (
              <li key={i} className="text-[10px] text-white/55 flex gap-1.5">
                <span className="text-amber-400/70 mt-0.5">▸</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const ECOMMERCE_LABELS: Record<string, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  amazon: "Amazon",
  etsy: "Etsy",
  ebay: "eBay",
  tiktok_shop: "TikTok Shop",
  walmart: "Walmart",
  // Sprint 27 expansion — keep the alphabetical order for the sorted view.
  depop: "Depop",
  bigcommerce: "BigCommerce",
  square: "Square",
  faire: "Faire",
  bonanza: "Bonanza",
  stockx: "StockX",
  reverb: "Reverb",
};

const SOCIAL_LABELS: Record<string, string> = {
  meta: "Meta (Facebook + Instagram)",
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "Twitter / X",
  pinterest: "Pinterest",
  google_ads: "Google Ads",
  gmail: "Gmail",
};

export function CapabilitiesTab() {
  const matrixQuery = trpc.connectors.capabilityMatrix.useQuery();
  const platformsQuery = trpc.connectors.listCredentials.useQuery();
  const socialQuery = trpc.connectors.listSocialAccounts.useQuery();

  const connectedEcommercePlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const cred of (platformsQuery.data ?? []) as any[]) {
      if (cred.platform) set.add(cred.platform);
    }
    return set;
  }, [platformsQuery.data]);

  const connectedSocialPlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const acct of (socialQuery.data ?? []) as any[]) {
      if (acct.platform) set.add(acct.platform);
    }
    return set;
  }, [socialQuery.data]);

  if (matrixQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-64 w-full bg-white/[0.03]" />
        ))}
      </div>
    );
  }

  if (matrixQuery.error || !matrixQuery.data) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
        Failed to load capability matrix. Refresh to try again.
      </div>
    );
  }

  const ecommerceEntries = Object.entries(matrixQuery.data.ecommerce ?? {});
  const socialEntries = Object.entries(matrixQuery.data.social ?? {});

  // Sort connected platforms first so users see what they have at a glance
  const sortByConnected = (connected: Set<string>) => (a: [string, any], b: [string, any]) => {
    const aConn = connected.has(a[0]) ? 0 : 1;
    const bConn = connected.has(b[0]) ? 0 : 1;
    return aConn - bConn;
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-heading font-bold tracking-tight text-foreground">E-commerce platforms</h3>
          <span className="text-[10px] text-white/35">
            {connectedEcommercePlatforms.size} connected · {ecommerceEntries.length} total
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ecommerceEntries
            .sort(sortByConnected(connectedEcommercePlatforms))
            .map(([platform, caps]) => (
              <CapabilityCard
                key={platform}
                platform={platform}
                label={ECOMMERCE_LABELS[platform] ?? platform}
                caps={caps}
                icon={ShoppingBag}
                isConnected={connectedEcommercePlatforms.has(platform)}
              />
            ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Share2 className="h-4 w-4 text-fuchsia-400" />
          <h3 className="text-sm font-heading font-bold tracking-tight text-foreground">Social channels</h3>
          <span className="text-[10px] text-white/35">
            {connectedSocialPlatforms.size} connected · {socialEntries.length} total
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {socialEntries
            .sort(sortByConnected(connectedSocialPlatforms))
            .map(([platform, caps]) => (
              <CapabilityCard
                key={platform}
                platform={platform}
                label={SOCIAL_LABELS[platform] ?? platform}
                caps={caps}
                icon={Share2}
                isConnected={connectedSocialPlatforms.has(platform)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
