/**
 * Coverage contract — no router accepts loose `z.any()` blobs in
 * mutation inputs.
 *
 * Pre-this-PR, 8 procedures across `workflows`, `botProfile`,
 * `merchant`, `connectors`, and `pluginStore` accepted
 * `z.any()` or `z.record(z.string(), z.any())` for `config`,
 * `input`, `condition`, and `metadata` fields. These payloads were
 * stored verbatim in JSON columns, leaving the system open to:
 *   - Storage bloat from a 100MB plant.
 *   - Quadratic JSON.parse on the client when the row was returned.
 *   - Schema drift over time as different callers shoved different
 *     shapes through the same loose hole.
 *
 * The fix: a `boundedJsonBlob({ maxBytes, maxTopLevelKeys })` Zod
 * schema in `server/utils/boundedJson.ts`. This test scans every
 * router file and asserts no `z.any()` or `z.record(z.string(), z.any())`
 * pattern survives. Adding a future loose blob to a mutation input
 * fails this test on commit.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

const REPO = resolve(__dirname, "..");
const ROUTERS_DIR = resolve(REPO, "server/routers");

function listRouterFiles(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(ROUTERS_DIR)) {
    const full = join(ROUTERS_DIR, entry);
    if (statSync(full).isFile() && entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("Zod blob coverage", () => {
  it("no router uses bare `z.any()` or `z.record(z.string(), z.any())`", () => {
    // Strict scan — these patterns are always wider than any
    // legitimate input shape and should never appear in a
    // mutation input. If a future router needs a JSON-shaped blob,
    // it should use `boundedJsonBlob({ maxBytes, maxTopLevelKeys })`
    // from `server/utils/boundedJson.ts` instead.
    const violations: string[] = [];
    for (const file of listRouterFiles()) {
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\bz\.any\s*\(\s*\)/.test(line)) {
          violations.push(`${file.replace(REPO + "/", "")}:${i + 1} uses z.any()`);
        }
        if (/z\.record\s*\(\s*z\.string\s*\(\s*\)\s*,\s*z\.any\s*\(\s*\)\s*\)/.test(line)) {
          violations.push(`${file.replace(REPO + "/", "")}:${i + 1} uses z.record(z.string(), z.any())`);
        }
      }
    }
    expect(violations, `Loose schemas found:\n  ${violations.join("\n  ")}`).toEqual([]);
  });

  it("every previously-loose call site now imports + uses boundedJsonBlob", () => {
    // Belt-and-suspenders: the audit specifically flagged 5 router
    // files. Pin that each one carries the import AND a usage so a
    // future refactor can't quietly drop the import (which would
    // make the loose-scan above pass while the schema regressed).
    const expectedImporters = [
      "server/routers/workflows.ts",
      "server/routers/botProfile.ts",
      "server/routers/merchant.ts",
      "server/routers/connectors.ts",
      "server/routers/pluginStore.ts",
    ];
    for (const rel of expectedImporters) {
      const src = readFileSync(resolve(REPO, rel), "utf8");
      expect(src, `${rel} missing boundedJsonBlob import`).toMatch(
        /import\s*\{\s*boundedJsonBlob\s*\}\s*from\s*"\.\.\/utils\/boundedJson"/,
      );
      expect(src, `${rel} imports boundedJsonBlob but never calls it`).toMatch(
        /boundedJsonBlob\(/,
      );
    }
  });
});
