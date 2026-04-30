/**
 * slug.test.ts — `insertWithSlugRetry`, `toSlug`, and the duplicate-key
 * predicate.
 *
 * The retry helper guards `createOrganization` (and any future caller)
 * against a TOCTOU race where two concurrent inserts pick the same
 * generated slug. The unit tests below pin the contract:
 *
 *   - First attempt uses the raw base slug (lets vanity URLs land
 *     unsuffixed when there's no collision).
 *   - Subsequent attempts append a `-<rand>` suffix.
 *   - Only `ER_DUP_ENTRY`-shaped errors trigger a retry; everything
 *     else propagates immediately so a connection-lost or schema
 *     error doesn't get silently retried up to its budget.
 *   - After `maxAttempts` consecutive duplicates, throws with a
 *     descriptive message.
 *   - Total slug length is capped at 80 chars so the suffix never
 *     overflows the column width on the source-of-truth DB schema.
 */

import { describe, expect, it, vi } from "vitest";
import {
  insertWithSlugRetry,
  isMysqlDuplicateKeyError,
  randomSuffix,
  toSlug,
} from "./slug";

const dupErr = (): Error => Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });

describe("toSlug", () => {
  it("lowercases, replaces non-alphanumerics with dashes, trims", () => {
    expect(toSlug("Acme  Corp!", "fb")).toBe("acme-corp");
  });

  it("falls back when the input slugifies to empty", () => {
    expect(toSlug("!!!", "user-7")).toBe("user-7");
    expect(toSlug("", "user-7")).toBe("user-7");
  });

  it("caps at 60 characters", () => {
    const long = "a".repeat(80);
    expect(toSlug(long, "fb")).toBe("a".repeat(60));
  });

  it("strips leading/trailing dashes", () => {
    expect(toSlug("---hello---", "fb")).toBe("hello");
  });
});

describe("isMysqlDuplicateKeyError", () => {
  it("matches the canonical MySQL error code", () => {
    expect(isMysqlDuplicateKeyError({ code: "ER_DUP_ENTRY" })).toBe(true);
  });

  it("rejects other error codes", () => {
    expect(isMysqlDuplicateKeyError({ code: "ER_LOCK_WAIT_TIMEOUT" })).toBe(false);
    expect(isMysqlDuplicateKeyError(new Error("connection lost"))).toBe(false);
    expect(isMysqlDuplicateKeyError(null)).toBe(false);
    expect(isMysqlDuplicateKeyError(undefined)).toBe(false);
  });
});

describe("randomSuffix", () => {
  it("returns 6 hex characters", () => {
    expect(randomSuffix()).toMatch(/^[0-9a-f]{6}$/);
  });

  it("is non-deterministic across calls", () => {
    const a = randomSuffix();
    const b = randomSuffix();
    // Crypto-random; collision probability is ~1/16M per pair.
    expect(a).not.toBe(b);
  });
});

describe("insertWithSlugRetry", () => {
  it("uses the base slug on first success — no suffix when no collision", async () => {
    const insert = vi.fn().mockResolvedValueOnce(42);
    const { slug, result } = await insertWithSlugRetry(
      insert,
      isMysqlDuplicateKeyError,
      { baseSlug: "acme" },
    );
    expect(slug).toBe("acme");
    expect(result).toBe(42);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenNthCalledWith(1, "acme");
  });

  it("appends a suffix on a duplicate-key collision and retries", async () => {
    const insert = vi
      .fn()
      .mockRejectedValueOnce(dupErr())
      .mockResolvedValueOnce(99);
    const { slug, result } = await insertWithSlugRetry(
      insert,
      isMysqlDuplicateKeyError,
      { baseSlug: "acme", randomSuffix: () => "abcdef" },
    );
    expect(slug).toBe("acme-abcdef");
    expect(result).toBe(99);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenNthCalledWith(1, "acme");
    expect(insert).toHaveBeenNthCalledWith(2, "acme-abcdef");
  });

  it("uses a fresh suffix on each retry — no stuck-on-bad-suffix loop", async () => {
    const suffixes = ["aaaaaa", "bbbbbb", "cccccc"];
    let i = 0;
    const insert = vi
      .fn()
      .mockRejectedValueOnce(dupErr())
      .mockRejectedValueOnce(dupErr())
      .mockResolvedValueOnce(7);
    const { slug } = await insertWithSlugRetry(
      insert,
      isMysqlDuplicateKeyError,
      { baseSlug: "acme", randomSuffix: () => suffixes[i++]! },
    );
    expect(slug).toBe("acme-bbbbbb");
    expect(insert).toHaveBeenNthCalledWith(2, "acme-aaaaaa");
    expect(insert).toHaveBeenNthCalledWith(3, "acme-bbbbbb");
  });

  it("propagates non-duplicate errors immediately without retrying", async () => {
    const insert = vi.fn().mockRejectedValueOnce(new Error("connection refused"));
    await expect(
      insertWithSlugRetry(insert, isMysqlDuplicateKeyError, { baseSlug: "acme" }),
    ).rejects.toThrow("connection refused");
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("throws after maxAttempts consecutive duplicates", async () => {
    const insert = vi.fn().mockRejectedValue(dupErr());
    await expect(
      insertWithSlugRetry(insert, isMysqlDuplicateKeyError, {
        baseSlug: "acme",
        maxAttempts: 3,
        randomSuffix: () => "ffffff",
      }),
    ).rejects.toThrow(/slug collision could not be resolved after 3 attempts \(base=acme\)/);
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it("clips the base slug so total length stays at or under the column width", async () => {
    // 80-char base — the suffix (`-` + 6 hex) is 7 chars, so the base
    // gets clipped to 73.
    const long = "x".repeat(80);
    const insert = vi
      .fn()
      .mockRejectedValueOnce(dupErr())
      .mockResolvedValueOnce("ok");
    const { slug } = await insertWithSlugRetry(
      insert,
      isMysqlDuplicateKeyError,
      { baseSlug: long, randomSuffix: () => "112233" },
    );
    // First attempt is the raw base (80 chars).
    expect(insert).toHaveBeenNthCalledWith(1, long);
    // Retry slug = clipped base (73) + "-" + 6 hex = 80 chars exactly.
    expect(slug.length).toBe(80);
    expect(slug).toBe(`${"x".repeat(73)}-112233`);
  });
});
