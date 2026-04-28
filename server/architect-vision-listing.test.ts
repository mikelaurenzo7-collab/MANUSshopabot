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

describe("VisionListingPanel — client wiring", () => {
  it("mounts in Architect.tsx between the niche scan and the bulk image optimizer", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Architect.tsx"),
      "utf-8",
    );
    expect(src).toContain("<VisionListingPanel />");
    // Order matters: vision listing comes before image optimizer.
    const visionIdx = src.indexOf("<VisionListingPanel />");
    const optimizerIdx = src.indexOf("<ImageOptimizerPanel />");
    expect(visionIdx).toBeGreaterThan(0);
    expect(optimizerIdx).toBeGreaterThan(visionIdx);
  });

  it("calls the trpc mutation with mimeType + bytesBase64", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Architect.tsx"),
      "utf-8",
    );
    expect(src).toContain("trpc.architect.generateListingFromImage.useMutation");
    expect(src).toContain("bytesBase64");
    expect(src).toContain("mimeType");
  });

  it("chunks bytes through btoa to avoid call-stack overflow on large images", async () => {
    // Naive `btoa(String.fromCharCode(...bytes))` blows up at ~100KB
    // on V8. The chunked encode handles 10MB cleanly.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Architect.tsx"),
      "utf-8",
    );
    expect(src).toContain("CHUNK = 0x8000");
    expect(src).toContain("btoa(bin)");
  });

  it("caps client-side file size at 10MB to match the server", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Architect.tsx"),
      "utf-8",
    );
    expect(src).toContain("10 * 1024 * 1024");
  });
});

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
    expect(src).toContain('href="/architect"');
    expect(src).toContain('href="/storefronts"');
    expect(src).toContain('href="/merchant"');
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
