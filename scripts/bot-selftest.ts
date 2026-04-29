#!/usr/bin/env tsx
/**
 * bot-selftest — "Is the bot a master operator right now?"
 *
 * Runs every adapter's healthCheck() against the credentials currently
 * in the environment and prints a green/red table.
 *
 * Usage:
 *   pnpm bot:selftest
 *
 * Environment: expects a .env file (or pre-set env vars) with the
 * platform API keys / OAuth tokens you want to validate. Any adapter
 * whose credentials are entirely absent is marked "NOT CONFIGURED"
 * rather than "FAIL" so you can distinguish missing keys from broken
 * integrations.
 *
 * Exit code:
 *   0 — all configured adapters healthy (or no adapters configured)
 *   1 — at least one configured adapter failed its health check
 */

// Load .env before importing any adapter code.
import { config } from "dotenv";
config();

import type { EcommercePlatformAdapter, AdapterCredentials } from "../server/adapters/ecommerce/types";
import { ShopifyAdapter } from "../server/adapters/ecommerce/shopifyAdapter";
import { WooCommerceAdapter } from "../server/adapters/ecommerce/woocommerceAdapter";
import { AmazonAdapter } from "../server/adapters/ecommerce/amazonAdapter";
import { EtsyAdapter } from "../server/adapters/ecommerce/etsyAdapter";
import { EbayAdapter } from "../server/adapters/ecommerce/ebayAdapter";
import { TikTokShopAdapter } from "../server/adapters/ecommerce/tiktokShopAdapter";
import { WalmartAdapter } from "../server/adapters/ecommerce/walmartAdapter";
import { MetaAdapter } from "../server/adapters/social/metaAdapter";
import { InstagramAdapter } from "../server/adapters/social/instagramAdapter";
import { TikTokAdapter } from "../server/adapters/social/tiktokAdapter";
import { TwitterAdapter } from "../server/adapters/social/twitterAdapter";
import { PinterestAdapter } from "../server/adapters/social/pinterestAdapter";
import { GoogleAdsAdapter } from "../server/adapters/social/googleAdsAdapter";
import { GmailAdapter } from "../server/adapters/social/gmailAdapter";
import type { SocialCredentials } from "../server/adapters/social/types";

// ─── ANSI colours ─────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
};

// ─── Result type ──────────────────────────────────────────────────────────────

type Status = "healthy" | "unhealthy" | "not_configured";

interface AdapterResult {
  family: string;
  platform: string;
  status: Status;
  latencyMs?: number;
  message?: string;
}

// ─── Credential helpers ───────────────────────────────────────────────────────

/** Returns true if every key in the list has a non-empty env value. */
function hasEnv(...keys: string[]): boolean {
  return keys.every((k) => !!(process.env[k]?.trim()));
}

// ─── E-Commerce adapters ──────────────────────────────────────────────────────

async function testEcommerce(): Promise<AdapterResult[]> {
  const results: AdapterResult[] = [];

  const adapters: Array<{
    name: string;
    adapter: EcommercePlatformAdapter;
    configured: boolean;
    creds: AdapterCredentials;
  }> = [
    {
      name: "shopify",
      adapter: new ShopifyAdapter(),
      configured: hasEnv("SHOPIFY_PARTNER_CLIENT_ID", "SHOPIFY_PARTNER_CLIENT_SECRET"),
      creds: {
        platform: "shopify",
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
        shopDomain: process.env.SHOPIFY_SHOP_DOMAIN,
      },
    },
    {
      name: "woocommerce",
      adapter: new WooCommerceAdapter(),
      configured: hasEnv("WOOCOMMERCE_CONSUMER_KEY", "WOOCOMMERCE_CONSUMER_SECRET"),
      creds: {
        platform: "woocommerce",
        apiKey: process.env.WOOCOMMERCE_CONSUMER_KEY,
        apiSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET,
        storeUrl: process.env.WOOCOMMERCE_STORE_URL,
      },
    },
    {
      name: "amazon",
      adapter: new AmazonAdapter(),
      configured: hasEnv("AMAZON_SP_CLIENT_ID", "AMAZON_SP_CLIENT_SECRET"),
      creds: {
        platform: "amazon",
        apiKey: process.env.AMAZON_SP_CLIENT_ID,
        apiSecret: process.env.AMAZON_SP_CLIENT_SECRET,
      },
    },
    {
      name: "etsy",
      adapter: new EtsyAdapter(),
      configured: hasEnv("ETSY_API_KEY"),
      creds: {
        platform: "etsy",
        apiKey: process.env.ETSY_API_KEY,
        apiSecret: process.env.ETSY_SHARED_SECRET,
        accessToken: process.env.ETSY_ACCESS_TOKEN,
      },
    },
    {
      name: "ebay",
      adapter: new EbayAdapter(),
      configured: hasEnv("EBAY_APP_ID", "EBAY_CERT_ID"),
      creds: {
        platform: "ebay",
        apiKey: process.env.EBAY_APP_ID,
        apiSecret: process.env.EBAY_CERT_ID,
      },
    },
    {
      name: "tiktok_shop",
      adapter: new TikTokShopAdapter(),
      configured: hasEnv("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"),
      creds: {
        platform: "tiktok_shop",
        apiKey: process.env.TIKTOK_CLIENT_KEY,
        apiSecret: process.env.TIKTOK_CLIENT_SECRET,
      },
    },
    {
      name: "walmart",
      adapter: new WalmartAdapter(),
      configured: hasEnv("WALMART_CLIENT_ID", "WALMART_CLIENT_SECRET"),
      creds: {
        platform: "walmart",
        apiKey: process.env.WALMART_CLIENT_ID,
        apiSecret: process.env.WALMART_CLIENT_SECRET,
      },
    },
  ];

  for (const { name, adapter, configured, creds } of adapters) {
    if (!configured) {
      results.push({ family: "ecommerce", platform: name, status: "not_configured" });
      continue;
    }
    try {
      const health = await adapter.healthCheck(creds);
      results.push({
        family: "ecommerce",
        platform: name,
        status: health.healthy ? "healthy" : "unhealthy",
        latencyMs: health.latencyMs,
        message: health.message,
      });
    } catch (err: unknown) {
      results.push({
        family: "ecommerce",
        platform: name,
        status: "unhealthy",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

// ─── Social adapters ──────────────────────────────────────────────────────────

async function testSocial(): Promise<AdapterResult[]> {
  const results: AdapterResult[] = [];

  const adapters: Array<{
    name: string;
    adapter: { healthCheck: (creds: SocialCredentials) => Promise<{ healthy: boolean; message: string; latencyMs: number }> };
    configured: boolean;
    creds: SocialCredentials;
  }> = [
    {
      name: "meta",
      adapter: new MetaAdapter(),
      configured: hasEnv("META_APP_ID", "META_APP_SECRET"),
      creds: {
        platform: "meta",
        accessToken: process.env.META_ACCESS_TOKEN ?? "",
        accountId: process.env.META_BUSINESS_ID,
      },
    },
    {
      name: "instagram",
      adapter: new InstagramAdapter(),
      configured: hasEnv("META_APP_ID"),
      creds: {
        platform: "instagram",
        accessToken: process.env.INSTAGRAM_ACCESS_TOKEN ?? "",
        accountId: process.env.INSTAGRAM_ACCOUNT_ID,
      },
    },
    {
      name: "tiktok",
      adapter: new TikTokAdapter(),
      configured: hasEnv("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"),
      creds: {
        platform: "tiktok",
        accessToken: process.env.TIKTOK_ACCESS_TOKEN ?? "",
        accountId: process.env.TIKTOK_ACCOUNT_ID,
      },
    },
    {
      name: "twitter",
      adapter: new TwitterAdapter(),
      configured: hasEnv("TWITTER_API_KEY", "TWITTER_API_SECRET"),
      creds: {
        platform: "twitter",
        accessToken: process.env.TWITTER_ACCESS_TOKEN ?? "",
      },
    },
    {
      name: "pinterest",
      adapter: new PinterestAdapter(),
      configured: hasEnv("PINTEREST_APP_ID"),
      creds: {
        platform: "pinterest",
        accessToken: process.env.PINTEREST_ACCESS_TOKEN ?? "",
      },
    },
    {
      name: "google_ads",
      adapter: new GoogleAdsAdapter(),
      configured: hasEnv("GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_DEVELOPER_TOKEN"),
      creds: {
        platform: "google_ads",
        accessToken: process.env.GOOGLE_ADS_ACCESS_TOKEN ?? "",
        adAccountId: process.env.GOOGLE_ADS_ACCOUNT_ID,
      },
    },
    {
      name: "gmail",
      adapter: new GmailAdapter(),
      configured: hasEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
      creds: {
        platform: "gmail",
        accessToken: process.env.GMAIL_ACCESS_TOKEN ?? "",
      },
    },
  ];

  for (const { name, adapter, configured, creds } of adapters) {
    if (!configured) {
      results.push({ family: "social", platform: name, status: "not_configured" });
      continue;
    }
    try {
      const health = await adapter.healthCheck(creds);
      results.push({
        family: "social",
        platform: name,
        status: health.healthy ? "healthy" : "unhealthy",
        latencyMs: health.latencyMs,
        message: health.message,
      });
    } catch (err: unknown) {
      results.push({
        family: "social",
        platform: name,
        status: "unhealthy",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

// ─── Report ───────────────────────────────────────────────────────────────────

function statusIcon(s: Status): string {
  switch (s) {
    case "healthy": return `${C.green}✓${C.reset}`;
    case "unhealthy": return `${C.red}✗${C.reset}`;
    case "not_configured": return `${C.yellow}–${C.reset}`;
  }
}

function statusLabel(s: Status): string {
  switch (s) {
    case "healthy": return `${C.green}HEALTHY${C.reset}`;
    case "unhealthy": return `${C.red}UNHEALTHY${C.reset}`;
    case "not_configured": return `${C.yellow}NOT CONFIGURED${C.reset}`;
  }
}

function printTable(results: AdapterResult[]): void {
  const COL1 = 16;
  const COL2 = 12;
  const COL3 = 17;
  const COL4 = 45;

  const pad = (s: string, n: number) => s.padEnd(n, " ");

  console.log(
    C.bold +
    pad("PLATFORM", COL1) +
    pad("FAMILY", COL2) +
    pad("STATUS", COL3) +
    pad("LATENCY / MESSAGE", COL4) +
    C.reset
  );
  console.log("─".repeat(COL1 + COL2 + COL3 + COL4));

  for (const r of results) {
    const detail =
      r.status === "healthy"
        ? r.latencyMs !== undefined
          ? `${r.latencyMs}ms`
          : ""
        : r.status === "unhealthy"
        ? (r.message ?? "error")
        : "";

    // Use raw strings for padding (ANSI codes don't add visual width)
    console.log(
      pad(r.platform, COL1) +
      pad(r.family, COL2) +
      statusIcon(r.status) + " " + statusLabel(r.status).padEnd(COL3 - 2, " ") +
      C.dim + detail.slice(0, COL4 - 1) + C.reset
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${C.cyan}Shop_a_Bot — Adapter Self-Test${C.reset}\n`);

  const [ecommerceResults, socialResults] = await Promise.all([
    testEcommerce(),
    testSocial(),
  ]);

  const allResults = [...ecommerceResults, ...socialResults];
  printTable(allResults);

  const configured = allResults.filter((r) => r.status !== "not_configured");
  const healthy = configured.filter((r) => r.status === "healthy");
  const unhealthy = configured.filter((r) => r.status === "unhealthy");
  const skipped = allResults.filter((r) => r.status === "not_configured");

  console.log("\n" + "─".repeat(90));
  console.log(
    `${C.bold}Summary:${C.reset} ` +
    `${C.green}${healthy.length} healthy${C.reset}  ` +
    (unhealthy.length ? `${C.red}${unhealthy.length} unhealthy${C.reset}  ` : "") +
    `${C.yellow}${skipped.length} not configured${C.reset}\n`
  );

  if (unhealthy.length > 0) {
    console.error(
      `${C.red}${C.bold}Self-test FAILED.${C.reset} ` +
      `${unhealthy.length} adapter(s) returned an error with the current credentials.\n`
    );
    process.exit(1);
  }

  if (configured.length === 0) {
    console.warn(
      `${C.yellow}No adapters configured.${C.reset} ` +
      `Set platform credentials in .env to run live health checks.\n`
    );
  } else {
    console.log(
      `${C.green}${C.bold}Self-test PASSED.${C.reset} ` +
      `All ${healthy.length} configured adapter(s) are healthy.\n`
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`${C.red}Self-test crashed:${C.reset}`, err);
  process.exit(2);
});
