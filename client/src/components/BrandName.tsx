/**
 * SHOPaBOT — Brand Name Component
 * "SHOP" in white, "a" in cyan gradient, "BOT" in white
 */

interface BrandNameProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "hero";
}

const sizeMap: Record<string, string> = {
  sm:    "text-sm",
  md:    "text-base",
  lg:    "text-lg",
  xl:    "text-xl",
  "2xl": "text-2xl",
  hero:  "text-4xl md:text-5xl",
};

export function BrandName({ className = "", size = "md" }: BrandNameProps) {
  const sizeClass = sizeMap[size] || sizeMap.md;
  return (
    <span
      className={`inline-flex items-baseline font-black tracking-tight ${sizeClass} ${className}`}
      aria-label="SHOPaBOT"
    >
      <span className="text-white">SHOP</span>
      <span className="bg-gradient-to-r from-cyan-400 to-sky-400 bg-clip-text text-transparent">
        a
      </span>
      <span className="text-white">BOT</span>
    </span>
  );
}

/** Plain text version for non-JSX contexts (tooltips, aria-labels, etc.) */
export const BRAND_NAME = "SHOPaBOT";

/** Technical/package name (no special chars) */
export const BRAND_SLUG = "shopabots";

export default BrandName;
