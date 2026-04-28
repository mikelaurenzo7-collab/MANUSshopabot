/**
 * Direct Anthropic SDK invoker (opt-in alongside the Forge proxy).
 *
 * The default LLM path in this app routes through Manus's Forge proxy
 * (`server/_core/llm.ts`), which is OpenAI-shaped and works against any
 * Manus-managed model. This module is the parallel, *opt-in* path that
 * talks to Anthropic directly via the official SDK so workflows can
 * use Claude-native features the OpenAI shape can't express:
 *
 *   • Prompt caching (`cache_control: { type: "ephemeral" }`) — ~90%
 *     input-token cost cut on repeated long system prompts. The
 *     niche_research / brand_identity_kit / ad_campaign workflows all
 *     ship 300-line+ system prompts that are reused on every run; the
 *     prefix is the cache target.
 *   • Adaptive thinking (`thinking: { type: "adaptive" }`) — the model
 *     decides depth per request. Replaces the tiny fixed 128-token
 *     budget the Forge path passes through.
 *   • Effort parameter — `low` / `medium` / `high` / `xhigh` / `max`.
 *     Coding + agentic workloads (Builder Bot scaffolding, Merchant
 *     Bot orchestration) want xhigh; classification can drop to low.
 *   • Structured outputs via `output_config.format` and the typed
 *     `messages.parse()` helper.
 *   • Batch API (50% cost cut) — exposed as `invokeClaudeBatch()` for
 *     fan-out workflows like social_content (28 posts) or product_creative.
 *
 * Activation: opt-in per call via `useClaudeDirect: true`. When
 * `ANTHROPIC_API_KEY` is unset, calls fall back to the Forge path
 * silently — Manus deploys without the key continue to work. Setting
 * the key is additive; it doesn't disable Forge.
 *
 * Per the skill defaults: model is `claude-opus-4-7`, adaptive thinking
 * for complex tasks, streaming for any high-`max_tokens` request to
 * stay under SDK HTTP timeouts.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";
import { invokeLLM } from "./llm";
import type { InvokeParams, InvokeResult, Message } from "./llm";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  if (!ENV.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — claudeDirect features are opt-in. Set the env var or call invokeLLM() to use the Forge proxy.",
    );
  }
  _client = new Anthropic({ apiKey: ENV.anthropicApiKey });
  return _client;
}

/** Whether the direct-Anthropic path is available in this deploy. */
export function isClaudeDirectAvailable(): boolean {
  return ENV.anthropicApiKey.trim().length > 0;
}

/**
 * Effort levels supported by Claude Opus 4.7. `xhigh` is best for
 * coding / agentic; `high` is the recommended minimum for
 * intelligence-sensitive work; `max` is Opus-tier only.
 */
export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeDirectParams {
  /**
   * The system prompt — the long, frozen, highly-reusable part of the
   * workflow's instructions. When `cacheSystemPrompt: true`, this gets
   * `cache_control: { type: "ephemeral" }` for ~90% input-token reuse
   * across runs.
   */
  system?: string;
  /** Multi-turn conversation. Same shape as the Forge invoker uses. */
  messages: Message[];
  /** Hard ceiling on output tokens. Defaults to 16K (under the SDK's
   *  10-minute non-streaming guard). For larger outputs, the function
   *  auto-switches to streaming. */
  maxTokens?: number;
  /** Cache the system prompt. No-op when `system` is shorter than the
   *  model's minimum cacheable prefix (4096 tokens for Opus 4.7). */
  cacheSystemPrompt?: boolean;
  /** Enable adaptive thinking. Defaults to true for complex tasks (the
   *  caller usually knows). */
  adaptiveThinking?: boolean;
  /** Override default effort. Defaults to `high` (the safe minimum for
   *  intelligence-sensitive work). */
  effort?: ClaudeEffort;
  /** Structured output schema — enforced server-side via
   *  `output_config.format.json_schema`. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Tool definitions. The caller dispatches; this module just shapes
   *  the request. For automatic loop handling, callers should use the
   *  SDK's `betaZodTool` + `tool_runner` directly. */
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  /** Override model — defaults to `ENV.anthropicModel` (`claude-opus-4-7`). */
  model?: string;
}

export interface ClaudeDirectResult {
  /** Concatenated text from all `text` blocks in the response. */
  text: string;
  /** When `jsonSchema` was provided, the parsed JSON object. */
  json?: unknown;
  /** Cache + token usage. Critical for verifying caching is working —
   *  if `cacheReadInputTokens` stays zero across runs with the same
   *  system prompt, a silent invalidator is at work. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
  /** Raw stop reason for callers that need to branch on `tool_use`,
   *  `max_tokens`, `refusal`, etc. */
  stopReason: string | null;
  /** Tool use blocks if the model called any tools. The caller
   *  dispatches and re-invokes with results. */
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}

/**
 * Convert our internal Message[] into Anthropic's content-block shape.
 * The Forge path uses OpenAI's role+content shape; we already have a
 * normalizer for that. Here we just need to get text out of each
 * message — Anthropic doesn't have a "system" role on messages (it's a
 * top-level field), so we pull system messages out separately.
 */
function splitSystemAndMessages(messages: Message[]): {
  system: string;
  conversation: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [];
  const conversation: Anthropic.MessageParam[] = [];

  for (const m of messages) {
    const text = typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
        ? m.content
            .map((p) => (typeof p === "string" ? p : p.type === "text" ? p.text : ""))
            .filter(Boolean)
            .join("\n")
        : m.content && typeof m.content === "object" && "type" in m.content && m.content.type === "text"
          ? m.content.text
          : "";

    if (m.role === "system") {
      if (text) systemParts.push(text);
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      conversation.push({ role: m.role, content: text });
    }
    // tool/function roles aren't supported through this entry point —
    // callers using tool use should drop down to the SDK directly.
  }

  return { system: systemParts.join("\n\n"), conversation };
}

/**
 * Direct Anthropic invocation with opt-in caching + adaptive thinking.
 *
 * When `ANTHROPIC_API_KEY` is unset, this throws — callers that want
 * graceful fallback should check `isClaudeDirectAvailable()` first or
 * use `invokeWithFallback()` below.
 */
export async function invokeClaudeDirect(
  params: ClaudeDirectParams,
): Promise<ClaudeDirectResult> {
  const client = getClient();
  const model = params.model ?? ENV.anthropicModel;
  const maxTokens = params.maxTokens ?? 16_000;
  const useStreaming = maxTokens > 16_000;

  const { system: systemFromMessages, conversation } = splitSystemAndMessages(params.messages);
  const systemText = [params.system, systemFromMessages].filter(Boolean).join("\n\n");

  // Build the system field. When caching, ship as a content-block
  // array so we can attach cache_control. When not caching, ship as a
  // bare string — fewer bytes on the wire.
  const systemField = params.cacheSystemPrompt && systemText
    ? [
        {
          type: "text" as const,
          text: systemText,
          cache_control: { type: "ephemeral" as const },
        },
      ]
    : systemText || undefined;

  const requestBase: Anthropic.MessageCreateParams = {
    model,
    max_tokens: maxTokens,
    messages: conversation.length > 0
      ? conversation
      : [{ role: "user", content: "Continue." }],
    ...(systemField !== undefined ? { system: systemField } : {}),
    ...(params.adaptiveThinking !== false
      ? { thinking: { type: "adaptive" as const } }
      : {}),
    // Effort goes inside output_config, not top-level. `high` is a safe
    // default; coding/agentic callers should override to `xhigh`.
    output_config: {
      effort: params.effort ?? "high",
      ...(params.jsonSchema
        ? {
            format: {
              type: "json_schema" as const,
              schema: params.jsonSchema.schema,
            },
          }
        : {}),
    },
    ...(params.tools && params.tools.length > 0
      ? { tools: params.tools as Anthropic.Tool[] }
      : {}),
  };

  // For high-max_tokens calls, stream and use .finalMessage() — keeps
  // us under the SDK's 10-minute idle-connection guard without
  // forcing the caller to handle individual events.
  const message = useStreaming
    ? await client.messages.stream(requestBase).finalMessage()
    : await client.messages.create(requestBase);

  // Concatenate text blocks; pull tool_use blocks for the caller.
  let text = "";
  const toolUses: ClaudeDirectResult["toolUses"] = [];
  let parsedJson: unknown;
  for (const block of message.content) {
    if (block.type === "text") text += block.text;
    if (block.type === "tool_use") {
      toolUses.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  // Structured output — when jsonSchema was set, the first text block
  // is guaranteed valid JSON.
  if (params.jsonSchema && text) {
    try {
      parsedJson = JSON.parse(text);
    } catch {
      // Schema enforcement should make this impossible; if it happens,
      // surface raw text and let the caller deal.
    }
  }

  return {
    text,
    ...(parsedJson !== undefined ? { json: parsedJson } : {}),
    usage: {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    },
    stopReason: message.stop_reason ?? null,
    toolUses,
  };
}

/**
 * Same shape as the existing `invokeLLM`. Routes to claudeDirect when
 * `useClaudeDirect: true` AND the API key is configured; otherwise
 * falls through to the Forge proxy. Use this from workflow steps that
 * want to opportunistically use caching/adaptive thinking when
 * available, without forcing every deploy to set the Anthropic key.
 */
export async function invokeWithFallback(
  params: InvokeParams & {
    useClaudeDirect?: boolean;
    cacheSystemPrompt?: boolean;
    effort?: ClaudeEffort;
    adaptiveThinking?: boolean;
  },
): Promise<InvokeResult> {
  const wantsDirect = params.useClaudeDirect && isClaudeDirectAvailable();
  if (!wantsDirect) {
    return invokeLLM(params);
  }

  // Translate to claudeDirect, then back to InvokeResult so callers
  // don't need to handle two response shapes.
  const jsonSchema =
    params.responseFormat?.type === "json_schema"
      ? params.responseFormat.json_schema
      : params.outputSchema;
  const direct = await invokeClaudeDirect({
    messages: params.messages,
    maxTokens: params.maxTokens ?? params.max_tokens,
    cacheSystemPrompt: params.cacheSystemPrompt,
    adaptiveThinking: params.adaptiveThinking,
    effort: params.effort,
    ...(jsonSchema
      ? {
          jsonSchema: {
            name: jsonSchema.name,
            schema: jsonSchema.schema,
          },
        }
      : {}),
  });

  // Adapt to the InvokeResult shape the rest of the engine expects.
  return {
    id: `claude-direct-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: params.maxTokens ? `direct:${ENV.anthropicModel}` : `direct:${ENV.anthropicModel}`,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: direct.text,
        },
        finish_reason: direct.stopReason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: direct.usage.inputTokens + direct.usage.cacheReadInputTokens,
      completion_tokens: direct.usage.outputTokens,
      total_tokens:
        direct.usage.inputTokens +
        direct.usage.cacheReadInputTokens +
        direct.usage.outputTokens,
    },
  };
}
