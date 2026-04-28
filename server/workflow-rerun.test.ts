/**
 * Workflow rerun — one-click "run again with same inputs" for completed
 * workflows.
 *
 * Distinct from the existing `retry` mutation, which is the failure
 * recovery affordance (failed/cancelled only). Rerun is the
 * happy-path repeat — weekly niche scans, repeated competitor checks,
 * "I liked the result, give me a fresh one" flows. Creates a
 * brand-new workflow row so the original's history is preserved.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

describe("workflows.rerun — server mutation", () => {
  it("registers as an org-scoped mutation on workflowRouter", async () => {
    const mod = await import("./routers/workflows");
    const procedures = mod.workflowRouter._def.procedures as Record<string, any>;
    expect(procedures.rerun).toBeDefined();
  });

  it("uses orgProcedure (not protectedProcedure) for cross-org safety", () => {
    const src = read("server/routers/workflows.ts");
    expect(src).toMatch(/rerun:\s*orgProcedure/);
  });

  it("verifies workflow.orgId matches the active org (no cross-org rerun)", () => {
    const src = read("server/routers/workflows.ts");
    // The rerun handler must check workflow.orgId !== ctx.org.id and
    // throw FORBIDDEN — otherwise a user in two orgs could rerun
    // the other org's workflows.
    expect(src).toMatch(/rerun:[\s\S]*?workflow\.orgId !== ctx\.org\.id[\s\S]*?FORBIDDEN/);
  });

  it("rejects non-completed workflows (failed/cancelled go through retry)", () => {
    const src = read("server/routers/workflows.ts");
    expect(src).toMatch(/rerun:[\s\S]*?workflow\.status !== "completed"/);
    expect(src).toContain('Use Retry for failed/cancelled runs');
  });

  it("strips prior [Rerun]/[Retry] prefixes so titles don't accumulate", () => {
    // After 3 reruns a workflow titled "Niche scan" must NOT become
    // "[Rerun] [Rerun] [Rerun] Niche scan". The regex strips first.
    const src = read("server/routers/workflows.ts");
    expect(src).toMatch(/replace\(\/\^\\\[\(Rerun\|Retry\)\\\]\\s\+\/g,\s*""\)/);
  });

  it("preserves all workflow inputs (agentType, type, scope, storeId, input)", () => {
    const src = read("server/routers/workflows.ts");
    // Locate the rerun handler block
    const rerunBlock = src.split("rerun: orgProcedure")[1]?.split("// ─── Available")[0] ?? "";
    expect(rerunBlock).toContain("agentType: workflow.agentType");
    expect(rerunBlock).toContain("workflowType: workflow.workflowType");
    expect(rerunBlock).toContain("scope: workflow.scope");
    expect(rerunBlock).toContain("storeId: workflow.storeId");
    expect(rerunBlock).toContain("input: (workflow.input as Record<string, any>) ?? {}");
  });
});

describe("Workflows.tsx — rerun button on history cards", () => {
  it("WorkflowCard accepts optional onRerun props", () => {
    const src = read("client/src/pages/Workflows.tsx");
    expect(src).toContain("onRerun?:");
    expect(src).toContain("isRerunningThis?:");
    expect(src).toContain("anyRerunInFlight?:");
  });

  it("renders the Rerun button only for completed workflows", () => {
    const src = read("client/src/pages/Workflows.tsx");
    expect(src).toMatch(/canRerun\s*=\s*workflow\.status === "completed"\s*&&\s*!!onRerun/);
  });

  it("Rerun button uses the emerald accent (Retry uses amber)", () => {
    const src = read("client/src/pages/Workflows.tsx");
    // Visual distinction: rerun = success-state action (emerald), retry = recovery action (amber)
    expect(src).toContain("border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10");
    expect(src).toContain("border-amber-500/30 text-amber-400 hover:bg-amber-500/10");
  });

  it("Workflows page wires trpc.workflows.rerun.useMutation with optimistic state", () => {
    const src = read("client/src/pages/Workflows.tsx");
    expect(src).toContain("trpc.workflows.rerun.useMutation");
    // Per-row spinner state via setRerunningId
    expect(src).toContain("setRerunningId(vars.workflowId)");
    // Invalidates the right caches on success
    expect(src).toContain("utils.workflows.active.invalidate()");
    expect(src).toContain("utils.workflows.counts.invalidate()");
  });

  it("Active tab does NOT pass onRerun (rerun only valid for history)", () => {
    // Rerun on an active workflow makes no sense — hide the affordance
    // entirely on that surface.
    const src = read("client/src/pages/Workflows.tsx");
    const activeBlock = src.split("Active Tab")[1]?.split("History Tab")[0] ?? "";
    expect(activeBlock).not.toContain("onRerun=");
    const historyBlock = src.split("History Tab")[1] ?? "";
    expect(historyBlock).toContain("onRerun={onRerun}");
  });
});
