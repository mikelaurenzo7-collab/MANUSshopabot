/**
 * Canonical platform brand registry — every surface that shows a
 * platform tile, badge, or chip pulls from here. Single source of
 * truth for icon, color, gradient, and one-liner across all 14
 * e-commerce + 7 social + 9 tool integrations.
 *
 * Why this exists: Sprint 27 added 7 new platforms but the legacy
 * PLATFORM_COLORS/ICONS maps lived in three different files (Integrations,
 * StoreView, PlatformHealth) and none had been updated. Centralizing
 * stops the drift and unlocks design upgrades — gradients, capability
 * halos, hero ribbons — that read every platform's brand consistently.
 */

export interface PlatformBrand {
  id: string;
  /** Display name. */
  name: string;
  /** Single-glyph emoji. Fast to render, no asset bundle. */
  icon: string;
  /** Primary brand hex — used for borders, accents, ring glow. */
  color: string;
  /** Secondary hex — pair with `color` for gradient ribbons. */
  accent: string;
  /** Functional category for grouping + filtering. */
  category:
    | "storefront"
    | "marketplace"
    | "social_commerce"
    | "social"
    | "ads"
    | "email"
    | "analytics"
    | "fulfillment"
    | "messaging"
    | "reviews"
    | "support"
    | "data";
  /** Bot-readable one-liner — surfaced on cards under the name. */
  tagline: string;
}

/* ─── E-commerce surfaces (14) ─────────────────────────────────────── */
export const ECOMMERCE_BRANDS: Record<string, PlatformBrand> = {
  shopify: {
    id: "shopify", name: "Shopify", icon: "🛍️",
    color: "#95BF47", accent: "#5E8E3E", category: "storefront",
    tagline: "Modern storefront with full webhook coverage",
  },
  woocommerce: {
    id: "woocommerce", name: "WooCommerce", icon: "🌐",
    color: "#96588A", accent: "#674399", category: "storefront",
    tagline: "Self-hosted WordPress storefront — zero platform fees",
  },
  amazon: {
    id: "amazon", name: "Amazon", icon: "📦",
    color: "#FF9900", accent: "#232F3E", category: "marketplace",
    tagline: "World's largest marketplace · FBA + Buy-Box battle",
  },
  etsy: {
    id: "etsy", name: "Etsy", icon: "🧡",
    color: "#F1641E", accent: "#D44910", category: "marketplace",
    tagline: "Handmade · vintage · craft — tags drive discovery",
  },
  ebay: {
    id: "ebay", name: "eBay", icon: "🔨",
    color: "#E53238", accent: "#0064D2", category: "marketplace",
    tagline: "Auctions + Buy-It-Now across every category",
  },
  tiktok_shop: {
    id: "tiktok_shop", name: "TikTok Shop", icon: "🎵",
    color: "#000000", accent: "#FE2C55", category: "social_commerce",
    tagline: "Live commerce + creator-driven viral product launches",
  },
  walmart: {
    id: "walmart", name: "Walmart", icon: "🏪",
    color: "#0071CE", accent: "#FFC220", category: "marketplace",
    tagline: "Lower fees than Amazon · WFS Prime-equivalent shipping",
  },
  // Sprint 27 expansion
  depop: {
    id: "depop", name: "Depop", icon: "👗",
    color: "#FF2300", accent: "#FF6B6B", category: "marketplace",
    tagline: "Gen-Z vintage · streetwear · y2k — hashtags drive 60%",
  },
  bigcommerce: {
    id: "bigcommerce", name: "BigCommerce", icon: "🛒",
    color: "#34313F", accent: "#1B6BA3", category: "storefront",
    tagline: "Mid-market SaaS storefront · webhook-first architecture",
  },
  square: {
    id: "square", name: "Square", icon: "⬜",
    color: "#3E4348", accent: "#006AFF", category: "storefront",
    tagline: "Square POS + Online Store · multi-location native",
  },
  faire: {
    id: "faire", name: "Faire", icon: "🏪",
    color: "#3D2E2C", accent: "#F5C04A", category: "marketplace",
    tagline: "Indie wholesale marketplace · Net-60 financing",
  },
  bonanza: {
    id: "bonanza", name: "Bonanza", icon: "🎪",
    color: "#FF6B35", accent: "#FFD23F", category: "marketplace",
    tagline: "Long-tail collectibles · Google Shopping syndication",
  },
  stockx: {
    id: "stockx", name: "StockX", icon: "📈",
    color: "#006340", accent: "#00FF7F", category: "marketplace",
    tagline: "Bid/ask resale · sneakers · streetwear · watches",
  },
  reverb: {
    id: "reverb", name: "Reverb", icon: "🎸",
    color: "#F95E1A", accent: "#000000", category: "marketplace",
    tagline: "Music gear marketplace · pedals · synths · pro audio",
  },
};

/* ─── Social surfaces (7) ──────────────────────────────────────────── */
export const SOCIAL_BRANDS: Record<string, PlatformBrand> = {
  meta: {
    id: "meta", name: "Meta", icon: "📘",
    color: "#1877F2", accent: "#42A5F5", category: "social",
    tagline: "Facebook + Instagram · ads + organic in one console",
  },
  facebook: {
    id: "facebook", name: "Facebook", icon: "📘",
    color: "#1877F2", accent: "#42A5F5", category: "social",
    tagline: "Pages, Groups, and ad reach beyond the under-30 crowd",
  },
  instagram: {
    id: "instagram", name: "Instagram", icon: "📸",
    color: "#E4405F", accent: "#F77737", category: "social",
    tagline: "Stories + Reels + Shopping — visual-first commerce",
  },
  tiktok: {
    id: "tiktok", name: "TikTok", icon: "🎵",
    color: "#010101", accent: "#FE2C55", category: "social",
    tagline: "Short-form video · viral mechanics · Gen-Z native",
  },
  twitter: {
    id: "twitter", name: "Twitter / X", icon: "🐦",
    color: "#1DA1F2", accent: "#0E1419", category: "social",
    tagline: "Realtime conversation + brand monitoring + threads",
  },
  pinterest: {
    id: "pinterest", name: "Pinterest", icon: "📌",
    color: "#E60023", accent: "#BD081C", category: "social",
    tagline: "Visual discovery · evergreen · 6-mo planning horizon",
  },
  google_ads: {
    id: "google_ads", name: "Google Ads", icon: "📊",
    color: "#4285F4", accent: "#34A853", category: "ads",
    tagline: "Search + Display + YouTube + Shopping · purchase intent",
  },
  gmail: {
    id: "gmail", name: "Gmail", icon: "📧",
    color: "#EA4335", accent: "#FBBC04", category: "email",
    tagline: "Transactional + lifecycle email at workspace scale",
  },
  // Sprint 27.5 social additions
  outlook: {
    id: "outlook", name: "Outlook", icon: "📨",
    color: "#0078D4", accent: "#50E6FF", category: "email",
    tagline: "Microsoft Graph · B2B inboxes · meetings on the same token",
  },
  slack: {
    id: "slack", name: "Slack", icon: "💬",
    color: "#4A154B", accent: "#ECB22E", category: "messaging",
    tagline: "VIP customer + community channel · Block Kit announcements",
  },
  youtube: {
    id: "youtube", name: "YouTube", icon: "▶️",
    color: "#FF0000", accent: "#282828", category: "social",
    tagline: "Shorts feed + long-form · SEO-compounding video distribution",
  },
};

/* ─── Tool surfaces (9) ────────────────────────────────────────────── */
export const TOOL_BRANDS: Record<string, PlatformBrand> = {
  google_sheets: {
    id: "google_sheets", name: "Google Sheets", icon: "📊",
    color: "#0F9D58", accent: "#34A853", category: "data",
    tagline: "Catalog sync · log events · share P&L tabs with bots",
  },
  google_analytics: {
    id: "google_analytics", name: "Google Analytics 4", icon: "📈",
    color: "#F9AB00", accent: "#FBBC04", category: "analytics",
    tagline: "Channel attribution · conversion paths · revenue mix",
  },
  klaviyo: {
    id: "klaviyo", name: "Klaviyo", icon: "💌",
    color: "#5C50C6", accent: "#7C71D6", category: "email",
    tagline: "Email + SMS flows · segment-driven lifecycle ops",
  },
  shipstation: {
    id: "shipstation", name: "ShipStation", icon: "📦",
    color: "#0072CE", accent: "#00B0FF", category: "fulfillment",
    tagline: "Multi-carrier rates · labels · margin-aware shipping",
  },
  postscript: {
    id: "postscript", name: "Postscript", icon: "📱",
    color: "#FF5C35", accent: "#FF8A65", category: "messaging",
    tagline: "SMS broadcasts · cart recovery · keyword campaigns",
  },
  printful: {
    id: "printful", name: "Printful", icon: "👕",
    color: "#0E1116", accent: "#19A974", category: "fulfillment",
    tagline: "Print-on-demand · auto-fulfill · zero inventory risk",
  },
  judgeme: {
    id: "judgeme", name: "Judge.me", icon: "⭐",
    color: "#FF642F", accent: "#FFA726", category: "reviews",
    tagline: "Pull reviews · triage · power UGC for the Social bot",
  },
  gorgias: {
    id: "gorgias", name: "Gorgias", icon: "🎧",
    color: "#1B66FF", accent: "#42A5F5", category: "support",
    tagline: "Ticket triage by intent · auto-answer order status",
  },
};

/* ─── Lookup helpers ───────────────────────────────────────────────── */
export function getBrand(id: string): PlatformBrand {
  return (
    ECOMMERCE_BRANDS[id] ||
    SOCIAL_BRANDS[id] ||
    TOOL_BRANDS[id] || {
      id,
      name: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: "🔌",
      color: "#64748b",
      accent: "#94a3b8",
      category: "data",
      tagline: "Custom integration",
    }
  );
}

/** Color-only lookup. Cheaper than getBrand when only the hex is needed. */
export function getBrandColor(id: string): string {
  return getBrand(id).color;
}

/** Linear-gradient string suitable for `background:` or `borderImageSource`. */
export function getBrandGradient(id: string, angle = 135): string {
  const b = getBrand(id);
  return `linear-gradient(${angle}deg, ${b.color}, ${b.accent})`;
}

/** A radial halo for hero ribbons / hover glows. */
export function getBrandHalo(id: string, alpha = 0.35): string {
  const b = getBrand(id);
  // Hex → rgba so we can tune alpha cleanly.
  const hex = b.color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const bb = parseInt(hex.substring(4, 6), 16);
  return `radial-gradient(circle at 0% 0%, rgba(${r}, ${g}, ${bb}, ${alpha}) 0%, transparent 60%)`;
}
