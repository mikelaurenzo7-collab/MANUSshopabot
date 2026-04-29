/**
 * Cookbook patterns — reflect-and-revise + citations source-level wiring.
 *
 * These two patterns ship as opt-in helpers (server/_core/claudeReflect.ts
 * and server/_core/claudeCitations.ts) plus engine wiring in
 * server/engine/workflowEngine.ts. The patterns activate only when
 * ANTHROPIC_API_KEY is configured; without it, callers get the
 * single-pass / uncited fallback so deploys without the key keep
 * working.
 *
 * These tests guard:
 *   1. The helper modules export the expected surface.
 *   2. The workflow engine wires reflect-and-revise into the llm_call
 *      path (so step authors can opt in via `reflectAndRevise: true`).
 *   3. The four high-stakes workflows actually opt in (niche_research,
 *      brand_identity in complete_store_buildout, ad_campaign,
 *      pricing_optimization).
 *   4. The reflection-focus rubric names stay in lockstep with the
 *      ones the workflow authors reference.
 */
import { describe, it, expect } from "vitest";

const read = (rel: string): string => {
  const fs = require("fs");
  const path = require("path");
  return fs.readFileSync(path.resolve(__dirname, rel), "utf-8");
};

describe("Cookbook recipe — reflect-and-revise", () => {
  it("claudeReflect.ts exports the expected helper surface", async () => {
    const mod = await import("./_core/claudeReflect");
    expect(typeof mod.reflectAndRevise).toBe("function");
    expect(typeof mod.isReflectAndReviseAvailable).toBe("function");
    // Without ANTHROPIC_API_KEY the gate must report false so the
    // engine routes to the single-shot fallback rather than throwing.
    expect(mod.isReflectAndReviseAvailable()).toBe(false);
  });

  it("ships rubrics for each named ReflectionFocus", () => {
    const src = read("_core/claudeReflect.ts");
    // The five named bot-facing rubrics + the generic one. If a
    // workflow references a rubric that's not in this list the
    // engine ignores the flag silently — these names are the contract.
    for (const focus of [
      "niche_research",
      "brand_identity",
      "ad_creative",
      "pricing_decision",
      "content_calendar",
      "merchant_quality",
    ]) {
      expect(src, `rubric "${focus}" must be defined`).toContain(`${focus}:`);
    }
  });

  it("falls back to invokeLLM when ANTHROPIC_API_KEY is unset", () => {
    const src = read("_core/claudeReflect.ts");
    // The fallback path is what makes this safe to wire into Manus
    // deploys without the key — without it, opting in becomes a hard
    // dependency rather than a quality lift.
    expect(src).toContain("if (!isClaudeDirectAvailable())");
    expect(src).toMatch(/await invokeLLM\(/);
    // The shape must round-trip — callers branch on `reflectedAndRevised`.
    expect(src).toContain("reflectedAndRevised: false");
  });

  it("workflow engine wires reflectAndRevise ahead of the standard path", () => {
    const src = read("engine/workflowEngine.ts");
    expect(src).toContain('import { reflectAndRevise');
    // The opt-in trigger — both flags must be present for the engine to
    // route through the reflect path.
    expect(src).toContain("input.reflectAndRevise && input.reflectionFocus");
    // The audit-trail field — UI surfaces "what changed in the revise pass".
    expect(src).toContain("__reflect");
  });
});

describe("Cookbook recipe — citations-backed research", () => {
  it("claudeCitations.ts exports the expected helper surface", async () => {
    const mod = await import("./_core/claudeCitations");
    expect(typeof mod.citedResearch).toBe("function");
    expect(typeof mod.isCitationsAvailable).toBe("function");
    expect(mod.isCitationsAvailable()).toBe(false);
  });

  it("falls back to invokeLLM with inline source markers when key is unset", () => {
    const src = read("_core/claudeCitations.ts");
    expect(src).toContain("if (!isClaudeDirectAvailable())");
    // The fallback synthesizes [#N] markers + a Sources section so
    // the UI's footnote rendering still has something to show.
    expect(src).toContain("[#1]");
    expect(src).toContain("citationsEnabled: false");
  });

  it("native path attaches cache_control to the system prompt", () => {
    const src = read("_core/claudeCitations.ts");
    // Citations API calls are expensive; caching the system prompt is
    // the difference between "every research run pays full input cost"
    // and "second run reads from cache".
    expect(src).toContain("cache_control:");
    expect(src).toContain('citations: { enabled: true }');
  });
});

describe("Cookbook patterns — workflow opt-ins", () => {
  it("niche_research opts in to the niche_research rubric", () => {
    const src = read("engine/architectWorkflows.ts");
    // Find the niche_research workflow's first llm_call step and
    // assert the reflect flags are set with the right rubric.
    const block = src.slice(src.indexOf('registerWorkflow("niche_research"'));
    const upToNext = block.slice(0, block.indexOf('registerWorkflow("product_sourcing"'));
    expect(upToNext).toContain("reflectAndRevise: true");
    expect(upToNext).toContain('reflectionFocus: "niche_research"');
  });

  it("brand identity step in complete_store_buildout opts in to brand_identity", () => {
    const src = read("engine/architectWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("complete_store_buildout"'));
    expect(block).toContain("reflectAndRevise: true");
    expect(block).toContain('reflectionFocus: "brand_identity"');
  });

  it("ad_campaign opts in to the ad_creative rubric on ad copy", () => {
    const src = read("engine/socialWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("ad_campaign"'));
    const upToNext = block.slice(0, block.indexOf('registerWorkflow("social_content"'));
    expect(upToNext).toContain("reflectAndRevise: true");
    expect(upToNext).toContain('reflectionFocus: "ad_creative"');
  });

  it("pricing_optimization opts in to the pricing_decision rubric", () => {
    const src = read("engine/merchantWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("pricing_optimization"'));
    const upToNext = block.slice(0, block.indexOf('registerWorkflow("fulfillment_automation"'));
    expect(upToNext).toContain("reflectAndRevise: true");
    expect(upToNext).toContain('reflectionFocus: "pricing_decision"');
  });
});
