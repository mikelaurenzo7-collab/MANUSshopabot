/**
 * Per-Integration Capability Matrix Tests
 *
 * Each adapter exposes a `getCapabilities()` method returning a typed
 * record that bots branch on at workflow planning time. These tests
 * lock in:
 *
 *   1. Every supported platform has a non-null capability matrix.
 *   2. Each matrix has a sane shape (no missing fields, no negative
 *      counters, recognised category enum, etc).
 *   3. The bot workflows that consume the matrix (`brand_identity_kit`
 *      and `ad_campaign`) actually import the registry — guarding
 *      against a future refactor that quietly disconnects the matrix
 *      from the workflow planning step.
 */
import { describe, it, expect } from "vitest";
import {
  getEcommerceCapabilityMatrix,
  SUPPORTED_ECOMMERCE_PLATFORMS,
} from "./adapters/ecommerce";
import {
  getSocialCapabilityMatrix,
  SUPPORTED_SOCIAL_PLATFORMS,
} from "./adapters/social";
import {
  SUPPORTED_TOOL_CONNECTORS,
} from "./adapters/tools";
import {
  getCapabilityRows,
  isCapabilitySupported,
  getAuthModel,
  getAllPlatforms,
} from "./adapters/capabilityMatrix";

describe("Per-integration capability matrix", () => {
  describe("ecommerce", () => {
    const matrix = getEcommerceCapabilityMatrix();

    it("returns one entry per supported platform", () => {
      for (const id of SUPPORTED_ECOMMERCE_PLATFORMS) {
        expect(matrix[id], `missing matrix entry for ${id}`).toBeDefined();
      }
    });

    it.each(Object.entries(getEcommerceCapabilityMatrix()))(
      "%s has a sane shape",
      (id, caps) => {
        expect(typeof caps.variants).toBe("boolean");
        expect(typeof caps.metafields).toBe("boolean");
        expect(typeof caps.bulkImport).toBe("boolean");
        expect(caps.maxImagesPerProduct).toBeGreaterThan(0);
        expect(typeof caps.categories).toBe("boolean");
        expect(typeof caps.webhooks).toBe("boolean");
        expect(Array.isArray(caps.webhookEvents)).toBe(true);
        expect(typeof caps.autoFulfillment).toBe("boolean");
        expect(typeof caps.partialFulfillment).toBe("boolean");
        expect(typeof caps.realTimeInventory).toBe("boolean");
        expect(caps.recommendedBatchSize).toBeGreaterThan(0);
        expect(caps.rateLimitTokensPerSec).toBeGreaterThan(0);
        expect(["marketplace", "storefront", "social_commerce"]).toContain(caps.category);
        expect(["subscription", "commission", "hybrid", "free"]).toContain(caps.feeStructure);
        expect(caps.strengths.length).toBeGreaterThan(0);
        expect(caps.limitations.length).toBeGreaterThan(0);
      },
    );

    it("Shopify is the most-capable storefront", () => {
      const shopify = matrix.shopify;
      expect(shopify.variants).toBe(true);
      expect(shopify.metafields).toBe(true);
      expect(shopify.webhooks).toBe(true);
      expect(shopify.realTimeInventory).toBe(true);
      expect(shopify.category).toBe("storefront");
    });

    it("Amazon is correctly classified as a marketplace with commission fees", () => {
      const amazon = matrix.amazon;
      expect(amazon.category).toBe("marketplace");
      expect(amazon.feeStructure).toBe("commission");
      expect(amazon.metafields).toBe(false); // marketplace owns presentation
    });
  });

  describe("social", () => {
    const matrix = getSocialCapabilityMatrix();

    it("returns one entry per supported platform", () => {
      for (const id of SUPPORTED_SOCIAL_PLATFORMS) {
        expect(matrix[id], `missing matrix entry for ${id}`).toBeDefined();
      }
    });

    it.each(Object.entries(getSocialCapabilityMatrix()))(
      "%s has a sane shape",
      (id, caps) => {
        expect(typeof caps.image).toBe("boolean");
        expect(typeof caps.video).toBe("boolean");
        expect(typeof caps.shortFormVideo).toBe("boolean");
        expect(typeof caps.carousel).toBe("boolean");
        expect(typeof caps.stories).toBe("boolean");
        expect(typeof caps.liveStream).toBe("boolean");
        expect(caps.maxCopyChars).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(caps.preferredAspectRatios)).toBe(true);
        expect(caps.maxVideoSeconds).toBeGreaterThanOrEqual(0);
        expect(typeof caps.scheduledPosting).toBe("boolean");
        expect(["native", "recommended", "ignored"]).toContain(caps.hashtagSupport);
        expect(typeof caps.ads).toBe("boolean");
        expect(Array.isArray(caps.adFormats)).toBe(true);
        expect(caps.maxAdCopyChars).toBeGreaterThanOrEqual(0);
        expect(["none", "interests", "behavioral", "lookalike"]).toContain(caps.audienceTargeting);
        expect(typeof caps.dynamicProductAds).toBe("boolean");
        expect(caps.recommendedPostsPerDay).toBeGreaterThanOrEqual(0);
        expect(caps.rateLimitTokensPerSec).toBeGreaterThan(0);
        expect(["commerce", "engagement", "broadcast", "professional"]).toContain(caps.audienceType);
        expect(caps.strengths.length).toBeGreaterThan(0);
        expect(caps.limitations.length).toBeGreaterThan(0);
      },
    );

    it("TikTok is shortform-vertical-only with the strongest organic reach", () => {
      const tiktok = matrix.tiktok;
      expect(tiktok.shortFormVideo).toBe(true);
      expect(tiktok.preferredAspectRatios).toContain("9:16");
      expect(tiktok.audienceType).toBe("engagement");
    });

    it("Meta supports lookalike audiences + dynamic product ads", () => {
      const meta = matrix.meta;
      expect(meta.audienceTargeting).toBe("lookalike");
      expect(meta.dynamicProductAds).toBe(true);
      expect(meta.ads).toBe(true);
    });

    it("Gmail is treated as a 1:1 channel, no ads concept", () => {
      const gmail = matrix.gmail;
      expect(gmail.ads).toBe(false);
      expect(gmail.audienceTargeting).toBe("none");
    });
  });

  describe("workflow integration", () => {
    it("brand_identity_kit imports the ecommerce capability registry", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "engine/architectWorkflows.ts"),
        "utf-8",
      );
      expect(src).toContain("getEcommerceCapabilityMatrix");
      // The platform-aware step must consult the matrix before deciding
      // what asset to emit.
      expect(src).toContain('input.platform as string | undefined');
    });

    it("ad_campaign imports the social capability registry", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "engine/socialWorkflows.ts"),
        "utf-8",
      );
      expect(src).toContain("getSocialCapabilityMatrix");
      // The platform brief should be threaded into the LLM system prompt.
      expect(src).toContain("platformBrief");
    });
  });

  // ─── Phase 3 PR 1 — flat, machine-readable matrix ───────────────────────
  //
  // The orchestrator and /PlatformHealth need a row-per-(platform,
  // capability) projection with the exact shape required by the
  // problem statement: { platform, capability, supported, requires_auth,
  // rate_limit, idempotent }. These tests lock the shape in.
  describe("flat capability rows", () => {
    const rows = getCapabilityRows();

    it("returns a non-empty array of rows", () => {
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
    });

    it("every row has the required machine-readable shape", () => {
      for (const row of rows) {
        expect(typeof row.platform).toBe("string");
        expect(row.platform.length).toBeGreaterThan(0);
        expect(["ecommerce", "social", "tools"]).toContain(row.family);
        expect(typeof row.capability).toBe("string");
        expect(row.capability.length).toBeGreaterThan(0);
        // Capability is namespaced with the family for unambiguous keys.
        expect(row.capability.startsWith(`${row.family}.`)).toBe(true);
        expect(typeof row.supported).toBe("boolean");
        expect(["oauth", "api_key", "hybrid", "none"]).toContain(row.requires_auth);
        expect(row.rate_limit === null || typeof row.rate_limit === "number").toBe(true);
        if (typeof row.rate_limit === "number") {
          expect(row.rate_limit).toBeGreaterThan(0);
        }
        expect(typeof row.idempotent).toBe("boolean");
      }
    });

    it("includes at least one row for every supported ecommerce platform", () => {
      for (const platform of SUPPORTED_ECOMMERCE_PLATFORMS) {
        const platformRows = rows.filter((r) => r.platform === platform && r.family === "ecommerce");
        expect(platformRows.length, `missing rows for ecommerce/${platform}`).toBeGreaterThan(0);
      }
    });

    it("includes at least one row for every supported social platform", () => {
      for (const platform of SUPPORTED_SOCIAL_PLATFORMS) {
        const platformRows = rows.filter((r) => r.platform === platform && r.family === "social");
        expect(platformRows.length, `missing rows for social/${platform}`).toBeGreaterThan(0);
      }
    });

    it("includes at least one row for every supported tool connector", () => {
      for (const tool of SUPPORTED_TOOL_CONNECTORS) {
        const toolRows = rows.filter((r) => r.platform === tool && r.family === "tools");
        expect(toolRows.length, `missing rows for tools/${tool}`).toBeGreaterThan(0);
      }
    });

    it("rows are deterministic — repeated calls return equal data", () => {
      // Critical property for the orchestrator gate: a flapping matrix
      // would cause flapping tool dispatches.
      const a = getCapabilityRows();
      const b = getCapabilityRows();
      expect(a).toEqual(b);
    });

    it("Shopify ecommerce.variants is supported", () => {
      const row = rows.find(
        (r) => r.platform === "shopify" && r.capability === "ecommerce.variants",
      );
      expect(row?.supported).toBe(true);
      // Read-style capability flag → idempotent.
      expect(row?.idempotent).toBe(true);
    });

    it("Amazon ecommerce.metafields is unsupported (marketplace owns presentation)", () => {
      const row = rows.find(
        (r) => r.platform === "amazon" && r.capability === "ecommerce.metafields",
      );
      expect(row?.supported).toBe(false);
    });

    it("Gmail social.ads is unsupported", () => {
      const row = rows.find(
        (r) => r.platform === "gmail" && r.capability === "social.ads",
      );
      expect(row?.supported).toBe(false);
    });

    it("publish-style social capabilities are flagged non-idempotent", () => {
      // Bots must not auto-retry these; duplicate posts are user-visible.
      const meta = rows.find((r) => r.platform === "meta" && r.capability === "social.image");
      expect(meta?.idempotent).toBe(false);
      const tiktok = rows.find((r) => r.platform === "tiktok" && r.capability === "social.shortFormVideo");
      expect(tiktok?.idempotent).toBe(false);
    });
  });

  describe("auth-model coverage", () => {
    it("every supported platform across all families has a declared auth model", () => {
      // If this fails, a platform was added to a registry without
      // updating capabilityMatrix.AUTH_MODEL — silent drift is exactly
      // what this test exists to prevent.
      for (const { platform } of getAllPlatforms()) {
        const auth = getAuthModel(platform);
        expect(auth, `no auth model declared for ${platform}`).not.toBe("none");
      }
    });

    it("rate_limit on social rows matches the adapter's declared rateLimitTokensPerSec", () => {
      const rows = getCapabilityRows();
      const socialMatrix = getSocialCapabilityMatrix();
      for (const platform of SUPPORTED_SOCIAL_PLATFORMS) {
        const expected = socialMatrix[platform].rateLimitTokensPerSec;
        const row = rows.find((r) => r.platform === platform && r.family === "social");
        expect(row?.rate_limit).toBe(expected);
      }
    });
  });

  describe("isCapabilitySupported (orchestrator gate)", () => {
    it("returns true for a known-supported capability", () => {
      expect(isCapabilitySupported("shopify", "ecommerce.variants")).toBe(true);
    });

    it("returns false for a known-unsupported capability", () => {
      expect(isCapabilitySupported("amazon", "ecommerce.metafields")).toBe(false);
    });

    it("returns false for an unknown platform", () => {
      // Conservative-by-default: unknown platforms must not be attempted.
      expect(isCapabilitySupported("nonexistent_platform", "ecommerce.variants")).toBe(false);
    });

    it("returns false for an unknown capability", () => {
      expect(isCapabilitySupported("shopify", "ecommerce.does_not_exist")).toBe(false);
    });

    it("returns false for empty / falsy inputs", () => {
      expect(isCapabilitySupported("", "ecommerce.variants")).toBe(false);
      expect(isCapabilitySupported("shopify", "")).toBe(false);
    });
  });
});
