/**
 * orchAIstrate — Token Bucket Rate Limiter
 *
 * Production-grade per-platform rate limiter using the token bucket algorithm.
 * Each platform gets its own bucket with configurable:
 *   - capacity: max burst size
 *   - refillRate: tokens added per second
 *   - refillInterval: how often tokens are added (ms)
 *
 * Advantages over the sliding window ApiRateLimiter:
 *   - Allows controlled bursts while maintaining average rate
 *   - O(1) memory per bucket (vs O(n) for sliding window)
 *   - Configurable burst vs sustained rate independently
 *   - Supports waitForToken() for backpressure instead of hard rejection
 */
import { logger } from "../_core/logger";

export interface TokenBucketConfig {
  /** Maximum tokens the bucket can hold (burst capacity) */
  capacity: number;
  /** Tokens added per refill cycle */
  refillRate: number;
  /** Milliseconds between refill cycles (default: 1000ms = 1 second) */
  refillIntervalMs?: number;
  /** Human-readable platform name for logging */
  platformName: string;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  readonly capacity: number;
  readonly refillRate: number;
  readonly refillIntervalMs: number;
  readonly platformName: string;

  /** Metrics tracking */
  private _totalRequests = 0;
  private _totalThrottled = 0;
  private _totalWaitMs = 0;

  constructor(config: TokenBucketConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.refillIntervalMs = config.refillIntervalMs ?? 1000;
    this.platformName = config.platformName;
    this.tokens = config.capacity; // Start full
    this.lastRefill = Date.now();
  }

  /** Refill tokens based on elapsed time */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const cycles = Math.floor(elapsed / this.refillIntervalMs);
    if (cycles > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + cycles * this.refillRate);
      this.lastRefill = now;
    }
  }

  /**
   * Try to consume a token immediately.
   * Returns true if a token was available, false if throttled.
   */
  tryConsume(count = 1): boolean {
    this.refill();
    this._totalRequests++;
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    this._totalThrottled++;
    return false;
  }

  /**
   * Wait until a token is available, then consume it.
   * Returns the number of milliseconds waited.
   * Throws if wait would exceed maxWaitMs (default: 30s).
   */
  async waitForToken(maxWaitMs = 30000): Promise<number> {
    this.refill();
    this._totalRequests++;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }

    // Calculate wait time until next token
    const tokensNeeded = 1 - this.tokens;
    const cyclesNeeded = Math.ceil(tokensNeeded / this.refillRate);
    const waitMs = cyclesNeeded * this.refillIntervalMs;

    if (waitMs > maxWaitMs) {
      this._totalThrottled++;
      throw new Error(
        `[TokenBucket:${this.platformName}] Rate limit exceeded. Would need to wait ${waitMs}ms (max: ${maxWaitMs}ms). ` +
        `Bucket: ${this.tokens.toFixed(1)}/${this.capacity} tokens.`
      );
    }

    this._totalThrottled++;
    this._totalWaitMs += waitMs;

    logger.warn("rate_limit_throttle", {
      platform: this.platformName,
      waitMs,
      tokensAvailable: Math.floor(this.tokens),
      capacity: this.capacity,
    });

    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
    return waitMs;
  }

  /** Get current token count (after refill) */
  get available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /** Get rate limiter metrics */
  get metrics() {
    return {
      platform: this.platformName,
      capacity: this.capacity,
      available: this.available,
      refillRate: this.refillRate,
      refillIntervalMs: this.refillIntervalMs,
      totalRequests: this._totalRequests,
      totalThrottled: this._totalThrottled,
      totalWaitMs: this._totalWaitMs,
      throttleRate: this._totalRequests > 0 ? this._totalThrottled / this._totalRequests : 0,
    };
  }

  /** Reset metrics (useful for periodic reporting) */
  resetMetrics(): void {
    this._totalRequests = 0;
    this._totalThrottled = 0;
    this._totalWaitMs = 0;
  }
}

// ─── Per-Platform Token Bucket Configurations ─────────────────────────────
// Based on official API documentation and conservative estimates.
// capacity = burst allowance, refillRate = sustained rate per interval.

export const platformBuckets: Record<string, TokenBucket> = {
  // E-Commerce Platforms
  shopify: new TokenBucket({
    platformName: "Shopify",
    capacity: 40,        // Shopify leaky bucket: 40 requests
    refillRate: 2,       // 2 requests/second refill (basic plan)
    refillIntervalMs: 1000,
  }),
  woocommerce: new TokenBucket({
    platformName: "WooCommerce",
    capacity: 25,        // Server-dependent, conservative
    refillRate: 25,      // ~25 req/sec sustained
    refillIntervalMs: 1000,
  }),
  amazon: new TokenBucket({
    platformName: "Amazon SP-API",
    capacity: 30,        // Burst of 30
    refillRate: 15,      // ~15 req/sec sustained
    refillIntervalMs: 1000,
  }),
  ebay: new TokenBucket({
    platformName: "eBay",
    capacity: 100,       // Burst of 100
    refillRate: 58,      // ~5000/day ≈ 58/interval at 10s intervals
    refillIntervalMs: 10000,
  }),
  etsy: new TokenBucket({
    platformName: "Etsy",
    capacity: 30,        // Burst of 30
    refillRate: 10,      // ~10 req/sec
    refillIntervalMs: 1000,
  }),
  tiktok_shop: new TokenBucket({
    platformName: "TikTok Shop",
    capacity: 50,        // Burst of 50
    refillRate: 10,      // ~10 req/sec
    refillIntervalMs: 1000,
  }),
  walmart: new TokenBucket({
    platformName: "Walmart",
    capacity: 20,        // Burst of 20
    refillRate: 5,       // ~5 req/sec
    refillIntervalMs: 1000,
  }),

  // Social / Ads Platforms
  meta: new TokenBucket({
    platformName: "Meta",
    capacity: 50,        // Burst of 50
    refillRate: 200,     // 200 calls/min = ~3.3/sec, refill 200 per 60s
    refillIntervalMs: 60000,
  }),
  instagram: new TokenBucket({
    platformName: "Instagram",
    capacity: 50,        // Shares Meta's rate limits
    refillRate: 200,
    refillIntervalMs: 60000,
  }),
  tiktok: new TokenBucket({
    platformName: "TikTok",
    capacity: 30,        // Burst of 30
    refillRate: 100,     // ~100 calls/min
    refillIntervalMs: 60000,
  }),
  twitter: new TokenBucket({
    platformName: "Twitter/X",
    capacity: 15,        // Very restrictive: 15 calls/15min for most endpoints
    refillRate: 15,
    refillIntervalMs: 900000, // 15 minutes
  }),
  pinterest: new TokenBucket({
    platformName: "Pinterest",
    capacity: 30,        // Burst of 30
    refillRate: 100,     // ~100 calls/min
    refillIntervalMs: 60000,
  }),
  google_ads: new TokenBucket({
    platformName: "Google Ads",
    capacity: 30,        // Burst of 30
    refillRate: 100,     // ~100 calls/min
    refillIntervalMs: 60000,
  }),
  youtube: new TokenBucket({
    platformName: "YouTube",
    capacity: 30,        // Burst of 30
    refillRate: 100,     // ~100 calls/min (quota-based, conservative)
    refillIntervalMs: 60000,
  }),
};

/**
 * Get a token bucket for a platform. Falls back to a default bucket
 * if the platform is not configured.
 */
export function getBucket(platform: string): TokenBucket {
  const normalized = platform.toLowerCase().replace(/[\s-]/g, "_");
  if (platformBuckets[normalized]) return platformBuckets[normalized];
  // Fallback: conservative default
  if (!platformBuckets[`_default_${normalized}`]) {
    platformBuckets[`_default_${normalized}`] = new TokenBucket({
      platformName: platform,
      capacity: 10,
      refillRate: 5,
      refillIntervalMs: 1000,
    });
  }
  return platformBuckets[`_default_${normalized}`];
}

/**
 * Get metrics for all configured platform buckets.
 */
export function getAllBucketMetrics() {
  return Object.entries(platformBuckets)
    .filter(([key]) => !key.startsWith("_default_"))
    .map(([, bucket]) => bucket.metrics);
}
