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
    expect(src).toContain("retry: protectedProcedure");
    expect(src).toContain("workflowId: z.number()");
  });

  it("retry validates that only failed/cancelled workflows can be retried", () => {
    const src = readFile("server/routers/workflows.ts");
    expect(src).toContain("status !== \"failed\" && workflow.status !== \"cancelled\"");
    expect(src).toContain("Only failed or cancelled workflows can be retried");
  });

  it("retry re-launches workflow with same parameters", () => {
    const src = readFile("server/routers/workflows.ts");
    expect(src).toContain("launchWorkflow(ctx.user.id");
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
    expect(src).toContain("checkAll: protectedProcedure.mutation");
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

  it("/health route is registered in App.tsx", () => {
    const src = readFile("client/src/App.tsx");
    expect(src).toContain("path=\"/health\"");
    expect(src).toContain("PlatformHealthPage");
  });

  it("Platform Health appears in DashboardLayout sidebar", () => {
    const src = readFile("client/src/components/DashboardLayout.tsx");
    expect(src).toContain("Platform Health");
    expect(src).toContain("path: \"/health\"");
    expect(src).toContain("HeartPulse");
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

  it("DashboardLayout outer component uses navigateTo alias to avoid collision", () => {
    const src = readFile("client/src/components/DashboardLayout.tsx");
    expect(src).toContain("navigateTo");
  });

  it("DashboardLayout inner component still uses location for active path", () => {
    const src = readFile("client/src/components/DashboardLayout.tsx");
    expect(src).toContain("const [location, setLocation] = useLocation()");
  });
});
