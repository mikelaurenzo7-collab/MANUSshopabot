/**
 * Anthropic Cookbook recipe — reflect-and-revise.
 *
 * The pattern: instead of trusting the first draft of a high-stakes
 * output, you ask the model to critique its own draft against an
 * explicit rubric, then revise. Two extra inference passes for one
 * tighter, more accurate, more on-brand result.
 *
 * Why we layer this in:
 *   • Niche research — first drafts overstate viability + skip risk
 *     mitigations. A critique pass focused on "where would this break?"
 *     drags the score back to honest.
 *   • Brand identity kits — first drafts default to safe-but-bland
 *     palettes/voice. A critique pass focused on "is this distinctive?"
 *     gets the merchant a kit that actually stands out.
 *   • Ad campaigns — first drafts hit every checkbox but bury the hook.
 *     A critique pass focused on "what's the actual hook in line 1?"
 *     surfaces a stronger lead.
 *   • Pricing decisions — first drafts price by margin, ignore
 *     channel-specific fee structures. A critique pass focused on
 *     "did you net this against marketplace commission?" catches the
 *     ~15% Amazon haircut every time.
 *
 * Cost / latency profile:
 *   • +2 inference passes (critique + revise). Cached system prompt
 *     keeps the input cost low; Anthropic's prompt caching applies on
 *     all three passes when `cacheSystemPrompt: true`.
 *   • Wall-clock: roughly 2.5× the single-pass time on average. Use
 *     selectively on outputs the merchant will see, not on every
 *     intermediate step.
 *   • When ANTHROPIC_API_KEY is unset, this module degrades to a
 *     single pass through the Forge proxy — no critique, no revise.
 *     The caller's contract still holds (returns the same shape), it
 *     just skips the quality lift silently.
 *
 * Activation: opt-in per llm_call step via `reflectAndRevise: true`.
 * Step authors choose the rubric via `reflectionFocus`. Defaults to
 * the platform's generic "merchant-facing quality bar" rubric.
 */

import { invokeClaudeDirect, isClaudeDirectAvailable } from "./claudeDirect";
import { invokeLLM } from "./llm";
import type { ResponseFormat } from "./llm";

/** Built-in critique rubrics tuned to each bot's responsibilities. */
export type ReflectionFocus =
  | "niche_research"      // skepticism + risk surfacing
  | "brand_identity"      // distinctiveness + voice consistency
  | "ad_creative"         // hook strength + audience fit
  | "pricing_decision"    // fee-structure + margin honesty
  | "content_calendar"    // cadence + platform-fit + voice
  | "merchant_quality"    // generic merchant-facing quality bar
  ;

const RUBRICS: Record<ReflectionFocus, string> = {
  niche_research: `Critique this niche research draft. Specifically:
1. Where did the analysis overstate viability? Flag any score above 70 that lacks specific evidence.
2. What risks are missing? Force-list at least 2 risks not in the draft.
3. Is the platform recommendation actually grounded in fee structure + audience fit, or is it a generic "Shopify is good" answer?
4. Does the Marketing Moat section name a SPECIFIC walled-garden competitor, or does it hand-wave?
5. Are the trending products real categories with real demand signals, or generic fluff (e.g., "eco-friendly water bottles")?
Return a JSON critique with a list of {issue, severity, fix} objects. Severity is one of: blocker, major, minor.`,

  brand_identity: `Critique this brand identity kit. Specifically:
1. Is the name actually distinctive, or a generic "X.co"-style fill-in? Reject any name that could front 5 different niches.
2. Does the voice description differentiate from "friendly + professional + trustworthy"? Reject if it could describe any DTC brand.
3. Is the palette grounded in the niche's emotional terrain, or arbitrary? Reject color choices the doc can't justify.
4. Is the tagline a real hook — does it promise a specific outcome — or marketing word salad?
5. Does the kit consider the target platform's surface (Etsy hand-craft tone vs. Amazon scan-and-buy)?
Return a JSON critique with {issue, severity, fix} objects. Severity is one of: blocker, major, minor.`,

  ad_creative: `Critique this ad campaign draft. Specifically:
1. Does line 1 of each ad copy variant carry a real hook (specific outcome, named pain, surprising claim)? Reject generic openers.
2. Does the audience targeting match the niche's actual buyer (not just the seller's hopeful demographic)?
3. Is the budget allocation justified by platform fit, or evenly split out of laziness?
4. Are the creative directions actually shootable, or vague art-direction fluff?
5. Does each ad have a clear CTA, or trail off into "Learn more"?
Return a JSON critique with {issue, severity, fix} objects. Severity is one of: blocker, major, minor.`,

  pricing_decision: `Critique this pricing draft. Specifically:
1. Did the recommendation net price against marketplace commission (Amazon ~15%, Etsy ~6.5%, eBay ~12.9%)? Reject any margin claim that ignores fees.
2. Does the price ladder respect platform constraints (Walmart no compare-at, Amazon Buy Box dynamics)?
3. Is the recommendation actually different from competitor pricing, or just a copy-paste with $0.01 shaved off?
4. Does the strategy account for return rate / chargeback risk on the channel?
5. Are price moves >25% flagged [REQUIRES_APPROVAL] per platform policy?
Return a JSON critique with {issue, severity, fix} objects. Severity is one of: blocker, major, minor.`,

  content_calendar: `Critique this content calendar draft. Specifically:
1. Does each platform's cadence match its capability matrix (TikTok 1-3/day, LinkedIn 3-5/wk, Pinterest 10-25 pins/wk)? Reject lazy "daily on every platform".
2. Is the voice actually adapted per surface, or copy-pasted? Reject identical captions across surfaces.
3. Does each post have a specific job (educate / sell / build authority / drive traffic), or is it filler?
4. Are CTAs platform-appropriate (link-in-bio for IG, native shopping for TikTok Shop)?
5. Does the calendar respect the platform constraint table (caption length, video length, aspect ratios)?
Return a JSON critique with {issue, severity, fix} objects. Severity is one of: blocker, major, minor.`,

  merchant_quality: `Critique this draft against the merchant-facing quality bar:
1. Is every claim specific (named competitor, real number, concrete tactic)?
2. Are recommendations actionable today, or aspirational ("eventually consider...")? Reject the latter.
3. Does the draft skip preamble and lead with the most useful sentence first?
4. Is the output mobile-readable (≤3-sentence paragraphs, no walls of text)?
5. Does any structured field violate output conventions (currency in cents, ISO dates, hex colors with #)?
Return a JSON critique with {issue, severity, fix} objects. Severity is one of: blocker, major, minor.`,
};

export interface ReflectAndReviseParams {
  /** Long, frozen system prompt — usually the shared platform preamble
   *  plus the workflow-specific instructions. Cached when caching is
   *  available so all 3 passes (draft, critique, revise) read from
   *  the same prefix. */
  systemPrompt: string;
  /** The draft prompt — the "do the thing" message. */
  userPrompt: string;
  /** Pick one of the built-in rubrics. The rubric framing determines
   *  what the critique pass looks for. */
  reflectionFocus: ReflectionFocus;
  /** Optional structured-output schema for the FINAL revised output.
   *  The critique pass always returns a JSON list of issues regardless. */
  responseFormat?: ResponseFormat;
  /** Hard cap on output tokens for the revise step. Default 8000. */
  maxTokens?: number;
  /** Whether to cache the system prompt across passes. Pays off
   *  almost always — the system prompt is identical across all three
   *  passes by construction. */
  cacheSystemPrompt?: boolean;
  /** Effort for the draft + revise passes. Critique always runs at
   *  "high" — we want a sharp critic. Default "high". */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export interface CritiqueIssue {
  issue: string;
  severity: "blocker" | "major" | "minor";
  fix: string;
}

export interface ReflectAndReviseResult {
  /** The final revised draft text — JSON-parseable when a schema was
   *  set on the original call. */
  text: string;
  /** Same string, parsed, when the call passed a json_schema. */
  json?: unknown;
  /** The critique pass's structured findings. Useful for audit logs
   *  and the operator-facing "what improved" panel. */
  critique: CritiqueIssue[];
  /** Whether the reflect path actually ran, vs. fell back to single-shot.
   *  False when ANTHROPIC_API_KEY isn't configured. */
  reflectedAndRevised: boolean;
  /** Token usage rolled up across all three passes. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  };
}

const CRITIQUE_SCHEMA = {
  type: "object" as const,
  properties: {
    issues: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          issue: { type: "string" as const },
          severity: { type: "string" as const, enum: ["blocker", "major", "minor"] },
          fix: { type: "string" as const },
        },
        required: ["issue", "severity", "fix"],
        additionalProperties: false,
      },
    },
  },
  required: ["issues"],
  additionalProperties: false,
};

/**
 * Three-pass refinement: draft → critique → revise.
 *
 * When the direct Anthropic SDK isn't wired (ANTHROPIC_API_KEY unset),
 * this falls back to a single Forge pass and reports
 * `reflectedAndRevised: false`. Callers should treat the result the
 * same either way — the contract holds; the quality lift is opportunistic.
 */
export async function reflectAndRevise(
  params: ReflectAndReviseParams,
): Promise<ReflectAndReviseResult> {
  // Fallback path — no direct SDK, no critique loop.
  if (!isClaudeDirectAvailable()) {
    const single = await invokeLLM({
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      ...(params.responseFormat ? { response_format: params.responseFormat } : {}),
      ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
    });
    const text = String(single.choices?.[0]?.message?.content ?? "");
    let json: unknown;
    if (params.responseFormat?.type === "json_schema") {
      try { json = JSON.parse(text); } catch { /* ignore */ }
    }
    return {
      text,
      ...(json !== undefined ? { json } : {}),
      critique: [],
      reflectedAndRevised: false,
      usage: {
        inputTokens: single.usage?.prompt_tokens ?? 0,
        outputTokens: single.usage?.completion_tokens ?? 0,
        cacheReadInputTokens: 0,
      },
    };
  }

  const maxTokens = params.maxTokens ?? 8000;
  const effort = params.effort ?? "high";
  const cacheSystemPrompt = params.cacheSystemPrompt ?? true;

  // ── Pass 1: draft ────────────────────────────────────────────────
  const draft = await invokeClaudeDirect({
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.userPrompt }],
    maxTokens,
    cacheSystemPrompt,
    effort,
    adaptiveThinking: true,
    ...(params.responseFormat?.type === "json_schema"
      ? { jsonSchema: { name: params.responseFormat.json_schema.name, schema: params.responseFormat.json_schema.schema } }
      : {}),
  });

  // ── Pass 2: critique against the rubric ──────────────────────────
  // The critic ALWAYS returns the {issues: []} schema. The rubric
  // framing decides what kinds of issues it looks for.
  const critiqueResult = await invokeClaudeDirect({
    system: params.systemPrompt,
    messages: [
      {
        role: "user",
        content: `Original task:\n${params.userPrompt}\n\n--- DRAFT ---\n${draft.text}\n\n--- CRITIQUE INSTRUCTIONS ---\n${RUBRICS[params.reflectionFocus]}`,
      },
    ],
    maxTokens: 4000,
    cacheSystemPrompt,
    effort: "high",
    adaptiveThinking: true,
    jsonSchema: { name: "critique", schema: CRITIQUE_SCHEMA },
  });

  let critique: CritiqueIssue[] = [];
  if (critiqueResult.json && typeof critiqueResult.json === "object" && critiqueResult.json !== null) {
    const parsed = critiqueResult.json as { issues?: CritiqueIssue[] };
    if (Array.isArray(parsed.issues)) critique = parsed.issues;
  }

  // If the critic finds nothing actionable, skip the revise pass.
  // The draft already cleared the rubric.
  const actionable = critique.filter((c) => c.severity === "blocker" || c.severity === "major");
  if (actionable.length === 0) {
    return {
      text: draft.text,
      ...(draft.json !== undefined ? { json: draft.json } : {}),
      critique,
      reflectedAndRevised: true,
      usage: {
        inputTokens: draft.usage.inputTokens + critiqueResult.usage.inputTokens,
        outputTokens: draft.usage.outputTokens + critiqueResult.usage.outputTokens,
        cacheReadInputTokens:
          draft.usage.cacheReadInputTokens + critiqueResult.usage.cacheReadInputTokens,
      },
    };
  }

  // ── Pass 3: revise with critique in hand ─────────────────────────
  const issuesBlock = critique
    .map((c) => `- [${c.severity.toUpperCase()}] ${c.issue}\n  Fix: ${c.fix}`)
    .join("\n");

  const revised = await invokeClaudeDirect({
    system: params.systemPrompt,
    messages: [
      {
        role: "user",
        content: `Original task:\n${params.userPrompt}\n\n--- PREVIOUS DRAFT ---\n${draft.text}\n\n--- CRITIQUE TO ADDRESS ---\n${issuesBlock}\n\nReproduce the original task's required output format, but address every blocker and major issue from the critique. Return only the revised output — no preamble, no critique narration.`,
      },
    ],
    maxTokens,
    cacheSystemPrompt,
    effort,
    adaptiveThinking: true,
    ...(params.responseFormat?.type === "json_schema"
      ? { jsonSchema: { name: params.responseFormat.json_schema.name, schema: params.responseFormat.json_schema.schema } }
      : {}),
  });

  return {
    text: revised.text,
    ...(revised.json !== undefined ? { json: revised.json } : {}),
    critique,
    reflectedAndRevised: true,
    usage: {
      inputTokens:
        draft.usage.inputTokens +
        critiqueResult.usage.inputTokens +
        revised.usage.inputTokens,
      outputTokens:
        draft.usage.outputTokens +
        critiqueResult.usage.outputTokens +
        revised.usage.outputTokens,
      cacheReadInputTokens:
        draft.usage.cacheReadInputTokens +
        critiqueResult.usage.cacheReadInputTokens +
        revised.usage.cacheReadInputTokens,
    },
  };
}

/** Whether the reflect-and-revise path will actually run. Same gate
 *  as claudeDirect — when false, callers still get a single-shot
 *  result; they just don't get the quality lift. */
export function isReflectAndReviseAvailable(): boolean {
  return isClaudeDirectAvailable();
}
