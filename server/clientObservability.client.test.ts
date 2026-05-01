/**
 * Client-side observability lib unit tests — pure-helper coverage
 * (clip, rate). The rest of the lib (reportError → sendBeacon, the
 * PerformanceObserver wiring) needs a browser environment to exercise
 * meaningfully and is covered indirectly by the server endpoint tests
 * + manual smoke testing.
 *
 * Lives under server/ so vitest's existing `server/**.test.ts` glob
 * picks it up without adding a jsdom environment dep.
 */
import { describe, expect, it } from "vitest";
import { __testInternals } from "../client/src/lib/clientObservability";

const { clip, rate } = __testInternals;

describe("clientObservability — clip()", () => {
  it("returns undefined for non-strings (number, null, undefined, object)", () => {
    expect(clip(42, 100)).toBeUndefined();
    expect(clip(null, 100)).toBeUndefined();
    expect(clip(undefined, 100)).toBeUndefined();
    expect(clip({ a: 1 }, 100)).toBeUndefined();
  });

  it("returns undefined for the empty string (the server treats it as missing)", () => {
    expect(clip("", 100)).toBeUndefined();
  });

  it("returns the original string when shorter than the cap", () => {
    expect(clip("hello", 100)).toBe("hello");
  });

  it("truncates strings at exactly `max` characters when over the cap", () => {
    const long = "x".repeat(2_500);
    const out = clip(long, 2_000);
    expect(out).toBeDefined();
    expect(out!.length).toBe(2_000);
  });
});

describe("clientObservability — rate()", () => {
  it("returns the documented LCP thresholds (good ≤2500ms, poor >4000ms)", () => {
    expect(rate("LCP", 1_000)).toBe("good");
    expect(rate("LCP", 2_500)).toBe("good");
    expect(rate("LCP", 3_000)).toBe("needs-improvement");
    expect(rate("LCP", 5_000)).toBe("poor");
  });

  it("returns the documented CLS thresholds (good ≤0.1, poor >0.25)", () => {
    expect(rate("CLS", 0.05)).toBe("good");
    expect(rate("CLS", 0.1)).toBe("good");
    expect(rate("CLS", 0.2)).toBe("needs-improvement");
    expect(rate("CLS", 0.4)).toBe("poor");
  });

  it("returns the documented INP thresholds (good ≤200ms, poor >500ms)", () => {
    expect(rate("INP", 100)).toBe("good");
    expect(rate("INP", 200)).toBe("good");
    expect(rate("INP", 350)).toBe("needs-improvement");
    expect(rate("INP", 800)).toBe("poor");
  });

  it("returns the documented FCP and TTFB ratings", () => {
    expect(rate("FCP", 1_500)).toBe("good");
    expect(rate("FCP", 2_500)).toBe("needs-improvement");
    expect(rate("FCP", 3_500)).toBe("poor");
    expect(rate("TTFB", 600)).toBe("good");
    expect(rate("TTFB", 1_500)).toBe("needs-improvement");
    expect(rate("TTFB", 2_000)).toBe("poor");
  });

  it("returns undefined for unknown vital names", () => {
    expect(rate("MADE_UP", 100)).toBeUndefined();
  });
});

describe("clientObservability — caps are tight enough to bound the wire payload", () => {
  it("MAX_MESSAGE / MAX_STACK are within sane budgets for log ingestion", () => {
    expect(__testInternals.MAX_MESSAGE).toBeLessThanOrEqual(2_000);
    expect(__testInternals.MAX_STACK).toBeLessThanOrEqual(8_000);
  });
});
