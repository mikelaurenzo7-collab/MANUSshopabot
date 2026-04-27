/**
 * Celebration.tsx — small, dependency-free micro-celebration overlay.
 *
 * Item 7 of the onboarding-polish proposal: confetti / shimmer on first
 * store connect and first launch. We deliberately avoid pulling in a
 * confetti library — the visual is a handful of CSS-animated dots
 * positioned absolutely and a soft radial shimmer behind the trigger.
 *
 * Behaviour:
 *   • Auto-unmounts after `durationMs` (default 1800ms) so it can be
 *     dropped into any tree with `<Celebration trigger={x} />`.
 *   • Honours `prefers-reduced-motion` — falls back to a static shimmer
 *     glow without animated particles (item 11 spirit).
 *   • Pointer-events-none + aria-hidden so it never traps focus or
 *     breaks accessibility.
 */
import { useEffect, useState } from "react";

interface CelebrationProps {
  /**
   * Increment / change this prop to trigger a celebration. The component
   * is keyed off the value so consumers can fire repeated celebrations
   * by passing a counter.
   */
  trigger: number | string | boolean | null | undefined;
  durationMs?: number;
  /** Visual intensity — `subtle` is a glow only, `full` adds particles. */
  variant?: "subtle" | "full";
}

const PARTICLE_COLORS = [
  "#38bdf8", // sky-400
  "#22d3ee", // cyan-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#f472b6", // pink-400
];

export function Celebration({
  trigger,
  durationMs = 1800,
  variant = "full",
}: CelebrationProps) {
  const [visibleKey, setVisibleKey] = useState<typeof trigger>(null);

  useEffect(() => {
    if (trigger === null || trigger === undefined || trigger === false) return;
    setVisibleKey(trigger);
    const t = setTimeout(() => setVisibleKey(null), durationMs);
    return () => clearTimeout(t);
  }, [trigger, durationMs]);

  if (!visibleKey) return null;

  const particles = variant === "full" ? 18 : 0;

  return (
    <div
      key={String(visibleKey)}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden flex items-center justify-center"
    >
      {/* Soft radial shimmer glow — kept for reduced-motion users so they
          still get a visual ack of the milestone, just without the
          fade/zoom intro animation. */}
      <div
        className="absolute h-48 w-48 rounded-full bg-gradient-to-br from-sky-400/30 via-cyan-300/20 to-transparent blur-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-500"
        style={{ animationFillMode: "forwards" }}
      />
      {/* Particles — only for users who haven't opted out of motion. */}
      {Array.from({ length: particles }).map((_, i) => {
        const angle = (i / particles) * Math.PI * 2;
        const distance = 90 + ((i * 13) % 40);
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
        const delay = (i % 5) * 30;
        const particleStyle: React.CSSProperties & {
          ["--cx"]?: string;
          ["--cy"]?: string;
        } = {
          backgroundColor: color,
          boxShadow: `0 0 6px ${color}`,
          animation: `celebrate-particle ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms forwards`,
          "--cx": `${dx}px`,
          "--cy": `${dy}px`,
        };
        return (
          <span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full motion-reduce:hidden"
            style={particleStyle}
          />
        );
      })}
      {/* Inline keyframes — keeps the component fully self-contained so
          consumers don't have to remember to import a CSS file. */}
      <style>{`
        @keyframes celebrate-particle {
          0% {
            transform: translate(0, 0) scale(0.6);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          100% {
            transform: translate(var(--cx), var(--cy)) scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
