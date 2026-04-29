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

  it("social_content opts in to the content_calendar rubric", () => {
    const src = read("engine/socialWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("social_content"'));
    const upToNext = block.slice(0, block.indexOf('registerWorkflow("seo_audit"'));
    expect(upToNext).toContain("reflectAndRevise: true");
    expect(upToNext).toContain('reflectionFocus: "content_calendar"');
  });

  it("inventory_audit opts in to the merchant_quality rubric", () => {
    const src = read("engine/merchantWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("inventory_audit"'));
    const upToNext = block.slice(0, block.indexOf('registerWorkflow("pricing_optimization"'));
    expect(upToNext).toContain("reflectAndRevise: true");
    expect(upToNext).toContain('reflectionFocus: "merchant_quality"');
  });

  it("email_flow opts in to the ad_creative rubric", () => {
    const src = read("engine/socialWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("email_flow"'));
    const upToNext = block.slice(0, block.indexOf('registerWorkflow("product_creative"'));
    expect(upToNext).toContain("reflectAndRevise: true");
    expect(upToNext).toContain('reflectionFocus: "ad_creative"');
  });
});

describe("Cookbook recipe — multi-draft + judge", () => {
  it("claudeMultiDraft.ts exports the expected helper surface", async () => {
    const mod = await import("./_core/claudeMultiDraft");
    expect(typeof mod.multiDraftAndJudge).toBe("function");
    expect(typeof mod.isMultiDraftAvailable).toBe("function");
    expect(mod.isMultiDraftAvailable()).toBe(false);
    // The pre-built brand-naming persona set ships with the helper —
    // four divergent angles so the judge gets a real choice.
    expect(Array.isArray(mod.BRAND_NAMING_PERSONAS)).toBe(true);
    expect(mod.BRAND_NAMING_PERSONAS.length).toBeGreaterThanOrEqual(3);
    for (const p of mod.BRAND_NAMING_PERSONAS) {
      expect(typeof p.label).toBe("string");
      expect(typeof p.framing).toBe("string");
      expect(p.framing.length).toBeGreaterThan(50);
    }
  });

  it("rejects multi-draft requests with fewer than 2 personas", async () => {
    const { multiDraftAndJudge } = await import("./_core/claudeMultiDraft");
    await expect(
      multiDraftAndJudge({
        systemPrompt: "x",
        userPrompt: "x",
        personas: [{ label: "only", framing: "x" }],
        judgeCriteria: "x",
      }),
    ).rejects.toThrow(/at least 2 personas/);
  });

  it("falls back to single-shot when ANTHROPIC_API_KEY is unset", () => {
    const src = read("_core/claudeMultiDraft.ts");
    expect(src).toContain("if (!isClaudeDirectAvailable())");
    expect(src).toContain("multiDrafted: false");
    // Must use Promise.all for parallel drafting — sequential drafting
    // would defeat the latency advantage that's half the point.
    expect(src).toContain("Promise.all(draftPromises)");
  });

  it("workflow engine wires multi-draft ahead of the standard path", () => {
    const src = read("engine/workflowEngine.ts");
    expect(src).toContain("import { multiDraftAndJudge");
    expect(src).toContain("input.multiDraftPersonas");
    expect(src).toContain("input.judgeCriteria");
    expect(src).toContain("__multiDraft");
  });

  it("brand-naming substep in brand_identity_kit opts into multi-draft", () => {
    const src = read("engine/architectWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("brand_identity_kit"'));
    expect(block).toContain("multiDraftPersonas:");
    expect(block).toContain("judgeCriteria:");
    // The four canonical brand-naming angles must all be present.
    expect(block).toContain('"clever_coiner"');
    expect(block).toContain('"practical_descriptor"');
    expect(block).toContain('"aspirational_mood"');
    expect(block).toContain('"category_disruptor"');
  });
});

describe("Cookbook recipe — generic agent loop", () => {
  it("claudeAgentLoop.ts exports the expected helper surface", async () => {
    const mod = await import("./_core/claudeAgentLoop");
    expect(typeof mod.runAgentLoop).toBe("function");
    expect(typeof mod.isAgentLoopAvailable).toBe("function");
    expect(mod.isAgentLoopAvailable()).toBe(false);
  });

  it("throws (no fallback) when ANTHROPIC_API_KEY is missing", () => {
    // Unlike reflect / multi-draft, the agent loop has no meaningful
    // single-call fallback — autonomous research without a loop is a
    // contradiction. The helper must throw so callers route around it.
    const src = read("_core/claudeAgentLoop.ts");
    expect(src).toContain("ANTHROPIC_API_KEY is not set");
    expect(src).toContain("no meaningful single-call fallback");
  });

  it("dispatches tool calls + records an audit trail with iteration + category", () => {
    const src = read("_core/claudeAgentLoop.ts");
    // Audit trail is the operator-facing surface — workflow engine
    // attaches it to the step output so the dashboard can render
    // "scraped 3 pages, looked up SKU, decided to hold pricing".
    expect(src).toContain("toolCalls: auditTrail");
    expect(src).toContain("toolCategoryByName");
    expect(src).toContain("iteration: iterations");
    // Failures must be caught and returned to the model as
    // tool_result with is_error so the loop can self-correct rather
    // than crashing the whole step.
    expect(src).toContain("is_error: true");
  });

  it("caches the system prompt across loop iterations", () => {
    const src = read("_core/claudeAgentLoop.ts");
    // Multi-iteration loops are exactly the case caching pays for —
    // the system prompt is identical across all N round-trips.
    expect(src).toContain('cache_control: { type: "ephemeral" as const }');
  });
});

describe("Cookbook patterns — additional reflect opt-ins", () => {
  it("competitor_pricing_scan opts in to merchant_quality", () => {
    const src = read("engine/architectWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("competitor_pricing_scan"'));
    const upToNext = block.slice(0, block.indexOf('registerWorkflow("brand_identity_kit"'));
    expect(upToNext).toContain("reflectAndRevise: true");
    expect(upToNext).toContain('reflectionFocus: "merchant_quality"');
  });

  it("competitor_analysis (Merchant) opts in to merchant_quality", () => {
    const src = read("engine/merchantWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("competitor_analysis"'));
    const upToNext = block.slice(0, block.indexOf('registerWorkflow("supply_chain_intelligence"'));
    expect(upToNext).toContain("reflectAndRevise: true");
    expect(upToNext).toContain('reflectionFocus: "merchant_quality"');
  });

  it("seo_audit (Social) opts in to merchant_quality", () => {
    const src = read("engine/socialWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("seo_audit"'));
    const upToNext = block.slice(0, block.indexOf('registerWorkflow("email_flow"'));
    expect(upToNext).toContain("reflectAndRevise: true");
    expect(upToNext).toContain('reflectionFocus: "merchant_quality"');
  });

  it("viral_trend_detector (Social) opts in to content_calendar", () => {
    const src = read("engine/socialWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("viral_trend_detector"'));
    const upToNext = block.slice(0, block.indexOf('registerWorkflow("influencer_outreach"'));
    expect(upToNext).toContain("reflectAndRevise: true");
    expect(upToNext).toContain('reflectionFocus: "content_calendar"');
  });
});

describe("Cookbook recipe — agent-loop engine wiring", () => {
  it("agentToolsets registry exposes register / get / list", async () => {
    const mod = await import("./engine/agentToolsets");
    expect(typeof mod.registerAgentToolset).toBe("function");
    expect(typeof mod.getAgentToolset).toBe("function");
    expect(typeof mod.listAgentToolsetNames).toBe("function");
    // The v0 toolset registers at module load — must be present.
    const names = mod.listAgentToolsetNames();
    expect(names).toContain("architect.competitor_stalker_v0");
    const set = mod.getAgentToolset("architect.competitor_stalker_v0");
    expect(set).toBeDefined();
    expect(Array.isArray(set!.tools)).toBe(true);
    expect(set!.tools.length).toBe(3);
    for (const t of set!.tools) {
      expect(typeof t.name).toBe("string");
      expect(typeof t.description).toBe("string");
      expect(typeof t.input_schema).toBe("object");
    }
  });

  it("competitor_stalker dispatcher returns the documented shapes for each tool", async () => {
    const { getAgentToolset } = await import("./engine/agentToolsets");
    const set = getAgentToolset("architect.competitor_stalker_v0");
    expect(set).toBeDefined();
    const searchResult = (await set!.dispatch("search_competitors", { niche: "minimalist watches", limit: 4 })) as any;
    expect(searchResult.ok).toBe(true);
    expect(searchResult.niche).toBe("minimalist watches");
    expect(Array.isArray(searchResult.candidates)).toBe(true);
    expect(searchResult.candidates.length).toBe(4);
    for (const c of searchResult.candidates) {
      expect(typeof c.name).toBe("string");
      expect(typeof c.platform).toBe("string");
      expect(typeof c.estimatedMonthlyVisits).toBe("number");
    }
    const fetchResult = (await set!.dispatch("fetch_competitor_pricing", { sellerName: "BrandA", platform: "shopify" })) as any;
    expect(fetchResult.ok).toBe(true);
    expect(fetchResult.priceBandUsd.min).toBeGreaterThan(0);
    expect(fetchResult.priceBandUsd.max).toBeGreaterThanOrEqual(fetchResult.priceBandUsd.min);
    const compareResult = (await set!.dispatch("compare_to_our_pricing", {
      ourPriceUsdMin: 30, ourPriceUsdMax: 50,
      competitorPriceUsdMin: 25, competitorPriceUsdMax: 45,
      targetMarginPct: 40,
    })) as any;
    expect(compareResult.ok).toBe(true);
    expect(["above", "below", "at-parity"]).toContain(compareResult.positioning);
    expect(typeof compareResult.recommendation).toBe("string");
  });

  it("workflow engine wires useAgentLoop ahead of the standard path", () => {
    const src = read("engine/workflowEngine.ts");
    expect(src).toContain("import { runAgentLoop");
    expect(src).toContain("import { getAgentToolset }");
    expect(src).toContain("input.useAgentLoop");
    expect(src).toContain("input.agentToolset");
    expect(src).toContain("__agentLoop");
    // Misregistered toolsets must fall through to single-shot — never
    // crash the workflow on a typo'd toolset name.
    expect(src).toMatch(/is not registered .* falling back/);
  });

  it("autonomous_competitor_stalker workflow opts into the agent loop", () => {
    const src = read("engine/architectWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("autonomous_competitor_stalker"'));
    expect(block).toContain("useAgentLoop: true");
    expect(block).toContain('agentToolset: "architect.competitor_stalker_v0"');
    // Iteration cap must be set so a thrashing agent can't burn budget.
    expect(block).toContain("maxIterations:");
  });

  it("agentToolsets registers at boot via the workflow router import", () => {
    const src = read("routers/workflows.ts");
    expect(src).toContain('import "../engine/agentToolsets"');
  });

  it("registers all three bot toolsets at module load", async () => {
    const { listAgentToolsetNames } = await import("./engine/agentToolsets");
    const names = listAgentToolsetNames();
    expect(names).toContain("architect.competitor_stalker_v0");
    expect(names).toContain("merchant.repricer_v0");
    expect(names).toContain("social.trend_hunter_v0");
  });

  it("merchant.repricer_v0 dispatcher returns documented shapes + enforces the 25% policy", async () => {
    const { getAgentToolset } = await import("./engine/agentToolsets");
    const set = getAgentToolset("merchant.repricer_v0");
    expect(set).toBeDefined();
    expect(set!.tools.map((t) => t.name).sort()).toEqual(["get_competitor_band", "get_sku_snapshot", "propose_repricing"]);

    const snapshot = (await set!.dispatch("get_sku_snapshot", { sku: "ABC-100" })) as any;
    expect(snapshot.ok).toBe(true);
    expect(snapshot.sku).toBe("ABC-100");
    expect(snapshot.currentPriceUsd).toBeGreaterThan(0);
    expect(snapshot.costUsd).toBeGreaterThan(0);
    expect(snapshot.currentPriceUsd).toBeGreaterThan(snapshot.costUsd);

    const band = (await set!.dispatch("get_competitor_band", { sku: "ABC-100", category: "watches", platform: "shopify" })) as any;
    expect(band.ok).toBe(true);
    expect(band.bandUsd.min).toBeGreaterThan(0);
    expect(band.bandUsd.max).toBeGreaterThanOrEqual(band.bandUsd.min);

    // Auto-apply path: ≤25% move with explicit raise/drop action stays as proposed.
    const auto = (await set!.dispatch("propose_repricing", {
      sku: "ABC-100", action: "raise",
      currentPriceUsd: 50, newPriceUsd: 55,
      justification: "below band median",
    })) as any;
    expect(auto.acceptedAction).toBe("raise");
    expect(auto.requiresApproval).toBe(false);

    // Policy gate: a >25% raise must auto-promote to flag_for_approval
    // even when the agent picks "raise" — this is the platform-policy
    // enforcement happening in the dispatcher, not optional.
    const flagged = (await set!.dispatch("propose_repricing", {
      sku: "ABC-100", action: "raise",
      currentPriceUsd: 50, newPriceUsd: 80,
      justification: "competitors moved up sharply",
    })) as any;
    expect(flagged.acceptedAction).toBe("flag_for_approval");
    expect(flagged.requiresApproval).toBe(true);
    expect(flagged.policyNote).toMatch(/policy/i);
  });

  it("social.trend_hunter_v0 dispatcher returns per-platform trends + scoring + briefs", async () => {
    const { getAgentToolset } = await import("./engine/agentToolsets");
    const set = getAgentToolset("social.trend_hunter_v0");
    expect(set).toBeDefined();
    expect(set!.tools.map((t) => t.name).sort()).toEqual(["commit_trend_brief", "fetch_platform_trends", "score_trend_relevance"]);

    const trends = (await set!.dispatch("fetch_platform_trends", { platform: "tiktok", niche: "minimalist watches", limit: 3 })) as any;
    expect(trends.ok).toBe(true);
    expect(trends.platform).toBe("tiktok");
    expect(Array.isArray(trends.trends)).toBe(true);
    expect(trends.trends.length).toBe(3);
    for (const t of trends.trends) {
      expect(typeof t.name).toBe("string");
      expect(typeof t.risingPct).toBe("number");
    }

    const score = (await set!.dispatch("score_trend_relevance", { trendName: "POVcheck", niche: "minimalist watches" })) as any;
    expect(score.ok).toBe(true);
    expect(score.score).toBeGreaterThanOrEqual(30);
    expect(score.score).toBeLessThanOrEqual(99);
    expect(["high-fit", "worth-testing", "skip"]).toContain(score.verdict);

    const brief = (await set!.dispatch("commit_trend_brief", {
      trendName: "POVcheck", platform: "tiktok", niche: "minimalist watches",
      format: "POV", hookCopy: "the watch every minimalist obsesses over", urgencyHours: 48,
    })) as any;
    expect(brief.ok).toBe(true);
    expect(brief.brief.urgencyHours).toBe(48);
    expect(typeof brief.committedAt).toBe("string");
  });

  it("autonomous_repricer (Merchant) opts into merchant.repricer_v0 + an approval gate", () => {
    const src = read("engine/merchantWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("autonomous_repricer"'));
    expect(block).toContain("useAgentLoop: true");
    expect(block).toContain('agentToolset: "merchant.repricer_v0"');
    expect(block).toContain("maxIterations:");
    // The downstream approval gate is what makes the flag_for_approval
    // policy actually do something — without it, flagged moves
    // would just be data on the floor.
    expect(block).toContain('stepType: "approval_gate"');
  });

  it("autonomous_trend_hunter (Social) opts into social.trend_hunter_v0", () => {
    const src = read("engine/socialWorkflows.ts");
    const block = src.slice(src.indexOf('registerWorkflow("autonomous_trend_hunter"'));
    expect(block).toContain("useAgentLoop: true");
    expect(block).toContain('agentToolset: "social.trend_hunter_v0"');
    expect(block).toContain("maxIterations:");
  });
});

describe("Cookbook detail panel — expandable audit surface", () => {
  it("LiveWorkflowRunner exposes a CookbookDetail block for each recipe payload", () => {
    const src = read("../client/src/components/LiveWorkflowRunner.tsx");
    expect(src).toContain("function CookbookDetail");
    // Three independently-rendering blocks — one per recipe. Each one
    // must guard its own input so a partial step.output renders the
    // pieces it has and skips the pieces it doesn't.
    expect(src).toContain("ReflectCritiqueBlock");
    expect(src).toContain("MultiDraftBlock");
    expect(src).toContain("AgentTrailBlock");
    // The toggle controls expand/collapse — must be wired to per-step
    // local state so multiple steps can be open at once without
    // fighting each other.
    expect(src).toContain("Show details");
    expect(src).toContain("Hide details");
    expect(src).toContain("function stepHasCookbookDetail");
  });

  it("ReflectCritiqueBlock groups by severity so blockers float up", () => {
    const src = read("../client/src/components/LiveWorkflowRunner.tsx");
    expect(src).toContain("bySeverity");
    // The severity order is fixed — blockers first, then majors, then
    // minors. Operators care most about the things the critique pass
    // forced changed.
    expect(src).toMatch(/\["blocker", "Blocker"\]/);
    expect(src).toMatch(/\["major", "Major"\]/);
    expect(src).toMatch(/\["minor", "Minor"\]/);
  });

  it("AgentTrailBlock surfaces iteration + tool name + result snippet per call", () => {
    const src = read("../client/src/components/LiveWorkflowRunner.tsx");
    expect(src).toContain("live-workflow-runner-cookbook-trail-iter");
    expect(src).toContain("live-workflow-runner-cookbook-trail-name");
    expect(src).toContain("live-workflow-runner-cookbook-trail-snippet");
    // Errored tool calls must paint visibly different so operators
    // can scan the timeline and spot failures fast.
    expect(src).toContain("is-error");
  });

  it("index.css carries the detail-panel block styles", () => {
    const css = read("../client/src/index.css");
    expect(css).toContain("live-workflow-runner-cookbook-detail");
    expect(css).toContain("live-workflow-runner-cookbook-block.is-reflect");
    expect(css).toContain("live-workflow-runner-cookbook-block.is-multi");
    expect(css).toContain("live-workflow-runner-cookbook-block.is-agent");
    expect(css).toContain("live-workflow-runner-cookbook-issue.is-blocker");
  });
});

describe("Cookbook badges — operator-facing surface", () => {
  it("LiveWorkflowRunner renders CookbookBadges from step.output.__reflect / __multiDraft / __agentLoop", () => {
    const src = read("../client/src/components/LiveWorkflowRunner.tsx");
    expect(src).toContain("CookbookBadges");
    // Badges only render when the underlying flag actually fired —
    // we don't want the UI to lie about what the bot did when the
    // path fell back to single-shot.
    expect(src).toMatch(/reflectedAndRevised === true/);
    expect(src).toMatch(/multiDrafted === true/);
    // Agent pill lights only when at least one tool was actually called.
    expect(src).toContain("__agentLoop");
    expect(src).toMatch(/toolCallCount > 0/);
    // Tooltip must surface the cookbook detail so operators
    // understand what changed without opening the full panel.
    expect(src).toContain("Reflected & revised");
    expect(src).toContain("Multi-drafted");
    expect(src).toContain("Agent-looped");
  });

  it("index.css carries the cookbook-pill styles", () => {
    const src = read("../client/src/index.css");
    expect(src).toContain("live-workflow-runner-cookbook-pill");
    expect(src).toContain(".is-reflect");
    expect(src).toContain(".is-multi");
  });
});
