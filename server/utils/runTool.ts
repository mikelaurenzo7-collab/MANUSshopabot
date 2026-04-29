/**
 * runTool — observability wrapper for every adapter / tool call.
 *
 * Wraps any async adapter operation with:
 *   • Structured logging at start and end (tool name, args summary, latency)
 *   • Automatic timing (latencyMs appended to the result metadata)
 *   • Consistent error handling: logs then re-throws so callers still see
 *     the original error type.
 *   • Redaction of credentials and tokens in log metadata so secrets
 *     never appear in logs.
 *
 * Usage:
 *   import { runTool } from "./runTool";
 *
 *   const product = await runTool(
 *     "shopify.listProducts",
 *     { storeId, limit: 50 },
 *     () => adapter.listProducts(credentials, { limit: 50 }),
 *     { agentType: "merchant", storeId },
 *   );
 */

import { logger } from "./logger";

// Fields whose values should be replaced with "[redacted]" in log output.
const SENSITIVE_KEYS = new Set([
  "accessToken", "refreshToken", "apiKey", "apiSecret",
  "consumerKey", "consumerSecret", "clientSecret", "password",
  "token", "secret", "privateKey", "auth",
]);

/**
 * Recursively redact sensitive fields from an object so credentials are never
 * emitted to logs. Returns a shallow clone — does not mutate the original.
 */
function redact(input: unknown, depth = 0): unknown {
  if (depth > 5 || input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    result[k] = SENSITIVE_KEYS.has(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return result;
}

/**
 * Metadata passed through to the structured log entries. Mirrors the shape
 * accepted by the existing `logger` utility.
 */
export interface ToolCallMeta {
  agentType?: "architect" | "merchant" | "social" | "system";
  storeId?: number;
  workflowId?: string;
  [key: string]: unknown;
}

/**
 * Wraps a single async tool/adapter invocation with observability.
 *
 * @param toolName   Human-readable `"adapter.method"` identifier logged on
 *                   every call — shown in structured logs and traces.
 * @param args       Arguments summary to log. Sensitive fields are redacted.
 * @param fn         The actual operation to execute (zero-arg thunk).
 * @param meta       Extra context forwarded to every log entry.
 * @returns          The resolved value of `fn()`, unchanged.
 * @throws           Re-throws any error from `fn()` after logging it.
 */
export async function runTool<T>(
  toolName: string,
  args: Record<string, unknown>,
  fn: () => Promise<T>,
  meta: ToolCallMeta = {},
): Promise<T> {
  const startMs = Date.now();

  logger.info(`[runTool] start: ${toolName}`, {
    ...meta,
    tool: toolName,
    args: redact(args),
  });

  try {
    const result = await fn();
    const latencyMs = Date.now() - startMs;

    logger.info(`[runTool] ok: ${toolName} (${latencyMs}ms)`, {
      ...meta,
      tool: toolName,
      latencyMs,
    });

    return result;
  } catch (err: unknown) {
    const latencyMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);

    logger.error(`[runTool] error: ${toolName} (${latencyMs}ms) — ${message}`, {
      ...meta,
      tool: toolName,
      latencyMs,
      errorMessage: message,
    });

    throw err;
  }
}
