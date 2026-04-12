/**
 * Agent Telemetry Middleware
 * 
 * Wraps any agent action in telemetry logging so every operation
 * is recorded for Phase 2 ML training. Captures:
 * - What the agent did (actionType)
 * - What input it received
 * - What output it produced
 * - How long it took
 * - Whether it succeeded or failed
 * 
 * Usage:
 *   const result = await withTelemetry({
 *     agentType: "merchant",
 *     actionType: "price_change",
 *     storeId: 42,
 *     triggerSource: "manual",
 *     input: { productId: 1, newPrice: 1999 },
 *   }, async () => {
 *     return await updateProductPrice(1, 1999);
 *   });
 */

import * as db from "./db";
import type { InsertAgentTelemetry } from "../drizzle/schema";

export interface TelemetryContext {
  agentType: "architect" | "merchant" | "social";
  actionType: string;
  storeId?: number;
  triggerSource?: "manual" | "workflow" | "scheduler" | "webhook";
  input?: any;
  outcomeType?: string;
  llmModel?: string;
  metadata?: any;
}

/**
 * Wrap an async function with automatic telemetry logging.
 * Returns the function's result and logs success/failure + duration.
 */
export async function withTelemetry<T>(
  ctx: TelemetryContext,
  fn: () => Promise<T>,
): Promise<T> {
  const startTime = Date.now();
  let telemetryId: number | null = null;

  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;

    // Log success
    telemetryId = await db.logTelemetry({
      agentType: ctx.agentType,
      actionType: ctx.actionType,
      storeId: ctx.storeId,
      triggerSource: ctx.triggerSource || "manual",
      input: ctx.input,
      output: typeof result === "object" ? summarizeOutput(result) : { value: result },
      outcomeType: ctx.outcomeType,
      llmModel: ctx.llmModel,
      success: true,
      durationMs,
      metadata: ctx.metadata,
    }) ?? null;

    return result;
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    // Log failure
    try {
      await db.logTelemetry({
        agentType: ctx.agentType,
        actionType: ctx.actionType,
        storeId: ctx.storeId,
        triggerSource: ctx.triggerSource || "manual",
        input: ctx.input,
        outcomeType: ctx.outcomeType,
        llmModel: ctx.llmModel,
        success: false,
        errorMessage: error.message || String(error),
        durationMs,
        metadata: ctx.metadata,
      });
    } catch (logError) {
      // Don't let telemetry failures break the main flow
      console.error("[Telemetry] Failed to log error telemetry:", logError);
    }

    throw error; // Re-throw the original error
  }
}

/**
 * Log a telemetry event directly (for cases where withTelemetry wrapper isn't suitable).
 */
export async function logAgentAction(
  ctx: TelemetryContext & {
    output?: any;
    success?: boolean;
    errorMessage?: string;
    durationMs?: number;
    llmTokensUsed?: number;
    llmLatencyMs?: number;
  },
): Promise<number | null> {
  try {
    return await db.logTelemetry({
      agentType: ctx.agentType,
      actionType: ctx.actionType,
      storeId: ctx.storeId,
      triggerSource: ctx.triggerSource || "manual",
      input: ctx.input,
      output: ctx.output,
      outcomeType: ctx.outcomeType,
      llmModel: ctx.llmModel,
      llmTokensUsed: ctx.llmTokensUsed,
      llmLatencyMs: ctx.llmLatencyMs,
      success: ctx.success ?? true,
      errorMessage: ctx.errorMessage,
      durationMs: ctx.durationMs,
      metadata: ctx.metadata,
    }) ?? null;
  } catch (error) {
    console.error("[Telemetry] Failed to log action:", error);
    return null;
  }
}

/**
 * Schedule an outcome collection for a telemetry event.
 * Called after the action to measure its impact (e.g., sales change after price update).
 */
export async function collectOutcome(
  telemetryId: number,
  outcomeType: string,
  outcomeBefore: any,
  outcomeAfter: any,
): Promise<void> {
  try {
    await db.updateTelemetryOutcome(telemetryId, {
      outcomeType,
      outcomeBefore,
      outcomeAfter,
    });
  } catch (error) {
    console.error("[Telemetry] Failed to collect outcome:", error);
  }
}

/**
 * Calculate time-to-fulfill metric for a specific order.
 * Measures from order creation to fulfillment completion.
 */
export async function logTimeToFulfill(
  storeId: number,
  orderId: string,
  orderCreatedAt: Date,
  fulfilledAt: Date = new Date(),
): Promise<void> {
  const timeToFulfillMs = fulfilledAt.getTime() - orderCreatedAt.getTime();
  const timeToFulfillMinutes = Math.round(timeToFulfillMs / 60000);

  await logAgentAction({
    agentType: "merchant",
    actionType: "time_to_fulfill",
    storeId,
    triggerSource: "webhook",
    input: { orderId, orderCreatedAt: orderCreatedAt.toISOString() },
    output: {
      fulfilledAt: fulfilledAt.toISOString(),
      timeToFulfillMs,
      timeToFulfillMinutes,
      isZeroTouch: timeToFulfillMinutes < 5,
    },
    success: true,
    durationMs: timeToFulfillMs,
    metadata: { metric: "time_to_fulfill", minutes: timeToFulfillMinutes },
  });
}

/**
 * Log LLM cost per workflow execution.
 * Tracks token usage and estimated cost for each workflow run.
 */
export async function logLlmWorkflowCost(
  agentType: "architect" | "merchant" | "social",
  workflowType: string,
  storeId: number | undefined,
  stats: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    llmCalls: number;
    totalLatencyMs: number;
    model?: string;
  },
): Promise<void> {
  // Estimated cost per 1K tokens (conservative estimate)
  const costPer1kTokens = 0.003;
  const estimatedCostCents = Math.round((stats.totalTokens / 1000) * costPer1kTokens * 100);

  await logAgentAction({
    agentType,
    actionType: "llm_workflow_cost",
    storeId,
    triggerSource: "workflow",
    input: { workflowType },
    output: {
      totalTokens: stats.totalTokens,
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      llmCalls: stats.llmCalls,
      estimatedCostCents,
      avgLatencyPerCall: stats.llmCalls > 0 ? Math.round(stats.totalLatencyMs / stats.llmCalls) : 0,
    },
    success: true,
    durationMs: stats.totalLatencyMs,
    llmModel: stats.model,
    llmTokensUsed: stats.totalTokens,
    llmLatencyMs: stats.totalLatencyMs,
    metadata: { metric: "llm_cost", estimatedCostCents },
  });
}

/**
 * Summarize large outputs to avoid bloating the telemetry table.
 * Keeps the first 5 items of arrays, truncates long strings.
 */
function summarizeOutput(output: any): any {
  if (output === null || output === undefined) return output;
  if (typeof output === "string") {
    return output.length > 1000 ? output.slice(0, 1000) + "...[truncated]" : output;
  }
  if (Array.isArray(output)) {
    const summary = output.slice(0, 5).map(summarizeOutput);
    if (output.length > 5) {
      summary.push({ _truncated: true, totalItems: output.length });
    }
    return summary;
  }
  if (typeof output === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(output)) {
      result[key] = summarizeOutput(value);
    }
    return result;
  }
  return output;
}
