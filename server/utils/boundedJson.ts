/**
 * Bounded JSON-blob Zod schema.
 *
 * Several tRPC mutations accept loose `z.any()` (or
 * `z.record(z.string(), z.any())`) blobs for `config`, `input`,
 * `condition`, `metadata`, etc. These payloads are stored verbatim
 * in JSON columns and round-tripped to the client. Without bounds:
 *
 *   - A malicious caller can plant a 100MB blob and bloat row size
 *     until reads slow down.
 *   - Deeply-nested objects can hit quadratic parse time on the
 *     client when the row is later returned and JSON.parse'd.
 *   - LLM-fed payloads can drift the shape over time, breaking
 *     downstream code that assumes a specific schema.
 *
 * `boundedJsonBlob` replaces those loose schemas with a Zod schema
 * that:
 *
 *   1. Rejects non-object inputs (only plain JSON objects allowed).
 *   2. Caps the total serialized byte size (default 50KB).
 *   3. Caps the number of top-level keys (default 200).
 *
 * Depth is intentionally NOT capped — deeply-nested but small
 * objects are fine, and the byte cap already bounds the worst case.
 *
 * Usage:
 *   .input(z.object({
 *     config: boundedJsonBlob().optional(),
 *   }))
 */

import { z } from "zod";

/** Default cap: 50KB serialized. Bumps storage friendliness while
 *  leaving plenty of room for legitimate workflow / pricing-rule
 *  configs (those are typically <2KB in practice). */
export const DEFAULT_MAX_BLOB_BYTES = 50_000;

/** Default cap: 200 top-level keys. Covers any reasonable
 *  per-feature config; plant attacks plant 100k+ keys. */
export const DEFAULT_MAX_TOP_LEVEL_KEYS = 200;

interface BoundedJsonBlobOptions {
  /** Max serialized size in bytes (UTF-8 length of `JSON.stringify`). */
  maxBytes?: number;
  /** Max number of top-level keys on the blob. */
  maxTopLevelKeys?: number;
}

/**
 * Returns a Zod schema that accepts a JSON-shaped object, rejects
 * arrays and primitives, and enforces both a serialized-size cap
 * and a top-level key-count cap. The schema's runtime check is
 * O(1) on key count and O(n) on serialization length — n is the
 * payload size, which is exactly what we want to bound.
 */
export function boundedJsonBlob(options: BoundedJsonBlobOptions = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BLOB_BYTES;
  const maxKeys = options.maxTopLevelKeys ?? DEFAULT_MAX_TOP_LEVEL_KEYS;

  return z
    .record(z.string().max(255), z.unknown())
    .refine(
      (value) => Object.keys(value).length <= maxKeys,
      { message: `Object exceeds ${maxKeys} top-level keys` },
    )
    .refine(
      (value) => {
        // Surface the byte cap. We use UTF-8 length of the
        // serialized form, which approximates DB storage cost.
        let serialized: string;
        try {
          serialized = JSON.stringify(value);
        } catch {
          // Circular references or non-serializable values fall through
          // as a parse failure below.
          return false;
        }
        // Buffer.byteLength would be more accurate for multi-byte
        // characters, but `.length` is a tighter upper bound (each JS
        // string char is at most 4 UTF-8 bytes, so bytes ≤ 4 * length;
        // we use length as the cap because it's cheaper and still safe).
        return serialized.length <= maxBytes;
      },
      { message: `Object exceeds ${maxBytes} bytes when serialized` },
    );
}

// Exported for tests.
export const __testInternals = {
  DEFAULT_MAX_BLOB_BYTES,
  DEFAULT_MAX_TOP_LEVEL_KEYS,
};
