/**
 * LiveWorkflowRunner + LiveActivityTicker presence tests.
 *
 * Both components live above the fold on the most-trafficked pages
 * (Workflows / Home), and both depend on existing tRPC contracts
 * (workflows.detail and dashboard.recentActivity). These tests guard
 * the presence of the components, the contract they consume, and
 * the mount points so a careless refactor can't silently regress
 * the dashboard's signature liveness signals.
 */
import { describe, it, expect } from "vitest";

const read = (rel: string): string => {
  const fs = require("fs");
  const path = require("path");
  return fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");
};

describe("LiveWorkflowRunner — real-time step rail", () => {
  it("component file exists and reads workflows.detail", () => {
    const src = read("client/src/components/LiveWorkflowRunner.tsx");
    expect(src).toContain("trpc.workflows.detail");
    // Must auto-stop polling on terminal states.
    expect(src).toContain("return false");
    expect(src).toContain("running");
    expect(src).toContain("awaiting_approval");
  });

  it("renders all five step phases (done/running/awaiting/failed/upcoming)", () => {
    const src = read("client/src/components/LiveWorkflowRunner.tsx");
    for (const phase of ["done", "running", "awaiting", "failed", "upcoming"]) {
      expect(src).toContain(`phase === "${phase}"`);
    }
  });

  it("Workflows page mounts the runner for in-flight workflows", () => {
    const src = read("client/src/pages/Workflows.tsx");
    expect(src).toContain('import { LiveWorkflowRunner }');
    expect(src).toContain("<LiveWorkflowRunner");
    // Must keep the static card path for non-running workflows so
    // failed/cancelled/queued ones don't lose their retry button.
    expect(src).toContain("WorkflowCard");
  });
});

describe("ActiveBotWorkflows — inline runner panel", () => {
  it("filters workflows.active to the panel's agentType", () => {
    const src = read("client/src/components/ActiveBotWorkflows.tsx");
    expect(src).toContain("trpc.workflows.active");
    expect(src).toContain("w.agentType === agentType");
    // Must auto-hide on empty so bot pages don't carry a hollow card.
    expect(src).toContain("own.length === 0");
    expect(src).toContain("return null");
  });

  it("the inline panel imports + filters as expected (legacy bot-page mounts removed)", () => {
    // The standalone Architect/Merchant/Social pages were retired and now
    // redirect to /chat, so we can no longer assert their `<ActiveBotWorkflows>`
    // mounts. The component itself is still required to filter by agentType.
    const src = read("client/src/components/ActiveBotWorkflows.tsx");
    expect(src).toContain("agentType");
  });
});

describe("BotRecentWins — last 3 completions strip", () => {
  it("reads workflows.list filtered to completed status", () => {
    const src = read("client/src/components/BotRecentWins.tsx");
    expect(src).toContain("trpc.workflows.list");
    expect(src).toContain('status: "completed"');
    expect(src).toContain("limit: 3");
  });

  it("calls workflows.rerun on click + invalidates the active list", () => {
    const src = read("client/src/components/BotRecentWins.tsx");
    expect(src).toContain("trpc.workflows.rerun.useMutation");
    expect(src).toContain("workflows.active.invalidate");
  });

  it("BotRecentWins component still exposes the agentType prop (legacy bot-page mounts removed)", () => {
    // Architect/Merchant/Social standalone pages were retired in favor of
    // the unified /chat surface. We keep the component itself, so just
    // assert it accepts an agentType filter.
    const src = read("client/src/components/BotRecentWins.tsx");
    expect(src).toContain("agentType");
  });
});

describe("LiveActivityTicker — always-on newsfeed", () => {
  it("component file exists and reads dashboard.recentActivity", () => {
    const src = read("client/src/components/LiveActivityTicker.tsx");
    expect(src).toContain("trpc.dashboard.recentActivity");
    // Auto-rotate every 4.5s and pause on hover.
    expect(src).toContain("4500");
    expect(src).toContain("setPaused(true)");
    expect(src).toContain("setPaused(false)");
  });

  it("Home page mounts the ticker", () => {
    const src = read("client/src/pages/Home.tsx");
    expect(src).toContain('import { LiveActivityTicker }');
    expect(src).toContain("<LiveActivityTicker />");
  });

  it("uses aria-live polite so screen readers announce updates", () => {
    const src = read("client/src/components/LiveActivityTicker.tsx");
    expect(src).toContain('aria-live="polite"');
  });
});
