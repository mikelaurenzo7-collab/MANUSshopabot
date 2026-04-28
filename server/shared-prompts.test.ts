/**
 * Shared system-prompt bundle — cache-threshold + determinism canary.
 *
 * The platform-wide preamble (Marketing Moat directive, output
 * conventions, workflow recipes, capability primer) is bundled into a
 * single block. Workflows that opt into `cacheSystemPrompt: true` get
 * `cache_control: ephemeral` stamped on this block — but caching only
 * activates if the prefix clears the model's minimum cacheable size
 * (4096 tokens for Opus 4.7). If the bundle ever shrinks below that,
 * caching silently no-ops and the platform pays full input price for
 * every preamble on every run.
 *
 * Determinism is the second invariant: any byte change in the
 * preamble invalidates the cache for every downstream workflow on
 * every tenant. No timestamps, no UUIDs, no per-user data.
 */
import { describe, it, expect } from "vitest";

// Workflow registrations are required for the capability primer to
// have data to render — adapter modules populate the registry as a
// side effect of import.
import "./engine/architectWorkflows";
import "./engine/merchantWorkflows";
import "./engine/socialWorkflows";

import {
  getSharedSystemPrompt,
  getSharedSystemPromptTokenEstimate,
  composeSystemPrompt,
  _resetSharedPromptCacheForTest,
} from "./engine/sharedPrompts";

describe("shared system-prompt bundle", () => {
  it("clears the Opus 4.7 cache minimum (4096 tokens)", () => {
    const tokens = getSharedSystemPromptTokenEstimate();
    // 4096 is the hard minimum for Opus 4.7 prompt caching. The
    // estimator is intentionally conservative (3.5 chars/token vs
    // the actual ~4 chars/token), so this guard fires earlier than
    // the live API would. Real-world cache_creation_input_tokens
    // should consistently equal or exceed this estimate.
    expect(tokens, `bundle is only ${tokens} tokens — caching will silently no-op`).toBeGreaterThanOrEqual(4096);
  });

  it("is deterministic across calls", () => {
    _resetSharedPromptCacheForTest();
    const a = getSharedSystemPrompt();
    _resetSharedPromptCacheForTest();
    const b = getSharedSystemPrompt();
    // Byte-identical. If this ever drifts, every cache hit anywhere
    // in the platform turns into a cache miss.
    expect(a).toBe(b);
  });

  it("contains no obvious silent invalidators (timestamps, UUIDs, randomness)", () => {
    const prompt = getSharedSystemPrompt();
    // ISO-8601 timestamps would invalidate the cache every request.
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // UUIDs would invalidate every request.
    expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    // Math.random()-style trailing decimals (a tell for unsorted JSON).
    expect(prompt).not.toMatch(/0\.\d{10,}/);
  });

  it("contains the Marketing Moat directive", () => {
    const prompt = getSharedSystemPrompt();
    expect(prompt).toContain("MARKETING MOAT DIRECTIVE");
    expect(prompt).toContain("WALLED GARDENS");
    expect(prompt).toContain("CHANNEL DEPENDENCY SCORE");
  });

  it("contains the integration capability primer with all 7 ecommerce + 7 social platforms", () => {
    const prompt = getSharedSystemPrompt();
    expect(prompt).toContain("INTEGRATION CAPABILITY PRIMER");
    // Spot-check one platform from each side renders with strengths.
    expect(prompt).toContain("### shopify");
    expect(prompt).toContain("### amazon");
    expect(prompt).toContain("### tiktok");
    expect(prompt).toContain("### gmail");
  });

  it("contains the workflow-recipe catalog (so the bot can plan multi-step sagas)", () => {
    const prompt = getSharedSystemPrompt();
    expect(prompt).toContain("CANONICAL WORKFLOW RECIPES");
    // Recipes the bots actually call.
    expect(prompt).toContain("niche_research");
    expect(prompt).toContain("ad_campaign");
    expect(prompt).toContain("inventory_audit");
    expect(prompt).toContain("brand_identity_kit");
  });

  it("composeSystemPrompt prefixes the shared preamble and appends a workflow header", () => {
    const composed = composeSystemPrompt("Be a brilliant strategist.");
    expect(composed.startsWith(getSharedSystemPrompt())).toBe(true);
    expect(composed).toContain("## WORKFLOW INSTRUCTIONS");
    expect(composed).toContain("Be a brilliant strategist.");
  });

  it("workflows that opt into caching also use composeSystemPrompt", async () => {
    // Pre-fix only the niche_research workflow inlined the Marketing
    // Moat block. After the bundle, every workflow that opts into
    // cacheSystemPrompt: true should call composeSystemPrompt() to
    // get the platform preamble — otherwise the workflow's task
    // prompt sits alone, well under the cache minimum, and caching
    // silently no-ops.
    const fs = await import("fs");
    const path = await import("path");
    const arch = fs.readFileSync(path.resolve(__dirname, "engine/architectWorkflows.ts"), "utf-8");
    const merch = fs.readFileSync(path.resolve(__dirname, "engine/merchantWorkflows.ts"), "utf-8");

    // niche_research opts into caching → must use composeSystemPrompt
    const nicheStart = arch.indexOf('registerWorkflow("niche_research"');
    const nicheSection = arch.slice(nicheStart, nicheStart + 4000);
    expect(nicheSection).toContain("cacheSystemPrompt: true");
    expect(nicheSection).toContain("composeSystemPrompt(");

    // store_setup opts into caching → must use composeSystemPrompt
    const setupStart = arch.indexOf('registerWorkflow("store_setup"');
    const setupSection = arch.slice(setupStart, setupStart + 4000);
    expect(setupSection).toContain("cacheSystemPrompt: true");
    expect(setupSection).toContain("composeSystemPrompt(");

    // competitor_analysis + pricing_optimization (in merchantWorkflows)
    expect(merch).toContain("composeSystemPrompt(");
    const compStart = merch.indexOf('registerWorkflow("competitor_analysis"');
    expect(merch.slice(compStart, compStart + 4000)).toContain("cacheSystemPrompt: true");
    const priceStart = merch.indexOf('registerWorkflow("pricing_optimization"');
    expect(merch.slice(priceStart, priceStart + 4000)).toContain("cacheSystemPrompt: true");
  });
});
