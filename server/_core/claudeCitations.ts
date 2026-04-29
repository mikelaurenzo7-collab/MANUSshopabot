/**
 * Anthropic Cookbook recipe — citations-backed research.
 *
 * The pattern: when the model writes about something it could be
 * wrong about (market sizing, competitor claims, trend stats), force
 * it to ground each claim in a named source. The Anthropic Citations
 * API lets you pass in document blocks with `citations: { enabled: true }`
 * and the model emits a content array where each text block carries
 * a citations array linking back to the source span.
 *
 * Why we layer this in:
 *   • Niche research — viability scores depend on demand stats, TAM
 *     estimates, growth rates. Operators (correctly) distrust uncited
 *     numbers. Citations turn "the market is growing 12% YoY" into
 *     "the market is growing 12% YoY [Statista 2025-Q1]" with a
 *     clickable source panel.
 *   • Trend reports (Social Bot) — same problem, different surface.
 *     Operators want to know which TikTok creators / Reddit threads
 *     the trend signal came from before they pour budget at it.
 *   • Competitor analysis — claims like "competitor X dropped pricing
 *     20% last week" must be cited to the scrape source, the date,
 *     and the URL. Otherwise we're inventing confidence.
 *
 * Provenance tier:
 *   When the caller has real document text (a scrape, a Files-API
 *   upload, a competitor PDP HTML), pass it as a documents[] block
 *   and the model cites back to the exact span. When the caller only
 *   has URLs (the common case for niche research), the model still
 *   emits inline pseudo-citations like [#N] and the helper synthesizes
 *   a sources panel — that's lower-fidelity but still better than
 *   nothing, and it gives the operator a list of URLs to verify
 *   manually.
 *
 * Activation: opt-in per workflow step via `useCitations: true`. When
 * ANTHROPIC_API_KEY is unset, the helper falls back to a regular call
 * that asks the model to add a "Sources:" section. Lower fidelity,
 * but contract holds.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";
import { invokeLLM } from "./llm";
import { isClaudeDirectAvailable } from "./claudeDirect";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  if (!ENV.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — citations path requires the direct SDK.",
    );
  }
  _client = new Anthropic({ apiKey: ENV.anthropicApiKey });
  return _client;
}

export interface CitationSource {
  /** Stable ID — usually a URL or a file_id. Round-tripped to the UI
   *  so the operator can click through. */
  id: string;
  /** Human-readable title for the sources panel. */
  title: string;
  /** Either inline document text (citations land on spans of this) or
   *  a URL the caller has already fetched separately. When both are
   *  present, `text` is what gets cited; `url` is the click-through. */
  text?: string;
  /** Click-through URL surfaced in the operator UI. */
  url?: string;
}

export interface CitedClaim {
  /** A sentence or short paragraph. */
  text: string;
  /** Indices into the sources[] array — the documents this claim cites. */
  sourceIndices: number[];
}

export interface CitationsResearchParams {
  /** Long, frozen system prompt — usually the shared platform preamble.
   *  Cached for cross-step reuse when supported. */
  systemPrompt: string;
  /** The research prompt — what to investigate. */
  userPrompt: string;
  /** Documents to ground the answer in. The model can only cite
   *  documents passed here; it won't fabricate sources beyond this list. */
  sources: CitationSource[];
  /** Hard cap on output tokens. Default 8000. */
  maxTokens?: number;
  /** Cache the system prompt across calls. Default true. */
  cacheSystemPrompt?: boolean;
}

export interface CitationsResearchResult {
  /** The full prose answer with inline [#N]-style citation markers
   *  the UI renders as clickable footnotes. */
  text: string;
  /** Structured per-claim breakdown — useful when the UI wants to
   *  render claim cards with attached sources. Empty when the API
   *  didn't emit citation blocks (uncited fallback path). */
  citedClaims: CitedClaim[];
  /** The sources array passed in, unchanged — included so callers can
   *  surface the panel without holding onto the input separately. */
  sources: CitationSource[];
  /** Whether the API's native citations path actually ran. False on
   *  the Forge fallback. */
  citationsEnabled: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  };
}

/**
 * Run a research prompt against a fixed set of sources, with the
 * model citing claims back to those sources.
 *
 * The output combines:
 *   1. `text` — prose with inline [#N] markers, suitable for direct
 *      rendering in the operator's report view.
 *   2. `citedClaims` — structured breakdown for callers that want a
 *      richer UI (claim cards, per-source confidence, etc.).
 *   3. `sources` — round-tripped for the panel.
 */
export async function citedResearch(
  params: CitationsResearchParams,
): Promise<CitationsResearchResult> {
  // ── Fallback: no direct SDK ──────────────────────────────────────
  // Ask the Forge proxy to produce inline [#N] markers + a Sources
  // section. Lower fidelity (no span-level grounding) but the prose
  // contract still holds.
  if (!isClaudeDirectAvailable()) {
    const sourcesPreamble = params.sources
      .map((s, i) => `[${i + 1}] ${s.title}${s.url ? ` — ${s.url}` : ""}${s.text ? `\n${s.text.slice(0, 1500)}` : ""}`)
      .join("\n\n");
    const augmented =
      `${params.userPrompt}\n\n---\nGround every claim in one of these sources. ` +
      `After each claim, append a marker like [#1] referencing the source index. ` +
      `Do not fabricate sources beyond the list below.\n\n` +
      `SOURCES:\n${sourcesPreamble}`;

    const fallback = await invokeLLM({
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: augmented },
      ],
      ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
    });
    const text = String(fallback.choices?.[0]?.message?.content ?? "");
    return {
      text,
      citedClaims: [],
      sources: params.sources,
      citationsEnabled: false,
      usage: {
        inputTokens: fallback.usage?.prompt_tokens ?? 0,
        outputTokens: fallback.usage?.completion_tokens ?? 0,
        cacheReadInputTokens: 0,
      },
    };
  }

  // ── Native citations path ────────────────────────────────────────
  const client = getClient();
  const maxTokens = params.maxTokens ?? 8000;

  // Build document blocks. Sources with inline `text` get cited at
  // span level; sources with only a `url` get a single span containing
  // the title (so the model can still cite back to "the URL itself"
  // by index even when we don't have the body text).
  const documentBlocks = params.sources.map((s, i) => ({
    type: "document" as const,
    source: {
      type: "text" as const,
      media_type: "text/plain" as const,
      data: s.text && s.text.length > 0 ? s.text : `${s.title}${s.url ? `\n${s.url}` : ""}`,
    },
    title: s.title,
    citations: { enabled: true },
    // Anthropic's citations API returns indices that match the order
    // documents were provided; we record this mapping for the UI.
    context: `Source index: ${i + 1}`,
  }));

  const systemField = params.cacheSystemPrompt !== false
    ? [{
        type: "text" as const,
        text: params.systemPrompt,
        cache_control: { type: "ephemeral" as const },
      }]
    : params.systemPrompt;

  const message = await client.messages.create({
    model: ENV.anthropicModel,
    max_tokens: maxTokens,
    system: systemField,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    messages: [
      {
        role: "user",
        content: [
          ...documentBlocks,
          { type: "text", text: params.userPrompt },
        ],
      },
    ],
  });

  // Walk the content blocks. Each text block may have a `citations`
  // array linking to the source documents.
  let combinedText = "";
  const citedClaims: CitedClaim[] = [];
  for (const block of message.content) {
    if (block.type !== "text") continue;
    const blockText = block.text;
    const cites = (block as any).citations as Array<{ document_index?: number }> | undefined;
    if (cites && cites.length > 0) {
      const indices = cites
        .map((c) => (typeof c.document_index === "number" ? c.document_index : -1))
        .filter((i) => i >= 0);
      // Append inline markers to the prose for the UI's footnote rendering.
      const markers = indices.map((i) => `[#${i + 1}]`).join("");
      combinedText += `${blockText}${markers}`;
      citedClaims.push({ text: blockText, sourceIndices: indices });
    } else {
      combinedText += blockText;
    }
  }

  return {
    text: combinedText,
    citedClaims,
    sources: params.sources,
    citationsEnabled: true,
    usage: {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    },
  };
}

/** Whether the native citations path is wired. */
export function isCitationsAvailable(): boolean {
  return isClaudeDirectAvailable();
}
