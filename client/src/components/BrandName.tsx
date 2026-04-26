/**
 * Shop_a_Bot — Brand Name Component
 * "Shop" in white, "_a_" in cyan gradient, "Bot" in white
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
      aria-label="Shop_a_Bot"
    >
      <span className="text-white">Shop</span>
      <span className="bg-gradient-to-r from-cyan-400 to-sky-400 bg-clip-text text-transparent">
        _a_
      </span>
      <span className="text-white">Bot</span>
    </span>
  );
}

/** Plain text version for non-JSX contexts (tooltips, aria-labels, etc.) */
export const BRAND_NAME = "Shop_a_Bot";

/** Technical/package name (no special chars) */
export const BRAND_SLUG = "shop_a_bot";

export default BrandName;
