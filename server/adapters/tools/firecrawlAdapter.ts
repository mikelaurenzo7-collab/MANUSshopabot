/**
 * Firecrawl adapter — give the bots real web data.
 *
 * Until this adapter the Builder Bot's competitor research workflow
 * ran on synthetic dispatcher output (`agentToolsets.ts` returned
 * deterministic fake "BrandA / BrandB / BrandC" candidates). Firecrawl
 * lets the bot actually FETCH a competitor URL — the merchant's own
 * site, a vendor reference, a Shopify storefront — and reason over
 * real markdown content.
 *
 * Auth: API key (`FIRECRAWL_API_KEY`). Get one at https://firecrawl.dev.
 *
 * The adapter is keyed in two layers:
 *   - As a tool connector in the registry (`getToolAdapter("firecrawl")`),
 *     so it shows up alongside Klaviyo/ShipStation/etc. on the
 *     Integrations page when we surface it there.
 *   - As the dispatcher for the new `scout_url` tool inside
 *     `architect.competitor_stalker_v0` (wired in a separate file so
 *     the agent loop gracefully falls back to the synthetic dispatcher
 *     when no API key is present).
 *
 * Implements `ScrapeCapabilities` (declared in `./types.ts`).
 *
 * Endpoint: POST https://api.firecrawl.dev/v1/scrape
 *   body: { url, formats?: ["markdown" | "html" | ...], onlyMainContent? }
 *   returns: { success, data: { markdown, metadata: { title, description, ... } } }
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  ScrapeCapabilities,
  ScrapeResult,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const FIRECRAWL_API = "https://api.firecrawl.dev/v1";

/** Max response length we hand back to the agent loop. Firecrawl
 *  itself will gladly return 200 KB of markdown for a content-rich
 *  page, but the agent doesn't need that much — Claude reasons better
 *  on a tight excerpt and we burn fewer input tokens. The truncation
 *  is byte-aware, not character-aware, so multibyte UTF-8 doesn't
 *  break mid-codepoint. */
const MAX_MARKDOWN_BYTES = 24_000;

function truncateMarkdown(md: string): { value: string; truncated: boolean } {
  const buf = Buffer.from(md, "utf8");
  if (buf.byteLength <= MAX_MARKDOWN_BYTES) return { value: md, truncated: false };
  const sliced = buf.subarray(0, MAX_MARKDOWN_BYTES).toString("utf8");
  // Cut at the last newline so we don't break mid-list-item / mid-link.
  const lastNl = sliced.lastIndexOf("\n");
  const finalText = lastNl > MAX_MARKDOWN_BYTES * 0.6 ? sliced.slice(0, lastNl) : sliced;
  return { value: finalText + "\n\n…[truncated]…", truncated: true };
}

export class FirecrawlAdapter implements ToolConnectorAdapter, ScrapeCapabilities {
  readonly tool = "firecrawl";
  readonly toolName = "Firecrawl";
  readonly category: ToolCategory = "research";
  readonly bots: ReadonlyArray<BotDomain> = ["architect", "merchant", "social"];
  readonly capabilities = [
    "Scrape any URL into LLM-ready markdown the bot can reason over",
    "Ground competitor research in real product/pricing pages",
    "Pull merchant-supplied vendor pages for sourcing decisions",
    "Cite the source URL on every claim the bot makes",
  ] as const;

  private headers(credentials: ToolCredentials): Record<string, string> {
    return {
      Authorization: `Bearer ${credentials.apiKey || ""}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

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
      // Firecrawl exposes a `/team/credit-usage` endpoint that's the
      // canonical health probe — it returns the credit balance and
      // proves the key is valid without consuming credits.
      const res = await axios.get(`${FIRECRAWL_API}/team/credit-usage`, {
        headers: this.headers(credentials),
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      });
      const remaining = res.data?.data?.remaining_credits;
      const planCredits = res.data?.data?.plan_credits;
      const accountLabel =
        typeof remaining === "number"
          ? `Firecrawl · ${remaining}${typeof planCredits === "number" ? `/${planCredits}` : ""} credits`
          : "Firecrawl";
      return {
        healthy: true,
        message: "Connected",
        latencyMs: Date.now() - start,
        accountLabel,
      };
    } catch (err: any) {
      return {
        healthy: false,
        message:
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  /** Scrape a single URL into LLM-ready markdown.
   *
   *  Returns trimmed markdown + a small metadata bag (title, description,
   *  source URL). Errors propagate so the caller can decide whether to
   *  fall back to the synthetic dispatcher or surface the failure to
   *  the agent. */
  async scrapeUrl(
    credentials: ToolCredentials,
    url: string,
    options?: { onlyMainContent?: boolean; formats?: Array<"markdown" | "html"> },
  ): Promise<ScrapeResult> {
    if (!credentials.apiKey) {
      throw new Error("Firecrawl API key not configured");
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`Firecrawl: invalid URL (must include scheme): ${url}`);
    }
    const { default: axios } = await import("axios");
    const res = await axios.post(
      `${FIRECRAWL_API}/scrape`,
      {
        url,
        formats: options?.formats ?? ["markdown"],
        onlyMainContent: options?.onlyMainContent ?? true,
      },
      {
        headers: this.headers(credentials),
        // Firecrawl can take 5-15s for slow / JS-heavy pages — bump
        // above the default tool timeout so we don't hang up early.
        timeout: 30_000,
      },
    );
    if (res.data?.success !== true) {
      throw new Error(
        `Firecrawl scrape failed: ${res.data?.error || res.data?.message || "unknown error"}`,
      );
    }
    const data = res.data.data ?? {};
    const md = String(data.markdown ?? "");
    const { value: markdown, truncated } = truncateMarkdown(md);
    return {
      url,
      markdown,
      truncated,
      title: data.metadata?.title ?? null,
      description: data.metadata?.description ?? null,
      statusCode: data.metadata?.statusCode ?? null,
      sourceUrl: data.metadata?.sourceURL ?? data.metadata?.url ?? url,
    };
  }
}
