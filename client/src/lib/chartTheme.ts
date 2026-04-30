/**
 * Recharts theming bound to the design-token system.
 *
 * Recharts accepts CSS-variable references in `fill`/`stroke` props and in
 * the inline `contentStyle`/`labelStyle` objects, so consumers can use the
 * exports below in place of raw hex strings without losing token control.
 *
 * Audit P1 #6 (`AUDIT_2026_04.md` row 6): consolidates the duplicated
 * `CHART_COLORS` / `TOOLTIP_STYLE` / `LABEL_STYLE` constants previously
 * sprinkled across `Analytics.tsx`, `Intelligence.tsx`, and
 * `CampaignFunnel.tsx`.
 */

import type { CSSProperties } from "react";

/** Categorical palette wired to `--chart-1`…`--chart-5`. The 6th slot reuses
 *  `--chart-2` (cyan) so unbounded series wrap predictably. */
export const CHART_COLORS: readonly string[] = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-2)",
];

/** Pick a chart color cyclically — useful for unbounded series counts. */
export function chartColor(index: number): string {
  return CHART_COLORS[((index % CHART_COLORS.length) + CHART_COLORS.length) % CHART_COLORS.length];
}

/** Tooltip surface — matches popover/glass-elevated styling. */
export const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  fontSize: "11px",
  color: "var(--popover-foreground)",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
};

/** Tooltip label (the X-axis value at the top of the tooltip). */
export const LABEL_STYLE: CSSProperties = {
  color: "var(--muted-foreground)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: "9px",
};

/** Axis tick / cartesian grid styling helpers. */
export const AXIS_TICK_STYLE: CSSProperties = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
};

export const GRID_STROKE = "var(--border)";
