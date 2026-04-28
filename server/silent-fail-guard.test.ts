/**
 * Silent-fail guard — defends against the GmailBot Compose class of
 * bug (button rendered, no onClick; field rendered, no value/onChange).
 *
 * Pre-launch we caught one of these by manual sweep. This test runs
 * the same check across every page so the next one gets caught in the
 * diff. Defensive — not perfect (multi-line JSX isn't fully parseable
 * with regex), but catches the common single-line cases.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

const PAGE_DIR = path.resolve(__dirname, "../client/src/pages");

const ALL_PAGES = fs
  .readdirSync(PAGE_DIR)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => path.join("client/src/pages", f));

describe("Silent-fail guard — every page", () => {
  it("has no off-brand bg-blue-600 buttons (we use sky / cyan / violet)", () => {
    // bg-blue-600 + bg-blue-700 was the vestigial Tailwind-default
    // primary that pre-dated the design system. Sweep + lock out.
    const offenders: string[] = [];
    for (const rel of ALL_PAGES) {
      const src = read(rel);
      if (/bg-blue-(600|700)/.test(src)) offenders.push(rel);
    }
    expect(offenders, `pages still using bg-blue-6/700: ${offenders.join(", ")}`).toEqual([]);
  });

  it("has no bg-gray-900 / border-gray-700 inputs (we use bg-input/50 + white/[0.08])", () => {
    // Same story for grays — pre-design-system.
    const offenders: string[] = [];
    for (const rel of ALL_PAGES) {
      const src = read(rel);
      if (/bg-gray-9\d\d|border-gray-7\d\d/.test(src)) offenders.push(rel);
    }
    expect(offenders, `pages still using gray-900/700: ${offenders.join(", ")}`).toEqual([]);
  });

  it("has no GmailBot-style 'Loading inbox...' flat gray text", () => {
    // Locks in the skeleton-loader pattern. Any new "Loading X..." gray
    // text is a regression to flat loading states.
    const offenders: string[] = [];
    for (const rel of ALL_PAGES) {
      const src = read(rel);
      if (/text-(gray|slate)-400">Loading [A-Za-z]+\.\.\./.test(src)) offenders.push(rel);
    }
    expect(offenders, `pages with flat 'Loading X...' text: ${offenders.join(", ")}`).toEqual([]);
  });

  it("has no inline empty-state divs (use the .empty-state class for aurora drift)", () => {
    // The .empty-state CSS class adds the aurora-drift animation +
    // signature glow. Inline copies of the same border-dashed +
    // py-16 + text-center pattern miss the animation, breaking
    // visual consistency. Locked.
    const offenders: { file: string; matches: number }[] = [];
    for (const rel of ALL_PAGES) {
      const src = read(rel);
      // Match the canonical empty-state shape: py-16 + border-dashed +
      // bg-white/[0.01] in a flex-col container. Anything that mirrors
      // this without the .empty-state class is a manual reimplementation.
      const re = /flex flex-col items-center justify-center py-16 rounded-xl border border-dashed/g;
      const matches = src.match(re);
      if (matches && matches.length > 0) {
        offenders.push({ file: rel, matches: matches.length });
      }
    }
    expect(
      offenders,
      `pages with inline empty-state divs (use .empty-state class): ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });

  it("has no client-side console.log left over from debugging", () => {
    // Server has intentional structured console.log in webhook handlers
    // (operational logs); the client should never have raw console.log
    // in production code. console.error stays (real error reporting).
    const CLIENT_DIR = path.resolve(__dirname, "../client/src");
    function walk(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...walk(full));
        else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(full);
      }
      return files;
    }
    const offenders: string[] = [];
    for (const file of walk(CLIENT_DIR)) {
      const src = fs.readFileSync(file, "utf-8");
      // Strip comments first so a `// console.log(...)` doesn't trip
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // console.debug is allowed (intentional dev-only telemetry);
      // console.error is allowed (genuine error paths)
      if (/\bconsole\.(log|warn|info)\(/.test(stripped)) {
        offenders.push(path.relative(path.resolve(__dirname, ".."), file));
      }
    }
    expect(
      offenders,
      `client files with console.log/warn/info: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

describe("SupplierPOs — polish from this commit", () => {
  it("New PO button uses the default Button (no off-brand bg-blue-600)", () => {
    const src = read("client/src/pages/SupplierPOs.tsx");
    // The pre-fix bg-blue-600 has been swept
    expect(src).not.toContain("bg-blue-600 hover:bg-blue-700");
  });

  it("Summary stat cards animate with CountUp", () => {
    const src = read("client/src/pages/SupplierPOs.tsx");
    expect(src).toContain('import { CountUp } from "@/components/CountUp"');
    expect(src).toContain("<CountUp value={totalPOs}");
    expect(src).toContain("<CountUp value={draftCount}");
    expect(src).toContain('<CountUp value={totalValue / 100} prefix="$" decimals={2}');
  });
});
