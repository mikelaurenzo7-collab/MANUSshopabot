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

  it("All 8 workspace surfaces are registered as routes in App.tsx", () => {
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
