/**
 * Tests for the LLM helper utilities (parseLLMJson, sanitizeRedisUrl).
 *
 * These pin the invariants that production code relies on — clean error
 * messages from malformed LLM JSON and credential-stripped Redis URLs in
 * health responses.
 */
import { describe, it, expect } from "vitest";
import { parseLLMJson } from "./llm";
import { sanitizeRedisUrl } from "../queue/config";

describe("parseLLMJson", () => {
  it("parses well-formed JSON content", () => {
    const result = parseLLMJson<{ a: number }>('{"a":1}');
    expect(result).toEqual({ a: 1 });
  });

  it("includes the label and a snippet on parse failure", () => {
    const bad = '{"oops": "no closing bra';
    expect(() => parseLLMJson(bad, "social.adCopy")).toThrow(/social\.adCopy/);
    expect(() => parseLLMJson(bad, "social.adCopy")).toThrow(/no closing bra/);
  });

  it("rejects non-string content with a clear message", () => {
    // @ts-expect-error — exercising the runtime guard
    expect(() => parseLLMJson(undefined, "merchant.x")).toThrow(/expected string/);
    // @ts-expect-error
    expect(() => parseLLMJson({ already: "parsed" }, "merchant.x")).toThrow(/expected string/);
  });

  it("truncates long snippets to keep error messages bounded", () => {
    const huge = "garbage" + "x".repeat(5000);
    try {
      parseLLMJson(huge, "architect.foo");
      throw new Error("expected throw");
    } catch (err: any) {
      // Snippet is capped at 200 chars — overall message stays small.
      expect(err.message.length).toBeLessThan(600);
    }
  });
});

describe("sanitizeRedisUrl", () => {
  it("strips username + password from a credentialed URL", () => {
    expect(
      sanitizeRedisUrl("redis://default:supersecret@redis.example.com:6379"),
    ).toBe("redis://redis.example.com:6379");
  });

  it("preserves rediss:// (TLS) scheme and default port", () => {
    expect(sanitizeRedisUrl("rediss://user:pw@cache.internal")).toBe(
      "rediss://cache.internal:6380",
    );
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeRedisUrl("")).toBe("");
    expect(sanitizeRedisUrl(undefined)).toBe("");
    expect(sanitizeRedisUrl(null)).toBe("");
  });

  it("returns a sentinel for unparseable input rather than echoing it", () => {
    expect(sanitizeRedisUrl("this is not a url")).toBe("redis://[unparseable]");
  });

  it("never includes the password substring in its output", () => {
    const out = sanitizeRedisUrl(
      "redis://default:correct-horse-battery-staple@host:6379",
    );
    expect(out).not.toContain("correct-horse-battery-staple");
    expect(out).not.toContain("default");
  });
});
