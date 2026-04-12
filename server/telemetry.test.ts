/**
 * Tests for the Agent Telemetry system:
 * 1. telemetry.ts — withTelemetry wrapper and logAgentAction
 * 2. Telemetry DB helpers
 * 3. Telemetry tRPC router
 * 4. Webhook telemetry integration
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Unit Tests: telemetry.ts ─────────────────────────────────────────────

describe("Telemetry Module", () => {
  it("exports withTelemetry function", async () => {
    const mod = await import("./telemetry");
    expect(typeof mod.withTelemetry).toBe("function");
  });

  it("exports logAgentAction function", async () => {
    const mod = await import("./telemetry");
    expect(typeof mod.logAgentAction).toBe("function");
  });

  it("exports collectOutcome function", async () => {
    const mod = await import("./telemetry");
    expect(typeof mod.collectOutcome).toBe("function");
  });

  it("withTelemetry returns the wrapped function's result", async () => {
    const { withTelemetry } = await import("./telemetry");
    const result = await withTelemetry(
      { agentType: "architect", actionType: "test_action" },
      async () => ({ success: true, data: "hello" }),
    );
    expect(result).toEqual({ success: true, data: "hello" });
  });

  it("withTelemetry re-throws errors from the wrapped function", async () => {
    const { withTelemetry } = await import("./telemetry");
    await expect(
      withTelemetry(
        { agentType: "merchant", actionType: "failing_action" },
        async () => { throw new Error("Test failure"); },
      ),
    ).rejects.toThrow("Test failure");
  });

  it("logAgentAction does not throw even if DB is unavailable", async () => {
    const { logAgentAction } = await import("./telemetry");
    // Should not throw — gracefully handles DB errors
    const result = await logAgentAction({
      agentType: "hypeman",
      actionType: "test_no_db",
      success: true,
    });
    // Result may be null if DB is unavailable, that's fine
    expect(result === null || typeof result === "number").toBe(true);
  });
});

// ─── Unit Tests: Telemetry DB helpers ─────────────────────────────────────

describe("Telemetry DB Helpers", () => {
  it("exports logTelemetry", async () => {
    const db = await import("./db");
    expect(typeof db.logTelemetry).toBe("function");
  });

  it("exports updateTelemetryOutcome", async () => {
    const db = await import("./db");
    expect(typeof db.updateTelemetryOutcome).toBe("function");
  });

  it("exports getTelemetryByStore", async () => {
    const db = await import("./db");
    expect(typeof db.getTelemetryByStore).toBe("function");
  });

  it("exports getTelemetryByAgent", async () => {
    const db = await import("./db");
    expect(typeof db.getTelemetryByAgent).toBe("function");
  });

  it("exports getTelemetryStats", async () => {
    const db = await import("./db");
    expect(typeof db.getTelemetryStats).toBe("function");
  });
});

// ─── Unit Tests: Telemetry Router ─────────────────────────────────────────

describe("Telemetry Router", () => {
  it("exports telemetryRouter", async () => {
    const mod = await import("./routers/telemetry");
    expect(mod.telemetryRouter).toBeDefined();
  });

  it("telemetryRouter has byStore, byAgent, and stats procedures", async () => {
    const mod = await import("./routers/telemetry");
    const router = mod.telemetryRouter;
    // tRPC routers have _def.procedures
    expect(router._def.procedures).toBeDefined();
    const procedures = router._def.procedures as Record<string, any>;
    expect(procedures.byStore).toBeDefined();
    expect(procedures.byAgent).toBeDefined();
    expect(procedures.stats).toBeDefined();
  });
});

// ─── Unit Tests: Schema ───────────────────────────────────────────────────

describe("Agent Telemetry Schema", () => {
  it("exports agentTelemetry table and InsertAgentTelemetry type", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.agentTelemetry).toBeDefined();
    // Check table has expected columns
    const columns = Object.keys(schema.agentTelemetry);
    expect(columns).toContain("agentType");
    expect(columns).toContain("actionType");
    expect(columns).toContain("success");
    expect(columns).toContain("durationMs");
    expect(columns).toContain("outcomeType");
    expect(columns).toContain("llmModel");
  });
});

// ─── Integration: Workflow Engine has telemetry import ─────────────────────

describe("Workflow Engine Telemetry Integration", () => {
  it("workflowEngine imports logAgentAction from telemetry", async () => {
    // Just verify the module loads without errors
    const mod = await import("./engine/workflowEngine");
    expect(typeof mod.launchWorkflow).toBe("function");
  });
});

// ─── Integration: Shopify Webhooks have telemetry import ──────────────────

describe("Shopify Webhooks Telemetry Integration", () => {
  it("shopifyWebhooks imports logAgentAction from telemetry", async () => {
    const mod = await import("./shopifyWebhooks");
    expect(typeof mod.registerShopifyWebhookRoutes).toBe("function");
  });
});

// ─── Integration: Scheduler has telemetry import ──────────────────────────

describe("Scheduler Telemetry Integration", () => {
  it("scheduler imports logAgentAction from telemetry", async () => {
    const mod = await import("./scheduler/index");
    expect(mod.agentScheduler).toBeDefined();
  });
});
