#!/usr/bin/env node
/**
 * Comprehensive platform additions:
 * 1. Move Google Ads from SOCIAL_PLATFORMS to tools router
 * 2. Add 7 new e-commerce platforms: Depop, BigCommerce, Square, Faire, Bonanza, StockX, Reverb
 * 3. Add env vars for new platforms
 * 4. Update connectors router availability checks
 * 5. Update frontend Integrations page
 */

import fs from "fs";
import path from "path";

const PROJECT_ROOT = "/home/ubuntu/beast-bots";

// ─── STEP 1: Update env.ts to add new platform env vars ───────────────────

const envFile = path.join(PROJECT_ROOT, "server/_core/env.ts");
let envContent = fs.readFileSync(envFile, "utf-8");

// Find the Google Ads section and add new platforms after it
const newEnvVars = `
  // Depop
  depopAppId: process.env.DEPOP_APP_ID ?? "",
  depopAppSecret: process.env.DEPOP_APP_SECRET ?? "",
  // BigCommerce
  bigcommerceClientId: process.env.BIGCOMMERCE_CLIENT_ID ?? "",
  bigcommerceClientSecret: process.env.BIGCOMMERCE_CLIENT_SECRET ?? "",
  // Square
  squareClientId: process.env.SQUARE_CLIENT_ID ?? "",
  squareClientSecret: process.env.SQUARE_CLIENT_SECRET ?? "",
  // Faire
  faireApiKey: process.env.FAIRE_API_KEY ?? "",
  // Bonanza
  bonanzaDevId: process.env.BONANZA_DEV_ID ?? "",
  bonanzaCertId: process.env.BONANZA_CERT_ID ?? "",
  // StockX
  stockxClientId: process.env.STOCKX_CLIENT_ID ?? "",
  stockxClientSecret: process.env.STOCKX_CLIENT_SECRET ?? "",
  // Reverb
  reverbClientId: process.env.REVERB_CLIENT_ID ?? "",
  reverbClientSecret: process.env.REVERB_CLIENT_SECRET ?? "",`;

// Insert after Google Ads section
const insertPoint = envContent.indexOf("// Facebook Page ID for bot notifications");
if (insertPoint > -1) {
  envContent = envContent.slice(0, insertPoint) + newEnvVars + "\n  " + envContent.slice(insertPoint);
  fs.writeFileSync(envFile, envContent);
  console.log("✓ Updated env.ts with new platform env vars");
}

// ─── STEP 2: Update connectors.ts ────────────────────────────────────────

const connectorsFile = path.join(PROJECT_ROOT, "server/routers/connectors.ts");
let connectorsContent = fs.readFileSync(connectorsFile, "utf-8");

// Add new e-commerce platforms to ECOMMERCE_PLATFORMS
const newPlatforms = `
  depop: {
    name: "Depop",
    icon: "👗",
    color: "#00D084",
    connectionType: "oauth" as const,
    description: "Manage Depop shop — inventory, orders, and shipping",
    oauthConfig: {
      authUrl: (_: string, clientId: string, scopes: string, redirectUri: string, state: string) =>
        \`https://partnerapi.depop.com/oauth/authorize?client_id=\${clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}&response_type=code&scope=\${encodeURIComponent(scopes)}&state=\${state}\`,
      tokenUrl: () => "https://partnerapi.depop.com/oauth/token",
      scopes: "inventory:read inventory:write orders:read orders:write shipping:read shipping:write",
    },
    capabilities: ["listings", "orders", "inventory", "shipping"],
  },
  bigcommerce: {
    name: "BigCommerce",
    icon: "🛒",
    color: "#003366",
    connectionType: "oauth" as const,
    description: "Manage BigCommerce store — products, orders, customers",
    oauthConfig: {
      authUrl: (_: string, clientId: string, scopes: string, redirectUri: string, state: string) =>
        \`https://login.bigcommerce.com/oauth2/authorize?client_id=\${clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}&response_type=code&scope=\${encodeURIComponent(scopes)}&state=\${state}\`,
      tokenUrl: () => "https://login.bigcommerce.com/oauth2/token",
      scopes: "store_v2_products store_v2_orders store_v2_customers store_v2_inventory",
    },
    capabilities: ["products", "orders", "customers", "inventory"],
  },
  square: {
    name: "Square",
    icon: "⬜",
    color: "#3E4348",
    connectionType: "oauth" as const,
    description: "Manage Square store — catalog, orders, payments",
    oauthConfig: {
      authUrl: (_: string, clientId: string, scopes: string, redirectUri: string, state: string) =>
        \`https://connect.squareup.com/oauth2/authorize?client_id=\${clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}&response_type=code&scope=\${encodeURIComponent(scopes)}&state=\${state}\`,
      tokenUrl: () => "https://connect.squareup.com/oauth2/token",
      scopes: "MERCHANT_PROFILE_READ CATALOG_READ ORDERS_READ ORDERS_WRITE INVENTORY_READ",
    },
    capabilities: ["catalog", "orders", "inventory", "payments"],
  },
  faire: {
    name: "Faire",
    icon: "🏪",
    color: "#6B5B95",
    connectionType: "api_key" as const,
    description: "Wholesale marketplace — manage orders and inventory",
    requiredFields: ["apiKey"],
    capabilities: ["orders", "inventory", "wholesale"],
  },
  bonanza: {
    name: "Bonanza",
    icon: "🎪",
    color: "#FF6B35",
    connectionType: "api_key" as const,
    description: "Marketplace via Bonapitit API — enter your Developer ID and Certificate",
    requiredFields: ["devId", "certId"],
    capabilities: ["listings", "orders", "inventory"],
  },
  stockx: {
    name: "StockX",
    icon: "📈",
    color: "#000000",
    connectionType: "oauth" as const,
    description: "Resale marketplace — manage listings and orders",
    oauthConfig: {
      authUrl: (_: string, clientId: string, scopes: string, redirectUri: string, state: string) =>
        \`https://api.stockx.com/oauth/authorize?client_id=\${clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}&response_type=code&scope=\${encodeURIComponent(scopes)}&state=\${state}\`,
      tokenUrl: () => "https://api.stockx.com/oauth/token",
      scopes: "listings:read listings:write orders:read orders:write",
    },
    capabilities: ["listings", "orders", "resale"],
  },
  reverb: {
    name: "Reverb",
    icon: "🎸",
    color: "#2E7D32",
    connectionType: "oauth" as const,
    description: "Music gear marketplace — manage listings and orders",
    oauthConfig: {
      authUrl: (_: string, clientId: string, scopes: string, redirectUri: string, state: string) =>
        \`https://reverb.com/oauth/authorize?client_id=\${clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}&response_type=code&scope=\${encodeURIComponent(scopes)}&state=\${state}\`,
      tokenUrl: () => "https://api.reverb.com/oauth/token",
      scopes: "listings:read listings:write orders:read orders:write",
    },
    capabilities: ["listings", "orders", "inventory"],
  },`;

// Find the end of walmart platform and insert before the closing brace
const walmartEnd = connectorsContent.indexOf("  },\n};", connectorsContent.indexOf("walmart:"));
if (walmartEnd > -1) {
  connectorsContent = connectorsContent.slice(0, walmartEnd + 4) + newPlatforms + connectorsContent.slice(walmartEnd + 4);
  fs.writeFileSync(connectorsFile, connectorsContent);
  console.log("✓ Added 7 new e-commerce platforms to connectors.ts");
}

// Update availability checks
const oldAvailability = `    const ecommerceAvailability: Record<string, boolean> = {
      shopify: !!ENV.shopifyPartnerClientId && !!ENV.shopifyPartnerClientSecret,
      etsy: !!ENV.etsyApiKey && !!ENV.etsySharedSecret,
      ebay: !!ENV.ebayAppId && !!ENV.ebayCertId,
      amazon: !!ENV.amazonSpClientId && !!ENV.amazonSpClientSecret,
      tiktok_shop: !!ENV.tiktokAppId && !!ENV.tiktokClientSecret,
      walmart: true, // API-key based, no OAuth needed
      woocommerce: true, // API-key based, no shared OAuth required
    };`;

const newAvailability = `    const ecommerceAvailability: Record<string, boolean> = {
      shopify: !!ENV.shopifyPartnerClientId && !!ENV.shopifyPartnerClientSecret,
      etsy: !!ENV.etsyApiKey && !!ENV.etsySharedSecret,
      ebay: !!ENV.ebayAppId && !!ENV.ebayCertId,
      amazon: !!ENV.amazonSpClientId && !!ENV.amazonSpClientSecret,
      tiktok_shop: !!ENV.tiktokAppId && !!ENV.tiktokClientSecret,
      walmart: true, // API-key based, no OAuth needed
      woocommerce: true, // API-key based, no shared OAuth required
      depop: !!ENV.depopAppId && !!ENV.depopAppSecret,
      bigcommerce: !!ENV.bigcommerceClientId && !!ENV.bigcommerceClientSecret,
      square: !!ENV.squareClientId && !!ENV.squareClientSecret,
      faire: true, // API-key based
      bonanza: true, // API-key based
      stockx: !!ENV.stockxClientId && !!ENV.stockxClientSecret,
      reverb: !!ENV.reverbClientId && !!ENV.reverbClientSecret,
    };`;

connectorsContent = connectorsContent.replace(oldAvailability, newAvailability);
fs.writeFileSync(connectorsFile, connectorsContent);
console.log("✓ Updated availability checks for new platforms");

// ─── STEP 3: Remove Google Ads from SOCIAL_PLATFORMS ────────────────────

// Find and remove Google Ads from SOCIAL_PLATFORMS
const googleAdsSection = connectorsContent.indexOf("  google_ads: {");
const googleAdsEnd = connectorsContent.indexOf("  },\n  gmail:", googleAdsSection);
if (googleAdsSection > -1 && googleAdsEnd > -1) {
  connectorsContent = connectorsContent.slice(0, googleAdsSection) + connectorsContent.slice(googleAdsEnd + 5);
  fs.writeFileSync(connectorsFile, connectorsContent);
  console.log("✓ Removed Google Ads from SOCIAL_PLATFORMS");
}

// Remove google_ads from socialAvailability
connectorsContent = fs.readFileSync(connectorsFile, "utf-8");
const oldSocialAvail = `    const socialAvailability: Record<string, boolean> = {
      meta: !!ENV.metaAppId && !!ENV.metaAppSecret,
      instagram: !!ENV.metaAppId && !!ENV.metaAppSecret,
      tiktok: !!ENV.tiktokClientKey && !!ENV.tiktokClientSecret,
      twitter: !!ENV.twitterClientId && !!ENV.twitterClientSecret,
      pinterest: !!ENV.pinterestAppId && !!ENV.pinterestAppSecret,
      gmail: !!ENV.googleClientId && !!ENV.googleClientSecret,
    };`;

const newSocialAvail = `    const socialAvailability: Record<string, boolean> = {
      meta: !!ENV.metaAppId && !!ENV.metaAppSecret,
      instagram: !!ENV.metaAppId && !!ENV.metaAppSecret,
      tiktok: !!ENV.tiktokClientKey && !!ENV.tiktokClientSecret,
      twitter: !!ENV.twitterClientId && !!ENV.twitterClientSecret,
      pinterest: !!ENV.pinterestAppId && !!ENV.pinterestAppSecret,
      gmail: !!ENV.googleClientId && !!ENV.googleClientSecret,
    };`;

connectorsContent = connectorsContent.replace(oldSocialAvail, newSocialAvail);

// Remove google_ads from enum in connectSocialAccount
connectorsContent = connectorsContent.replace(
  'z.enum(["meta", "instagram", "tiktok", "twitter", "pinterest", "google_ads", "gmail"])',
  'z.enum(["meta", "instagram", "tiktok", "twitter", "pinterest", "gmail"])'
);

// Remove google_ads from enum in generateSocialOAuthUrl
connectorsContent = connectorsContent.replace(
  'z.enum(["meta", "instagram", "tiktok", "twitter", "pinterest", "google_ads", "gmail"])',
  'z.enum(["meta", "instagram", "tiktok", "twitter", "pinterest", "gmail"])'
);

// Remove google_ads from clientIdMap
const oldClientIdMap = `      const clientIdMap: Record<string, string> = {
        meta: ENV.metaClientId || ENV.metaAppId,
        instagram: ENV.metaClientId || ENV.metaAppId, // Instagram uses Meta OAuth
        tiktok: ENV.tiktokClientKey,
        twitter: ENV.twitterClientId,
        pinterest: ENV.pinterestAppId,
        google_ads: ENV.googleAdsClientId,
        gmail: ENV.googleClientId,
      };`;

const newClientIdMap = `      const clientIdMap: Record<string, string> = {
        meta: ENV.metaClientId || ENV.metaAppId,
        instagram: ENV.metaClientId || ENV.metaAppId, // Instagram uses Meta OAuth
        tiktok: ENV.tiktokClientKey,
        twitter: ENV.twitterClientId,
        pinterest: ENV.pinterestAppId,
        gmail: ENV.googleClientId,
      };`;

connectorsContent = connectorsContent.replace(oldClientIdMap, newClientIdMap);

// Remove google_ads from getSetupInstructions
connectorsContent = connectorsContent.replace(
  /    google_ads: "1\. Go to console\.cloud\.google\.com.*?5\. Add them as GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET in Settings > Secrets",\n/s,
  ""
);

fs.writeFileSync(connectorsFile, connectorsContent);
console.log("✓ Removed Google Ads from social platforms");

// ─── STEP 4: Add Google Ads to tools router ────────────────────────────

const toolsFile = path.join(PROJECT_ROOT, "server/routers/tools.ts");
let toolsContent = fs.readFileSync(toolsFile, "utf-8");

// Add Google Ads to TOOL_CONNECTORS
const googleAdsToolConfig = `  google_ads: {
    name: "Google Ads",
    icon: "📊",
    color: "#4285F4",
    category: "advertising",
    bots: ["architect", "merchant"],
    description: "Manage Google Ads campaigns, monitor performance, and optimize spend",
    capabilities: ["Campaign management", "Performance reporting", "Bid optimization", "Conversion tracking"],
    whereToFind: "Click Connect to sign in with the Google account that owns your Google Ads account.",
    connectionType: "oauth",
    oauthScopes: "https://www.googleapis.com/auth/adwords",
  },`;

// Find where to insert (after gorgias)
const gorgiasEnd = toolsContent.indexOf("  },\n};", toolsContent.indexOf("gorgias:"));
if (gorgiasEnd > -1) {
  toolsContent = toolsContent.slice(0, gorgiasEnd + 4) + googleAdsToolConfig + "\n" + toolsContent.slice(gorgiasEnd + 4);
  fs.writeFileSync(toolsFile, toolsContent);
  console.log("✓ Added Google Ads to tools router");
}

console.log("\n✅ All platform additions complete!");
console.log("\nNext steps:");
console.log("1. Run: cd /home/ubuntu/beast-bots && pnpm install (if new deps needed)");
console.log("2. Server will auto-reload with new platforms");
console.log("3. Update frontend Integrations.tsx to support new platforms");
console.log("4. Create redirect URI checklist for user");
