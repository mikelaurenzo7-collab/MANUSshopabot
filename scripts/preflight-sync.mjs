#!/usr/bin/env node
/**
 * Preflight checks for Manus "Sync GitHub changes".
 *
 * This script catches the most common reasons a GitHub → Manus sync fails
 * after a multi-AI workflow merges a PR:
 *
 *   1. Drizzle migration drift (journal vs. .sql vs. snapshots out of sync,
 *      or someone edited an older migration in place instead of appending).
 *   2. Accidentally-tracked Manus-owned files (e.g. client/public/__manus__/).
 *   3. Accidentally-tracked secrets (.env, *credentials*.md).
 *   4. Unresolved git conflict markers committed to source.
 *   5. Missing pnpm-lock.yaml or stray npm/yarn lockfiles.
 *
 * Design goals:
 *   - Zero runtime dependencies (Node built-ins only) so it runs in any
 *     environment, even before `pnpm install`.
 *   - Distinguishes ERRORS (block sync) from WARNINGS (heads-up only) so
 *     historical drift in this repo doesn't break existing CI.
 *   - Exit code: 0 on success or warnings-only, 1 on any error.
 *
 * Usage:
 *   node scripts/preflight-sync.mjs            # check everything
 *   node scripts/preflight-sync.mjs --strict   # treat warnings as errors
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const strict = process.argv.includes("--strict");

const errors = [];
const warnings = [];

const err = msg => errors.push(msg);
const warn = msg => warnings.push(msg);

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function listTrackedFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.toString("utf8").split("\0").filter(Boolean);
  } catch {
    return null; // Not a git checkout (e.g. unpacked tarball). Skip git-based checks.
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/* ------------------------------------------------------------------ */
/* Check 1: Drizzle migration consistency                             */
/* ------------------------------------------------------------------ */

function checkDrizzle() {
  const drizzleDir = join(repoRoot, "drizzle");
  const metaDir = join(drizzleDir, "meta");
  const journalPath = join(metaDir, "_journal.json");

  if (!existsSync(journalPath)) {
    warn("drizzle/meta/_journal.json not found — skipping migration checks.");
    return;
  }

  let journal;
  try {
    journal = readJson(journalPath);
  } catch (e) {
    err(`drizzle/meta/_journal.json is not valid JSON: ${e.message}`);
    return;
  }

  if (!Array.isArray(journal.entries)) {
    err("drizzle/meta/_journal.json is missing an 'entries' array.");
    return;
  }

  // Expect monotonically increasing idx starting at 0.
  let journalIsValid = true;
  for (let i = 0; i < journal.entries.length; i++) {
    const e = journal.entries[i];
    if (e.idx !== i) {
      err(
        `drizzle journal entry #${i} has idx=${e.idx}; expected ${i}. Migrations must be append-only and sequential.`
      );
      journalIsValid = false;
    }
    if (typeof e.tag !== "string" || !/^\d{4}_/.test(e.tag)) {
      err(
        `drizzle journal entry #${i} has invalid tag '${e.tag}'. Expected format '0000_name'.`
      );
      journalIsValid = false;
    }
  }

  // Subsequent checks rely on tag.slice(0, 4); bail out if any tag is malformed.
  if (!journalIsValid) return;

  // Every journal tag must have a matching .sql file.
  const sqlFiles = new Set(
    readdirSync(drizzleDir).filter(f => f.endsWith(".sql"))
  );
  const snapshotFiles = new Set(
    existsSync(metaDir)
      ? readdirSync(metaDir).filter(
          f => f.endsWith("_snapshot.json") && /^\d{4}_/.test(f)
        )
      : []
  );

  const expectedSql = new Set(journal.entries.map(e => `${e.tag}.sql`));
  const expectedSnapshots = new Set(
    journal.entries.map(e => `${e.tag.slice(0, 4)}_snapshot.json`)
  );

  for (const f of expectedSql) {
    if (!sqlFiles.has(f)) {
      err(
        `drizzle: journal references migration '${f}' but the .sql file is missing.`
      );
    }
  }
  for (const f of sqlFiles) {
    const idxPart = f.slice(0, 4);
    const inJournal = journal.entries.some(e => e.tag.slice(0, 4) === idxPart);
    if (!inJournal) {
      err(`drizzle: ${f} exists on disk but is not in _journal.json.`);
    }
  }
  for (const f of expectedSnapshots) {
    if (!snapshotFiles.has(f)) {
      // Snapshots are mainly used by drizzle-kit when generating the *next*
      // migration. Missing historical snapshots will not crash Manus runtime
      // migrations, but they will block future drizzle-kit generate runs
      // that try to diff against that snapshot.
      //
      // Under --strict this is promoted to a hard error so CI can guarantee
      // every journaled migration ships with its snapshot. In normal runs we
      // emit a loud warning so historical drift doesn't break existing CI.
      const msg =
        `drizzle: snapshot '${f}' is missing for a journaled migration. ` +
        `Future 'drizzle-kit generate' runs may fail or produce incorrect diffs. ` +
        `Re-run 'pnpm drizzle-kit generate' against the latest schema to regenerate.`;
      if (strict) {
        err(msg);
      } else {
        warn(msg);
      }
    }
  }

  // Detect modifications to historical migrations (anything older than the
  // last entry being changed in the working tree compared to HEAD).
  try {
    const changed = execFileSync(
      "git",
      ["diff", "--name-only", "HEAD", "--", "drizzle/"],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    )
      .split("\n")
      .filter(Boolean);
    if (journal.entries.length > 0) {
      const latestTag = journal.entries[journal.entries.length - 1].tag;
      const latestPrefix = latestTag.slice(0, 4);
      for (const path of changed) {
        const base = path.split("/").pop();
        const m = base.match(/^(\d{4})_/);
        if (m && m[1] !== latestPrefix && base.endsWith(".sql")) {
          err(
            `drizzle: '${path}' modifies a historical migration. ` +
              `Migrations are append-only — create a new migration with 'pnpm drizzle-kit generate' instead.`
          );
        }
      }
    }
  } catch {
    // git not available or not a git repo; ignore.
  }
}

/* ------------------------------------------------------------------ */
/* Check 2: Manus-owned and secret files must not be tracked          */
/* ------------------------------------------------------------------ */

function checkForbiddenTrackedFiles(tracked) {
  if (!tracked) return;

  const forbiddenExact = [
    "client/public/__manus__/version.json",
    ".env",
    ".env.local",
    ".env.development.local",
    ".env.test.local",
    ".env.production.local",
    "CREDENTIALS_COLLECTED.md",
  ];

  // Patterns are matched against the file's basename so credentials files in
  // any subdirectory are caught (e.g. 'docs/CREDENTIALS_FOO.md'). Only files
  // that Manus auto-generates server-side (and would overwrite on sync) need
  // exact-path entries — not the entire __manus__ directory, since some files
  // in there (e.g. debug-collector.js) are intentionally checked in.
  const forbiddenBasenamePatterns = [
    /\.credentials\.md$/i,
    /^CREDENTIALS.*\.md$/i,
  ];

  for (const f of tracked) {
    if (forbiddenExact.includes(f)) {
      err(
        `Forbidden file is tracked in git: '${f}'. It must not be committed.`
      );
      continue;
    }
    const basename = f.split("/").pop() ?? f;
    for (const re of forbiddenBasenamePatterns) {
      if (re.test(basename)) {
        err(
          `Forbidden file is tracked in git: '${f}' (matches ${re}). It must not be committed.`
        );
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Check 3: Conflict markers in tracked text files                    */
/* ------------------------------------------------------------------ */

function checkConflictMarkers(tracked) {
  if (!tracked) return;

  // Conflict markers must appear at the start of a line. We require all three
  // marker types to be present in the same file to avoid false positives on
  // documentation that quotes a single marker (like this very file).
  const skipDirs = ["node_modules/", "dist/", "build/", "coverage/", ".git/"];
  // Skip the preflight script itself (it documents these markers).
  const selfPath = relative(repoRoot, fileURLToPath(import.meta.url)).replace(
    /\\/g,
    "/"
  );

  for (const f of tracked) {
    if (skipDirs.some(d => f.startsWith(d))) continue;
    if (f === selfPath) continue;
    // Only check text-ish files by extension to avoid loading binaries.
    if (
      !/\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|sql|css|html|sh|toml)$/.test(
        f
      )
    )
      continue;
    const abs = join(repoRoot, f);
    try {
      if (statSync(abs).size > 2 * 1024 * 1024) continue; // skip >2MB
      const content = readFileSync(abs, "utf8");
      const hasStart = /^<{7,} /m.test(content);
      const hasMid = /^={7,}$/m.test(content);
      const hasEnd = /^>{7,} /m.test(content);
      if (hasStart && hasMid && hasEnd) {
        err(`Unresolved git conflict markers found in '${f}'.`);
      }
    } catch {
      // unreadable / binary — ignore
    }
  }
}

/* ------------------------------------------------------------------ */
/* Check 4: Raw-hex regression guard for `client/src/pages/*.tsx`     */
/* ------------------------------------------------------------------ */

/**
 * Audit P3 #15 (`AUDIT_2026_04.md`): once the page-level color sweep
 * finished, we want a cheap guard that prevents new `bg-[#…]` /
 * `text-[#…]` / `border-[#…]` Tailwind arbitrary values from sneaking
 * back into page files.
 *
 * Scope: only `client/src/pages/*.tsx`. `client/src/components/` and
 * `client/src/lib/` are exempt because they legitimately consume raw
 * hex for chart helpers and brand-data registries (`platformBrand.ts`,
 * `chartTheme.ts`).
 *
 * Reports a warning per offending line so existing branches won't fail
 * outright — flip with `--strict` once the next round of cleanup is
 * confirmed clean.
 */
function checkPageHexRegressions(tracked) {
  if (!tracked) return;

  const re = /(bg|text|border|from|via|to|fill|stroke|ring)-\[#[0-9a-fA-F]{3,8}\]/;

  for (const f of tracked) {
    if (!f.startsWith("client/src/pages/")) continue;
    if (!f.endsWith(".tsx")) continue;
    const abs = join(repoRoot, f);
    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;
      warn(
        `Raw hex Tailwind utility '${m[0]}' in ${f}:${i + 1} — replace with a token class (see client/src/index.css).`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Check 5: Lockfile sanity                                           */
/* ------------------------------------------------------------------ */

function checkLockfiles() {
  const pnpmLock = join(repoRoot, "pnpm-lock.yaml");
  const npmLock = join(repoRoot, "package-lock.json");
  const yarnLock = join(repoRoot, "yarn.lock");

  if (!existsSync(pnpmLock)) {
    err(
      "pnpm-lock.yaml is missing. This repo uses pnpm — run 'pnpm install' and commit the lockfile."
    );
  }
  if (existsSync(npmLock)) {
    err(
      "package-lock.json must not be committed in a pnpm repo — delete it and commit only pnpm-lock.yaml."
    );
  }
  if (existsSync(yarnLock)) {
    err(
      "yarn.lock must not be committed in a pnpm repo — delete it and commit only pnpm-lock.yaml."
    );
  }
}

/* ------------------------------------------------------------------ */
/* Run all checks                                                     */
/* ------------------------------------------------------------------ */
/* Recommended-env coverage report                                     */
/* ------------------------------------------------------------------ */
/* Heads-up only: lists the env vars the app would degrade-without if
   they weren't injected at runtime. Doesn't fail sync — Manus injects
   most of them after the deploy comes up. The point is to surface the
   feature-coverage truth at sync time so the operator knows what's
   live before they go to production.                                  */
function checkRecommendedEnvCoverage() {
  const tiers = [
    {
      label: "Billing (Stripe)",
      vars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    },
    {
      label: "Reasoning lifts (Anthropic)",
      vars: ["ANTHROPIC_API_KEY"],
    },
    {
      label: "Email delivery (SendGrid)",
      vars: ["SENDGRID_API_KEY"],
    },
    {
      label: "Shopify connector",
      vars: ["SHOPIFY_PARTNER_CLIENT_ID", "SHOPIFY_PARTNER_CLIENT_SECRET"],
    },
    {
      label: "Encryption-at-rest (TOKEN_ENCRYPTION_KEY)",
      vars: ["TOKEN_ENCRYPTION_KEY"],
    },
  ];
  const envExamplePath = join(repoRoot, ".env.example");
  const envExample = existsSync(envExamplePath)
    ? readFileSync(envExamplePath, "utf8")
    : "";
  const examplesByVar = new Set(
    envExample
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split("=")[0].trim()),
  );

  for (const tier of tiers) {
    const undocumented = tier.vars.filter((v) => !examplesByVar.has(v));
    if (undocumented.length > 0) {
      warn(
        `${tier.label}: ${undocumented.join(", ")} not present in .env.example — operators won't know to set them.`,
      );
    }
  }
}

const tracked = listTrackedFiles();

checkDrizzle();
checkForbiddenTrackedFiles(tracked);
checkConflictMarkers(tracked);
checkPageHexRegressions(tracked);
checkLockfiles();
checkRecommendedEnvCoverage();

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

const reset = "\x1b[0m";
const red = "\x1b[31m";
const yellow = "\x1b[33m";
const green = "\x1b[32m";
const bold = "\x1b[1m";

if (warnings.length) {
  console.error(
    `${yellow}${bold}Preflight warnings (${warnings.length}):${reset}`
  );
  for (const w of warnings) console.error(`  ${yellow}⚠${reset}  ${w}`);
}

if (errors.length) {
  console.error(`${red}${bold}Preflight errors (${errors.length}):${reset}`);
  for (const e of errors) console.error(`  ${red}✗${reset}  ${e}`);
  console.error(
    `\n${red}Preflight failed.${reset} Fix the errors above before clicking "Sync GitHub changes" in Manus.`
  );
  process.exit(1);
}

if (warnings.length && strict) {
  console.error(
    `\n${red}Preflight failed (--strict mode):${reset} treat warnings as errors.`
  );
  process.exit(1);
}

console.log(
  `${green}${bold}Preflight OK${reset}` +
    (warnings.length ? ` (with ${warnings.length} warning(s))` : "") +
    "."
);
process.exit(0);
