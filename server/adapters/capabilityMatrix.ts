/**
 * Shop_a_Bot — Flat, machine-readable capability matrix.
 *
 * Phase 3 / PR 1: the orchestrator and the /PlatformHealth page need a
 * single, machine-readable description of "which platform supports which
 * capability and under what constraints" — projected from the live
 * adapter `getCapabilities()` outputs, never from a hand-maintained doc.
 *
 * Each row has the shape required by the problem statement:
 *
 *   { platform, capability, supported, requires_auth, rate_limit, idempotent }
 *
 * Rows are derived deterministically from the registries so adding a
 * platform / capability to an adapter automatically lights it up here
 * without touching any other code.
 *
 * Consumers:
 *   - server/routers/connectors.ts → exposes the rows over tRPC.
 *   - client/src/pages/PlatformHealth.tsx → renders the matrix.
 *   - server/routers/orchestrator.ts (later PRs) → gates tool attempts
 *     via `isCapabilitySupported(platform, capability)`.
 */

import {
  getEcommerceCapabilityMatrix,
  SUPPORTED_ECOMMERCE_PLATFORMS,
} from "./ecommerce";
import {
  getSocialCapabilityMatrix,
  SUPPORTED_SOCIAL_PLATFORMS,
} from "./social";
import { SUPPORTED_TOOL_CONNECTORS, getToolAdapter } from "./tools";

// ─── Public types ──────────────────────────────────────────────────────────

export type CapabilityFamily = "ecommerce" | "social" | "tools";

/** How a platform authenticates. Per-platform — every row for a given
 *  platform shares the same `requires_auth` value. */
export type AuthModel = "oauth" | "api_key" | "hybrid" | "none";

export interface CapabilityRow {
  /** Platform identifier (matches the adapter registry key). */
  platform: string;
  /** Adapter family this row was projected from. */
  family: CapabilityFamily;
  /** Capability name, namespaced by family
   *  (e.g. `ecommerce.variants`, `social.shortFormVideo`). */
  capability: string;
  /** Whether the platform exposes this capability. */
  supported: boolean;
  /** Auth model the platform requires to use any of its capabilities. */
  requires_auth: AuthModel;
  /** Sustained tokens/sec the bot should target, per the adapter.
   *  `null` when the adapter does not declare a rate limit. */
  rate_limit: number | null;
  /** Whether retrying this capability is safe (no duplicate side-effects).
   *  Reads / health checks are idempotent; writes are not, unless the
   *  adapter explicitly declares idempotency-key support. */
  idempotent: boolean;
}

// Auth-model lookup
//
// Derived from server/ecommerceOAuth.ts, server/socialOAuth.ts, and
// server/toolOAuth.ts — platforms with an OAuth `case` are "oauth";
// platforms that use an API key on the credentials UI are "api_key";
// shopify supports both private-app tokens and OAuth, so it's "hybrid".
//
// This is the only hand-maintained piece, and it lives next to the
// projection so it is easy to keep in sync. The `auth-model coverage`
// test below (in server/capability-matrix.test.ts) asserts that every
// supported platform has a declared auth model, so silent drift when
// new platforms are added to a registry is impossible.

const AUTH_MODEL: Record<string, AuthModel> = {
  // Ecommerce — OAuth platforms
  shopify: "hybrid", // OAuth or private-app access token
  etsy: "oauth",
  amazon: "oauth",
  ebay: "oauth",
  tiktok_shop: "oauth",
  square: "oauth",
  faire: "oauth",
  bigcommerce: "oauth",
  // Ecommerce — API-key platforms
  woocommerce: "api_key",
  walmart: "api_key",
  depop: "api_key",
  bonanza: "api_key",
  stockx: "api_key",
  reverb: "api_key",
  // Social — all OAuth
  meta: "oauth",
  instagram: "oauth",
  tiktok: "oauth",
  twitter: "oauth",
  pinterest: "oauth",
  google_ads: "oauth",
  gmail: "oauth",
  snapchat: "oauth",
  // Sprint 27.5 social additions — Outlook on Microsoft Graph, Slack
  // on OAuth v2, YouTube on the same Google OAuth client as Gmail.
  outlook: "oauth",
  slack: "oauth",
  youtube: "oauth",
  // Tools
  google_sheets: "oauth",
  google_analytics: "oauth",
  klaviyo: "api_key",
  shipstation: "api_key",
  postscript: "api_key",
  printful: "api_key",
  judgeme: "api_key",
  gorgias: "api_key",
  // Research / web-data tools
  firecrawl: "api_key",
  tavily: "api_key",
};

/** Public accessor — returns "none" for unknown platforms so callers don't
 *  blow up when an experimental adapter is added without a matching auth
 *  entry. The `auth-model coverage` test in
 *  server/capability-matrix.test.ts guards against drift. */
export function getAuthModel(platform: string): AuthModel {
  return AUTH_MODEL[platform] ?? "none";
}

// ─── Idempotency classification ───────────────────────────────────────────
//
// Capabilities are classified by name. Reads, lookups, and metadata
// queries are safe to retry; writes are not. The classification is
// deliberately conservative — when in doubt, we mark a capability as
// non-idempotent so the orchestrator's retry policy will not duplicate
// side-effects.

const NON_IDEMPOTENT_CAPABILITY_NAMES = new Set<string>([
  // Catalog mutations
  "bulkImport",
  "bulkPriceUpdate",
  // Order mutations
  "autoFulfillment",
  "partialFulfillment",
  // Pricing mutations
  "compareAtPrice", // ability to *set* compareAtPrice
  "scheduledSale",
  // Social — every "publish-style" capability is a side-effecting write
  "image",
  "video",
  "shortFormVideo",
  "carousel",
  "stories",
  "liveStream",
  "scheduledPosting",
  "ads",
  "dynamicProductAds",
]);

function isCapabilityIdempotent(capabilityKey: string): boolean {
  return !NON_IDEMPOTENT_CAPABILITY_NAMES.has(capabilityKey);
}

// ─── Projection ────────────────────────────────────────────────────────────

/**
 * Boolean capability fields we project from `PlatformCapabilities` for
 * each ecommerce platform. We ignore the numeric/string hint fields
 * (recommendedBatchSize, category, etc.) — those are hints, not yes/no
 * capabilities, and have no `supported` semantics.
 */
const ECOMMERCE_CAPABILITY_KEYS = [
  "variants",
  "metafields",
  "bulkImport",
  "categories",
  "webhooks",
  "autoFulfillment",
  "partialFulfillment",
  "realTimeInventory",
  "compareAtPrice",
  "bulkPriceUpdate",
  "scheduledSale",
] as const;

const SOCIAL_CAPABILITY_KEYS = [
  "image",
  "video",
  "shortFormVideo",
  "carousel",
  "stories",
  "liveStream",
  "scheduledPosting",
  "ads",
  "dynamicProductAds",
] as const;

/**
 * Build the flat capability matrix. Pulled lazily from each adapter's
 * `getCapabilities()` (or, for tool connectors, the `capabilities`
 * declarations) so the rows always reflect live adapter behavior — no
 * parallel doc to drift.
 */
export function getCapabilityRows(): CapabilityRow[] {
  const rows: CapabilityRow[] = [];

  // ── Ecommerce ──────────────────────────────────────────────────────────
  const ecomMatrix = getEcommerceCapabilityMatrix();
  for (const platform of SUPPORTED_ECOMMERCE_PLATFORMS) {
    const caps = ecomMatrix[platform];
    if (!caps) continue;
    const auth = getAuthModel(platform);
    const rate = caps.rateLimitTokensPerSec ?? null;
    for (const key of ECOMMERCE_CAPABILITY_KEYS) {
      rows.push({
        platform,
        family: "ecommerce",
        capability: `ecommerce.${key}`,
        supported: Boolean(caps[key]),
        requires_auth: auth,
        rate_limit: rate,
        idempotent: isCapabilityIdempotent(key),
      });
    }
  }

  // ── Social ─────────────────────────────────────────────────────────────
  const socialMatrix = getSocialCapabilityMatrix();
  for (const platform of SUPPORTED_SOCIAL_PLATFORMS) {
    const caps = socialMatrix[platform];
    if (!caps) continue;
    const auth = getAuthModel(platform);
    const rate = caps.rateLimitTokensPerSec ?? null;
    for (const key of SOCIAL_CAPABILITY_KEYS) {
      rows.push({
        platform,
        family: "social",
        capability: `social.${key}`,
        supported: Boolean(caps[key]),
        requires_auth: auth,
        rate_limit: rate,
        idempotent: isCapabilityIdempotent(key),
      });
    }
  }

  // ── Tools ──────────────────────────────────────────────────────────────
  // Tool connectors don't expose a typed PlatformCapabilities; they
  // declare a string array on the adapter. Each declared capability
  // becomes one row, marked supported=true. Tool calls are treated as
  // idempotent reads unless the capability name says otherwise (send,
  // create, push, sync, charge…).
  const NON_IDEMPOTENT_TOOL_VERBS = /\b(send|create|push|sync|charge|publish|update|delete|fulfill)\b/i;
  for (const tool of SUPPORTED_TOOL_CONNECTORS) {
    let adapter;
    try {
      adapter = getToolAdapter(tool);
    } catch {
      continue;
    }
    const auth = getAuthModel(tool);
    for (const cap of adapter.capabilities) {
      rows.push({
        platform: tool,
        family: "tools",
        capability: `tools.${cap}`,
        supported: true,
        requires_auth: auth,
        rate_limit: null,
        idempotent: !NON_IDEMPOTENT_TOOL_VERBS.test(cap),
      });
    }
  }

  return rows;
}

// ─── Orchestrator gate ────────────────────────────────────────────────────

/**
 * Single helper the orchestrator will call before attempting a tool.
 *
 *   isCapabilitySupported("shopify", "ecommerce.variants") // true
 *   isCapabilitySupported("amazon",  "ecommerce.metafields") // false
 *
 * Returns `false` for unknown platforms / capabilities — the orchestrator
 * should treat "unknown" as "don't attempt" rather than "best effort"
 * because attempting an unsupported capability silently maps to an
 * adapter-level NotImplementedError, which is exactly what we're trying
 * to prevent.
 *
 * Subsequent PRs (3a/3b/3c — orchestrator wiring) will call this from
 * the auto-discovered tool dispatch path.
 */
export function isCapabilitySupported(platform: string, capability: string): boolean {
  if (!platform || !capability) return false;
  const rows = getCapabilityRows();
  const row = rows.find((r) => r.platform === platform && r.capability === capability);
  return row?.supported === true;
}

/** All supported platforms across all families, no aliases. */
export function getAllPlatforms(): { platform: string; family: CapabilityFamily }[] {
  return [
    ...SUPPORTED_ECOMMERCE_PLATFORMS.map((p) => ({ platform: p, family: "ecommerce" as const })),
    ...SUPPORTED_SOCIAL_PLATFORMS.map((p) => ({ platform: p, family: "social" as const })),
    ...SUPPORTED_TOOL_CONNECTORS.map((p) => ({ platform: p, family: "tools" as const })),
  ];
}
