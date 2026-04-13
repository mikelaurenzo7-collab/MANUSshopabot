/**
 * orchAIstrate — Platform Rate Limiter
 *
 * Dual implementation:
 * - TokenBucket: original hand-rolled class with full API (tryConsume, available,
 *   capacity, refillRate, refillIntervalMs, metrics, resetMetrics, waitForToken).
 *   Used directly in tests and kept for API compatibility.
 * - PlatformLimiter: Bottleneck-backed limiter used by getBucket() in production.
 *   Provides concurrency control and Redis-ready distributed limiting.
 *
 * External API for production code:
 *   getBucket(platform).waitForToken()   — await before any API call
 *   getAllBucketMetrics()                — health/metrics for all platforms
 */
import Bottleneck from "bottleneck";
import { logger } from "../_core/logger";

// ─── Original TokenBucket class (full API, used by tests) ────────────────────────────
export interface TokenBucketConfig {
  capacity: number;
  refillRate: number;
  refillIntervalMs?: number;
  platformName: string;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  readonly capacity: number;
  readonly refillRate: number;
  readonly refillIntervalMs: number;
  readonly platformName: string;
  private _totalRequests = 0;
  private _totalThrottled = 0;
  private _totalWaitMs = 0;

  constructor(config: TokenBucketConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.refillIntervalMs = config.refillIntervalMs ?? 1000;
    this.platformName = config.platformName;
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const cycles = Math.floor(elapsed / this.refillIntervalMs);
    if (cycles > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + cycles * this.refillRate);
      this.lastRefill = now;
    }
  }

  tryConsume(count = 1): boolean {
    this.refill();
    this._totalRequests++;
    if (this.tokens >= count) { this.tokens -= count; return true; }
    this._totalThrottled++;
    return false;
  }

  async waitForToken(maxWaitMs = 30000): Promise<number> {
    this.refill();
    this._totalRequests++;
    if (this.tokens >= 1) { this.tokens -= 1; return 0; }
    const tokensNeeded = 1 - this.tokens;
    const cyclesNeeded = Math.ceil(tokensNeeded / this.refillRate);
    const waitMs = cyclesNeeded * this.refillIntervalMs;
    if (waitMs > maxWaitMs) {
      this._totalThrottled++;
      throw new Error(
        `[TokenBucket:${this.platformName}] Rate limit exceeded. Would need to wait ${waitMs}ms (max: ${maxWaitMs}ms).`
      );
    }
    this._totalThrottled++;
    this._totalWaitMs += waitMs;
    logger.warn("rate_limit_throttle", { platform: this.platformName, waitMs });
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
    return waitMs;
  }

  get available(): number { this.refill(); return Math.floor(this.tokens); }

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

  resetMetrics(): void {
    this._totalRequests = 0;
    this._totalThrottled = 0;
    this._totalWaitMs = 0;
  }
}

// ─── PlatformLimiter: Bottleneck-backed limiter for production getBucket() ─────────────
export interface PlatformLimiterConfig {
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
  platformName: string;
  maxConcurrent?: number;
}

export class PlatformLimiter {
  private limiter: Bottleneck;
  readonly platformName: string;
  readonly capacity: number;
  readonly refillRate: number;
  private _totalRequests = 0;
  private _totalThrottled = 0;

  constructor(config: PlatformLimiterConfig) {
    this.platformName = config.platformName;
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.limiter = new Bottleneck({
      reservoir: config.capacity,
      reservoirRefreshAmount: config.refillRate,
      reservoirRefreshInterval: config.refillIntervalMs,
      maxConcurrent: config.maxConcurrent ?? 5,
    });
    this.limiter.on("depleted", () => {
      this._totalThrottled++;
      logger.debug("rate_limiter_depleted", { platform: config.platformName });
    });
  }

  async waitForToken(): Promise<number> {
    this._totalRequests++;
    const start = Date.now();
    await this.limiter.schedule(() => Promise.resolve());
    return Date.now() - start;
  }

  get metrics() {
    return {
      platform: this.platformName,
      capacity: this.capacity,
      refillRate: this.refillRate,
      totalRequests: this._totalRequests,
      totalThrottled: this._totalThrottled,
    };
  }

  async stop(): Promise<void> {
    await this.limiter.stop({ dropWaitingJobs: false });
  }
}

// ─── Per-platform configs ──────────────────────────────────────────────────────────────
const PLATFORM_CONFIGS: Record<string, PlatformLimiterConfig> = {
  shopify:     { platformName: "Shopify",       capacity: 40,  refillRate: 2,   refillIntervalMs: 1000,   maxConcurrent: 4 },
  woocommerce: { platformName: "WooCommerce",   capacity: 25,  refillRate: 25,  refillIntervalMs: 1000,   maxConcurrent: 5 },
  amazon:      { platformName: "Amazon SP-API", capacity: 30,  refillRate: 15,  refillIntervalMs: 1000,   maxConcurrent: 5 },
  ebay:        { platformName: "eBay",          capacity: 100, refillRate: 58,  refillIntervalMs: 10000,  maxConcurrent: 8 },
  etsy:        { platformName: "Etsy",          capacity: 30,  refillRate: 10,  refillIntervalMs: 1000,   maxConcurrent: 4 },
  tiktok_shop: { platformName: "TikTok Shop",   capacity: 50,  refillRate: 10,  refillIntervalMs: 1000,   maxConcurrent: 5 },
  walmart:     { platformName: "Walmart",       capacity: 20,  refillRate: 5,   refillIntervalMs: 1000,   maxConcurrent: 3 },
  meta:        { platformName: "Meta",          capacity: 50,  refillRate: 200, refillIntervalMs: 60000,  maxConcurrent: 5 },
  instagram:   { platformName: "Instagram",     capacity: 50,  refillRate: 200, refillIntervalMs: 60000,  maxConcurrent: 5 },
  tiktok:      { platformName: "TikTok",        capacity: 30,  refillRate: 100, refillIntervalMs: 60000,  maxConcurrent: 4 },
  twitter:     { platformName: "Twitter/X",     capacity: 15,  refillRate: 15,  refillIntervalMs: 900000, maxConcurrent: 2 },
  pinterest:   { platformName: "Pinterest",     capacity: 30,  refillRate: 100, refillIntervalMs: 60000,  maxConcurrent: 4 },
  google_ads:  { platformName: "Google Ads",    capacity: 30,  refillRate: 100, refillIntervalMs: 60000,  maxConcurrent: 4 },
  youtube:     { platformName: "YouTube",       capacity: 30,  refillRate: 100, refillIntervalMs: 60000,  maxConcurrent: 4 },
};

// Singleton map of Bottleneck-backed platform limiters
const limiters = new Map<string, PlatformLimiter>(
  Object.entries(PLATFORM_CONFIGS).map(([key, cfg]) => [key, new PlatformLimiter(cfg)])
);

/**
 * Get the Bottleneck-backed rate limiter for a platform.
 * Falls back to a conservative default for unknown platforms.
 */
export function getBucket(platform: string): PlatformLimiter {
  const normalized = platform.toLowerCase().replace(/[\s-]/g, "_");
  if (limiters.has(normalized)) return limiters.get(normalized)!;
  const fallbackKey = `_default_${normalized}`;
  if (!limiters.has(fallbackKey)) {
    limiters.set(
      fallbackKey,
      new PlatformLimiter({ platformName: platform, capacity: 10, refillRate: 5, refillIntervalMs: 1000, maxConcurrent: 2 })
    );
  }
  return limiters.get(fallbackKey)!;
}

/**
 * Get metrics for all configured platform limiters.
 */
export function getAllBucketMetrics() {
  return Array.from(limiters.entries())
    .filter(([key]) => !key.startsWith("_default_"))
    .map(([, limiter]) => limiter.metrics);
}

// Legacy export: platformBuckets maps to PlatformLimiter instances
export const platformBuckets = Object.fromEntries(limiters);
