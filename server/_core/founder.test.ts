/**
 * Tests for the centralized founder bypass.
 *
 * Locks in the contract that:
 *   - Default allowlist matches the historical hardcoded emails so the
 *     migration is behavior-preserving.
 *   - FOUNDER_EMAILS env var overrides the default (comma-separated).
 *   - Comparison is case-insensitive.
 *   - Empty / null / undefined inputs return false safely.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("isFounderEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FOUNDER_EMAILS;
  });
  afterEach(() => {
    delete process.env.FOUNDER_EMAILS;
    vi.resetModules();
  });

  it("recognizes the historical default emails", async () => {
    const { isFounderEmail } = await import("./founder");
    expect(isFounderEmail("mlaurenzo8@gmail.com")).toBe(true);
    expect(isFounderEmail("mikelaurenzo7@gmail.com")).toBe(true);
  });

  it("is case-insensitive", async () => {
    const { isFounderEmail } = await import("./founder");
    expect(isFounderEmail("MLaurenzo8@Gmail.com")).toBe(true);
    expect(isFounderEmail("MIKELAURENZO7@GMAIL.COM")).toBe(true);
  });

  it("returns false for non-founder emails", async () => {
    const { isFounderEmail } = await import("./founder");
    expect(isFounderEmail("attacker@example.com")).toBe(false);
    expect(isFounderEmail("notfounder+tag@gmail.com")).toBe(false);
  });

  it("safely handles null / undefined / empty input", async () => {
    const { isFounderEmail } = await import("./founder");
    expect(isFounderEmail(null)).toBe(false);
    expect(isFounderEmail(undefined)).toBe(false);
    expect(isFounderEmail("")).toBe(false);
  });

  it("uses FOUNDER_EMAILS env var when set, replacing defaults", async () => {
    process.env.FOUNDER_EMAILS = "alice@x.com, bob@x.com";
    const { isFounderEmail } = await import("./founder");
    expect(isFounderEmail("alice@x.com")).toBe(true);
    expect(isFounderEmail("bob@x.com")).toBe(true);
    // Old defaults should NOT match once env override is active.
    expect(isFounderEmail("mlaurenzo8@gmail.com")).toBe(false);
  });

  it("trims whitespace in the comma-separated env list", async () => {
    process.env.FOUNDER_EMAILS = "  spaced@x.com   ,  another@x.com  ";
    const { isFounderEmail } = await import("./founder");
    expect(isFounderEmail("spaced@x.com")).toBe(true);
    expect(isFounderEmail("another@x.com")).toBe(true);
  });
});
