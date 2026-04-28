/**
 * Memory agent — agentic write loop for the bot memory tool.
 *
 * The base memory module (`./memory.ts`) exposes `MEMORY_TOOL_DEFS`
 * + `executeMemoryTool` (the dispatcher). The workflow engine's
 * `executeLLMStep` already does *passive* recall — it injects the
 * top-N stored memories into the system prompt before the LLM call.
 *
 * This module is the *active* half: a tool-use loop that lets Claude
 * actually call `memory_write`, `memory_read`, `memory_search`, and
 * `memory_forget` during the LLM call itself, so bots accumulate
 * learnings across runs without the workflow author hardcoding when
 * to write what.
 *
 * Activation:
 *   • Opt-in per workflow step via `input.useMemoryTools: true`.
 *   • Requires ANTHROPIC_API_KEY (the loop talks to the SDK directly
 *     so it can attach the `tools` array — Forge's OpenAI shape can't
 *     express Anthropic's tool format).
 *   • Requires a botProfile.id to scope every memory operation to the
 *     right bot's memory namespace.
 *
 * Iteration cap is 6 — memory is a 1-2-call-per-step pattern in
 * practice (search → write). 6 is generous enough for the model to
 * recover from a tool-error iteration without blowing token budgets
 * on a runaway loop.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "../_core/env";
import { isClaudeDirectAvailable } from "../_core/claudeDirect";
import {
  MEMORY_TOOL_DEFS,
  executeMemoryTool,
  type MemoryToolContext,
} from "./memory";

const MAX_ITERATIONS = 6;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  if (!ENV.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — runMemoryAgent requires the direct-Anthropic path.",
    );
  }
  _client = new Anthropic({ apiKey: ENV.anthropicApiKey });
  return _client;
}

/**
 * Returns true when the agent loop can actually run — needs the API
 * key. Callers should fall back to passive recall (single-shot LLM
 * call with memories pre-injected into the prompt) when this is false.
 */
export function isMemoryAgentAvailable(): boolean {
  return isClaudeDirectAvailable();
}

export interface MemoryAgentResult {
  /** Final text response after the tool-use loop converges. */
  text: string;
  /** How many round-trips the loop made before stopping. */
  iterations: number;
  /** Total memory_* tool calls executed across the run. */
  toolCallCount: number;
  /** Whether the loop hit the iteration cap (vs. converging on text). */
  hitIterationCap: boolean;
  /** stop_reason from the final response, for observability. */
  stopReason: string | null;
}

/**
 * Run an LLM call with the four memory tools available. Loops until
 * the model returns a pure-text response (no tool_use blocks) or the
 * iteration cap fires. Each tool_use block is dispatched through
 * `executeMemoryTool` and the result is fed back as a tool_result on
 * the next iteration.
 *
 * Failures inside `executeMemoryTool` are caught and returned to the
 * model as a tool_result with `{ ok: false, error: <message> }` —
 * better to let the model retry with corrected input than to crash
 * the whole step.
 */
export async function runMemoryAgent(args: {
  systemPrompt: string;
  userPrompt: string;
  ctx: MemoryToolContext;
  /** Effort hint for Opus 4.7. Defaults to "high" (the SDK default). */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Override max iterations for tests. */
  maxIterations?: number;
  /** Override max output tokens. */
  maxTokens?: number;
}): Promise<MemoryAgentResult> {
  const client = getClient();
  const cap = args.maxIterations ?? MAX_ITERATIONS;
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: args.userPrompt },
  ];

  let toolCallCount = 0;
  let iterations = 0;
  let stopReason: string | null = null;

  while (iterations < cap) {
    iterations++;

    const response = await client.messages.create({
      model: ENV.anthropicModel,
      max_tokens: args.maxTokens ?? 4000,
      system: args.systemPrompt,
      messages,
      tools: MEMORY_TOOL_DEFS as unknown as Anthropic.Tool[],
      ...(args.effort
        ? { output_config: { effort: args.effort } as any }
        : {}),
    });

    stopReason = response.stop_reason ?? null;

    // The Anthropic SDK requires the FULL assistant content (text +
    // tool_use blocks) be appended back to messages as the next turn's
    // history, so the model has the same view it just produced.
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    // Done — either the model decided not to call a tool, or it
    // signaled end_turn explicitly.
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
      };
    }

    // Execute every tool call this turn produced and gather results
    // into a single user-turn payload.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      let resultPayload: unknown;
      let isError = false;
      try {
        resultPayload = await executeMemoryTool(
          toolUse.name,
          (toolUse.input ?? {}) as Record<string, unknown>,
          args.ctx,
        );
      } catch (err) {
        isError = true;
        resultPayload = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(resultPayload),
        ...(isError ? { is_error: true } : {}),
      });
      toolCallCount++;
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Iteration cap reached — return the last assistant text we have,
  // if any, so the workflow gets *something* useful instead of a hard
  // failure on a chatty model.
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
    text: lastText || "[Memory agent reached max iterations without a final response]",
    iterations,
    toolCallCount,
    hitIterationCap: true,
    stopReason,
  };
}
