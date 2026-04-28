/**
 * Anthropic Batch API helper — 50% cost cut for fan-out workflows.
 *
 * The Batch API processes a list of Messages-API requests
 * asynchronously at half the per-token cost. Most batches complete
 * within an hour; the API guarantees within 24h. Results stay
 * available for 29 days. All Messages API features are supported,
 * including prompt caching — and because every request in a batch
 * shares the same shared system-prompt prefix, caching pays off
 * twice: 50% on the batch discount AND ~90% on the cached preamble.
 *
 * Use cases that pay off in this app:
 *   • social_content: 7-day calendar × 4 platforms = 28 posts. Each
 *     post needs an LLM call. Sequential = 28× sequential latency
 *     + full price. Batch = one submit, one poll, half the cost.
 *   • product_creative: aspect-ratio fan-out across target platforms.
 *   • competitor_pricing_scan: per-SKU LLM extraction from competitor
 *     pages. Hundreds of SKUs at once.
 *   • subject_line_ab_test: 5 variants × N campaigns.
 *
 * Activation: opt-in via `ANTHROPIC_API_KEY`. The synchronous Forge
 * proxy path stays the default; workflows that fan-out homogeneously
 * route through this helper instead. When the key is unset, callers
 * should fall back to N parallel synchronous calls (slower + costlier
 * but works).
 *
 * Workflow integration model: this helper exposes a low-level submit/
 * poll API. The workflow engine doesn't natively wait 1-24h for a
 * batch — instead, the calling step submits the batch, persists
 * `batch_id`, and a separate poller (background job) picks up results
 * when ready and resumes the workflow. That poller is left to a
 * future commit; this helper is the foundation.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";
import { isClaudeDirectAvailable } from "./claudeDirect";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  if (!ENV.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — Batch API path requires the direct SDK.",
    );
  }
  _client = new Anthropic({ apiKey: ENV.anthropicApiKey });
  return _client;
}

export interface BatchRequest {
  /** Caller-chosen ID, returned alongside the result so the caller can
   *  match results back to inputs. Must be unique within the batch. */
  customId: string;
  /** Long, frozen system prompt — usually the shared platform preamble.
   *  When `cache: true`, gets `cache_control: ephemeral` so every
   *  request in the batch reads from the same cached prefix. */
  system?: string;
  /** Per-request user message. The varying piece. */
  userPrompt: string;
  /** Optional structured-output schema. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Per-request output cap. Default 8K. */
  maxTokens?: number;
}

export interface BatchSubmissionResult {
  batchId: string;
  totalRequests: number;
  /** ISO-8601 timestamp from the API. */
  createdAt: string;
}

export interface BatchResult {
  customId: string;
  /** Concatenated text from all `text` blocks. */
  text: string;
  /** Parsed JSON when the request had a jsonSchema. */
  json?: unknown;
  /** True when the API completed the request successfully. */
  succeeded: boolean;
  /** Error message when `succeeded === false`. */
  error?: string;
  cacheReadInputTokens: number;
}

/**
 * Submit a batch of LLM requests. Returns a batchId to poll later.
 *
 * Caching note: when every request shares the same `system` text and
 * `cache: true` is set, the prefix gets cache_control. The first
 * request writes the cache; the remaining N-1 read from it. Combined
 * with the 50% batch discount, this is the cheapest way to run a
 * fan-out at scale.
 */
export async function submitBatch(args: {
  requests: BatchRequest[];
  cacheSharedSystemPrompt?: boolean;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<BatchSubmissionResult> {
  const client = getClient();
  const model = args.model ?? ENV.anthropicModel;
  const effort = args.effort ?? "high";

  const apiRequests = args.requests.map((r) => {
    const systemField = r.system && args.cacheSharedSystemPrompt
      ? [
          {
            type: "text" as const,
            text: r.system,
            cache_control: { type: "ephemeral" as const },
          },
        ]
      : r.system;

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: r.maxTokens ?? 8000,
      messages: [{ role: "user", content: r.userPrompt }],
      ...(systemField !== undefined ? { system: systemField } : {}),
      thinking: { type: "adaptive" },
      output_config: {
        effort,
        ...(r.jsonSchema
          ? {
              format: {
                type: "json_schema" as const,
                schema: r.jsonSchema.schema,
              },
            }
          : {}),
      },
    };

    return {
      custom_id: r.customId,
      params,
    };
  });

  const batch = await client.messages.batches.create({
    requests: apiRequests,
  });

  return {
    batchId: batch.id,
    totalRequests: args.requests.length,
    createdAt: batch.created_at,
  };
}

export type BatchStatus = "in_progress" | "canceling" | "ended";

export interface BatchStatusInfo {
  batchId: string;
  status: BatchStatus;
  /** Counts of requests by lifecycle bucket. */
  counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
}

/**
 * Poll for batch status. Returns counts so the caller can decide
 * whether to wait, resume the workflow, or surface partial results.
 */
export async function getBatchStatus(batchId: string): Promise<BatchStatusInfo> {
  const client = getClient();
  const batch = await client.messages.batches.retrieve(batchId);
  return {
    batchId: batch.id,
    status: batch.processing_status as BatchStatus,
    counts: {
      processing: batch.request_counts.processing,
      succeeded: batch.request_counts.succeeded,
      errored: batch.request_counts.errored,
      canceled: batch.request_counts.canceled,
      expired: batch.request_counts.expired,
    },
  };
}

/**
 * Stream results from a completed batch. Yields one BatchResult per
 * request — succeeded, errored, canceled, or expired. The caller
 * dispatches by `succeeded` and re-submits the errored set as a new
 * batch if needed.
 */
export async function* streamBatchResults(batchId: string): AsyncGenerator<BatchResult> {
  const client = getClient();
  for await (const result of await client.messages.batches.results(batchId)) {
    if (result.result.type === "succeeded") {
      const msg = result.result.message;
      let text = "";
      for (const block of msg.content) {
        if (block.type === "text") text += block.text;
      }
      let json: unknown;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          // Not JSON-formatted; fine.
        }
      }
      yield {
        customId: result.custom_id,
        text,
        ...(json !== undefined ? { json } : {}),
        succeeded: true,
        cacheReadInputTokens: msg.usage.cache_read_input_tokens ?? 0,
      };
    } else {
      // errored | canceled | expired — surface the error type so the
      // caller can decide whether to retry (errored) or abandon
      // (canceled, expired).
      const errorType = result.result.type === "errored"
        ? `${result.result.error.type ?? "errored"}`
        : result.result.type;
      yield {
        customId: result.custom_id,
        text: "",
        succeeded: false,
        error: errorType,
        cacheReadInputTokens: 0,
      };
    }
  }
}

/**
 * Cancel an in-progress batch. The API will set status to "canceling"
 * and stop processing pending requests; already-completed ones are
 * still billed.
 */
export async function cancelBatch(batchId: string): Promise<void> {
  const client = getClient();
  await client.messages.batches.cancel(batchId);
}

/** Whether the Batch API path is available. */
export function isBatchApiAvailable(): boolean {
  return isClaudeDirectAvailable();
}
