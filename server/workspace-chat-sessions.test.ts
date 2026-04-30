/**
 * Workspace chat session helper tests.
 *
 * The full DB-backed session lifecycle is exercised in integration. Here
 * we cover the title-derivation rules so the auto-naming logic that powers
 * the Claude-Code-style sidebar stays predictable.
 */

import { describe, it, expect } from "vitest";
import { deriveSessionTitle } from "./db";

describe("deriveSessionTitle", () => {
  it("returns 'New chat' for empty input", () => {
    expect(deriveSessionTitle("")).toBe("New chat");
    expect(deriveSessionTitle("   \n\t  ")).toBe("New chat");
  });

  it("returns short messages verbatim", () => {
    expect(deriveSessionTitle("Fix shipping rules")).toBe("Fix shipping rules");
  });

  it("collapses whitespace", () => {
    expect(deriveSessionTitle("  Draft a   holiday\ncampaign  ")).toBe(
      "Draft a holiday campaign",
    );
  });

  it("uses the first sentence when it's short enough", () => {
    expect(
      deriveSessionTitle("Plan a launch. Then estimate the ad budget for next week."),
    ).toBe("Plan a launch");
  });

  it("truncates long messages at a word boundary with an ellipsis", () => {
    const long =
      "I want to research the top trending products on TikTok this week and turn the best three into a holiday landing-page test";
    const title = deriveSessionTitle(long);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(61);
    // Should not split mid-word (the visible content before "…" should
    // not end with a space, and should end on a complete word).
    const visible = title.replace("…", "");
    expect(visible.endsWith(" ")).toBe(false);
    expect(visible.length).toBeGreaterThan(30);
  });

  it("never produces a title longer than 61 characters", () => {
    const veryLong = "abcdefghij ".repeat(20);
    expect(deriveSessionTitle(veryLong).length).toBeLessThanOrEqual(61);
  });
});
