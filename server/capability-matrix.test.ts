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
});
