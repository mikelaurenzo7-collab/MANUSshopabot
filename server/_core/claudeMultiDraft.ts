/**
 * Anthropic Cookbook recipe — multi-draft + judge.
 *
 * The pattern: instead of trusting one draft (or even a draft +
 * critique), generate N drafts in parallel from slightly different
 * "personas," then run a single judge pass that picks the strongest.
 * This is the orchestrator-worker pattern from the cookbook applied
 * to creative + strategy outputs.
 *
 * Why this on top of reflect-and-revise:
 *   • Reflect is sequential (draft → critique → revise). Multi-draft
 *     is parallel (N drafts → judge). For decisions where the right
 *     answer isn't a "fix this" iteration but a "pick the best
 *     direction" (brand naming, ad-hook angle, niche pivot strategy),
 *     parallel sampling beats sequential refinement.
 *   • The personas force divergent thinking. A "conservative analyst"
 *     and an "aggressive growth marketer" will surface different
 *     options — the judge picks the one that best fits the brief.
 *   • The cookbook's classic use-case: generate 3-5 candidate brand
 *     names from different angles (clever/practical/aspirational/
 *     descriptive/coined), then pick the one that scores highest on
 *     pronounceability + memorability + .com-likeness.
 *
 * Cost / latency profile:
 *   • Drafts run concurrently — wall-clock = max(draft_i) + judge,
 *     not Σ. So 4 drafts + judge at ~12s each ≈ 24s vs. 60s sequential.
 *   • Token cost = N × draft_input + judge_input. Shared system
 *     prompt caching keeps draft input cost low; the judge's input
 *     is N draft outputs which is unavoidable.
 *   • Falls back to single-shot when ANTHROPIC_API_KEY is unset.
 *
 * Activation: opt-in per call. Currently used by the brand_identity_kit
 * workflow's name-and-tagline substep, where divergent thinking
 * across 4 angles produces a meaningfully better shortlist than a
 * single "give me 5 names" pass.
 */

import { invokeClaudeDirect, isClaudeDirectAvailable } from "./claudeDirect";
import { invokeLLM } from "./llm";
import type { ResponseFormat } from "./llm";

export interface DraftPersona {
  /** Short label for the persona — surfaced in the audit trail so the
   *  operator can see "the judge picked the conservative draft over
   *  the aggressive one because…". */
  label: string;
  /** Persona-specific framing prepended to the user prompt. The
   *  shared system prompt stays identical across drafts so caching
   *  applies. */
  framing: string;
}

export interface MultiDraftParams {
  /** Long, frozen system prompt — usually the shared platform preamble.
   *  Cached across all draft calls + the judge call. */
  systemPrompt: string;
  /** The base task prompt — what to generate. */
  userPrompt: string;
  /** The personas to draft from. 3-5 is the sweet spot — fewer means
   *  not enough divergence, more means the judge gets overwhelmed. */
  personas: DraftPersona[];
  /** What the judge optimizes for. Specific criteria → consistent
   *  picks. "Pick the best one" → arbitrary picks. */
  judgeCriteria: string;
  /** Optional structured-output schema for the FINAL chosen draft. */
  responseFormat?: ResponseFormat;
  /** Hard cap on output tokens per draft. Default 6000. */
  maxTokensPerDraft?: number;
  /** Cache the shared system prompt across calls. Default true. */
  cacheSystemPrompt?: boolean;
}

export interface MultiDraftResult {
  /** The chosen draft's full text. JSON-parseable when a schema was
   *  set on the original call. */
  text: string;
  json?: unknown;
  /** Which persona's draft the judge picked. */
  chosenPersona: string;
  /** The judge's one-paragraph reasoning. Surfaced in the audit
   *  panel so the operator sees why this draft won. */
  judgeReasoning: string;
  /** All drafts the judge considered. Useful for the "show me the
   *  options" UI affordance — the operator sometimes wants the
   *  rejected draft anyway. */
  allDrafts: Array<{ persona: string; text: string }>;
  /** Whether the multi-draft path actually ran, vs. fell back to
   *  single-shot. False when ANTHROPIC_API_KEY isn't configured. */
  multiDrafted: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  };
}

const JUDGE_SCHEMA = {
  type: "object" as const,
  properties: {
    chosenIndex: { type: "integer" as const, minimum: 0 },
    reasoning: { type: "string" as const },
  },
  required: ["chosenIndex", "reasoning"],
  additionalProperties: false,
};

/**
 * Generate N drafts concurrently, then run a judge pass that picks
 * the best one against the supplied criteria.
 *
 * When the direct Anthropic SDK isn't wired (ANTHROPIC_API_KEY unset),
 * this falls back to a single-shot draft with the FIRST persona's
 * framing and reports `multiDrafted: false`. Callers should treat
 * the result the same either way — the contract holds; the divergent-
 * thinking lift is opportunistic.
 */
export async function multiDraftAndJudge(
  params: MultiDraftParams,
): Promise<MultiDraftResult> {
  if (params.personas.length < 2) {
    throw new Error("multiDraftAndJudge requires at least 2 personas — fewer means no divergent thinking, fall back to single-shot.");
  }

  // ── Fallback: no direct SDK ──────────────────────────────────────
  if (!isClaudeDirectAvailable()) {
    const first = params.personas[0];
    const single = await invokeLLM({
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: `${first.framing}\n\n${params.userPrompt}` },
      ],
      ...(params.responseFormat ? { response_format: params.responseFormat } : {}),
      ...(params.maxTokensPerDraft ? { max_tokens: params.maxTokensPerDraft } : {}),
    });
    const text = String(single.choices?.[0]?.message?.content ?? "");
    let json: unknown;
    if (params.responseFormat?.type === "json_schema") {
      try { json = JSON.parse(text); } catch { /* ignore */ }
    }
    return {
      text,
      ...(json !== undefined ? { json } : {}),
      chosenPersona: first.label,
      judgeReasoning: "Fallback path — direct SDK unavailable, single-draft only.",
      allDrafts: [{ persona: first.label, text }],
      multiDrafted: false,
      usage: {
        inputTokens: single.usage?.prompt_tokens ?? 0,
        outputTokens: single.usage?.completion_tokens ?? 0,
        cacheReadInputTokens: 0,
      },
    };
  }

  const maxTokens = params.maxTokensPerDraft ?? 6000;
  const cacheSystemPrompt = params.cacheSystemPrompt ?? true;

  // ── Draft pass — parallel ─────────────────────────────────────────
  // Caching note: every draft shares the same system prompt, so the
  // first draft writes the cache and the rest read from it. The
  // persona framing lives in the user message so it doesn't pollute
  // the cached prefix.
  const draftPromises = params.personas.map(async (persona) => {
    const result = await invokeClaudeDirect({
      system: params.systemPrompt,
      messages: [
        {
          role: "user",
          content: `${persona.framing}\n\n${params.userPrompt}`,
        },
      ],
      maxTokens,
      cacheSystemPrompt,
      effort: "high",
      adaptiveThinking: true,
      ...(params.responseFormat?.type === "json_schema"
        ? { jsonSchema: { name: params.responseFormat.json_schema.name, schema: params.responseFormat.json_schema.schema } }
        : {}),
    });
    return { persona: persona.label, text: result.text, usage: result.usage };
  });

  const drafts = await Promise.all(draftPromises);

  // ── Judge pass — pick the best draft ──────────────────────────────
  const draftsBlock = drafts
    .map((d, i) => `--- DRAFT ${i} (persona: ${d.persona}) ---\n${d.text}`)
    .join("\n\n");

  const judgeResult = await invokeClaudeDirect({
    system: params.systemPrompt,
    messages: [
      {
        role: "user",
        content:
          `Original task:\n${params.userPrompt}\n\n` +
          `${draftsBlock}\n\n` +
          `--- JUDGE INSTRUCTIONS ---\n` +
          `${params.judgeCriteria}\n\n` +
          `Pick the single best draft (by zero-based index) and explain in one paragraph why it won over the others. Be specific — name the criteria the winner met that the others missed.`,
      },
    ],
    maxTokens: 2000,
    cacheSystemPrompt,
    effort: "high",
    adaptiveThinking: true,
    jsonSchema: { name: "judge_decision", schema: JUDGE_SCHEMA },
  });

  let chosenIndex = 0;
  let reasoning = "Judge response unparseable — defaulting to first draft.";
  if (judgeResult.json && typeof judgeResult.json === "object" && judgeResult.json !== null) {
    const parsed = judgeResult.json as { chosenIndex?: number; reasoning?: string };
    if (typeof parsed.chosenIndex === "number" && parsed.chosenIndex >= 0 && parsed.chosenIndex < drafts.length) {
      chosenIndex = parsed.chosenIndex;
    }
    if (typeof parsed.reasoning === "string") {
      reasoning = parsed.reasoning;
    }
  }

  const chosen = drafts[chosenIndex];
  let chosenJson: unknown;
  if (params.responseFormat?.type === "json_schema") {
    try { chosenJson = JSON.parse(chosen.text); } catch { /* ignore */ }
  }

  const totalInput = drafts.reduce((sum, d) => sum + d.usage.inputTokens, 0) + judgeResult.usage.inputTokens;
  const totalOutput = drafts.reduce((sum, d) => sum + d.usage.outputTokens, 0) + judgeResult.usage.outputTokens;
  const totalCacheRead = drafts.reduce((sum, d) => sum + d.usage.cacheReadInputTokens, 0) + judgeResult.usage.cacheReadInputTokens;

  return {
    text: chosen.text,
    ...(chosenJson !== undefined ? { json: chosenJson } : {}),
    chosenPersona: chosen.persona,
    judgeReasoning: reasoning,
    allDrafts: drafts.map((d) => ({ persona: d.persona, text: d.text })),
    multiDrafted: true,
    usage: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadInputTokens: totalCacheRead,
    },
  };
}

/** Whether the multi-draft path will actually run. Same gate as
 *  claudeDirect — when false, callers fall back to a single draft. */
export function isMultiDraftAvailable(): boolean {
  return isClaudeDirectAvailable();
}

/**
 * Pre-built persona set tuned for brand naming + tagline generation.
 * Each persona forces a different angle so the judge gets a real
 * choice, not five variations on the same theme.
 */
export const BRAND_NAMING_PERSONAS: DraftPersona[] = [
  {
    label: "clever_coiner",
    framing: "Approach this as a brand-naming wordsmith who coins original, distinctive names — invented words, smart portmanteaus, repurposed nouns. Avoid generic suffixes (Co, Studio, Lab) and the .com-fill-in-the-blank trap.",
  },
  {
    label: "practical_descriptor",
    framing: "Approach this as a pragmatic merchant who picks names that say exactly what the brand does. Plain English, easy to spell, immediately memorable. SEO-friendly. The kind of name that wins on search even before brand recognition.",
  },
  {
    label: "aspirational_mood",
    framing: "Approach this as a brand strategist who picks names that evoke a feeling — what the customer wants to BE when they buy this product. Names that work as a tattoo. Short, evocative, mood-led.",
  },
  {
    label: "category_disruptor",
    framing: "Approach this as a category-defining founder who picks names that explicitly reject the niche's defaults. If everyone else is soft + earthy, go bold + tech. If everyone is bold + tech, go quiet + heritage. The name signals a different point of view.",
  },
];
