import { logger } from "./logger";

/**
 * Rate Limiter with Exponential Backoff
 *
 * Provides retry logic for API calls that may hit rate limits (HTTP 429).
 * Used by adapters to gracefully handle throttling from Shopify, Meta, Etsy, etc.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 30000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Check if an error is a rate limit (429) response
 */
function isRateLimitError(err: any): boolean {
  if (err?.response?.status === 429) return true;
  if (err?.status === 429) return true;
  if (err?.message?.includes("429")) return true;
  if (err?.message?.toLowerCase()?.includes("rate limit")) return true;
  if (err?.message?.toLowerCase()?.includes("too many requests")) return true;
  return false;
}

/**
 * Extract Retry-After header value in milliseconds
 */
function getRetryAfterMs(err: any): number | null {
  const retryAfter = err?.response?.headers?.["retry-after"];
  if (!retryAfter) return null;
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  // Try parsing as HTTP date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  return null;
}

/**
 * Calculate delay for a given retry attempt
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  let delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  delay = Math.min(delay, options.maxDelayMs);
  if (options.jitter) {
    delay = delay * (0.5 + Math.random() * 0.5); // 50-100% of calculated delay
  }
  return Math.floor(delay);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with automatic retry on rate limit errors.
 * 
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => shopifyApi.getProducts(),
 *   { maxRetries: 3, initialDelayMs: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      // Only retry on rate limit errors
      if (!isRateLimitError(err)) {
        throw err;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= opts.maxRetries) {
        logger.error("rate_limiter_max_retries_exhausted", {
          module: "rateLimiter",
          maxRetries: opts.maxRetries,
          error: err.message,
        });
        throw err;
      }

      // Calculate delay — prefer Retry-After header if available
      const retryAfterMs = getRetryAfterMs(err);
      const delay = retryAfterMs ?? calculateDelay(attempt, opts);

      logger.warn("rate_limiter_retry_scheduled", {
        module: "rateLimiter",
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs: delay,
      });
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Simple in-memory rate limiter for outgoing API calls.
 * Tracks calls per window and blocks if limit is exceeded.
 */
export class ApiRateLimiter {
  private calls: number[] = [];
  
  constructor(
    private readonly maxCalls: number,
    private readonly windowMs: number
  ) {}

  /**
   * Check if a call can be made within the rate limit window.
   * Returns the number of milliseconds to wait, or 0 if the call can proceed.
   */
  check(): number {
    const now = Date.now();
    // Remove expired entries
    this.calls = this.calls.filter(t => now - t < this.windowMs);
    
    if (this.calls.length >= this.maxCalls) {
      const oldestCall = this.calls[0];
      return (oldestCall + this.windowMs) - now;
    }
    return 0;
  }

  /**
   * Record a call and wait if necessary to respect the rate limit.
   */
  async acquire(): Promise<void> {
    const waitMs = this.check();
    if (waitMs > 0) {
      logger.warn("api_rate_limiter_throttling", {
        module: "rateLimiter",
        waitMs,
        callsInWindow: this.calls.length,
        maxCalls: this.maxCalls,
      });
      await sleep(waitMs);
    }
    this.calls.push(Date.now());
  }
}

/**
 * Pre-configured rate limiters for known platform API limits.
 * These are conservative estimates — actual limits vary by plan.
 */
export const platformRateLimiters = {
  shopify: new ApiRateLimiter(40, 1000),       // Shopify: 40 calls/sec (2 calls/sec for basic)
  etsy: new ApiRateLimiter(10, 1000),          // Etsy: ~10 calls/sec
  meta: new ApiRateLimiter(200, 60000),        // Meta: 200 calls/min per user
  tiktok: new ApiRateLimiter(100, 60000),      // TikTok: ~100 calls/min
  twitter: new ApiRateLimiter(15, 900000),     // Twitter: 15 calls/15min (most endpoints)
  pinterest: new ApiRateLimiter(100, 60000),   // Pinterest: ~100 calls/min
  ebay: new ApiRateLimiter(5000, 86400000),    // eBay: 5000 calls/day
  amazon: new ApiRateLimiter(15, 1000),        // Amazon SP-API: ~15 calls/sec (varies by endpoint)
  woocommerce: new ApiRateLimiter(25, 1000),   // WooCommerce: ~25 calls/sec (server-dependent)
  google_ads: new ApiRateLimiter(100, 60000),  // Google Ads: ~100 calls/min
  // Sprint 27 expansion. Numbers tuned to public docs / community data.
  depop: new ApiRateLimiter(10, 1000),         // Depop Partner API: ~10 calls/sec
  bigcommerce: new ApiRateLimiter(450, 30000), // BigCommerce: ~15 req/sec, 450/30s window
  square: new ApiRateLimiter(700, 60000),      // Square: ~700 req/min (sandbox 50/min)
  faire: new ApiRateLimiter(60, 60000),        // Faire: ~1 req/sec sustained
  bonanza: new ApiRateLimiter(30, 60000),      // Bonanza Bonapitit: ~30/min (rough)
  stockx: new ApiRateLimiter(60, 60000),       // StockX: ~1 req/sec
  reverb: new ApiRateLimiter(60, 60000),       // Reverb: ~1 req/sec
};
