/**
 * CountUp — animates a number from 0 (or a starting value) to the
 * target on mount and on subsequent updates.
 *
 * Use for metric cards (revenue, orders, active stores, pending
 * approvals). Adds a small dopamine hit on every page load without
 * costing real performance — a single requestAnimationFrame loop
 * that finishes inside 800ms by default.
 *
 * Honors `prefers-reduced-motion` — users who've opted out skip the
 * animation and see the final value immediately.
 */
import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  /** Target value. */
  value: number;
  /** Animation duration in ms. Default: 800. */
  duration?: number;
  /** Decimal places to render. Default: 0. */
  decimals?: number;
  /** Optional prefix (e.g., "$"). */
  prefix?: string;
  /** Optional suffix (e.g., "%"). */
  suffix?: string;
  /** Format with thousands separators (default: true). */
  separator?: boolean;
  /** Optional className on the rendered span. */
  className?: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function CountUp({
  value,
  duration = 800,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator = true,
  className,
}: CountUpProps) {
  const [display, setDisplay] = useState<number>(value);
  const fromRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || duration <= 0) {
      setDisplay(value);
      return;
    }

    fromRef.current = display;
    startRef.current = performance.now();
    const range = value - fromRef.current;

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const next = fromRef.current + range * easeOutCubic(t);
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted = (() => {
    const fixed = display.toFixed(decimals);
    if (!separator) return fixed;
    const [whole, frac] = fixed.split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return frac !== undefined ? `${grouped}.${frac}` : grouped;
  })();

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
