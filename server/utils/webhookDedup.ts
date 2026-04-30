/**
 * webhookDedup.ts — three-state webhook deduplication.
 *
 * Vendors (Shopify, Etsy, …) deliver webhooks at-least-once: if our
 * server doesn't 200 within ~5s the vendor retries, sometimes for days.
 * The naive dedup pattern is "mark the key as seen on the way in" —
 * but if the work then fails, future retries are silently dropped and
 * the side effect (order created, fulfilled, …) never happens.
 *
 * This helper splits the dedup state into three buckets:
 *
 *   - **unseen**     — never claimed; the next call wins the claim.
 *   - **in_flight**  — currently being processed; concurrent retries
 *                      from the vendor (or duplicate dispatchers in
 *                      the same process) should skip while the first
 *                      worker is running. Stale claims older than
 *                      `IN_FLIGHT_MAX_MS` are treated as crashed and
 *                      can be re-claimed.
 *   - **completed**  — already processed successfully; retries should
 *                      skip, up to `COMPLETED_TTL_MS` after which the
 *                      entry is GC'd.
 *
 * On failure the caller calls `releaseClaim(key)` so the next retry
 * reaches the work — the legacy mark-on-entry pattern dropped those
 * retries silently and depended on the in-process DLQ to recover.
 *
 * The map is bounded by `MAX_ENTRIES`. When the cap is hit we evict
 * the oldest entry (insertion order via Map) — same fail-open
 * semantics as the circuit-breaker registry.
 */

export type ClaimResult = "claim" | "in_flight" | "completed";

interface Entry {
  state: "in_flight" | "completed";
  /** ms since epoch when the state was last set */
  ts: number;
}

export interface WebhookDedupOptions {
  /** Max distinct keys held in memory. Defaults to 10_000. */
  maxEntries?: number;
  /** How long a `completed` entry survives before eviction. Defaults
   *  to 5 minutes — matches Shopify's typical retry burst window. */
  completedTtlMs?: number;
  /** How long an `in_flight` claim is honoured before being treated as
   *  crashed and re-claimed. Defaults to 60s — long enough for any
   *  reasonable webhook handler, short enough that a crashed worker's
   *  claim doesn't permanently block retries. */
  inFlightMaxMs?: number;
  /** Override `Date.now` for tests. */
  now?: () => number;
}

const DEFAULTS = {
  maxEntries: 10_000,
  completedTtlMs: 5 * 60 * 1000,
  inFlightMaxMs: 60 * 1000,
  now: Date.now,
} as const satisfies Required<WebhookDedupOptions>;

export class WebhookDedup {
  private readonly opts: Required<WebhookDedupOptions>;
  private readonly entries = new Map<string, Entry>();

  constructor(options: WebhookDedupOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Try to claim a key for processing. */
  tryClaim(key: string): ClaimResult {
    const now = this.opts.now();
    const entry = this.entries.get(key);
    if (entry) {
      if (entry.state === "completed") {
        if (now - entry.ts < this.opts.completedTtlMs) return "completed";
        // Otherwise: TTL expired, fall through and allow re-claim.
      } else if (entry.state === "in_flight") {
        if (now - entry.ts < this.opts.inFlightMaxMs) return "in_flight";
        // Otherwise: stale claim (worker presumably crashed), allow re-claim.
      }
    }
    this.evictIfFull();
    this.entries.set(key, { state: "in_flight", ts: now });
    return "claim";
  }

  /** Mark a successful completion. Subsequent claims within the
   *  completed TTL return `"completed"`. */
  markCompleted(key: string): void {
    this.entries.set(key, { state: "completed", ts: this.opts.now() });
  }

  /** Release a failed claim. Next retry from the vendor (or in-process
   *  retry loop) will be allowed to re-attempt. Idempotent. */
  releaseClaim(key: string): void {
    const entry = this.entries.get(key);
    if (entry?.state === "in_flight") this.entries.delete(key);
  }

  /** Sweep entries whose TTL has elapsed. Cheap to call from a
   *  timer; the loop is bounded by `entries.size`. */
  prune(): number {
    const now = this.opts.now();
    let removed = 0;
    for (const [key, entry] of Array.from(this.entries.entries())) {
      const ttl =
        entry.state === "completed" ? this.opts.completedTtlMs : this.opts.inFlightMaxMs;
      if (now - entry.ts > ttl) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** For introspection / tests. */
  size(): number {
    return this.entries.size;
  }

  /** Reset state — useful in tests / admin recovery. */
  clear(): void {
    this.entries.clear();
  }

  private evictIfFull(): void {
    if (this.entries.size < this.opts.maxEntries) return;
    const oldest = this.entries.keys().next();
    if (!oldest.done && oldest.value !== undefined) this.entries.delete(oldest.value);
  }
}
