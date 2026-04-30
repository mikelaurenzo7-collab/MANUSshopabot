/**
 * slug.ts — generation + collision-retry helper.
 *
 * Extracted from `db.createOrganization` so the retry logic can be
 * unit-tested without standing up a MySQL fixture. The pattern is
 * insert-on-conflict-retry, which leans on the unique constraint as
 * the source of truth and avoids the SELECT-then-INSERT TOCTOU race
 * the original implementation had.
 */

import { randomBytes } from "node:crypto";

/** Maximum length of a slug after suffixing. The suffix is 7 chars
 *  (`-` + 6 hex digits), so the base is capped at 73 to keep the
 *  total ≤ 80 (matches the column width on `organizations.slug`). */
const SLUG_MAX_LEN = 80;
const SUFFIX_LEN = 7; // "-" + 6 hex chars

/** Convert any string to a URL-safe slug. */
export function toSlug(input: string, fallback: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}

/** Generate a 6-hex-char random suffix using `crypto.randomBytes` —
 *  16.7M values, collision-resistant under the 5-attempt retry
 *  budget. Exported for test injection. */
export function randomSuffix(): string {
  return randomBytes(3).toString("hex");
}

export interface InsertOnConflictOptions {
  baseSlug: string;
  /** Maximum total attempts (including the first base-slug try). */
  maxAttempts?: number;
  /** Override the random-suffix generator (used by tests for
   *  determinism). */
  randomSuffix?: () => string;
}

/** Attempt to insert with the base slug, then with `${baseSlug}-${rand}`
 *  on each subsequent attempt. The supplied `attemptInsert` callback
 *  must throw a duplicate-key error (e.g. MySQL `ER_DUP_ENTRY`) when
 *  the slug is taken; any other error propagates immediately so we
 *  don't paper over real bugs (connection lost, schema mismatch, etc.).
 *
 *  Returns the slug that successfully inserted. Throws after
 *  `maxAttempts` consecutive duplicate-key errors with a descriptive
 *  message. */
export async function insertWithSlugRetry<T>(
  attemptInsert: (slug: string) => Promise<T>,
  isDuplicateKeyError: (err: unknown) => boolean,
  options: InsertOnConflictOptions,
): Promise<{ slug: string; result: T }> {
  const { baseSlug, maxAttempts = 5, randomSuffix: rand = randomSuffix } = options;
  const baseClipped = baseSlug.slice(0, SLUG_MAX_LEN - SUFFIX_LEN);

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseClipped}-${rand()}`;
    try {
      const result = await attemptInsert(slug);
      return { slug, result };
    } catch (err) {
      lastError = err;
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
  throw new Error(
    `slug collision could not be resolved after ${maxAttempts} attempts (base=${baseSlug}): ` +
      `${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/** Convenience predicate for MySQL/MariaDB `ER_DUP_ENTRY` errors. */
export function isMysqlDuplicateKeyError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "ER_DUP_ENTRY";
}
