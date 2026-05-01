/**
 * Tavily adapter — give the bots real web search.
 *
 * Where Firecrawl handles the *deep-scrape* (one URL → markdown), Tavily
 * handles the *discovery* (one query → ranked URLs + a synthesized
 * answer). Together they form the agent's research stack:
 *
 *   web_search  → "what's the current best-seller in the niche, and where?"
 *                 returns ranked URLs + a one-paragraph synthesized answer
 *                 + per-result snippets the agent can reason over directly
 *   scout_url   → "give me the full markdown of *that* product page"
 *                 returns LLM-ready markdown trimmed to the byte budget
 *
 * The agent picks the tools — typically search first, then scrape the
 * top 1-2 hits. We don't pre-bundle the chain; Claude reasons better
 * when it can decide depth based on the query.
 *
 * Auth: API key (`TAVILY_API_KEY`). Get one at https://tavily.com.
 *       Pay-as-you-go plan recommended for production usage.
 *
 * Endpoint: POST https://api.tavily.com/search
 *   body: { api_key, query, search_depth, max_results, include_answer,
 *           include_domains?, exclude_domains?, topic? }
 *   returns: { query, answer, results: [{title, url, content, score, ...}],
 *              response_time }
 *
 * Implements `SearchCapabilities` (declared in `./types.ts`).
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  SearchCapabilities,
  SearchResult,
  SearchOptions,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const TAVILY_API = "https://api.tavily.com";

/** Cap per-result snippet length so a 10-result answer doesn't blow
 *  out the agent's token budget. Tavily's `content` field is already
 *  trimmed to the relevant chunk, but we still bound it defensively. */
const MAX_SNIPPET_CHARS = 1_200;

function trimSnippet(s: string): string {
  if (!s) return "";
  if (s.length <= MAX_SNIPPET_CHARS) return s;
  // Cut at the last sentence boundary above 60% of the cap so we don't
  // truncate mid-thought.
  const sliced = s.slice(0, MAX_SNIPPET_CHARS);
  const lastBoundary = Math.max(
    sliced.lastIndexOf(". "),
    sliced.lastIndexOf("? "),
    sliced.lastIndexOf("! "),
    sliced.lastIndexOf("\n"),
  );
  return lastBoundary > MAX_SNIPPET_CHARS * 0.6
    ? sliced.slice(0, lastBoundary + 1) + " …"
    : sliced + " …";
}

export class TavilyAdapter implements ToolConnectorAdapter, SearchCapabilities {
  readonly tool = "tavily";
  readonly toolName = "Tavily";
  readonly category: ToolCategory = "research";
  readonly bots: ReadonlyArray<BotDomain> = ["architect", "merchant", "social"];
  readonly capabilities = [
    "Search the live web for ranked, citable URLs the bot can reason over",
    "Get a synthesized one-paragraph answer up front (saves tokens vs. scraping every result)",
    "Discover competitor sites, vendor pages, news, and trend signals",
    "Scope competitor research before deep-scraping with Firecrawl",
  ] as const;

  async verifyConnection(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    return this.healthCheck(credentials);
  }

  async healthCheck(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    const start = Date.now();
    if (!credentials.apiKey) {
      return { healthy: false, message: "Missing API key", latencyMs: 0 };
    }
    try {
      const { default: axios } = await import("axios");
      // Tavily has no separate `/usage` or `/balance` endpoint — the
      // canonical health probe is a minimal search. We use the cheapest
      // variant (basic depth, max 1 result, no answer synthesis) so the
      // probe costs a single credit at most.
      const res = await axios.post(
        `${TAVILY_API}/search`,
        {
          api_key: credentials.apiKey,
          query: "health check",
          search_depth: "basic",
          max_results: 1,
          include_answer: false,
          include_raw_content: false,
        },
        {
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
        },
      );
      // Tavily returns 200 with results on success; bad keys 401/403.
      if (!Array.isArray(res.data?.results)) {
        return {
          healthy: false,
          message: "Tavily returned an unexpected response shape",
          latencyMs: Date.now() - start,
        };
      }
      return {
        healthy: true,
        message: "Connected",
        latencyMs: Date.now() - start,
        accountLabel: "Tavily · web search",
      };
    } catch (err: any) {
      return {
        healthy: false,
        message:
          err.response?.data?.detail ||
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  /** Run a web search.
   *
   *  Returns a synthesized answer (when `include_answer` is on, default
   *  true) plus a ranked list of URL+snippet hits the agent can either
   *  reason over directly or hand to Firecrawl's `scrapeUrl` for a
   *  deep-scrape. Errors propagate so the dispatcher can decide
   *  whether to surface "service unavailable" or fail loud. */
  async search(
    credentials: ToolCredentials,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    if (!credentials.apiKey) {
      throw new Error("Tavily API key not configured");
    }
    if (!query || typeof query !== "string" || !query.trim()) {
      throw new Error("Tavily: query must be a non-empty string");
    }
    // Cap query length so an over-eager prompt can't burn a giant
    // request body. Tavily's docs cap at ~400 chars practically; we
    // mirror that so the API doesn't 400 on edge cases.
    if (query.length > 400) {
      throw new Error("Tavily: query must be ≤400 characters");
    }

    const searchDepth = options?.searchDepth === "advanced" ? "advanced" : "basic";
    const maxResults = Math.min(20, Math.max(1, options?.maxResults ?? 5));
    const includeAnswer = options?.includeAnswer !== false; // default true
    const topic = options?.topic === "news" ? "news" : "general";

    const { default: axios } = await import("axios");
    const res = await axios.post(
      `${TAVILY_API}/search`,
      {
        api_key: credentials.apiKey,
        query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: includeAnswer,
        include_raw_content: false,
        topic,
        ...(options?.includeDomains?.length ? { include_domains: options.includeDomains } : {}),
        ...(options?.excludeDomains?.length ? { exclude_domains: options.excludeDomains } : {}),
        ...(options?.daysBack ? { days: options.daysBack } : {}),
      },
      {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        // Advanced search can take 5-10s; basic typically ≤2s. Bump
        // beyond the default 20s so we don't hang up early.
        timeout: 30_000,
      },
    );

    const data = res.data ?? {};
    const rawResults = Array.isArray(data.results) ? data.results : [];
    const results = rawResults.map((r: any) => ({
      title: typeof r?.title === "string" ? r.title : "",
      url: typeof r?.url === "string" ? r.url : "",
      content: trimSnippet(typeof r?.content === "string" ? r.content : ""),
      score: typeof r?.score === "number" ? Number(r.score.toFixed(3)) : null,
      publishedDate: typeof r?.published_date === "string" ? r.published_date : null,
    }));

    return {
      query: typeof data.query === "string" ? data.query : query,
      answer: typeof data.answer === "string" && data.answer.length > 0 ? data.answer : null,
      results,
      responseTimeMs:
        typeof data.response_time === "number"
          ? Math.round(data.response_time * 1000)
          : null,
    };
  }
}
