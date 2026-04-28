/**
 * PageHeader — canonical page header for all top-level pages.
 *
 * Three pages already have this exact pattern hardcoded (Inbox.tsx,
 * Storefronts.tsx, plus the Settings header). Standardizing it as a
 * single component lets us:
 *   1. Sweep the remaining pages (Analytics, Intelligence, CampaignFunnel,
 *      PromptLab) into a consistent visual language.
 *   2. Tune the header globally — accent intensity, spacing, micro-copy
 *      treatment — without n-way edits.
 *
 * Visual: 32x32 rounded-square icon plate (with accent glow) + title +
 * one-line subtitle. Right slot for action chips / status badges.
 *
 * The accent color drives the icon plate background, border, and
 * outer glow. Defaults to "sky" which matches the existing Inbox header.
 * Other tints picked to harmonise with each section's identity:
 *   - sky      = orchestrator surfaces (Inbox, Activity)
 *   - cyan     = connection / channel surfaces (Storefronts)
 *   - violet   = analytics / decision surfaces (Approvals, Analytics)
 *   - emerald  = revenue / commerce surfaces (Insights revenue)
 *   - fuchsia  = creative / generation surfaces (Campaigns, PromptLab)
 *   - amber    = intelligence / signal surfaces (Intelligence)
 */
import { ReactNode } from "react";

type AccentColor =
  | "sky"
  | "cyan"
  | "violet"
  | "emerald"
  | "fuchsia"
  | "amber"
  | "rose";

const ACCENT_STYLES: Record<AccentColor, { bg: string; border: string; text: string; glow: string; line: string; halo: string }> = {
  sky: {
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    text: "text-sky-400",
    glow: "shadow-[0_0_10px_rgba(14,165,233,0.1)]",
    line: "from-sky-500/50 via-sky-500/10 to-transparent",
    halo: "bg-sky-500/[0.08]",
  },
  cyan: {
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    text: "text-cyan-400",
    glow: "shadow-[0_0_10px_rgba(6,182,212,0.1)]",
    line: "from-cyan-500/50 via-cyan-500/10 to-transparent",
    halo: "bg-cyan-500/[0.08]",
  },
  violet: {
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    text: "text-violet-400",
    glow: "shadow-[0_0_10px_rgba(139,92,246,0.12)]",
    line: "from-violet-500/50 via-violet-500/10 to-transparent",
    halo: "bg-violet-500/[0.08]",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    glow: "shadow-[0_0_10px_rgba(16,185,129,0.12)]",
    line: "from-emerald-500/50 via-emerald-500/10 to-transparent",
    halo: "bg-emerald-500/[0.08]",
  },
  fuchsia: {
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/20",
    text: "text-fuchsia-400",
    glow: "shadow-[0_0_10px_rgba(217,70,239,0.12)]",
    line: "from-fuchsia-500/50 via-fuchsia-500/10 to-transparent",
    halo: "bg-fuchsia-500/[0.08]",
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
    glow: "shadow-[0_0_10px_rgba(245,158,11,0.12)]",
    line: "from-amber-500/50 via-amber-500/10 to-transparent",
    halo: "bg-amber-500/[0.08]",
  },
  rose: {
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    text: "text-rose-400",
    glow: "shadow-[0_0_10px_rgba(244,63,94,0.12)]",
    line: "from-rose-500/50 via-rose-500/10 to-transparent",
    halo: "bg-rose-500/[0.08]",
  },
};

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  accent?: AccentColor;
  /** Right-aligned slot for action chips, status pills, or buttons. */
  right?: ReactNode;
  /** Adds extra bottom padding when the page has its own tab bar below. */
  flushBottom?: boolean;
}

export function PageHeader({
  icon,
  title,
  subtitle,
  accent = "sky",
  right,
  flushBottom,
}: PageHeaderProps) {
  const styles = ACCENT_STYLES[accent];
  return (
    <div className="relative">
      {/* Ambient accent halo — sits behind the header at low opacity, */}
      {/* keyed to the page accent. Adds depth without cost.            */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-12 -left-6 h-32 w-64 ${styles.halo} blur-3xl opacity-50`}
      />
      <div className={`relative px-5 pt-4 ${flushBottom ? "pb-1.5" : "pb-3"} flex items-center gap-2.5`}>
        <div
          className={`h-8 w-8 rounded-lg ${styles.bg} border ${styles.border} flex items-center justify-center ${styles.glow} shrink-0`}
        >
          <span className={`${styles.text} flex items-center justify-center`} aria-hidden="true">
            {icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-heading font-bold tracking-tight text-foreground leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
      </div>
      {/* Signature accent line — the canonical scan-line under every  */}
      {/* page header. Subtle gradient that reinforces the page's      */}
      {/* identity color in one pixel of vertical real estate.          */}
      <div className={`h-px bg-gradient-to-r ${styles.line}`} aria-hidden="true" />
    </div>
  );
}
