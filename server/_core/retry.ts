/**
 * Retry Utility — Exponential Backoff + Circuit Breaker
 * Wraps any async operation with configurable retry logic.
 * Used to make LLM calls and external API calls resilient.
 */

import { logger } from "./logger";

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms (default: 1000). Doubles each attempt. */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 30000) */
  maxDelayMs?: number;
  /** Jitter factor 0-1 to randomize delay and avoid thundering herd (default: 0.2) */
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const exponential = options.baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, options.maxDelayMs);
  const jitterAmount = capped * options.jitter * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitterAmount));
}

function isNonRetryableError(err: any, nonRetryableStatuses: number[]): boolean {
  // Axios-style errors
  const status = err?.response?.status || err?.status;
  if (status && nonRetryableStatuses.includes(status)) return true;
  // Rate limit errors should be retried (429)
  if (status === 429) return false;
  // Network errors should be retried
  if (err?.code === "ECONNRESET" || err?.code === "ETIMEDOUT" || err?.code === "ENOTFOUND") return false;
  return false;
}

/**
 * Retry an async operation with exponential backoff.
 * @param fn The async function to retry
 * @param options Retry configuration
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      // Don't retry non-retryable errors
      if (isNonRetryableError(err, opts.nonRetryableStatuses)) {
        console.warn(`[Retry:${opts.label}] Non-retryable error on attempt ${attempt}: ${err.message}`);
        throw err;
      }

      if (attempt === opts.maxAttempts) {
        console.error(`[Retry:${opts.label}] All ${opts.maxAttempts} attempts failed. Last error: ${err.message}`);
        break;
      }

      const delay = calculateDelay(attempt, opts);
      console.warn(`[Retry:${opts.label}] Attempt ${attempt}/${opts.maxAttempts} failed: ${err.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError!;
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: "closed" | "open" | "half-open";
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

const CIRCUIT_BREAKER_THRESHOLD = 5; // failures before opening
const CIRCUIT_BREAKER_TIMEOUT_MS = 60000; // 1 minute before trying again

/**
 * Circuit breaker wrapper — stops calling a failing service after too many errors.
 * @param key Unique identifier for this circuit (e.g., "meta_api", "tiktok_api")
 * @param fn The async function to protect
 */
export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  let breaker = circuitBreakers.get(key);
  if (!breaker) {
    breaker = { failures: 0, lastFailureTime: 0, state: "closed" };
    circuitBreakers.set(key, breaker);
  }

  const now = Date.now();

  if (breaker.state === "open") {
    if (now - breaker.lastFailureTime > CIRCUIT_BREAKER_TIMEOUT_MS) {
      breaker.state = "half-open";
      logger.info("circuit_breaker_half_open", { key });
    } else {
      throw new Error(`[CircuitBreaker:${key}] Circuit is OPEN — service unavailable. Try again in ${Math.round((CIRCUIT_BREAKER_TIMEOUT_MS - (now - breaker.lastFailureTime)) / 1000)}s`);
    }
  }

  try {
    const result = await fn();
    // Success — reset circuit
    if (breaker.state === "half-open") {
      logger.info("circuit_breaker_closed", { key });
    }
    breaker.failures = 0;
    breaker.state = "closed";
    return result;
  } catch (err) {
    breaker.failures++;
    breaker.lastFailureTime = now;
    if (breaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      breaker.state = "open";
      logger.warn("circuit_breaker_opened", { key, failures: breaker.failures });
    }
    throw err;
  }
}

/**
 * Combined retry + circuit breaker for maximum resilience.
 */
export async function withResilience<T>(
  key: string,
  fn: () => Promise<T>,
  retryOptions: RetryOptions = {}
): Promise<T> {
  return withCircuitBreaker(key, () => withRetry(fn, { ...retryOptions, label: key }));
}
