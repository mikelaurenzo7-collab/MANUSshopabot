/**
 * Sparkline — tiny inline trendline rendered as raw SVG, no dependencies.
 *
 * Used on the workspace hero stat tiles to turn static numbers into
 * glance-readable trends. Optimised for sub-100px widths and dense
 * data — we use a viewBox that scales cleanly and a single `path` per
 * line so the DOM cost is negligible at scale.
 *
 * Empty / single-point data renders a flat hairline so the layout
 * doesn't jump when a freshly-connected store has nothing yet.
 */
import { useMemo } from "react";

interface SparklineProps {
  /** Series of numeric values, oldest → newest. */
  data: number[];
  /** Width in px (default 64, fits the workspace hero stat tile). */
  width?: number;
  /** Height in px (default 20). */
  height?: number;
  /** Stroke color (CSS color string). Defaults to a soft sky tone. */
  color?: string;
  /** When true, the gradient under the line is filled. */
  filled?: boolean;
  /** Stroke width in px (default 1.5). */
  strokeWidth?: number;
  /** Optional accessible label so screen readers describe the trend. */
  label?: string;
}

export function Sparkline({
  data,
  width = 64,
  height = 20,
  color = "rgba(56,189,248,0.85)",
  filled = true,
  strokeWidth = 1.5,
  label,
}: SparklineProps) {
  const { d, areaD, lastX, lastY } = useMemo(() => {
    if (!data.length) {
      // Single flat hairline — keeps the tile from collapsing on first paint.
      const midY = height / 2;
      return {
        d: `M 0 ${midY} L ${width} ${midY}`,
        areaD: "",
        lastX: width,
        lastY: midY,
      };
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const xStep = data.length > 1 ? width / (data.length - 1) : width;
    const points = data.map((v, i) => {
      // Y is inverted (SVG 0,0 is top-left); inset by 1px so stroke isn't clipped.
      const x = i * xStep;
      const y = height - 1 - ((v - min) / range) * (height - 2);
      return [x, y] as const;
    });
    const path = points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ");
    const area = `${path} L ${width} ${height} L 0 ${height} Z`;
    const [lx, ly] = points[points.length - 1];
    return { d: path, areaD: area, lastX: lx, lastY: ly };
  }, [data, width, height]);

  const gradientId = useMemo(
    () => `sparkline-grad-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible shrink-0"
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {filled && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {filled && areaD && <path d={areaD} fill={`url(#${gradientId})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      {data.length > 0 && (
        // Trailing dot — anchors the eye on "where we are now".
        <circle cx={lastX} cy={lastY} r={1.6} fill={color} />
      )}
    </svg>
  );
}
