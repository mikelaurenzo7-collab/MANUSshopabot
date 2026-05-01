/**
 * halo-empty-state.test.ts — adoption guard for the canonical empty-state primitive.
 *
 * Over PRs #58–#62 the halo-glow + next-action pattern was inlined in
 * 8+ surfaces. The cook in this PR consolidated all of them into the
 * shared `client/src/components/HaloEmptyState.tsx` component. This
 * test pins the migration so a future contributor can't accidentally
 * fork the look back into bespoke per-page JSX:
 *
 *   - Every page in the list below MUST import `HaloEmptyState`.
 *   - Every page in the list below MUST USE `<HaloEmptyState ` at
 *     least once.
 *   - The component file itself MUST export the named symbols our
 *     call sites depend on.
 *
 * vitest-config restricts test discovery to `server/**`, so these are
 * source-string assertions rather than render tests — the same shape
 * the project already uses for `polish.test.ts` and friends.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(p: string): string {
  return fs.readFileSync(path.join(ROOT, p), "utf8");
}

const ADOPTERS = [
  "client/src/pages/Workflows.tsx",
  "client/src/pages/Approvals.tsx",
  "client/src/pages/Activity.tsx",
  "client/src/pages/Intelligence.tsx",
  "client/src/pages/CampaignFunnel.tsx",
  "client/src/pages/PlatformHealth.tsx",
  "client/src/pages/Analytics.tsx",
  "client/src/pages/PluginStore.tsx",
  "client/src/pages/BotSettings.tsx",
];

describe("HaloEmptyState — canonical primitive", () => {
  it("the source file exports the public API", () => {
    const src = read("client/src/components/HaloEmptyState.tsx");
    expect(src).toMatch(/export function HaloEmptyState\b/);
    expect(src).toMatch(/export type HaloTone/);
    expect(src).toMatch(/export type HaloSize/);
  });

  it("supports hero, inline, and patient size variants", () => {
    const src = read("client/src/components/HaloEmptyState.tsx");
    // The SIZE_STYLES record is the source of truth for which sizes
    // exist; the test reads the keys to keep migration safe.
    expect(src).toMatch(/\bhero:\s*\{/);
    expect(src).toMatch(/\binline:\s*\{/);
    expect(src).toMatch(/\bpatient:\s*\{/);
  });

  it("supports the full tone palette pages depend on", () => {
    const src = read("client/src/components/HaloEmptyState.tsx");
    for (const tone of ["sky", "cyan", "violet", "emerald", "amber", "muted"]) {
      expect(src).toMatch(new RegExp(`\\b${tone}:\\s*\\{`));
    }
  });

  it("renders rich CTA tiles when any CTA has a `sub`", () => {
    // The Workflows · Active first-run hero uses the rich-tile layout
    // (icon + title + sub + arrow). Loss of this branch would silently
    // collapse all 3 next-action tiles back into compact buttons.
    const src = read("client/src/components/HaloEmptyState.tsx");
    expect(src).toMatch(/useRichTiles/);
    expect(src).toMatch(/cta\.sub/);
  });
});

describe.each(ADOPTERS)("%s — adopts HaloEmptyState", (page) => {
  const src = read(page);

  it("imports HaloEmptyState from the shared module", () => {
    expect(src).toMatch(/from\s+["']@\/components\/HaloEmptyState["']/);
    expect(src).toMatch(/HaloEmptyState/);
  });

  it("renders <HaloEmptyState> at least once", () => {
    expect(src).toMatch(/<HaloEmptyState\b/);
  });

  it("does not redeclare the inlined halo-glow div trio that the helper replaces", () => {
    // The original inlined pattern was:
    //   <div className="absolute inset-0 rounded-2xl bg-{tone}-500/20 blur-xl" aria-hidden />
    //   <div className="relative h-14 w-14 rounded-2xl bg-{tone}-500/10 ...">
    //     <{Icon} className="h-6 w-6 text-{tone}-300" />
    //   </div>
    // Catch the exact inline shape so anyone re-introducing it gets a
    // failing test pointing at this file.
    expect(src).not.toMatch(
      /absolute inset-0 rounded-2xl bg-[a-z]+-500\/(15|20) blur-xl/,
    );
  });
});
