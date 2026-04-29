/**
 * PulseStream.tsx — ambient EKG that telegraphs liveness.
 *
 * A small, signature visual that lives in bot-page headers (and
 * anywhere the dashboard wants to show "the bots are alive"). It
 * renders an SVG line that draws an EKG-style waveform when the
 * agent is running, and a gentle baseline pulse when idle.
 *
 * The waveform is computed CSS-side via a `stroke-dashoffset`
 * animation — zero React state, zero RAF loop, GPU-cheap. The
 * "running" mode just speeds up the animation + thickens the stroke.
 */
import { useMemo } from "react";

interface PulseStreamProps {
  /** "running" speeds up + thickens; "ready" stays slow + soft. */
  status?: "running" | "ready" | "error" | "idle";
  /** Brand color for the line. Pairs with the bot identity. */
  color?: string;
  /** Width of the SVG. Default 96 fits any bot-page header chip. */
  width?: number;
  /** Height of the SVG. */
  height?: number;
  /** Optional aria label so screen readers know what this conveys. */
  label?: string;
}

export function PulseStream({
  status = "ready",
  color = "#38bdf8",
  width = 96,
  height = 24,
  label,
}: PulseStreamProps) {
  // Baseline EKG path — a long flat run with two heartbeat spikes.
  // Repeats inside the SVG by being long enough that the dash
  // animation cycles without showing the seam.
  const path = useMemo(() => {
    const baseline = height / 2;
    const spike = height * 0.85;
    const dip = height * 0.15;
    // EKG-ish shape: flat → small dip → big spike → small dip → flat.
    return [
      `M 0 ${baseline}`,
      `L ${width * 0.18} ${baseline}`,
      `L ${width * 0.22} ${baseline - 2}`,
      `L ${width * 0.26} ${baseline + 2}`,
      `L ${width * 0.3} ${baseline}`,
      `L ${width * 0.36} ${baseline}`,
      `L ${width * 0.4} ${baseline - height * 0.12}`,
      `L ${width * 0.42} ${spike}`,
      `L ${width * 0.44} ${dip}`,
      `L ${width * 0.46} ${baseline}`,
      `L ${width * 0.6} ${baseline}`,
      `L ${width * 0.64} ${baseline + 2}`,
      `L ${width * 0.68} ${baseline - 2}`,
      `L ${width * 0.72} ${baseline}`,
      `L ${width} ${baseline}`,
    ].join(" ");
  }, [width, height]);

  const isRunning = status === "running";
  const isError = status === "error";
  const lineColor = isError ? "#ef4444" : color;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pulse-stream"
      data-status={status}
      role="img"
      aria-label={label ?? `Bot pulse: ${status}`}
    >
      <defs>
        <linearGradient id="pulse-fade" x1="0" x2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0" />
          <stop offset="20%" stopColor={lineColor} stopOpacity="0.6" />
          <stop offset="80%" stopColor={lineColor} stopOpacity="0.6" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="url(#pulse-fade)"
        strokeWidth={isRunning ? 2 : 1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pulse-stream-line"
        style={{
          filter: isRunning ? `drop-shadow(0 0 4px ${lineColor})` : undefined,
        }}
      />
    </svg>
  );
}
