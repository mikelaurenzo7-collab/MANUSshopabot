/**
 * workspace-shell.test.ts — source-pin regression for the per-store
 * workspace contract introduced in PR #82.
 *
 * Why this exists: the workspace shell is a single point of failure for
 * the per-store routing pivot. If its tab registry, route prefix, or
 * the suppression hook get refactored without updating the wiring,
 * operators land on broken pages with no visible error. This test
 * pins the contract so the build fails first.
 *
 * Pattern matches `claude-batch-files.test.ts` — grep-style assertions
 * over source. Doesn't need a DOM, runs in vitest's `node` environment.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("Workspace shell contract", () => {
  it("WorkspaceShell exposes the suppression hook + route prefix", () => {
    const src = read("client/src/components/workspace/WorkspaceShell.tsx");
    // Public contract — pages import these to detect nesting.
    expect(src).toContain("export function useIsInsideWorkspaceShell");
    expect(src).toContain("export function useWorkspaceShellStoreId");
    expect(src).toContain("export function WorkspaceShell");
    // Route prefix the shell binds against.
    expect(src).toContain('"/store/:storeId/:rest*"');
    // Provider must wrap children so nested pages can read context.
    expect(src).toContain("WorkspaceShellContext.Provider");
  });

  it("All 9 workspace surfaces are registered as routes in App.tsx", () => {
    const src = read("client/src/App.tsx");
    // The workspace pivot ships these surfaces — losing any of them
    // breaks the corresponding sub-nav tab.
    expect(src).toContain('path="/store/:storeId"');
    expect(src).toContain('path="/store/:storeId/chat"');
    expect(src).toContain('path="/store/:storeId/workflows"');
    expect(src).toContain('path="/store/:storeId/builder"');
    expect(src).toContain('path="/store/:storeId/connectors"');
    expect(src).toContain('path="/store/:storeId/memory"');
    expect(src).toContain('path="/store/:storeId/instructions"');
    expect(src).toContain('path="/store/:storeId/insights"');
    expect(src).toContain('path="/store/:storeId/activity"');
  });

  it("Activity surface ships its own page wrapper", () => {
    const src = read("client/src/pages/WorkspaceActivity.tsx");
    expect(src).toContain("WorkspaceShell");
    expect(src).toContain('activeTab="activity"');
    // Folds approvals + workflow lifecycle into one timeline.
    expect(src).toContain("approvals.pending");
    expect(src).toContain("workflows.list");
  });

  it("Workspace pages use design-system tokens, not raw hex Tailwind utilities", () => {
    // Mirrors `scripts/preflight-sync.mjs` checkPageHexRegressions().
    // The CI "Manus sync smoke test" runs preflight with --strict, which
    // promotes any raw-hex utility (e.g. `ring-[#050507]`) into a hard
    // failure. PR #84 originally shipped `ring-[#050507]` on the
    // Activity timeline dot which broke the post-merge smoke run; this
    // assertion locks the regression so it cannot sneak past again.
    const HEX_RE = /(?:bg|text|border|from|via|to|fill|stroke|ring)-\[#[0-9a-fA-F]{3,8}\]/;
    const workspacePages = [
      "client/src/pages/WorkspaceOverview.tsx",
      "client/src/pages/WorkspaceChat.tsx",
      "client/src/pages/WorkspaceWorkflows.tsx",
      "client/src/pages/WorkspaceBuilder.tsx",
      "client/src/pages/WorkspaceConnectors.tsx",
      "client/src/pages/WorkspaceMemory.tsx",
      "client/src/pages/WorkspaceInstructions.tsx",
      "client/src/pages/WorkspaceInsights.tsx",
      "client/src/pages/WorkspaceActivity.tsx",
    ];
    const violations: string[] = [];
    for (const page of workspacePages) {
      const src = read(page);
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(HEX_RE);
        if (m) violations.push(`${page}:${i + 1} → ${m[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("Workspace mark pulses while running workflows are in flight", () => {
    const shellSrc = read("client/src/components/workspace/WorkspaceShell.tsx");
    const cssSrc = read("client/src/index.css");
    // The shell flips a class on the brand mark when running > 0.
    expect(shellSrc).toContain("workspace-mark-pulsing");
    // The class drives the dual-ring keyframe animation.
    expect(cssSrc).toContain(".workspace-mark-pulsing");
    expect(cssSrc).toContain("@keyframes workspace-mark-ring");
    // Honors prefers-reduced-motion.
    expect(cssSrc).toMatch(/prefers-reduced-motion: reduce[\s\S]+workspace-mark-pulsing::before/);
  });

  it("Sparkline component is dependency-free + accessible", () => {
    const src = read("client/src/components/Sparkline.tsx");
    // Pure SVG primitive — no chart library import.
    expect(src).not.toMatch(/from ['"]recharts['"]/);
    expect(src).not.toMatch(/from ['"]d3-/);
    // Has an accessible label hook so screen readers describe the trend.
    expect(src).toContain("label?:");
    expect(src).toContain('aria-label={label}');
  });

  it("WorkspaceOverview renders the first-run welcome when freshly connected", () => {
    const src = read("client/src/pages/WorkspaceOverview.tsx");
    expect(src).toContain("isFreshlyConnected");
    expect(src).toContain("Welcome to ");
    // Three concrete next steps — bot / connectors / builder.
    expect(src).toContain("Open chat");
    expect(src).toContain("Connect a channel");
    expect(src).toContain("Launch your first workflow");
  });

  it("PageHeader honors the inside-workspace suppression hook", () => {
    const src = read("client/src/components/PageHeader.tsx");
    expect(src).toContain("useIsInsideWorkspaceShell");
    // Compact branch that runs when nested — the eyebrow path.
    expect(src).toContain("uppercase tracking-[0.16em] text-white/55");
  });

  it("Chat page suppresses its own header when inside a workspace", () => {
    const src = read("client/src/pages/Chat.tsx");
    expect(src).toContain("useIsInsideWorkspaceShell");
    expect(src).toContain("{!insideWorkspace && (");
  });

  it("Home store cards open the per-store workspace overview", () => {
    const src = read("client/src/pages/Home.tsx");
    // The pivot — store cards must route into /store/:id, not the
    // generic /storefronts shell.
    expect(src).toMatch(/setLocation\(`\/store\/\$\{store\.id\}`\)/);
  });

  it("Sidebar workspace switcher navigates into the workspace, not just sets context", () => {
    const src = read("client/src/components/DashboardLayout.tsx");
    // Old behavior: setActiveStoreId(s.id) only. New behavior: also
    // navigates into the per-store world so the chrome stays in sync.
    expect(src).toMatch(/setActiveStoreId\(s\.id\);\s*\n\s*setLocation\(`\/store\/\$\{s\.id\}`\)/);
    expect(src).toContain("WorkspaceSidebarNav");
  });
});
