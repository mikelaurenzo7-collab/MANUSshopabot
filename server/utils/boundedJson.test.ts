/**
 * boundedJsonBlob — schema-bound JSON config blobs.
 *
 * Replaces the loose `z.any()` and `z.record(z.string(), z.any())`
 * patterns scattered across mutation inputs. Each blob now bounds:
 *   - Top-level key count (default 200)
 *   - Serialized byte size (default 50KB)
 *
 * Without these caps, an attacker (or a runaway LLM) could plant a
 * 100MB JSON blob into `config` / `input` / `metadata` fields,
 * bloating storage rows and slowing every read of that row.
 */
import { describe, expect, it } from "vitest";
import {
  boundedJsonBlob,
  __testInternals,
} from "./boundedJson";

describe("boundedJsonBlob — happy path", () => {
  it("accepts a typical small config object", () => {
    const schema = boundedJsonBlob();
    const result = schema.safeParse({
      strategy: "competitor_match",
      targetMargin: 0.35,
      excludeTags: ["clearance", "demo"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts the empty object", () => {
    const schema = boundedJsonBlob();
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("accepts deeply-nested but small structures (no depth cap)", () => {
    const schema = boundedJsonBlob();
    const deep = { a: { b: { c: { d: { e: { f: { g: "x" } } } } } } };
    expect(schema.safeParse(deep).success).toBe(true);
  });
});

describe("boundedJsonBlob — rejection cases", () => {
  it("rejects strings (must be an object)", () => {
    const schema = boundedJsonBlob();
    expect(schema.safeParse("hello").success).toBe(false);
  });

  it("rejects numbers / booleans / arrays at the top level", () => {
    const schema = boundedJsonBlob();
    expect(schema.safeParse(42).success).toBe(false);
    expect(schema.safeParse(true).success).toBe(false);
    expect(schema.safeParse(["a", "b"]).success).toBe(false);
  });

  it("rejects objects exceeding the top-level key cap", () => {
    const schema = boundedJsonBlob({ maxTopLevelKeys: 10 });
    const tooManyKeys: Record<string, number> = {};
    for (let i = 0; i < 11; i++) tooManyKeys[`k${i}`] = i;
    const result = schema.safeParse(tooManyKeys);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("top-level keys");
    }
  });

  it("rejects objects exceeding the serialized byte cap", () => {
    const schema = boundedJsonBlob({ maxBytes: 200 });
    const bigValue = "x".repeat(500);
    const result = schema.safeParse({ data: bigValue });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("bytes");
    }
  });

  it("default 50KB byte cap rejects a 100KB plant", () => {
    const schema = boundedJsonBlob();
    const massive = "x".repeat(100_000);
    expect(schema.safeParse({ payload: massive }).success).toBe(false);
  });
});

describe("boundedJsonBlob — exposed defaults", () => {
  it("exposes the documented defaults so callers can reason about them", () => {
    expect(__testInternals.DEFAULT_MAX_BLOB_BYTES).toBe(50_000);
    expect(__testInternals.DEFAULT_MAX_TOP_LEVEL_KEYS).toBe(200);
  });
});
