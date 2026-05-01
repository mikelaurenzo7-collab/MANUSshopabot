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
import { useIsInsideWorkspaceShell } from "@/components/workspace/WorkspaceShell";

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
    glow: "shadow-[0_0_16px_rgba(14,165,233,0.18),0_0_32px_rgba(14,165,233,0.08)]",
    line: "from-sky-500/60 via-sky-500/15 to-transparent",
    halo: "bg-sky-500/[0.08]",
  },
  cyan: {
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    text: "text-cyan-400",
    glow: "shadow-[0_0_16px_rgba(6,182,212,0.18),0_0_32px_rgba(6,182,212,0.08)]",
    line: "from-cyan-500/60 via-cyan-500/15 to-transparent",
    halo: "bg-cyan-500/[0.08]",
  },
  violet: {
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    text: "text-violet-400",
    glow: "shadow-[0_0_16px_rgba(139,92,246,0.18),0_0_32px_rgba(139,92,246,0.08)]",
    line: "from-violet-500/60 via-violet-500/15 to-transparent",
    halo: "bg-violet-500/[0.08]",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    glow: "shadow-[0_0_16px_rgba(16,185,129,0.18),0_0_32px_rgba(16,185,129,0.08)]",
    line: "from-emerald-500/60 via-emerald-500/15 to-transparent",
    halo: "bg-emerald-500/[0.08]",
  },
  fuchsia: {
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/20",
    text: "text-fuchsia-400",
    glow: "shadow-[0_0_16px_rgba(217,70,239,0.18),0_0_32px_rgba(217,70,239,0.08)]",
    line: "from-fuchsia-500/60 via-fuchsia-500/15 to-transparent",
    halo: "bg-fuchsia-500/[0.08]",
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
    glow: "shadow-[0_0_16px_rgba(245,158,11,0.18),0_0_32px_rgba(245,158,11,0.08)]",
    line: "from-amber-500/60 via-amber-500/15 to-transparent",
    halo: "bg-amber-500/[0.08]",
  },
  rose: {
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    text: "text-rose-400",
    glow: "shadow-[0_0_16px_rgba(244,63,94,0.18),0_0_32px_rgba(244,63,94,0.08)]",
    line: "from-rose-500/60 via-rose-500/15 to-transparent",
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
  // When this header is rendered inside a `<WorkspaceShell>` we collapse
  // it to a thin compact row — the shell already shows the store identity
  // + workspace sub-nav, so a second giant title row would feel like
  // duplicated chrome. The page's `right` slot (action buttons) still
  // renders so functionality isn't lost.
  const insideWorkspace = useIsInsideWorkspaceShell();
  if (insideWorkspace) {
    return (
      <div className="px-3 sm:px-4 md:px-6 pt-3 pb-1 flex items-center gap-2.5">
        <span className={`${styles.text} shrink-0`} aria-hidden="true">{icon}</span>
        <div className="min-w-0 flex-1">
          {/* Title becomes an eyebrow — workspace shell already owns the H1 */}
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/55 truncate">
            {title}
          </p>
          {subtitle && (
            <p className="text-[11px] text-white/45 truncate mt-0.5 leading-snug hidden sm:block">
              {subtitle}
            </p>
          )}
        </div>
        {right && <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">{right}</div>}
      </div>
    );
  }
  return (
    <div className="relative">
      {/* Ambient accent halo — sits behind the header at low opacity, */}
      {/* keyed to the page accent. Adds depth without cost.            */}
      {/* Responsive sizing: smaller on mobile to prevent overflow */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-16 -left-8 h-32 w-48 sm:h-48 sm:w-80 ${styles.halo} blur-3xl opacity-60`}
      />
      {/* Secondary halo — a smaller, more focused glow behind the icon */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute top-0 left-4 h-12 w-20 sm:h-16 sm:w-28 ${styles.halo} blur-2xl opacity-40`}
      />
      <div className={`relative px-3 sm:px-4 md:px-6 pt-4 sm:pt-5 ${flushBottom ? "pb-2" : "pb-3 sm:pb-4"} flex items-center gap-2 sm:gap-3`}>
        {/* Icon plate — responsive sizing for better mobile layout */}
        <div
          className={`h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl ${styles.bg} border ${styles.border} flex items-center justify-center ${styles.glow} shrink-0 transition-all duration-500 hover:scale-110 hover:shadow-premium-lg`}
        >
          <span className={`${styles.text} flex items-center justify-center text-sm sm:text-base`} aria-hidden="true">
            {icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-heading font-bold tracking-tight text-foreground leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-[12px] text-white/45 truncate mt-0.5 leading-snug hidden xs:block">{subtitle}</p>
          )}
        </div>
        {right && <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">{right}</div>}
      </div>
      {/* Signature accent line — animated sweep for a dynamic edge. */}
      <div
        className={`page-accent-line bg-gradient-to-r ${styles.line}`}
        aria-hidden="true"
      />
    </div>
  );
}
