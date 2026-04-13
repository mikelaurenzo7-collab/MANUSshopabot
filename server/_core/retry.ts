/**
 * orchAIstrate — Resilience Layer (powered by cockatiel)
 *
 * Replaces hand-rolled retry + circuit-breaker logic with cockatiel
 * (1.2k ⭐, used by VS Code) — composable, battle-tested, TypeScript-native.
 *
 * PUBLIC API IS UNCHANGED — all existing call sites work without modification:
 *   withRetry(fn, options?)           — exponential backoff retry
 *   withCircuitBreaker(key, fn)       — per-key circuit breaker (threshold: 5)
 *   withResilience(key, fn, options?) — retry + circuit breaker combined
 *
 * Cockatiel policies used:
 *   ExponentialBackoff + retry()      → replaces custom calculateDelay loop
 *   ConsecutiveBreaker(5) + circuitBreaker() → replaces hand-rolled state machine
 */
import {
  retry,
  circuitBreaker,
  ExponentialBackoff,
  ConsecutiveBreaker,
  handleAll,
  handleWhen,
  CircuitState,
  isBrokenCircuitError,
} from "cockatiel";
import { logger } from "./logger";

// ─── RetryOptions (public API preserved) ─────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of attempts including the first try (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 30000) */
  maxDelayMs?: number;
  /** Jitter factor 0-1 — kept for API compat; cockatiel uses full jitter internally */
  jitter?: number;
  /** HTTP status codes that should NOT be retried (default: [400, 401, 403, 404, 422]) */
  nonRetryableStatuses?: number[];
  /** Optional label for logging */
  label?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: 0.2,
  nonRetryableStatuses: [400, 401, 403, 404, 422],
  label: "operation",
};

function isNonRetryable(err: any, nonRetryableStatuses: number[]): boolean {
  const status = err?.response?.status ?? err?.status;
  if (status === 429) return false; // always retry rate limits
  if (status && nonRetryableStatuses.includes(status)) return true;
  return false;
}

// ─── withRetry ────────────────────────────────────────────────────────────────

/**
 * Retry an async operation with exponential backoff (cockatiel-powered).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const policy = retry(
    handleWhen((err) => !isNonRetryable(err, opts.nonRetryableStatuses)),
    {
      maxAttempts: Math.max(0, opts.maxAttempts - 1), // cockatiel counts retries, not total attempts
      backoff: new ExponentialBackoff({
        initialDelay: opts.baseDelayMs,
        maxDelay: opts.maxDelayMs,
      }),
    }
  );

  policy.onRetry((reason) => {
    const err = "error" in reason ? reason.error : undefined;
    logger.warn("retry_attempt", { label: opts.label, attempt: (reason as any).attempt, delayMs: (reason as any).delay, error: err?.message });
  });

  policy.onGiveUp((reason) => {
    const err = "error" in reason ? reason.error : undefined;
    logger.error("retry_exhausted", {
      label: opts.label,
      maxAttempts: opts.maxAttempts,
      error: err?.message,
    });
  });

  return policy.execute(fn);
}

// ─── withCircuitBreaker ───────────────────────────────────────────────────────

const CIRCUIT_BREAKER_THRESHOLD = 5;   // consecutive failures before opening
const CIRCUIT_BREAKER_TIMEOUT_MS = 60_000; // 1 minute half-open window

// Per-key cockatiel circuit breaker instances
const _breakers = new Map<string, ReturnType<typeof circuitBreaker>>();

function getBreaker(key: string) {
  if (_breakers.has(key)) return _breakers.get(key)!;

  const policy = circuitBreaker(handleAll, {
    halfOpenAfter: CIRCUIT_BREAKER_TIMEOUT_MS,
    breaker: new ConsecutiveBreaker(CIRCUIT_BREAKER_THRESHOLD),
  });

  policy.onBreak((reason) => {
    const err = "error" in reason ? reason.error : undefined;
    logger.warn("circuit_breaker_opened", { key, error: err?.message });
  });
  policy.onReset(() => logger.info("circuit_breaker_closed", { key }));
  policy.onHalfOpen(() => logger.info("circuit_breaker_half_open", { key }));

  _breakers.set(key, policy);
  return policy;
}

/**
 * Circuit breaker wrapper — stops calling a failing service after too many errors.
 * @param key  Unique identifier for this circuit (e.g., "meta_api", "tiktok_api")
 * @param fn   The async function to protect
 */
export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const policy = getBreaker(key);

  // Eagerly reject when the circuit is already open (mirrors original behaviour)
  if (policy.state === CircuitState.Open) {
    throw new Error(
      `[CircuitBreaker:${key}] Circuit is OPEN — service unavailable. Try again later.`
    );
  }

  try {
    return await policy.execute(fn);
  } catch (err: any) {
    // Cockatiel throws BrokenCircuitError when the circuit opens mid-execution;
    // re-wrap with the original message format so tests and callers stay happy.
    if (isBrokenCircuitError(err)) {
      throw new Error(
        `[CircuitBreaker:${key}] Circuit is OPEN — service unavailable. Try again later.`
      );
    }
    throw err;
  }
}

// ─── withResilience ───────────────────────────────────────────────────────────

/**
 * Combined retry + circuit breaker for maximum resilience.
 * The circuit breaker wraps the retry policy so a tripped circuit
 * short-circuits before any retry attempts are made.
 */
export async function withResilience<T>(
  key: string,
  fn: () => Promise<T>,
  retryOptions: RetryOptions = {}
): Promise<T> {
  // Delegate to the two public helpers — keeps behaviour consistent
  return withCircuitBreaker(key, () => withRetry(fn, { ...retryOptions, label: key }));
}

// ─── Utility: reset a circuit (useful in tests / admin recovery) ──────────────
export function resetCircuit(key: string): void {
  _breakers.delete(key);
}
