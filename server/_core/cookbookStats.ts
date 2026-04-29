/**
 * Cookbook telemetry — lightweight in-memory counters for recipe activations.
 *
 * Three numbers per recipe:
 *   • activations — how many times the recipe was invoked
 *   • successes — how many invocations completed without falling back
 *     (i.e. ANTHROPIC_API_KEY was set + the recipe ran end-to-end)
 *   • signalSum — recipe-specific aggregate. For reflect, the count of
 *     critique issues addressed across all runs. For multi-draft, the
 *     count of times the judge picked a non-default persona. For
 *     agent-loop, the total tool-call count across all runs.
 *
 * The point: without this, we ship the recipes and never know if
 * they're actually catching things or just adding latency. With this,
 * a quick `getCookbookStats()` snapshot tells you: "reflect ran 247
 * times today, addressed 1,203 issues — averages ~5 issues per run, so
 * the critique pass is doing real work."
 *
 * Storage: process-local Map. Resets on restart. Good enough for
 * production-watching by operators; not a substitute for proper
 * persistent telemetry. When that's needed, the existing
 * server/telemetry.ts surface is the right place — this module is
 * specifically for the cookbook recipes' activation pattern, which
 * benefits from cheap fire-and-forget counters.
 *
 * Activation: every cookbook helper calls `recordCookbookEvent()`
 * after the recipe runs. The engine wires the call sites; helpers
 * stay agnostic of the telemetry surface so they can be tested
 * standalone.
 */

export type CookbookRecipe =
  | "reflect"
  | "multi_draft"
  | "agent_loop";

interface RecipeStats {
  /** Total invocations (success + fallback). */
  activations: number;
  /** Invocations that completed via the actual recipe path (not the
   *  single-shot fallback). */
  successes: number;
  /** Recipe-specific aggregate signal. */
  signalSum: number;
  /** Last activation timestamp (ms epoch). Lets ops gauge "is the
   *  recipe still running?" at a glance. */
  lastActivatedAt: number | null;
}

const stats: Record<CookbookRecipe, RecipeStats> = {
  reflect: { activations: 0, successes: 0, signalSum: 0, lastActivatedAt: null },
  multi_draft: { activations: 0, successes: 0, signalSum: 0, lastActivatedAt: null },
  agent_loop: { activations: 0, successes: 0, signalSum: 0, lastActivatedAt: null },
};

interface CookbookEventInput {
  recipe: CookbookRecipe;
  /** Did the recipe actually run, or did we fall back to single-shot
   *  because ANTHROPIC_API_KEY was unset / the API errored / etc.?
   *  When false, `signal` is ignored. */
  success: boolean;
  /** Recipe-specific signal:
   *   • reflect: critique issue count addressed in the revise pass.
   *   • multi_draft: 1 if a non-first persona won, else 0.
   *   • agent_loop: tool-call count across the loop. */
  signal?: number;
}

/**
 * Record one cookbook recipe activation. Called from the engine
 * call site (workflowEngine.executeLLMStep) after each recipe lands.
 * Cheap — array of integer increments + a Date.now(). Fire-and-forget;
 * never throws, never awaits, never blocks the workflow path.
 */
export function recordCookbookEvent(event: CookbookEventInput): void {
  const s = stats[event.recipe];
  if (!s) return;
  s.activations++;
  if (event.success) {
    s.successes++;
    if (typeof event.signal === "number" && Number.isFinite(event.signal) && event.signal >= 0) {
      s.signalSum += event.signal;
    }
  }
  s.lastActivatedAt = Date.now();
}

export interface CookbookStatsSnapshot {
  reflect: RecipeStats & { avgIssuesPerSuccess: number };
  multi_draft: RecipeStats & { nonDefaultPersonaPickRate: number };
  agent_loop: RecipeStats & { avgToolCallsPerSuccess: number };
  /** Total activations across all three recipes. */
  totalActivations: number;
  /** Total successful (non-fallback) activations across all three recipes. */
  totalSuccesses: number;
}

/**
 * Read the current counters. Snapshots are cheap; nothing locks.
 * Operators / health endpoints call this; the workflow engine doesn't.
 */
export function getCookbookStats(): CookbookStatsSnapshot {
  const successes = (r: RecipeStats) => Math.max(1, r.successes);
  return {
    reflect: {
      ...stats.reflect,
      avgIssuesPerSuccess: stats.reflect.successes > 0
        ? Number((stats.reflect.signalSum / successes(stats.reflect)).toFixed(2))
        : 0,
    },
    multi_draft: {
      ...stats.multi_draft,
      nonDefaultPersonaPickRate: stats.multi_draft.successes > 0
        ? Number((stats.multi_draft.signalSum / successes(stats.multi_draft)).toFixed(2))
        : 0,
    },
    agent_loop: {
      ...stats.agent_loop,
      avgToolCallsPerSuccess: stats.agent_loop.successes > 0
        ? Number((stats.agent_loop.signalSum / successes(stats.agent_loop)).toFixed(2))
        : 0,
    },
    totalActivations:
      stats.reflect.activations +
      stats.multi_draft.activations +
      stats.agent_loop.activations,
    totalSuccesses:
      stats.reflect.successes +
      stats.multi_draft.successes +
      stats.agent_loop.successes,
  };
}

/**
 * Reset all counters. Tests use this to start each case from zero;
 * production never calls it.
 */
export function resetCookbookStats(): void {
  for (const recipe of Object.keys(stats) as CookbookRecipe[]) {
    stats[recipe] = { activations: 0, successes: 0, signalSum: 0, lastActivatedAt: null };
  }
}
