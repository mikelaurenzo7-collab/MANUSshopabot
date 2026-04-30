/**
 * rateLimiter.test.ts — `withRetry` and `ApiRateLimiter` behaviour.
 *
 * The retry helper guards every adapter HTTP call against vendor 429s.
 * Wrong-by-one bugs (off-by-one retry counts, swallowed non-429 errors,
 * exponential explosion under jitter) all map to either lost data or
 * runaway request fan-out, so we pin the contract here.
 *
 * Vitest fake-timers run the backoff path synchronously — no real waits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withRetry, ApiRateLimiter } from "./rateLimiter";

// `withRetry` calls `setTimeout` between attempts; vi.useFakeTimers()
// lets us advance through the entire backoff schedule deterministically.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Drive the run-loop forward until the wrapped promise settles. The
 *  `withRetry` helper alternates `await fn()` and `await sleep(...)`,
 *  so we just keep flushing pending timers + microtasks until the
 *  promise resolves or rejects. */
async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: any }> {
  let result: { ok: true; value: T } | { ok: false; error: any } | null = null;
  p.then((value) => {
    result = { ok: true, value };
  }).catch((error) => {
    result = { ok: false, error };
  });
  // Up to 12 alternations should cover any maxRetries we use in tests.
  for (let i = 0; i < 12 && result === null; i++) {
    await vi.runAllTimersAsync();
  }
  if (result === null) throw new Error("test promise never settled — increase iteration cap");
  return result;
}

const make429 = () => Object.assign(new Error("Too Many Requests"), { response: { status: 429 } });
const make500 = () => Object.assign(new Error("Server Error"), { response: { status: 500 } });

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const r = await settle(withRetry(fn));
    expect(r).toEqual({ ok: true, value: "ok" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and eventually succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(make429()).mockResolvedValueOnce("ok");
    const r = await settle(withRetry(fn, { maxRetries: 3, initialDelayMs: 100, jitter: false }));
    expect(r).toEqual({ ok: true, value: "ok" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-429 errors", async () => {
    const fn = vi.fn().mockRejectedValue(make500());
    const r = await settle(withRetry(fn, { maxRetries: 3 }));
    expect(r.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries 429s and surfaces the last error", async () => {
    const fn = vi.fn().mockRejectedValue(make429());
    const r = await settle(withRetry(fn, { maxRetries: 2, initialDelayMs: 50, jitter: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("Too Many Requests");
    // Initial attempt + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("recognises 429 errors via err.status (no .response wrapper)", async () => {
    const status429 = Object.assign(new Error("rate limited"), { status: 429 });
    const fn = vi.fn().mockRejectedValueOnce(status429).mockResolvedValueOnce("ok");
    const r = await settle(withRetry(fn, { maxRetries: 1, initialDelayMs: 50, jitter: false }));
    expect(r.ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("recognises 429 errors via the message string ('rate limit')", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("API rate limit exceeded — try again later"))
      .mockResolvedValueOnce("ok");
    const r = await settle(withRetry(fn, { maxRetries: 1, initialDelayMs: 50, jitter: false }));
    expect(r.ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects a Retry-After header (in seconds)", async () => {
    const err = Object.assign(new Error("429"), {
      response: { status: 429, headers: { "retry-after": "2" } },
    });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("ok");
    const promise = withRetry(fn, { maxRetries: 1, initialDelayMs: 5000, jitter: false });

    // Drive the first attempt + reject path.
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    // Retry-After said 2s; less than that and the retry must NOT have fired.
    await vi.advanceTimersByTimeAsync(1500);
    expect(fn).toHaveBeenCalledTimes(1);
    // Past the 2s mark — retry now fires.
    await vi.advanceTimersByTimeAsync(1000);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("ApiRateLimiter", () => {
  it("allows calls under the limit without waiting", async () => {
    const limiter = new ApiRateLimiter(3, 1000);
    expect(limiter.check()).toBe(0);
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.check()).toBe(0);
  });

  it("returns the wait time once the window is full", async () => {
    const limiter = new ApiRateLimiter(2, 1000);
    await limiter.acquire();
    await limiter.acquire();
    const wait = limiter.check();
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(1000);
  });

  it("releases capacity after the window expires", async () => {
    const limiter = new ApiRateLimiter(2, 1000);
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.check()).toBeGreaterThan(0);
    // Advance past the window.
    vi.advanceTimersByTime(1100);
    expect(limiter.check()).toBe(0);
  });

  it("acquire() throttles when the window is saturated", async () => {
    const limiter = new ApiRateLimiter(1, 500);
    await limiter.acquire();
    const acquireP = limiter.acquire();
    let resolved = false;
    acquireP.then(() => {
      resolved = true;
    });
    // Right after — should NOT have resolved yet (throttling).
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).toBe(false);
    // Past the window — must resolve.
    await vi.advanceTimersByTimeAsync(500);
    await acquireP;
    expect(resolved).toBe(true);
  });
});
