/**
 * Plugin store — premium-feel polish lockdown.
 *
 * The page was the last surface in the Storefronts hub still using
 * default Card components, generic empty states, and a one-click
 * destructive uninstall. This test locks in the rewrite so future
 * edits don't regress to the un-immaculate version.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

const PAGE = "client/src/pages/PluginStore.tsx";

describe("PluginStore — section structure", () => {
  it("uses canonical section headers (icon + font-heading + count)", () => {
    const src = read(PAGE);
    expect(src).toContain("Plugin marketplace");
    expect(src).toContain("My installed plugins");
    expect(src).toContain('font-heading font-bold tracking-tight');
    // Right-aligned count text per section
    // JSX renders the count via {availableCount} / {installedCount}
    expect(src).toMatch(/\{availableCount\}\s*available/);
    expect(src).toMatch(/\{installedCount\}\s*installed/);
  });

  it("uses the shared empty-state pattern (with the aurora-drift CSS)", () => {
    const src = read(PAGE);
    // Two empty-state surfaces (one for catalog, one for installed)
    const matches = src.match(/className="empty-state"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("empty catalog state sets honest expectations (catalog-opens-at-launch)", () => {
    const src = read(PAGE);
    expect(src).toContain("Catalog opens at launch");
    expect(src).toContain("hello@shop-a-bot.app");
  });
});

describe("PluginStore — install / toggle / uninstall flows", () => {
  it("install button shows per-row spinner state (not a global flag)", () => {
    const src = read(PAGE);
    expect(src).toContain("setInstallingId(vars.pluginId)");
    expect(src).toMatch(/isInstalling = installingId === plugin\.id/);
    expect(src).toContain("Installing…");
  });

  it("toggle uses optimistic per-row state so multiple cards stay independent", () => {
    const src = read(PAGE);
    expect(src).toContain("setTogglingId(vars.pluginId)");
    expect(src).toMatch(/isToggling = togglingId === inst\.pluginId/);
  });

  it("uninstall is gated behind an AlertDialog confirmation", () => {
    // Pre-fix uninstall was one-click destroy. That's a foot-gun for a
    // plugin with custom config. Now: click → confirm dialog → confirm.
    const src = read(PAGE);
    expect(src).toContain("AlertDialog");
    expect(src).toContain("Uninstall {uninstallTarget?.name}?");
    expect(src).toContain("setUninstallTarget");
    // Destructive-action red theme on the confirm button
    expect(src).toContain("bg-rose-600 hover:bg-rose-700");
  });

  it("toasts on every mutation outcome (success + error)", () => {
    const src = read(PAGE);
    expect(src).toContain("toast.success");
    expect(src).toContain("toast.error");
    expect(src).toContain('Installed ${plugin?.pluginName ?? "plugin"}');
    expect(src).toContain("Plugin uninstalled");
  });
});

describe("PluginStore — premium card styling (no default Card chrome)", () => {
  it("cards use the bento-style border + hover-accent pattern", () => {
    const src = read(PAGE);
    expect(src).toContain("rounded-xl border border-white/[0.06] bg-white/[0.02]");
    expect(src).toContain("hover:border-fuchsia-400/25");
    expect(src).toContain("hover:border-cyan-400/25");
  });

  it("install button replaces the Installed badge inline (no layout shift)", () => {
    const src = read(PAGE);
    // The conditional render uses min-h-[3rem] on the description so the
    // card height stays stable whether description is short or long
    expect(src).toContain("min-h-[3rem]");
  });

  it("toggle/uninstall buttons have aria-labels for screen readers", () => {
    const src = read(PAGE);
    expect(src).toContain('aria-label={enabled ? "Disable plugin" : "Enable plugin"}');
    expect(src).toContain('aria-label="Uninstall plugin"');
  });
});
