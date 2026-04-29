/**
 * Anthropic Cookbook recipe — generic autonomous tool-use loop.
 *
 * The pattern: hand Claude a tool set + a task, then let it call
 * tools in a loop until it has enough information to answer. The
 * helper dispatches each tool_use block through a caller-supplied
 * handler, feeds the result back, and keeps looping until the model
 * stops calling tools (or the iteration cap fires).
 *
 * This is the canonical agentic recipe — every cookbook recipe that
 * ends with "and then the model decides what to do next" boils down
 * to this loop. We already have one specialization (engine/memoryAgent.ts)
 * scoped to the four memory tools. This module is the generalization
 * — any workflow can hand it a tool set and get an autonomous sub-agent
 * for free.
 *
 * Why this on top of the engine's standard llm_call:
 *   • llm_call is single-round-trip: prompt → response. No tools.
 *   • multiDraft + reflect are still single-call patterns under the
 *     hood — the model never gets to ask for more information.
 *   • The agent loop is the recipe for autonomous research:
 *     - Builder Bot's competitor stalker calls fetch_competitor_pdp,
 *       extract_pricing, summarize → loops until it has enough.
 *     - Merchant Bot's autonomous repricer calls get_current_price,
 *       check_competitor_price, get_inventory_level, set_price →
 *       loops until the SKU is repriced.
 *     - Social Bot's autonomous trend hunter calls fetch_tiktok_top,
 *       fetch_reddit_rising, score_relevance → loops until it has
 *       a ranked shortlist.
 *
 * Activation: opt-in. Callers pass `tools` (Anthropic tool defs) +
 * `dispatch` (a handler that maps `(toolName, input) → result`). When
 * ANTHROPIC_API_KEY is unset, the helper throws — there's no
 * meaningful single-call fallback for an autonomous agent (the whole
 * point is the loop). Workflow authors should check
 * `isAgentLoopAvailable()` first and route to a static workflow when
 * the key is missing.
 *
 * Iteration cap defaults to 8 — generous enough for a multi-tool
 * research path with one or two retries, tight enough that a runaway
 * loop blows up loudly instead of silently burning $40 of inference.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";
import { isClaudeDirectAvailable } from "./claudeDirect";

const DEFAULT_MAX_ITERATIONS = 8;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  if (!ENV.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — runAgentLoop requires the direct-Anthropic path. There is no meaningful single-call fallback for an autonomous agent.",
    );
  }
  _client = new Anthropic({ apiKey: ENV.anthropicApiKey });
  return _client;
}

/**
 * A tool the agent can call. Same shape Anthropic's API expects, but
 * with the addition of a `category` label so the audit trail can
 * group tool calls by purpose ("research" / "action" / "lookup").
 */
export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Optional grouping label for the audit trail. Free-form. */
  category?: string;
}

/**
 * Dispatcher signature. Receives the tool name + parsed input from
 * the model; returns whatever JSON-serializable payload the tool
 * produces. Errors thrown here are caught and returned to the model
 * as `{ ok: false, error: <message> }` so the loop can recover.
 */
export type AgentToolDispatcher = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<unknown>;

export interface AgentLoopParams {
  /** System prompt — usually the shared platform preamble + workflow-
   *  specific instructions. Cached when caching is on so all
   *  iterations of the loop read from the same prefix. */
  systemPrompt: string;
  /** Initial user task. The agent's "mission". */
  userPrompt: string;
  /** Tool definitions. Anthropic enforces input_schema on every tool
   *  call so type errors surface to the model, not the caller. */
  tools: AgentTool[];
  /** Tool dispatcher — turns a tool_use block into a JSON result. */
  dispatch: AgentToolDispatcher;
  /** Hard cap on iterations. Default 8. */
  maxIterations?: number;
  /** Per-iteration max tokens. Default 4000. */
  maxTokens?: number;
  /** Effort hint for Opus 4.7. Default "high". */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Cache the system prompt across loop iterations. Default true —
   *  multi-iteration loops are exactly the case caching pays for. */
  cacheSystemPrompt?: boolean;
}

export interface AgentToolCallAudit {
  iteration: number;
  toolName: string;
  category?: string;
  input: Record<string, unknown>;
  /** Truncated to 600 chars for storage in the workflow step output. */
  resultSnippet: string;
  isError: boolean;
}

export interface AgentLoopResult {
  /** Final assistant text after the loop converges. */
  text: string;
  /** How many model round-trips the loop made. */
  iterations: number;
  /** Total tool calls executed across the run. */
  toolCallCount: number;
  /** Whether the loop hit the iteration cap (vs. converging). */
  hitIterationCap: boolean;
  /** Last stop_reason from the model — useful for branching on
   *  "end_turn" vs "max_tokens" vs "tool_use". */
  stopReason: string | null;
  /** Per-tool-call audit trail. The workflow engine surfaces this on
   *  the step output so operators can see what the agent actually did
   *  ("scraped 3 competitor pages, looked up our SKU, decided to
   *  hold pricing"). */
  toolCalls: AgentToolCallAudit[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  };
}

/**
 * Whether the agent loop can actually run. False when
 * ANTHROPIC_API_KEY is unset — callers must route to a static fallback.
 */
export function isAgentLoopAvailable(): boolean {
  return isClaudeDirectAvailable();
}

/**
 * Run an autonomous tool-use loop. Generalizes the engine/memoryAgent
 * pattern to arbitrary tool sets + dispatchers.
 *
 * Failures inside `dispatch` are caught and returned to the model as
 * tool_result with `is_error: true`, so the model can retry with
 * corrected input rather than crashing the whole step.
 */
export async function runAgentLoop(
  params: AgentLoopParams,
): Promise<AgentLoopResult> {
  const client = getClient();
  const cap = params.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const maxTokens = params.maxTokens ?? 4000;
  const effort = params.effort ?? "high";
  const cacheSystemPrompt = params.cacheSystemPrompt ?? true;

  // Build the system field. Caching attaches `cache_control: ephemeral`
  // to a content-block array; without caching, send the bare string.
  const systemField = cacheSystemPrompt
    ? [{
        type: "text" as const,
        text: params.systemPrompt,
        cache_control: { type: "ephemeral" as const },
      }]
    : params.systemPrompt;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: params.userPrompt },
  ];

  // Build a quick lookup so the audit trail can attach the tool's
  // category label without re-walking the tool list each iteration.
  const toolCategoryByName = new Map<string, string | undefined>(
    params.tools.map((t) => [t.name, t.category]),
  );

  const auditTrail: AgentToolCallAudit[] = [];
  let toolCallCount = 0;
  let iterations = 0;
  let stopReason: string | null = null;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;

  while (iterations < cap) {
    iterations++;

    const response = await client.messages.create({
      model: ENV.anthropicModel,
      max_tokens: maxTokens,
      system: systemField,
      messages,
      tools: params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })) as Anthropic.Tool[],
      output_config: { effort },
    });

    stopReason = response.stop_reason ?? null;
    totalInput += response.usage.input_tokens ?? 0;
    totalOutput += response.usage.output_tokens ?? 0;
    totalCacheRead += response.usage.cache_read_input_tokens ?? 0;

    // Append the assistant's full content (text + tool_use blocks)
    // back into messages — the SDK requires this so the next turn
    // sees the same history the model just produced.
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // Loop-exit: model emitted only text or signaled end_turn.
    if (toolUses.length === 0 || response.stop_reason === "end_turn") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        text,
        iterations,
        toolCallCount,
        hitIterationCap: false,
        stopReason,
        toolCalls: auditTrail,
        usage: {
          inputTokens: totalInput,
          outputTokens: totalOutput,
          cacheReadInputTokens: totalCacheRead,
        },
      };
    }

    // Dispatch every tool_use this turn produced. Results go back as
    // a single user-turn payload of tool_result blocks.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const input = (toolUse.input ?? {}) as Record<string, unknown>;
      let resultPayload: unknown;
      let isError = false;
      try {
        resultPayload = await params.dispatch(toolUse.name, input);
      } catch (err) {
        isError = true;
        resultPayload = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      const serialized = JSON.stringify(resultPayload);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: serialized,
        ...(isError ? { is_error: true } : {}),
      });
      auditTrail.push({
        iteration: iterations,
        toolName: toolUse.name,
        category: toolCategoryByName.get(toolUse.name),
        input,
        // Truncate so the audit trail is reasonable to store; the
        // full result was already fed back to the model.
        resultSnippet: serialized.length > 600 ? `${serialized.slice(0, 600)}…` : serialized,
        isError,
      });
      toolCallCount++;
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Cap reached. Return whatever final assistant text we have so the
  // workflow gets *something* useful instead of a hard failure.
  let lastText = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role: string; content: unknown };
    if (m.role !== "assistant") continue;
    if (!Array.isArray(m.content)) break;
    for (const block of m.content as any[]) {
      if (block && block.type === "text") {
        lastText += String(block.text ?? "");
      }
    }
    break;
  }
  return {
    text: lastText || "[Agent loop reached max iterations without a final response]",
    iterations,
    toolCallCount,
    hitIterationCap: true,
    stopReason,
    toolCalls: auditTrail,
    usage: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadInputTokens: totalCacheRead,
    },
  };
}
