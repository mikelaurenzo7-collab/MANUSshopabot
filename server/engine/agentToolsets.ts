/**
 * Agent-toolset registry — named bundles of tools + dispatchers that
 * workflow steps reference by string ID.
 *
 * Why a registry:
 *   The agent-loop helper (server/_core/claudeAgentLoop.ts) takes a
 *   `tools[]` array and a `dispatch()` function. Both are runtime
 *   values — they can't be serialized into the workflow_steps.input
 *   JSON column. So workflow authors don't pass them inline; instead
 *   they pass a registered name like `architect.competitor_stalker_v0`,
 *   and the engine resolves it to the live tools+dispatcher pair
 *   at execution time.
 *
 * Why this shape (vs. inlining tools in the engine):
 *   Toolsets are workflow-domain logic (where to look up a competitor
 *   price, how to score a niche). They live with the workflow code,
 *   not the engine. The engine only knows how to look up by name and
 *   call the dispatcher.
 *
 * How to add a new toolset:
 *   1. Build a `tools: AgentTool[]` describing each tool's shape.
 *   2. Build a `dispatch(name, input) → result` that handles every
 *      tool the array declares.
 *   3. Call `registerAgentToolset("namespace.toolset_name_v0", ...)`
 *      at module load. The version suffix lets you ship breaking
 *      changes without renaming workflows.
 *   4. Reference by name from the workflow:
 *        input: { useAgentLoop: true, agentToolset: "architect.competitor_stalker_v0", ... }
 *
 * The initial registered toolset is `architect.competitor_stalker_v0`
 * — a 3-tool agent that searches for competitors in a niche, fetches
 * pricing snapshots, and compares to the merchant's own prices. The
 * dispatcher returns deterministic synthesized data (not external
 * HTTP) for the v0 — proving the wiring without depending on external
 * services. Real network calls land in v1 when web-scrape adapters
 * are wired through.
 */

import type { AgentTool, AgentToolDispatcher } from "../_core/claudeAgentLoop";

interface RegisteredToolset {
  tools: AgentTool[];
  dispatch: AgentToolDispatcher;
}

const registry = new Map<string, RegisteredToolset>();

/**
 * Register a toolset under a stable name. Idempotent — re-registering
 * the same name overwrites the prior entry, which is what the test
 * suite + the dev hot-reload path want. Production deploys register
 * once at module load.
 */
export function registerAgentToolset(
  name: string,
  toolset: RegisteredToolset,
): void {
  registry.set(name, toolset);
}

/** Look up a registered toolset. Returns undefined when missing — the
 *  caller decides whether that's an error (workflow author typo) or
 *  a graceful "agent loop unavailable, fall back" branch. */
export function getAgentToolset(name: string): RegisteredToolset | undefined {
  return registry.get(name);
}

/** All currently-registered toolset names. Surfaced to tests + the
 *  workflow authoring UX so authors discover what's available. */
export function listAgentToolsetNames(): string[] {
  return Array.from(registry.keys()).sort();
}

// ─── Toolset: architect.competitor_stalker_v0 ──────────────────────────────
//
// Three-tool agent that researches competitors in a niche and returns
// a structured pricing-and-positioning shortlist. The agent decides
// the order of calls — typically search → fetch a few → compare to
// our pricing. The audit trail shows exactly which competitors it
// looked at and why it picked the final shortlist.
//
// All three tools return deterministic synthesized data in this v0
// — the structure is stable so the rest of the workflow can rely on
// it. v1 will swap the dispatcher to call the live web-scrape +
// internal pricing endpoints.

const COMPETITOR_STALKER_TOOLS: AgentTool[] = [
  {
    name: "search_competitors",
    description:
      "Search for the top competitors selling in a given niche. Returns up to N candidate sellers with platform + estimated traffic + a brief positioning blurb. Use this first to scope the field.",
    category: "research",
    input_schema: {
      type: "object",
      properties: {
        niche: { type: "string", description: "The niche/category to search within (e.g. 'minimalist watches', 'vintage denim')." },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 8, description: "How many candidates to return." },
      },
      required: ["niche"],
    },
  },
  {
    name: "fetch_competitor_pricing",
    description:
      "Fetch a pricing snapshot for one competitor — typical price band (USD), discount cadence, and any visible badges/positioning. Pass the seller name from search_competitors. Use this 2-4× to triangulate a price band, not 10×.",
    category: "research",
    input_schema: {
      type: "object",
      properties: {
        sellerName: { type: "string", description: "The competitor name returned by search_competitors." },
        platform: { type: "string", description: "Platform the competitor operates on (e.g. 'shopify', 'amazon')." },
      },
      required: ["sellerName", "platform"],
    },
  },
  {
    name: "compare_to_our_pricing",
    description:
      "Given a competitor's price band, compute where the merchant's own pricing sits — at-parity, above, or below — and what margin headroom exists at each tier. Use this once you have a triangulated band.",
    category: "analysis",
    input_schema: {
      type: "object",
      properties: {
        ourPriceUsdMin: { type: "number" },
        ourPriceUsdMax: { type: "number" },
        competitorPriceUsdMin: { type: "number" },
        competitorPriceUsdMax: { type: "number" },
        targetMarginPct: { type: "number", default: 40 },
      },
      required: ["ourPriceUsdMin", "ourPriceUsdMax", "competitorPriceUsdMin", "competitorPriceUsdMax"],
    },
  },
];

/**
 * Deterministic synth dispatcher. Returns plausible structured data
 * so the agent loop has something to reason about. The shape is
 * stable across versions; the values are deterministic functions of
 * the input so tests can assert on them.
 */
const competitorStalkerDispatch: AgentToolDispatcher = async (toolName, input) => {
  if (toolName === "search_competitors") {
    const niche = String(input.niche ?? "general");
    const limit = Math.min(20, Math.max(1, Number(input.limit ?? 8)));
    const candidates = Array.from({ length: limit }, (_, i) => ({
      name: `${niche.split(/\s+/)[0]?.replace(/[^a-z0-9]/gi, "") || "Brand"}${String.fromCharCode(65 + (i % 26))}`,
      platform: ["shopify", "amazon", "etsy", "tiktok_shop"][i % 4],
      estimatedMonthlyVisits: 5_000 * (i + 1),
      positioning:
        i % 3 === 0
          ? "premium · curated · slow-fashion narrative"
          : i % 3 === 1
            ? "value · high-volume · marketplace-native"
            : "niche specialist · craftsmanship · loyal community",
    }));
    return { ok: true, niche, candidates };
  }

  if (toolName === "fetch_competitor_pricing") {
    const sellerName = String(input.sellerName ?? "Unknown");
    const platform = String(input.platform ?? "unknown");
    // Hash the name into a deterministic price band so different
    // sellers return different snapshots without external dependency.
    let h = 0;
    for (let i = 0; i < sellerName.length; i++) h = ((h << 5) - h + sellerName.charCodeAt(i)) | 0;
    const base = 30 + Math.abs(h % 60);
    const spread = 15 + Math.abs(h % 30);
    return {
      ok: true,
      sellerName,
      platform,
      priceBandUsd: { min: base, median: base + spread / 2, max: base + spread },
      discountCadence:
        platform === "shopify" ? "15-20% on email signup, 25% Black Friday window"
          : platform === "amazon" ? "Lightning Deals 1-2× / month, no compare-at"
          : platform === "etsy" ? "Holiday-aligned native sales, 10-25% range"
          : "Live drops + creator-coded discounts",
      badges: ["best-seller", "free-shipping"].filter(() => Math.abs(h) % 3 !== 0),
    };
  }

  if (toolName === "compare_to_our_pricing") {
    const ourMid = (Number(input.ourPriceUsdMin) + Number(input.ourPriceUsdMax)) / 2;
    const compMid = (Number(input.competitorPriceUsdMin) + Number(input.competitorPriceUsdMax)) / 2;
    const targetMargin = Number(input.targetMarginPct ?? 40);
    const delta = ((ourMid - compMid) / compMid) * 100;
    const positioning =
      delta > 10 ? "above" : delta < -10 ? "below" : "at-parity";
    const headroomToMargin = ourMid * (targetMargin / 100);
    return {
      ok: true,
      ourMidUsd: Number(ourMid.toFixed(2)),
      competitorMidUsd: Number(compMid.toFixed(2)),
      deltaPct: Number(delta.toFixed(1)),
      positioning,
      marginHeadroomUsd: Number(headroomToMargin.toFixed(2)),
      recommendation:
        positioning === "above"
          ? "Defend premium positioning with story + service, or run a parity SKU as the volume play."
          : positioning === "below"
            ? "Raise to band median and validate elasticity — current pricing leaves margin on the table."
            : "Hold and differentiate on positioning rather than price; the band is fair.",
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
};

registerAgentToolset("architect.competitor_stalker_v0", {
  tools: COMPETITOR_STALKER_TOOLS,
  dispatch: competitorStalkerDispatch,
});

// ─── Toolset: merchant.repricer_v0 ─────────────────────────────────────────
//
// Autonomous repricer agent. Walks the merchant's catalog one SKU at
// a time: fetches current price + cost + recent velocity, checks where
// the SKU sits vs. the live competitor band, and emits a structured
// repricing decision (hold / raise / drop / flag-for-approval). The
// "flag-for-approval" branch hits the workflow's approval gate
// downstream rather than auto-applying — moves >25% always require
// human sign-off per platform policy.
//
// Three tools, each independently useful:
//   • get_sku_snapshot — current price, cost, days-of-stock, recent
//     velocity. The base data the decision is grounded in.
//   • get_competitor_band — typical price range for the SKU's
//     category on the merchant's primary platform. Drives whether
//     "hold" is the right call.
//   • propose_repricing — writes the decision into a structured
//     {action, newPriceUsd, justification, requiresApproval} blob
//     the workflow's downstream approval gate consumes.
//
// V0 dispatcher returns deterministic synthesized data. V1 swaps to
// live store + competitor adapters.

const REPRICER_TOOLS: AgentTool[] = [
  {
    name: "get_sku_snapshot",
    description:
      "Fetch the merchant's current snapshot for a SKU — current price (USD), cost (USD), days-of-stock, and last-30-day velocity (units/day). Use this first, once per SKU.",
    category: "lookup",
    input_schema: {
      type: "object",
      properties: {
        sku: { type: "string" },
      },
      required: ["sku"],
    },
  },
  {
    name: "get_competitor_band",
    description:
      "Fetch the typical competitor price band (USD min / median / max) for a SKU's category on the merchant's primary platform. Use after get_sku_snapshot to triangulate where the SKU sits vs. the market.",
    category: "research",
    input_schema: {
      type: "object",
      properties: {
        sku: { type: "string" },
        category: { type: "string" },
        platform: { type: "string" },
      },
      required: ["sku", "category"],
    },
  },
  {
    name: "propose_repricing",
    description:
      "Emit a structured repricing decision for a SKU. action ∈ {hold, raise, drop, flag_for_approval}. Moves >25% must use flag_for_approval per platform policy. Use this once per SKU at the end of the loop.",
    category: "action",
    input_schema: {
      type: "object",
      properties: {
        sku: { type: "string" },
        action: { type: "string", enum: ["hold", "raise", "drop", "flag_for_approval"] },
        currentPriceUsd: { type: "number" },
        newPriceUsd: { type: "number" },
        justification: { type: "string" },
      },
      required: ["sku", "action", "currentPriceUsd", "newPriceUsd", "justification"],
    },
  },
];

const repricerDispatch: AgentToolDispatcher = async (toolName, input) => {
  // Hash SKU into deterministic snapshot + band so tests can assert
  // on stable shapes without coupling to randomness.
  const sku = String(input.sku ?? "SKU-0");
  let h = 0;
  for (let i = 0; i < sku.length; i++) h = ((h << 5) - h + sku.charCodeAt(i)) | 0;
  const baseCost = 8 + Math.abs(h % 22);
  const basePrice = baseCost * (2 + (Math.abs(h) % 100) / 100);

  if (toolName === "get_sku_snapshot") {
    return {
      ok: true,
      sku,
      currentPriceUsd: Number(basePrice.toFixed(2)),
      costUsd: Number(baseCost.toFixed(2)),
      daysOfStock: 14 + Math.abs(h % 30),
      velocityPerDay: Number((1 + (Math.abs(h) % 50) / 10).toFixed(1)),
    };
  }

  if (toolName === "get_competitor_band") {
    const min = basePrice * 0.85;
    const max = basePrice * 1.18;
    return {
      ok: true,
      sku,
      category: String(input.category ?? "general"),
      platform: String(input.platform ?? "shopify"),
      bandUsd: {
        min: Number(min.toFixed(2)),
        median: Number(((min + max) / 2).toFixed(2)),
        max: Number(max.toFixed(2)),
      },
    };
  }

  if (toolName === "propose_repricing") {
    const current = Number(input.currentPriceUsd);
    const proposed = Number(input.newPriceUsd);
    const action = String(input.action);
    const deltaPct = current > 0 ? ((proposed - current) / current) * 100 : 0;
    // Platform policy: >25% moves require approval. Helper rejects
    // any "raise" or "drop" that crosses the line — keeps the agent
    // honest even if its reasoning would otherwise paper over the gate.
    const violatesPolicy =
      (action === "raise" || action === "drop") && Math.abs(deltaPct) > 25;
    return {
      ok: true,
      sku,
      acceptedAction: violatesPolicy ? "flag_for_approval" : action,
      proposed: {
        action,
        currentPriceUsd: current,
        newPriceUsd: proposed,
        justification: String(input.justification ?? ""),
        deltaPct: Number(deltaPct.toFixed(1)),
      },
      requiresApproval: violatesPolicy || action === "flag_for_approval",
      policyNote: violatesPolicy
        ? "Move > 25% — auto-promoted to flag_for_approval per platform policy."
        : action === "flag_for_approval"
          ? "Agent flagged for approval explicitly."
          : "Within auto-apply policy.",
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
};

registerAgentToolset("merchant.repricer_v0", {
  tools: REPRICER_TOOLS,
  dispatch: repricerDispatch,
});

// ─── Toolset: social.trend_hunter_v0 ───────────────────────────────────────
//
// Autonomous trend hunter. Crawls cross-platform trend signals,
// scores them against the brand's niche, and shortlists the trends
// the Social Bot should jump on. Three tools:
//   • fetch_platform_trends(platform, niche) — top-N rising sounds /
//     hashtags / formats on a single platform.
//   • score_trend_relevance(trendName, niche) — niche-fit score 0-100.
//   • commit_trend_brief(trend) — emits a structured creative brief
//     the Social Bot's downstream content_calendar workflow can
//     consume directly.
//
// V0 dispatcher returns deterministic synthesized data; v1 reads
// from live platform analytics adapters.

const TREND_HUNTER_TOOLS: AgentTool[] = [
  {
    name: "fetch_platform_trends",
    description:
      "Fetch top rising trends (sounds / hashtags / formats) on one platform for a given niche. Call once per platform — TikTok, Instagram, and Twitter typically; Pinterest if the niche is visual-shopping-heavy.",
    category: "research",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["tiktok", "instagram", "twitter", "pinterest", "youtube"] },
        niche: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 15, default: 8 },
      },
      required: ["platform", "niche"],
    },
  },
  {
    name: "score_trend_relevance",
    description:
      "Score how well a single trend fits the brand's niche on a 0-100 scale. Reject trends below 40 — under that the production cost outweighs the lift. Call once per candidate trend you actually want to evaluate.",
    category: "analysis",
    input_schema: {
      type: "object",
      properties: {
        trendName: { type: "string" },
        niche: { type: "string" },
      },
      required: ["trendName", "niche"],
    },
  },
  {
    name: "commit_trend_brief",
    description:
      "Emit a structured creative brief for one trend the Social Bot should hijack. Use only for trends scoring ≥40. The brief feeds the content_calendar workflow downstream.",
    category: "action",
    input_schema: {
      type: "object",
      properties: {
        trendName: { type: "string" },
        platform: { type: "string" },
        niche: { type: "string" },
        format: { type: "string", description: "e.g. 'duet', 'remix', 'POV', 'static carousel'" },
        hookCopy: { type: "string", description: "First-line hook (≤80 chars) tuned to the platform." },
        ctaCopy: { type: "string" },
        urgencyHours: { type: "integer", description: "How many hours of relevance the trend has left." },
      },
      required: ["trendName", "platform", "niche", "format", "hookCopy", "urgencyHours"],
    },
  },
];

const trendHunterDispatch: AgentToolDispatcher = async (toolName, input) => {
  const niche = String(input.niche ?? "general");

  if (toolName === "fetch_platform_trends") {
    const platform = String(input.platform ?? "tiktok");
    const limit = Math.min(15, Math.max(1, Number(input.limit ?? 8)));
    // Per-platform deterministic trend names so tests can assert
    // exactly what came back without snapshot drift.
    const seedFor: Record<string, string[]> = {
      tiktok: ["GRWMfor", "softlaunch", "thatGirl", "deinfluencing", "POV", "duet", "transition", "haul", "comfortwatch", "underratedfind"],
      instagram: ["dumpgrid", "carouselcomeback", "reelcover", "softboard", "asmrunbox", "behindscenes", "ootd", "studyflats", "outfittime", "linkup"],
      twitter: ["thread", "ratiowatch", "quoteit", "hottakes", "screenshotmoment", "explainer", "context", "receiptthread", "pollcheck", "bookmarkbait"],
      pinterest: ["moodboard", "outfitstack", "weddingplanning", "homerefresh", "vintageaesthetic", "DIYsimple", "kitchenstaple", "sustainableswap", "neutralpalette", "softlifecore"],
      youtube: ["shortsdaily", "vlogweek", "sitdownreview", "studyalongsilent", "tutorialminimal", "challenge30day", "essayreact", "podcastclip", "productdeepdive", "asmrproductive"],
    };
    const seeds = seedFor[platform] ?? seedFor.tiktok;
    const trends = seeds.slice(0, limit).map((name, i) => ({
      name: `${name}_${niche.replace(/\s+/g, "")}`.slice(0, 40),
      platform,
      risingPct: 35 + ((i * 17) % 50),
      sampleCreators: [`@creator_${platform}_${i}`, `@brand_${platform}_${i}`],
    }));
    return { ok: true, platform, niche, trends };
  }

  if (toolName === "score_trend_relevance") {
    const trendName = String(input.trendName ?? "");
    let h = 0;
    for (let i = 0; i < (trendName + niche).length; i++) {
      h = ((h << 5) - h + (trendName + niche).charCodeAt(i)) | 0;
    }
    const score = 30 + Math.abs(h % 70); // 30-99
    return {
      ok: true,
      trendName,
      niche,
      score,
      verdict: score >= 70 ? "high-fit" : score >= 40 ? "worth-testing" : "skip",
      rationale:
        score >= 70
          ? `Trend "${trendName}" maps cleanly to "${niche}" — same audience, same emotional terrain.`
          : score >= 40
            ? `Trend "${trendName}" has tangential overlap with "${niche}" — worth a single test post.`
            : `Trend "${trendName}" doesn't align with "${niche}" — skip; production cost outweighs lift.`,
    };
  }

  if (toolName === "commit_trend_brief") {
    return {
      ok: true,
      brief: {
        trendName: String(input.trendName ?? ""),
        platform: String(input.platform ?? ""),
        niche: String(input.niche ?? ""),
        format: String(input.format ?? "POV"),
        hookCopy: String(input.hookCopy ?? "").slice(0, 80),
        ctaCopy: input.ctaCopy ? String(input.ctaCopy).slice(0, 80) : null,
        urgencyHours: Number(input.urgencyHours ?? 24),
      },
      committedAt: new Date().toISOString(),
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
};

registerAgentToolset("social.trend_hunter_v0", {
  tools: TREND_HUNTER_TOOLS,
  dispatch: trendHunterDispatch,
});
