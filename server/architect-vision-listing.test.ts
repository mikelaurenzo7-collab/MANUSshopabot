/**
 * Architect — vision-driven listing generator regression guards.
 *
 * `architect.generateListingFromImage` accepts a product photo and
 * returns SEO-optimized listing copy via Claude vision (Files API).
 * The mutation is gated on isFilesApiAvailable() so that deploys
 * without ANTHROPIC_API_KEY refuse-fast instead of silently 500ing.
 *
 * The companion UI panel (VisionListingPanel in Architect.tsx) chunks
 * the file's bytes through btoa to avoid call-stack overflow on
 * large images. Tests lock both sides in.
 */
import { describe, it, expect } from "vitest";

describe("architect.generateListingFromImage — server wiring", () => {
  it("registers the mutation on the architectRouter", async () => {
    const mod = await import("./routers/architect");
    const procedures = mod.architectRouter._def.procedures as Record<string, any>;
    expect(procedures.generateListingFromImage).toBeDefined();
  });

  it("gates on isFilesApiAvailable + caps size at 10MB", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "routers/architect.ts"),
      "utf-8",
    );
    expect(src).toContain("isFilesApiAvailable()");
    expect(src).toContain("PRECONDITION_FAILED");
    expect(src).toContain("10 * 1024 * 1024");
    expect(src).toContain("PAYLOAD_TOO_LARGE");
  });

  it("requests a strict-JSON listing schema with the high-leverage fields", async () => {
    // Locks the schema shape so consumers (the UI panel + downstream
    // bot prompts) don't break silently if the prompt is rewritten.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "routers/architect.ts"),
      "utf-8",
    );
    for (const field of [
      "title",
      "description",
      "bulletPoints",
      "seoKeywords",
      "suggestedPriceRange",
      "imageAltText",
      "tags",
      "categoryBreadcrumb",
      "estimatedConversionAngle",
    ]) {
      expect(src).toContain(field);
    }
  });

  it("deletes the uploaded file in the finally block (sensitive image cleanup)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "routers/architect.ts"),
      "utf-8",
    );
    // The cleanup pattern matches supplier.parseReceiptDocument:
    // try { vision } finally { deleteFile }.
    expect(src).toMatch(/finally\s*{[\s\S]*?deleteFile\(uploaded\.id\)/);
  });
});

// The "VisionListingPanel — client wiring" describe block was retired
// with client/src/pages/Architect.tsx (the page that mounted
// <VisionListingPanel />). The server-side mutation contract is still
// validated by the block above.

describe("Activity page — actionable empty states", () => {
  it("Activity Log empty state offers three concrete next-actions", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Activity.tsx"),
      "utf-8",
    );
    expect(src).toContain("Launch a workflow");
    expect(src).toContain("Connect a store");
    expect(src).toContain("Run an inventory check");
    // Both launch-workflow and inventory-check CTA link to the unified Store Bot workspace.
    expect(src).toContain('href="/chat"');
    expect(src).toContain('href="/storefronts"');
  });

  it("Decision History empty state offers a tune-thresholds + launch CTA", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Activity.tsx"),
      "utf-8",
    );
    expect(src).toContain("No decisions yet");
    expect(src).toContain("Tune approval thresholds");
  });
});
