/**
 * Sprint 6 Tests — Retry mutation, Platform Health router, Lazy loading, Micro-animations
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "..");

function readFile(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf-8");
}

function fileExists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

// ─── Workflow Retry Mutation ──────────────────────────────────────────────────

describe("Workflow Retry Mutation", () => {
  it("retry procedure exists in workflows router", () => {
    const src = readFile("server/routers/workflows.ts");
    // After multi-tenancy migration the procedure is org-scoped.
    expect(src).toContain("retry: orgProcedure");
    expect(src).toContain("workflowId: z.number()");
  });

  it("retry validates that only failed/cancelled workflows can be retried", () => {
    const src = readFile("server/routers/workflows.ts");
    expect(src).toContain("status !== \"failed\" && workflow.status !== \"cancelled\"");
    expect(src).toContain("Only failed or cancelled workflows can be retried");
  });

  it("retry re-launches workflow with same parameters", () => {
    const src = readFile("server/routers/workflows.ts");
    expect(src).toContain("launchWorkflow(");
    expect(src).toContain("ctx.user.id");
    expect(src).toContain("orgId: ctx.org.id");
    expect(src).toContain("newWorkflowId");
    expect(src).toContain("[Retry]");
  });

  it("retry button appears in Workflows history tab for failed/cancelled workflows", () => {
    const src = readFile("client/src/pages/Workflows.tsx");
    expect(src).toContain("retryMutation");
    expect(src).toContain("onRetry");
    expect(src).toContain("retryLoading");
    expect(src).toContain("border-amber-500/30 text-amber-400");
  });
});

// ─── Platform Health Router ───────────────────────────────────────────────────

describe("Platform Health Router", () => {
  it("health router file exists", () => {
    expect(fileExists("server/routers/health.ts")).toBe(true);
  });

  it("health router exports healthRouter", () => {
    const src = readFile("server/routers/health.ts");
    expect(src).toContain("export const healthRouter");
  });

  it("health router has checkAll mutation", () => {
    const src = readFile("server/routers/health.ts");
    // Migrated from protectedProcedure → orgProcedure as part of the
    // cross-tenant hardening pass — the mutation now reads the active
    // org's credentials, not the user's union of every org they're in.
    expect(src).toContain("checkAll: orgProcedure.mutation");
    expect(src).toContain("getEcommerceAdapter");
    expect(src).toContain("getSocialAdapter");
  });

  it("health router has summary query", () => {
    const src = readFile("server/routers/health.ts");
    expect(src).toContain("summary: protectedProcedure.query");
    expect(src).toContain("getConnectedPlatformSummary");
  });

  it("health router is registered in main routers.ts", () => {
    const src = readFile("server/routers.ts");
    expect(src).toContain("import { healthRouter }");
    expect(src).toContain("health: healthRouter");
  });

  it("PlatformHealth page exists", () => {
    expect(fileExists("client/src/pages/PlatformHealth.tsx")).toBe(true);
  });

  it("PlatformHealth page uses health.checkAll mutation", () => {
    const src = readFile("client/src/pages/PlatformHealth.tsx");
    expect(src).toContain("trpc.health.checkAll.useMutation");
    expect(src).toContain("trpc.health.summary.useQuery");
  });

  it("PlatformHealth page shows webhook listener status", () => {
    const src = readFile("client/src/pages/PlatformHealth.tsx");
    expect(src).toContain("Webhook Listeners");
    expect(src).toContain("orders/create");
  });

  it("/health legacy route redirects to the Settings hub", () => {
    // Post-redirect-consolidation, the /health URL no longer mounts the
    // page directly — it redirects to /settings#platform where the
    // Settings hub renders PlatformHealthPage as an admin-gated tab. This
    // keeps old bookmarks working without duplicating the page chrome.
    const src = readFile("client/src/App.tsx");
    expect(src).toContain("path=\"/health\"");
    expect(src).toContain("/settings#platform");
  });

  it("Platform Health is reachable from DashboardLayout chrome (now via Settings shell)", () => {
    // Post-consolidation, Platform Health lives inside the Settings tabbed
    // shell rather than as a top-level sidebar item. Verify the sidebar
    // surfaces a Settings entry pointing at /settings (which renders the
    // PlatformHealth tab for admins).
    const layout = readFile("client/src/components/DashboardLayout.tsx");
    expect(layout).toMatch(/path:\s*"\/settings"/);

    const settingsShell = readFile("client/src/pages/Settings.tsx");
    expect(settingsShell).toContain("PlatformHealthPage");
    expect(settingsShell).toContain("./PlatformHealth");
  });
});

// ─── Lazy Loading ─────────────────────────────────────────────────────────────

describe("Lazy Loading", () => {
  it("App.tsx uses React.lazy for all page imports", () => {
    const src = readFile("client/src/App.tsx");
    expect(src).toContain("lazy(() => import");
    // Check at least 5 lazy imports
    const lazyMatches = src.match(/lazy\(\(\) => import/g) ?? [];
    expect(lazyMatches.length).toBeGreaterThanOrEqual(5);
  });

  it("App.tsx wraps routes in Suspense", () => {
    const src = readFile("client/src/App.tsx");
    expect(src).toContain("<Suspense");
    expect(src).toContain("fallback={<PageLoader");
  });

  it("PageLoader component exists in App.tsx", () => {
    const src = readFile("client/src/App.tsx");
    expect(src).toContain("function PageLoader");
    expect(src).toContain("animate-spin");
  });
});

// ─── Micro-animations ─────────────────────────────────────────────────────────

describe("Micro-animations", () => {
  it("index.css contains stagger-in keyframe", () => {
    const src = readFile("client/src/index.css");
    expect(src).toContain("@keyframes stagger-in");
  });

  it("index.css contains slide-up keyframe", () => {
    const src = readFile("client/src/index.css");
    expect(src).toContain("@keyframes slide-up");
  });

  it("index.css contains page-enter class", () => {
    const src = readFile("client/src/index.css");
    expect(src).toContain(".page-enter");
  });

  it("index.css contains stagger-list class", () => {
    const src = readFile("client/src/index.css");
    expect(src).toContain(".stagger-list");
  });

  it("index.css contains card-hover class", () => {
    const src = readFile("client/src/index.css");
    expect(src).toContain(".card-hover");
  });

  it("index.css contains shimmer animation", () => {
    const src = readFile("client/src/index.css");
    expect(src).toContain(".shimmer");
    expect(src).toContain("@keyframes shimmer");
  });

  it("index.css has reduced-motion media query", () => {
    const src = readFile("client/src/index.css");
    expect(src).toContain("prefers-reduced-motion: reduce");
    expect(src).toContain("animation-duration: 0.01ms");
  });

  it("Home.tsx applies page-enter animation", () => {
    const src = readFile("client/src/pages/Home.tsx");
    expect(src).toContain("page-enter");
  });

  it("Home.tsx applies stagger-list to metrics grid", () => {
    const src = readFile("client/src/pages/Home.tsx");
    expect(src).toContain("stagger-list");
  });

  it("Workflows.tsx applies page-enter animation", () => {
    const src = readFile("client/src/pages/Workflows.tsx");
    expect(src).toContain("page-enter");
  });

  it("WorkflowCard applies card-hover animation", () => {
    const src = readFile("client/src/pages/Workflows.tsx");
    expect(src).toContain("card-hover");
  });
});

// ─── DashboardLayout Fix ──────────────────────────────────────────────────────

describe("DashboardLayout duplicate useLocation fix", () => {
  it("DashboardLayout has exactly one useLocation import", () => {
    const src = readFile("client/src/components/DashboardLayout.tsx");
    const importMatches = src.match(/import.*useLocation.*from.*wouter/g) ?? [];
    expect(importMatches.length).toBe(1);
  });

  it("DashboardLayout does not re-introduce duplicate useLocation calls", () => {
    // The original sprint6 fix renamed one of two clashing `useLocation()`
    // destructurings via a `navigateTo` alias. Post-refactor the layout
    // only calls `useLocation()` once, so the collision can't happen — but
    // we still guard against regressions by asserting there is at most one
    // call site in the component.
    const src = readFile("client/src/components/DashboardLayout.tsx");
    const callMatches = src.match(/useLocation\s*\(\s*\)/g) ?? [];
    expect(callMatches.length).toBeLessThanOrEqual(1);
  });

  it("DashboardLayout uses location for active path detection", () => {
    const src = readFile("client/src/components/DashboardLayout.tsx");
    // The destructured `location` (from wouter's useLocation) must still
    // drive active-state highlighting — whether destructured with
    // `setLocation` or just `[location]`.
    expect(src).toMatch(/const \[location[^\]]*\] = useLocation\(\)/);
    expect(src).toMatch(/location\s*===|location\.startsWith/);
  });
});
