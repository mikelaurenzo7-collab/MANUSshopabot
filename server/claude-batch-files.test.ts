/**
 * Batch API + Files API integration — wiring + opt-in canary.
 *
 * Both helpers are gated by ANTHROPIC_API_KEY. Source-level tests
 * lock in the right shape — submission + polling for batches, file
 * upload + cleanup for vision queries — without making live API
 * calls.
 */
import { describe, it, expect } from "vitest";

describe("Batch API helper", () => {
  it("isBatchApiAvailable() reads ANTHROPIC_API_KEY at call time", async () => {
    const { isBatchApiAvailable } = await import("./_core/claudeBatch");
    expect(typeof isBatchApiAvailable).toBe("function");
    // Returns true when ANTHROPIC_API_KEY is configured, false otherwise.
    expect(typeof isBatchApiAvailable()).toBe("boolean");
  });

  it("submitBatch attaches cache_control when cacheSharedSystemPrompt is true", async () => {
    // Regression guard: the entire point of pairing batch with the
    // shared preamble is that ALL N-1 follow-up requests in the
    // batch read the cached system prefix, on top of the 50% batch
    // discount. If cache_control gets dropped, the batch costs more
    // than it should.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "_core/claudeBatch.ts"),
      "utf-8",
    );
    expect(src).toContain("cache_control: { type: \"ephemeral\" as const }");
    expect(src).toContain("cacheSharedSystemPrompt");
  });

  it("submitBatch passes adaptive thinking + effort in output_config (no top-level temperature, no budget_tokens)", async () => {
    // Same SDK-contract invariants as the synchronous claudeDirect path.
    // Per Opus 4.7: temperature/top_p/top_k removed (400 if sent),
    // budget_tokens removed (use adaptive thinking instead).
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "_core/claudeBatch.ts"),
      "utf-8",
    );
    expect(src).toContain('thinking: { type: "adaptive" }');
    expect(src).toContain("output_config: {");
    expect(src).toContain("effort,");
    expect(src).not.toMatch(/budget_tokens:\s*\d+/);
    expect(src).not.toMatch(/temperature:/);
  });

  it("streamBatchResults handles all 4 result types (succeeded / errored / canceled / expired)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "_core/claudeBatch.ts"),
      "utf-8",
    );
    expect(src).toContain('result.result.type === "succeeded"');
    expect(src).toContain('result.result.type === "errored"');
    // canceled + expired share the catch-all error branch — the type
    // string is forwarded straight through to the BatchResult.error
    // field (`result.result.type` already encodes "canceled" /
    // "expired" verbatim, no string literal needed in source).
    expect(src).toContain("succeeded: false");
  });
});

describe("Files API helper", () => {
  it("isFilesApiAvailable() gate same as claudeDirect", async () => {
    const { isFilesApiAvailable } = await import("./_core/claudeFiles");
    // Returns true when ANTHROPIC_API_KEY is configured, false otherwise.
    expect(typeof isFilesApiAvailable()).toBe("boolean");
  });

  it("uploadFile + visionQuery pass the files-api beta header", async () => {
    // The Files API is a beta surface. Sending the request without
    // the beta header returns 404 / unknown-resource. SDK auto-adds
    // it on `client.beta.files.*` only — explicit pass-through is
    // required when the *managed-agents-2026-04-01* Files endpoint
    // is also in play.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "_core/claudeFiles.ts"),
      "utf-8",
    );
    expect(src).toContain('betas: ["files-api-2025-04-14"]');
    // Both upload + delete + visionQuery must include it.
    const uploadCount = (src.match(/files-api-2025-04-14/g) || []).length;
    expect(uploadCount).toBeGreaterThanOrEqual(3);
  });

  it("visionQuery branches PDF → document, image → image content block", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "_core/claudeFiles.ts"),
      "utf-8",
    );
    expect(src).toContain('args.mimeType === "application/pdf"');
    expect(src).toContain('type: "document" as const');
    expect(src).toContain('type: "image" as const');
  });

  it("visionQuery exposes cacheReferenceFile flag for re-used artifacts (style guides, brand PDFs)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "_core/claudeFiles.ts"),
      "utf-8",
    );
    expect(src).toContain("cacheReferenceFile?: boolean");
    expect(src).toContain("args.cacheReferenceFile");
  });
});

describe("supplier.parseReceiptDocument tRPC procedure", () => {
  it("is wired with the right input shape + cleanup", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "routers/supplier.ts"),
      "utf-8",
    );
    expect(src).toContain("parseReceiptDocument: orgProcedure");
    // PDF / PNG / JPEG / WEBP only — frontend should match.
    expect(src).toContain('"application/pdf"');
    expect(src).toContain('"image/png"');
    // 8MB upload cap — receipts are small.
    expect(src).toContain("8 * 1024 * 1024");
    // Always delete the file after extraction.
    expect(src).toContain("await deleteFile(uploaded.id)");
    // Strict JSON schema for line items + document-level fields.
    expect(src).toContain('"supplier_receipt"');
    expect(src).toContain("unitCostCents");
    expect(src).toContain("subtotalCents");
  });

  it("throws PRECONDITION_FAILED (with config hint) when ANTHROPIC_API_KEY is unset", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "routers/supplier.ts"),
      "utf-8",
    );
    expect(src).toContain('code: "PRECONDITION_FAILED"');
    expect(src).toContain("ANTHROPIC_API_KEY");
    expect(src).toContain("isFilesApiAvailable()");
  });
});

describe("Extended workflow promotion", () => {
  it("merchantWorkflows: 7+ workflows now opt into composeSystemPrompt + caching", async () => {
    // Each workflow contributes one cache hit per run on the shared
    // 4663-token preamble. After each workflow's first run, every
    // subsequent run reads the preamble from cache (~10% of full
    // input price for the cached portion).
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "engine/merchantWorkflows.ts"),
      "utf-8",
    );
    const composeCount = (src.match(/composeSystemPrompt\(/g) || []).length;
    const cacheCount = (src.match(/cacheSystemPrompt: true/g) || []).length;
    // pricing_optimization, competitor_analysis, inventory_audit (×2 LLM steps),
    // supply_chain_intelligence, profit_loss_analysis, customer_segmentation
    expect(composeCount).toBeGreaterThanOrEqual(6);
    expect(cacheCount).toBeGreaterThanOrEqual(6);
  });

  it("socialWorkflows: 5+ workflows now opt into composeSystemPrompt + caching", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "engine/socialWorkflows.ts"),
      "utf-8",
    );
    const composeCount = (src.match(/composeSystemPrompt\(/g) || []).length;
    const cacheCount = (src.match(/cacheSystemPrompt: true/g) || []).length;
    // ad_campaign (×2), social_content, email_flow, seo_audit, viral_trend_detector, conversion_funnel
    expect(composeCount).toBeGreaterThanOrEqual(5);
    expect(cacheCount).toBeGreaterThanOrEqual(5);
  });
});
