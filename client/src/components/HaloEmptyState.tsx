/**
 * HaloEmptyState.tsx — canonical empty-state primitive with halo glow.
 *
 * The pattern: a soft blur halo behind a coloured icon plate, a bold
 * heading-class title, a measured description line, and zero-to-three
 * tone-coloured next-action CTAs. Pioneered on Activity (no tasks /
 * no decisions) and standardised across the app over PRs #58–#62.
 *
 * Usage:
 *
 *   <HaloEmptyState
 *     tone="emerald"
 *     icon={ShieldCheck}
 *     title="All caught up"
 *     description="No bot decisions need your review right now."
 *     ctas={[
 *       { label: "Tune autonomy", href: "/settings#agents", tone: "emerald", icon: Filter },
 *       { label: "View activity", href: "#activity",          tone: "violet",  icon: GitBranch },
 *     ]}
 *   />
 *
 * Variants:
 *
 *   - `size="hero"` (default) — page-level empty state with a 14×14
 *     icon plate, room for a heading-class title, and the standard
 *     `empty-state` outer wrapper. Used on Workflows, Approvals,
 *     CampaignFunnel, Intelligence, Activity tabs, etc.
 *   - `size="inline"` — fits inside a chart card or column. 10×10
 *     plate, smaller title, no card wrapper. Used inside Analytics
 *     CardContent slots.
 *   - `size="patient"` — a quieter "we're listening / waiting" state,
 *     used by PlatformHealth and similar passive surfaces. 12×12 plate
 *     with no CTAs.
 *
 * Tone selection — match the meaning of the empty state:
 *
 *   - `emerald` — "all clear" / success / we did our job
 *   - `sky`     — "let's get started" / launch surfaces
 *   - `cyan`    — connected / merchant lane
 *   - `violet`  — analysis / quiet contemplative states
 *   - `amber`   — partial / waiting on user
 *   - `muted`   — neutral fallback
 */

import { Link } from "wouter";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type HaloTone = "sky" | "cyan" | "violet" | "emerald" | "amber" | "muted";
export type HaloSize = "hero" | "inline" | "patient";

interface CtaSpec {
  label: string;
  href: string;
  /** Per-CTA tone override; defaults to the parent `tone`. */
  tone?: HaloTone;
  /** Optional left-aligned icon for the CTA. */
  icon?: LucideIcon;
  /** Optional one-line subtitle. When provided on a 3-CTA hero, the
   *  CTAs render as a rich grid of tiles (icon-left + title + sub +
   *  arrow); otherwise they render as compact buttons. */
  sub?: string;
}

interface HaloEmptyStateProps {
  /** Halo + icon plate colour family. */
  tone?: HaloTone;
  /** Lucide icon component rendered inside the plate. */
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Layout variant — see file-level docs. */
  size?: HaloSize;
  /** Up to three CTAs. Layouts depend on count: 1 = single button,
   *  2 = wrapped row, 3 = grid (hero only). */
  ctas?: CtaSpec[];
  /** Optional className on the outer wrapper for one-off spacing
   *  tweaks (e.g. when nesting inside a custom container). */
  className?: string;
}

/* ── Tone palette ─────────────────────────────────────────────────────────── */

const TONE_STYLES: Record<HaloTone, {
  plate: string;       // background + border on the icon plate
  icon: string;        // icon foreground colour
  glow: string;        // halo bg colour (with opacity)
  shadow: string;      // outer shadow on the plate
  hoverBorder: string; // CTA hover border tint
  hoverBg: string;     // CTA hover bg tint
}> = {
  sky: {
    plate: "bg-sky-500/10 border-sky-500/25",
    icon: "text-sky-300",
    glow: "bg-sky-500/20",
    shadow: "shadow-[0_0_24px_rgba(14,165,233,0.18)]",
    hoverBorder: "hover:border-sky-400/30",
    hoverBg: "hover:bg-sky-500/5",
  },
  cyan: {
    plate: "bg-cyan-500/10 border-cyan-500/25",
    icon: "text-cyan-300",
    glow: "bg-cyan-500/20",
    shadow: "shadow-[0_0_24px_rgba(34,211,238,0.18)]",
    hoverBorder: "hover:border-cyan-400/30",
    hoverBg: "hover:bg-cyan-500/5",
  },
  violet: {
    plate: "bg-violet-500/10 border-violet-500/25",
    icon: "text-violet-300",
    glow: "bg-violet-500/20",
    shadow: "shadow-[0_0_24px_rgba(167,139,250,0.18)]",
    hoverBorder: "hover:border-violet-400/30",
    hoverBg: "hover:bg-violet-500/5",
  },
  emerald: {
    plate: "bg-emerald-500/10 border-emerald-500/25",
    icon: "text-emerald-300",
    glow: "bg-emerald-500/20",
    shadow: "shadow-[0_0_24px_rgba(16,185,129,0.18)]",
    hoverBorder: "hover:border-emerald-400/30",
    hoverBg: "hover:bg-emerald-500/5",
  },
  amber: {
    plate: "bg-amber-500/10 border-amber-500/25",
    icon: "text-amber-300",
    glow: "bg-amber-500/20",
    shadow: "shadow-[0_0_24px_rgba(251,191,36,0.18)]",
    hoverBorder: "hover:border-amber-400/30",
    hoverBg: "hover:bg-amber-500/5",
  },
  muted: {
    plate: "bg-white/[0.04] border-white/[0.10]",
    icon: "text-white/60",
    glow: "bg-white/[0.06]",
    shadow: "",
    hoverBorder: "hover:border-white/20",
    hoverBg: "hover:bg-white/5",
  },
};

/* ── Size scale ───────────────────────────────────────────────────────────── */

const SIZE_STYLES: Record<HaloSize, {
  plate: string;       // h-N w-N on the icon plate
  iconSize: string;    // h-N w-N on the icon itself
  glowRadius: string;  // rounded-N on the halo
  blurRadius: string;  // blur-(md|lg|xl)
  outerWrapper: string; // wrapper class for the full block
  titleClass: string;
  descriptionClass: string;
}> = {
  hero: {
    plate: "h-14 w-14",
    iconSize: "h-6 w-6",
    glowRadius: "rounded-2xl",
    blurRadius: "blur-xl",
    outerWrapper: "empty-state",
    titleClass: "text-base font-heading font-bold tracking-tight text-foreground",
    descriptionClass: "text-xs text-muted-foreground mt-1.5 max-w-md text-center leading-relaxed",
  },
  inline: {
    plate: "h-10 w-10",
    iconSize: "h-5 w-5",
    glowRadius: "rounded-xl",
    blurRadius: "blur-lg",
    outerWrapper: "empty-state",
    titleClass: "text-sm font-semibold text-foreground",
    descriptionClass: "text-xs text-muted-foreground mt-1.5 max-w-sm leading-relaxed",
  },
  patient: {
    plate: "h-12 w-12",
    iconSize: "h-5 w-5",
    glowRadius: "rounded-2xl",
    blurRadius: "blur-xl",
    outerWrapper: "flex flex-col items-center justify-center py-10 px-6",
    titleClass: "text-sm font-semibold text-foreground",
    descriptionClass: "text-xs text-muted-foreground mt-1.5 text-center max-w-md leading-relaxed",
  },
};

/* ── Component ────────────────────────────────────────────────────────────── */

export function HaloEmptyState({
  tone = "muted",
  icon: IconCmp,
  title,
  description,
  size = "hero",
  ctas,
  className,
}: HaloEmptyStateProps) {
  const t = TONE_STYLES[tone];
  const s = SIZE_STYLES[size];
  const wrapperClass = `${s.outerWrapper}${className ? ` ${className}` : ""}`;
  const ctaList = (ctas ?? []).slice(0, 3);
  // 3 CTAs lay out as a 3-column grid on hero size (matches the
  // gold-standard pattern from Activity.tsx); 1-2 wrap as a flex row.
  const useGrid = size === "hero" && ctaList.length === 3;
  // Rich tile layout — each CTA shows icon + label + subtitle + arrow.
  // Triggered when ANY CTA has a `sub`; matches the bot-lane picker
  // patterns on Workflows · Active and Activity · Tasks.
  const useRichTiles = useGrid && ctaList.some((c) => c.sub);

  return (
    <div className={wrapperClass}>
      <div className="relative mb-3">
        <div
          className={`absolute inset-0 ${s.glowRadius} ${s.blurRadius} ${t.glow}`}
          aria-hidden="true"
        />
        <div
          className={`relative ${s.plate} ${s.glowRadius} border flex items-center justify-center ${t.plate} ${t.shadow}`}
        >
          <IconCmp className={`${s.iconSize} ${t.icon}`} />
        </div>
      </div>
      <h3 className={s.titleClass}>{title}</h3>
      {description && <p className={s.descriptionClass}>{description}</p>}
      {ctaList.length > 0 && (
        <div
          className={
            useGrid
              ? "grid grid-cols-1 sm:grid-cols-3 gap-2 mt-5 w-full max-w-2xl"
              : "flex flex-wrap gap-2 justify-center mt-5"
          }
        >
          {ctaList.map((cta) => {
            const ct = TONE_STYLES[cta.tone ?? tone];
            const Icon = cta.icon;
            if (useRichTiles) {
              return (
                <Link key={cta.href + cta.label} href={cta.href}>
                  <Button
                    variant="outline"
                    className={`w-full justify-start h-auto py-2.5 px-3 border-white/10 ${ct.hoverBorder} ${ct.hoverBg}`}
                  >
                    {Icon && <Icon className={`h-4 w-4 ${ct.icon} shrink-0 mr-2`} aria-hidden="true" />}
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-xs font-medium text-foreground">{cta.label}</div>
                      {cta.sub && (
                        <div className="text-[10px] text-muted-foreground truncate">{cta.sub}</div>
                      )}
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 ml-1" aria-hidden="true" />
                  </Button>
                </Link>
              );
            }
            return (
              <Link key={cta.href + cta.label} href={cta.href}>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-auto py-2 px-3 border-white/10 ${ct.hoverBorder} ${ct.hoverBg} gap-1.5`}
                >
                  {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${ct.icon}`} aria-hidden="true" />}
                  <span className="text-xs font-medium">{cta.label}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                </Button>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
