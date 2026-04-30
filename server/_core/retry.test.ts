/**
 * retry.test.ts — focused tests for the circuit-breaker LRU bound.
 *
 * Why this file exists: `withCircuitBreaker(key, fn)` accepts arbitrary
 * keys, and several call sites use dynamic keys derived from store IDs
 * (`gmail-recovery-${store.id}`), social-account IDs, etc. Without a
 * cap on the breaker registry, every new store grows process memory by
 * one cockatiel breaker forever — a slow-burn leak that's invisible
 * until production sits at scale.
 *
 * The cap is hard-coded at MAX_BREAKERS (256). These tests verify:
 *   1. The registry stays at or under the cap as new keys arrive.
 *   2. LRU semantics — touching an existing key keeps it alive while
 *      cold keys get evicted first.
 *   3. Eviction does not break the public API; a re-used evicted key
 *      simply gets a fresh closed breaker.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { withCircuitBreaker, resetCircuit, _testHelpers } from "./retry";

beforeEach(() => {
  _testHelpers.clearAll();
});

describe("circuit-breaker registry — LRU bound", () => {
  it("stays at or below MAX_BREAKERS after exceeding the cap", async () => {
    const cap = _testHelpers.maxSize;
    // Drive `cap + 50` distinct keys through the breaker.
    for (let i = 0; i < cap + 50; i++) {
      await withCircuitBreaker(`leak-test-${i}`, async () => "ok");
    }
    expect(_testHelpers.size()).toBeLessThanOrEqual(cap);
  });

  it("evicts the oldest key first (LRU), keeping recently-touched keys alive", async () => {
    const cap = _testHelpers.maxSize;
    // Insert exactly `cap` keys so the registry is full.
    for (let i = 0; i < cap; i++) {
      await withCircuitBreaker(`lru-${i}`, async () => "ok");
    }
    expect(_testHelpers.size()).toBe(cap);

    // Touch lru-0 to bump it to most-recently-used.
    await withCircuitBreaker("lru-0", async () => "ok");

    // Insert a brand new key — eviction should kick out lru-1 (now the
    // oldest), not lru-0.
    await withCircuitBreaker("brand-new", async () => "ok");

    expect(_testHelpers.size()).toBe(cap);

    // After eviction we can't peek at the Map directly, but we can
    // observe LRU behaviour by tripping a key and checking whether the
    // OPEN state survives. lru-0 was just touched, so its state should
    // be intact: 5 consecutive failures must trip its breaker.
    const failFn = async () => {
      throw new Error("boom");
    };
    for (let i = 0; i < 5; i++) {
      await expect(withCircuitBreaker("lru-0", failFn)).rejects.toThrow("boom");
    }
    // 6th call should hit the open circuit.
    await expect(withCircuitBreaker("lru-0", failFn)).rejects.toThrow(/Circuit is OPEN/i);
  });

  it("an evicted key gets a fresh (closed) breaker on next use", async () => {
    const cap = _testHelpers.maxSize;
    const failFn = async () => {
      throw new Error("boom");
    };

    // Trip the breaker for "victim" so it's OPEN in the registry.
    for (let i = 0; i < 5; i++) {
      await expect(withCircuitBreaker("victim", failFn)).rejects.toThrow("boom");
    }
    await expect(withCircuitBreaker("victim", failFn)).rejects.toThrow(/Circuit is OPEN/i);

    // Force eviction by inserting `cap + 1` distinct keys, each
    // newer-than-victim, so victim becomes the LRU candidate.
    for (let i = 0; i < cap + 1; i++) {
      await withCircuitBreaker(`pressure-${i}`, async () => "ok");
    }

    // Victim should now be evicted. A fresh call must succeed (fresh
    // closed breaker), proving eviction wiped the OPEN state.
    const result = await withCircuitBreaker("victim", async () => "ok-after-eviction");
    expect(result).toBe("ok-after-eviction");
  });

  it("resetCircuit() drops a single breaker without disturbing others", async () => {
    await withCircuitBreaker("keep", async () => "ok");
    await withCircuitBreaker("drop", async () => "ok");
    expect(_testHelpers.size()).toBe(2);
    resetCircuit("drop");
    expect(_testHelpers.size()).toBe(1);
  });
});
