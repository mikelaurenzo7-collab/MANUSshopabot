/**
 * JustLanded.tsx — celebration hero for freshly-shipped integrations.
 *
 * Reads the canonical brand registry, filters to brands carrying a
 * `newSince` flag inside the 60-day grace window, and renders a
 * spotlight strip with an eyebrow tag, headline, and one tile per
 * new platform. The tiles deep-link into the Connect tab pre-filtered
 * to that platform (via hash) so the user lands on the relevant
 * Connect button with one click.
 *
 * Auto-hides itself when no brand qualifies — never need to remember
 * to take it down. The 60-day window ages out of the registry's
 * `isPlatformNew` helper.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { Sparkles, ArrowUpRight } from "lucide-react";
import {
  ECOMMERCE_BRANDS,
  SOCIAL_BRANDS,
  TOOL_BRANDS,
  isPlatformNew,
  type PlatformBrand,
} from "@/lib/platformBrand";

function hexToRgbTriple(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.substring(0, 2), 16)}, ${parseInt(h.substring(2, 4), 16)}, ${parseInt(h.substring(4, 6), 16)}`;
}

function tileVars(b: PlatformBrand): React.CSSProperties {
  return {
    ["--tile-color" as any]: hexToRgbTriple(b.color),
    ["--tile-accent" as any]: hexToRgbTriple(b.accent),
  };
}

interface NewBrand extends PlatformBrand {
  /** Which connect-tab subsection this brand lives in. */
  segment: "ecommerce" | "social" | "tools";
}

function annotateSegment(brands: Record<string, PlatformBrand>, seg: NewBrand["segment"]): NewBrand[] {
  return Object.values(brands)
    .filter((b) => b.id !== "facebook")
    .map((b) => ({ ...b, segment: seg }));
}

export function JustLanded({
  /** Each unlock line surfaces what the bot can do once the platform
   *  is connected — short, concrete, no marketing fluff. */
  unlocks = DEFAULT_UNLOCKS,
}: { unlocks?: Record<string, string> } = {}) {
  const newBrands = useMemo<NewBrand[]>(() => {
    const all = [
      ...annotateSegment(ECOMMERCE_BRANDS, "ecommerce"),
      ...annotateSegment(SOCIAL_BRANDS, "social"),
      ...annotateSegment(TOOL_BRANDS, "tools"),
    ];
    return all.filter((b) => isPlatformNew(b));
  }, []);

  if (newBrands.length === 0) return null;

  return (
    <div className="just-landed-hero">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <span className="just-landed-eyebrow">
            <span className="just-landed-eyebrow-dot" />
            Just landed
          </span>
          <h2 className="text-xl md:text-2xl font-heading font-black tracking-tight text-white mt-2">
            {newBrands.length} new {newBrands.length === 1 ? "channel is" : "channels are"} live
          </h2>
          <p className="text-[12px] text-white/60 mt-1 max-w-xl">
            The latest Sprint 27.5 expansion — every adapter is wired through the same capability
            matrix the bots branch on, so they slot into your existing workflows immediately.
          </p>
        </div>
        <Link
          href="/storefronts"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200 transition-colors"
        >
          See all integrations <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {newBrands.map((b) => {
          const unlock = unlocks[b.id] || `${b.tagline}.`;
          return (
            <Link
              key={b.id}
              href="/storefronts"
              className="just-landed-spot block"
              style={tileVars(b)}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-2xl leading-none flex-shrink-0">{b.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-heading font-bold tracking-tight text-white truncate">
                      {b.name}
                    </div>
                    <div
                      className="text-[10px] uppercase tracking-widest font-bold mt-0.5"
                      style={{ color: b.color }}
                    >
                      NEW
                    </div>
                  </div>
                </div>
                <Sparkles className="w-3.5 h-3.5 text-white/55 shrink-0" />
              </div>
              <p className="text-[12px] text-white/70 leading-snug">{unlock}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Per-platform unlock copy — describes what the bot does on day one
 * after connecting. Falls back to the brand's tagline if no override
 * is supplied. Maintained centrally so the marketing voice stays
 * consistent.
 */
const DEFAULT_UNLOCKS: Record<string, string> = {
  outlook: "Builder bot drafts B2B outreach, Merchant books meetings — same Microsoft Graph token.",
  slack: "Drop a product to your VIP channel with Block Kit + buy link in one workflow.",
  youtube: "Generate Shorts copy + tags from a product, upload, schedule the publish window.",
  depop: "Hashtag refresh sweeps every listing — drives 60% of Depop discovery.",
  bigcommerce: "Webhook bootstrap subscribes order + inventory events — zero polling.",
  square: "Multi-location inventory rebalance across retail + warehouse hubs.",
  faire: "24h acknowledgement watcher — auto-acks orders before Faire's deadline.",
  bonanza: "Margin × velocity tier optimizer for Google Shopping syndication.",
  stockx: "Live order-book repricer with a hard margin floor.",
  reverb: "Auto-respond to offers within margin guardrails — accept, counter, decline.",
};
