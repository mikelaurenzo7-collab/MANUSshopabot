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
