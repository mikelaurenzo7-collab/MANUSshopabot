/**
 * orchAIstrate — Brand Name Component
 * The "AI" is the hero: bold, gradient, slightly larger, with a subtle glow.
 * "orch" and "strate" are understated lowercase to let "AI" dominate.
 */

interface BrandNameProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "hero";
}

const sizeMap: Record<string, { base: string; ai: string }> = {
  sm:   { base: "text-sm",   ai: "text-base"  },
  md:   { base: "text-base", ai: "text-lg"    },
  lg:   { base: "text-lg",   ai: "text-xl"    },
  xl:   { base: "text-xl",   ai: "text-2xl"   },
  "2xl":{ base: "text-2xl",  ai: "text-3xl"   },
  hero: { base: "text-4xl md:text-5xl", ai: "text-5xl md:text-6xl" },
};

export function BrandName({ className = "", size = "md" }: BrandNameProps) {
  const s = sizeMap[size] || sizeMap.md;
  return (
    <span
      className={`inline-flex items-baseline font-medium tracking-tight ${s.base} ${className}`}
      aria-label="orchAIstrate"
    >
      <span className="text-muted-foreground/80">orch</span>
      <span
        className={`${s.ai} font-black bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(14,165,233,0.5)]`}
      >
        AI
      </span>
      <span className="text-muted-foreground/80">strate</span>
    </span>
  );
}

/** Plain text version for non-JSX contexts (tooltips, aria-labels, etc.) */
export const BRAND_NAME = "orchAIstrate";

/** Technical/package name (no special chars) */
export const BRAND_SLUG = "orchaistrate";

export default BrandName;
