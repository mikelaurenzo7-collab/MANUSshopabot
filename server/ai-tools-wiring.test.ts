/**
 * Tests for AI Tools wiring — verifying that all 9 backend mutations
 * exist and are callable (the UI buttons now call these instead of showing toasts).
 */
import { describe, it, expect } from "vitest";

describe("Architect AI Tools Backend Mutations", () => {
  it("architectRouter has storeHealthCheck mutation", async () => {
    const mod = await import("./routers/architect");
    const procedures = mod.architectRouter._def.procedures as Record<string, any>;
    expect(procedures.storeHealthCheck).toBeDefined();
  });

  it("architectRouter has rewriteProductDescriptions mutation", async () => {
    const mod = await import("./routers/architect");
    const procedures = mod.architectRouter._def.procedures as Record<string, any>;
    expect(procedures.rewriteProductDescriptions).toBeDefined();
  });

  it("architectRouter has competitorPriceScan mutation", async () => {
    const mod = await import("./routers/architect");
    const procedures = mod.architectRouter._def.procedures as Record<string, any>;
    expect(procedures.competitorPriceScan).toBeDefined();
  });
});

describe("Merchant AI Tools Backend Mutations", () => {
  it("merchantRouter has demandForecasting mutation", async () => {
    const mod = await import("./routers/merchant");
    const procedures = mod.merchantRouter._def.procedures as Record<string, any>;
    expect(procedures.demandForecasting).toBeDefined();
  });

  it("merchantRouter has marginAnalyzer mutation", async () => {
    const mod = await import("./routers/merchant");
    const procedures = mod.merchantRouter._def.procedures as Record<string, any>;
    expect(procedures.marginAnalyzer).toBeDefined();
  });

  it("merchantRouter has returnAnalysis mutation", async () => {
    const mod = await import("./routers/merchant");
    const procedures = mod.merchantRouter._def.procedures as Record<string, any>;
    expect(procedures.returnAnalysis).toBeDefined();
  });
});

describe("HypeMan AI Tools Backend Mutations", () => {
  it("hypemanRouter has abTestCopyGenerator mutation", async () => {
    const mod = await import("./routers/hypeman");
    const procedures = mod.hypemanRouter._def.procedures as Record<string, any>;
    expect(procedures.abTestCopyGenerator).toBeDefined();
  });

  it("hypemanRouter has smsRecoveryFlow mutation", async () => {
    const mod = await import("./routers/hypeman");
    const procedures = mod.hypemanRouter._def.procedures as Record<string, any>;
    expect(procedures.smsRecoveryFlow).toBeDefined();
  });

  it("hypemanRouter has socialProofGenerator mutation", async () => {
    const mod = await import("./routers/hypeman");
    const procedures = mod.hypemanRouter._def.procedures as Record<string, any>;
    expect(procedures.socialProofGenerator).toBeDefined();
  });
});

describe("Main Router includes telemetry", () => {
  it("appRouter includes telemetry sub-router", async () => {
    const mod = await import("./routers");
    const procedures = mod.appRouter._def.procedures as Record<string, any>;
    // telemetry.byStore, telemetry.byAgent, telemetry.stats
    expect(procedures["telemetry.byStore"]).toBeDefined();
    expect(procedures["telemetry.byAgent"]).toBeDefined();
    expect(procedures["telemetry.stats"]).toBeDefined();
  });
});
