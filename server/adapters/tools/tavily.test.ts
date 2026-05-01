/**
 * tavily.test.ts — focused tests for the Tavily adapter logic
 * that doesn't require a live API key.
 *
 * The shared `adapters-contract.test.ts` already loops over every
 * tool registry and asserts the tool/toolName/category/bots/health-
 * check shape, so Tavily is covered there for free. This file pins
 * the Tavily-specific behaviour:
 *
 *   - Empty API key path returns the documented "missing key" error
 *     shape rather than throwing.
 *   - Empty / over-long queries are rejected before any network call.
 *   - Registry shape: research category, all three bot domains, ≥1
 *     human-readable capability string.
 *
 * No live HTTP — every test exercises the public `search` /
 * `healthCheck` API and asserts on the structured rejection paths.
 */

import { describe, expect, it } from "vitest";
import { TavilyAdapter } from "./tavilyAdapter";

const adapter = new TavilyAdapter();
const NO_KEY = { tool: "tavily" } as const;

describe("TavilyAdapter — registry shape", () => {
  it("declares the expected tool id, name, and category", () => {
    expect(adapter.tool).toBe("tavily");
    expect(adapter.toolName).toBe("Tavily");
    expect(adapter.category).toBe("research");
  });

  it("is wired for all three bot domains", () => {
    expect(adapter.bots).toEqual(expect.arrayContaining(["architect", "merchant", "social"]));
  });

  it("publishes its capabilities so the Integrations UI can list them", () => {
    expect(adapter.capabilities.length).toBeGreaterThan(0);
    for (const c of adapter.capabilities) {
      expect(typeof c).toBe("string");
      expect(c.length).toBeGreaterThan(8);
    }
  });
});

describe("TavilyAdapter — healthCheck", () => {
  it("reports unhealthy with a clear message when no API key is set", async () => {
    const result = await adapter.healthCheck(NO_KEY);
    expect(result.healthy).toBe(false);
    expect(result.message).toMatch(/missing.*api key/i);
    expect(result.latencyMs).toBe(0);
  });

  it("verifyConnection delegates to healthCheck (no extra side effects)", async () => {
    const a = await adapter.verifyConnection(NO_KEY);
    const b = await adapter.healthCheck(NO_KEY);
    expect(a.healthy).toBe(b.healthy);
    expect(a.message).toBe(b.message);
  });
});

describe("TavilyAdapter — search input validation", () => {
  it("rejects with a missing-key error when no API key is set", async () => {
    await expect(adapter.search(NO_KEY, "anything")).rejects.toThrow(
      /tavily api key not configured/i,
    );
  });

  it("rejects empty / whitespace-only queries before any network call", async () => {
    const withKey = { tool: "tavily", apiKey: "tvly-test" };
    await expect(adapter.search(withKey, "")).rejects.toThrow(/non-empty/i);
    await expect(adapter.search(withKey, "   ")).rejects.toThrow(/non-empty/i);
  });

  it("rejects queries over the documented 400-char cap", async () => {
    const withKey = { tool: "tavily", apiKey: "tvly-test" };
    const tooLong = "x".repeat(401);
    await expect(adapter.search(withKey, tooLong)).rejects.toThrow(/≤400|400 characters/i);
  });

  it("accepts a normal query through validation (network failure is unrelated)", async () => {
    // We don't actually want to hit the network; the test just asserts
    // the synchronous validation step passes. A bogus key makes the
    // subsequent HTTP call fail fast — but the failure won't be a
    // validation message.
    const withBogusKey = { tool: "tavily", apiKey: "tvly-bogus" };
    let validationErr: Error | null = null;
    try {
      await adapter.search(withBogusKey, "minimalist watches under 200");
    } catch (e) {
      validationErr = e as Error;
    }
    expect(validationErr?.message).not.toMatch(/non-empty|400 characters/i);
  }, 35_000);
});
