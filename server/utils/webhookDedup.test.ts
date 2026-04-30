/**
 * webhookDedup.test.ts — three-state webhook dedup contract.
 *
 * The legacy implementation marked a webhook key as "seen" on the way
 * IN and never re-evaluated it. That meant any failure between the
 * mark and the actual side effect (DB write, workflow launch, …) was
 * permanently invisible to vendor retries within the 5-minute TTL —
 * the order would just disappear from our system. This file pins the
 * fix.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { WebhookDedup } from "./webhookDedup";

class Clock {
  now: number;
  constructor(start = 1_000_000) {
    this.now = start;
  }
  read = () => this.now;
  advance(ms: number) {
    this.now += ms;
  }
}

describe("WebhookDedup", () => {
  let clock: Clock;
  let dedup: WebhookDedup;

  beforeEach(() => {
    clock = new Clock();
    dedup = new WebhookDedup({ now: clock.read });
  });

  it("first claim wins; immediate second claim sees in_flight", () => {
    expect(dedup.tryClaim("k1")).toBe("claim");
    expect(dedup.tryClaim("k1")).toBe("in_flight");
  });

  it("after markCompleted, subsequent claims see completed", () => {
    expect(dedup.tryClaim("k1")).toBe("claim");
    dedup.markCompleted("k1");
    expect(dedup.tryClaim("k1")).toBe("completed");
  });

  it("after releaseClaim (failure path), the next claim wins again", () => {
    expect(dedup.tryClaim("k1")).toBe("claim");
    dedup.releaseClaim("k1");
    // This is the headline behaviour — the vendor's next retry can now
    // reach the work, where the legacy mark-on-entry pattern would have
    // returned "duplicate" and silently dropped the retry.
    expect(dedup.tryClaim("k1")).toBe("claim");
  });

  it("releaseClaim is idempotent and never disturbs a completed entry", () => {
    expect(dedup.tryClaim("k1")).toBe("claim");
    dedup.markCompleted("k1");
    dedup.releaseClaim("k1"); // no-op — should not undo completion
    expect(dedup.tryClaim("k1")).toBe("completed");
    // releaseClaim on an unknown key must not throw or grow state
    expect(() => dedup.releaseClaim("never-seen")).not.toThrow();
    expect(dedup.size()).toBe(1);
  });

  it("a completed entry expires after completedTtlMs and can be re-claimed", () => {
    const TTL = 5 * 60 * 1000;
    const d = new WebhookDedup({ now: clock.read, completedTtlMs: TTL });
    expect(d.tryClaim("k1")).toBe("claim");
    d.markCompleted("k1");
    clock.advance(TTL - 1);
    expect(d.tryClaim("k1")).toBe("completed");
    clock.advance(2);
    // TTL elapsed — vendor retry beyond the window should re-process.
    expect(d.tryClaim("k1")).toBe("claim");
  });

  it("a stale in_flight claim is treated as crashed after inFlightMaxMs", () => {
    const MAX = 60 * 1000;
    const d = new WebhookDedup({ now: clock.read, inFlightMaxMs: MAX });
    expect(d.tryClaim("k1")).toBe("claim");
    clock.advance(MAX - 1);
    // Still in flight — concurrent retry should skip.
    expect(d.tryClaim("k1")).toBe("in_flight");
    clock.advance(2);
    // Past the max — assume the worker crashed, allow re-claim.
    expect(d.tryClaim("k1")).toBe("claim");
  });

  it("prune() drops expired entries and returns the count", () => {
    const d = new WebhookDedup({
      now: clock.read,
      completedTtlMs: 1000,
      inFlightMaxMs: 500,
    });
    d.tryClaim("a");
    d.markCompleted("a");
    d.tryClaim("b"); // in_flight
    expect(d.size()).toBe(2);
    clock.advance(800); // past in_flight, not past completed
    expect(d.prune()).toBe(1);
    expect(d.size()).toBe(1);
    clock.advance(400); // total 1200, past completed
    expect(d.prune()).toBe(1);
    expect(d.size()).toBe(0);
  });

  it("evicts the oldest entry when maxEntries is hit (fail-open)", () => {
    const d = new WebhookDedup({ now: clock.read, maxEntries: 3 });
    d.tryClaim("a");
    d.tryClaim("b");
    d.tryClaim("c");
    expect(d.size()).toBe(3);
    // Adding a 4th evicts the oldest ("a").
    d.tryClaim("d");
    expect(d.size()).toBe(3);
    // "a" should be re-claimable (state was dropped).
    expect(d.tryClaim("a")).toBe("claim");
    // "b", "c", "d" were the survivors — but adding "a" evicted "b"
    // (oldest of remaining), so "b" is also re-claimable now.
    expect(d.tryClaim("b")).toBe("claim");
  });

  it("clear() drops all state", () => {
    dedup.tryClaim("k1");
    dedup.markCompleted("k1");
    dedup.tryClaim("k2");
    expect(dedup.size()).toBe(2);
    dedup.clear();
    expect(dedup.size()).toBe(0);
    expect(dedup.tryClaim("k1")).toBe("claim");
  });

  it("the recovery story: claim → fail → vendor retry succeeds", () => {
    // Round 1 — vendor delivers, our handler crashes mid-flight.
    expect(dedup.tryClaim("order:42")).toBe("claim");
    // Simulated failure — the dispatcher releases the claim:
    dedup.releaseClaim("order:42");

    // Round 2 — vendor retries (5s later in the real world). The
    // legacy mark-on-entry pattern would have returned "in_flight" or
    // "completed" here and SILENTLY DROPPED the retry. The new
    // contract correctly re-issues the claim.
    clock.advance(5_000);
    expect(dedup.tryClaim("order:42")).toBe("claim");

    // This time the handler succeeds.
    dedup.markCompleted("order:42");
    expect(dedup.tryClaim("order:42")).toBe("completed");
  });
});
