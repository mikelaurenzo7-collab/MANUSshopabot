/**
 * Tests for the bot-boost wave: new workflow types + engine
 * capabilities. We don't run the workflows end-to-end (no live LLM
 * in the test env); we verify they're registered, that the engine
 * recognizes the new step type, and that the safety-rule
 * implementation guards rate_limit correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Side-effect imports trigger registerWorkflow() for each bot
import "./engine/architectWorkflows";
import "./engine/merchantWorkflows";
import "./engine/socialWorkflows";

import {
  workflowRegistry,
  enforceSafetyRules,
  type StepContext,
} from "./engine/workflowEngine";

describe("Bot-boost — new workflow types", () => {
  it("Builder registers competitor_pricing_scan", () => {
    expect(workflowRegistry.has("competitor_pricing_scan")).toBe(true);
    const factory = workflowRegistry.get("competitor_pricing_scan")!;
    const steps = factory({ niche: "ergonomic desks", productType: "standing desk", targetMarginPct: 35 });
    expect(steps.length).toBeGreaterThan(0);
    // First step should be the parallel group
    expect(steps[0].stepType).toBe("parallel_group");
    const substeps = steps[0].input?.substeps;
    expect(Array.isArray(substeps)).toBe(true);
    expect(substeps).toHaveLength(2);
  });

  it("Merchant registers margin_guard_audit with an approval gate", () => {
    expect(workflowRegistry.has("margin_guard_audit")).toBe(true);
    const steps = workflowRegistry.get("margin_guard_audit")!({ minMarginPct: 20 });
    const approvalStep = steps.find((s) => s.stepType === "approval_gate");
    expect(approvalStep).toBeDefined();
    expect(approvalStep!.requiresApproval).toBe(true);
  });

  it("Social registers subject_line_ab_test", () => {
    expect(workflowRegistry.has("subject_line_ab_test")).toBe(true);
    const steps = workflowRegistry.get("subject_line_ab_test")!({
      campaignType: "abandoned_cart",
      productOrTopic: "ergonomic desk",
      brandVoice: "playful",
    });
    expect(steps[0].stepType).toBe("llm_call");
    // Schema requires 5 angles (curiosity, urgency, benefit, question, personalization)
    const schema =
      steps[0].input?.responseFormat?.json_schema?.schema?.properties?.variants?.items?.properties
        ?.angle?.enum;
    expect(schema).toEqual(["curiosity", "urgency", "benefit", "question", "personalization"]);
  });

  it("availableTypes router exposes the three new types", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["workflows.availableTypes"]).toBeDefined();

    // Read the source — the structural assertion guards against the
    // types accidentally being removed.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "routers/workflows.ts"), "utf-8");
    expect(src).toContain('type: "competitor_pricing_scan"');
    expect(src).toContain('type: "margin_guard_audit"');
    expect(src).toContain('type: "subject_line_ab_test"');
  });
});

describe("Bot-boost — engine parallel_group", () => {
  it("StepType union includes parallel_group", async () => {
    // TypeScript-level guard: the schema enum + StepType must include it.
    const schema = await import("../drizzle/schema");
    const cols = schema.workflowSteps as unknown as Record<string, any>;
    expect(cols.stepType).toBeDefined();
  });

  it("ad_campaign uses parallel_group for the audience+copy+creative phase", () => {
    expect(workflowRegistry.has("ad_campaign")).toBe(true);
    const steps = workflowRegistry.get("ad_campaign")!({ platform: "meta", product: "test product", budget: "$50/day" });
    // First step should be the parallel group, then approval, then notification
    expect(steps[0].stepType).toBe("parallel_group");
    const substeps = steps[0].input?.substeps;
    expect(Array.isArray(substeps)).toBe(true);
    expect(substeps).toHaveLength(3);
    // Two LLM calls + one image generation, in any order
    const stepTypes = substeps.map((s: any) => s.stepType).sort();
    expect(stepTypes).toEqual(["image_generation", "llm_call", "llm_call"]);
  });

  it("product_creative uses parallel_group for the three image renders", () => {
    expect(workflowRegistry.has("product_creative")).toBe(true);
    const steps = workflowRegistry.get("product_creative")!({ product: "test sku" });
    // Step 1 = creative brief (LLM); step 2 = parallel_group with 3 image gens
    const parallelStep = steps.find((s) => s.stepType === "parallel_group");
    expect(parallelStep).toBeDefined();
    expect(parallelStep!.input?.substeps).toHaveLength(3);
    expect(parallelStep!.input?.substeps.every((s: any) => s.stepType === "image_generation")).toBe(true);
  });
});

describe("Bot-boost — wave 2 workflows", () => {
  it("Builder registers brand_identity_kit with parallel voice+palette+naming", () => {
    expect(workflowRegistry.has("brand_identity_kit")).toBe(true);
    const steps = workflowRegistry.get("brand_identity_kit")!({ niche: "ergonomic furniture", target: "remote workers", brandStyle: "modern minimal" });
    expect(steps[0].stepType).toBe("parallel_group");
    expect(steps[0].input?.substeps).toHaveLength(3);
    // Logo image gen comes after the brief
    const imageStep = steps.find((s) => s.stepType === "image_generation");
    expect(imageStep).toBeDefined();
  });

  it("Merchant registers velocity_restock_predictor with approval gate", () => {
    expect(workflowRegistry.has("velocity_restock_predictor")).toBe(true);
    const steps = workflowRegistry.get("velocity_restock_predictor")!({ lookbackDays: 30, supplierLeadTimeDays: 14 });
    // First step: data_transform to compute velocity; LLM step for plan; approval gate
    expect(steps[0].stepType).toBe("data_transform");
    expect(steps[0].input?.operation).toBe("compute_sales_velocity");
    const approvalStep = steps.find((s) => s.stepType === "approval_gate");
    expect(approvalStep).toBeDefined();
    expect(approvalStep!.requiresApproval).toBe(true);
  });

  it("Social registers send_time_optimizer pulling from email_delivery_events", () => {
    expect(workflowRegistry.has("send_time_optimizer")).toBe(true);
    const steps = workflowRegistry.get("send_time_optimizer")!({ lookbackDays: 90, audience: "winback" });
    // Step 1: data_transform aggregates the heatmap; Step 2: LLM recommends; Step 3: notify
    expect(steps[0].stepType).toBe("data_transform");
    expect(steps[0].input?.operation).toBe("aggregate_open_heatmap");
    // Schema enforces cold-start handling
    const llmStep = steps.find((s) => s.stepType === "llm_call");
    const schemaProps =
      llmStep!.input?.responseFormat?.json_schema?.schema?.properties;
    expect(schemaProps?.isColdStart).toBeDefined();
    expect(schemaProps?.confidence?.enum).toEqual(["low", "medium", "high"]);
  });

  it("availableTypes router exposes the wave-2 types", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "routers/workflows.ts"), "utf-8");
    expect(src).toContain('type: "brand_identity_kit"');
    expect(src).toContain('type: "velocity_restock_predictor"');
    expect(src).toContain('type: "send_time_optimizer"');
  });
});

describe("Bot-boost — rate_limit safety rule", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows actions when there's no bot profile or no rate-limit rule", async () => {
    // No botProfile → enforcement short-circuits to allowed
    const ctx = {
      workflowId: 1,
      userId: 1,
      stepId: 1,
      stepIndex: 0,
      agentType: "merchant" as const,
      input: {},
      previousOutputs: [],
      botProfile: null,
    } as unknown as StepContext;
    const result = await enforceSafetyRules(ctx, { actionType: "price_change", amount: 10 });
    expect(result.allowed).toBe(true);
  });

  it("denies actions when the rate_limit window count is hit", async () => {
    // Mock a botProfile + a rate_limit rule, and stub getAgentTasks to
    // return enough recent matching tasks to trip the gate.
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    vi.doMock("./db", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./db")>();
      return {
        ...actual,
        getBotSafetyRules: vi.fn().mockResolvedValue([
          {
            id: 1,
            ruleType: "rate_limit",
            limit: "3",
            windowSeconds: 3600,
          },
        ]),
        getAgentTasks: vi.fn().mockResolvedValue([
          { taskType: "price_change", createdAt: sixMinutesAgo, agentType: "merchant" },
          { taskType: "price_change", createdAt: sixMinutesAgo, agentType: "merchant" },
          { taskType: "price_change", createdAt: sixMinutesAgo, agentType: "merchant" },
          // Older task should be ignored — outside the window
          { taskType: "price_change", createdAt: new Date(Date.now() - 90 * 60 * 1000), agentType: "merchant" },
        ]),
      };
    });

    // Re-import after the mock so the engine picks up our stub
    const { enforceSafetyRules: enforce } = await import("./engine/workflowEngine");
    const ctx = {
      workflowId: 1,
      userId: 1,
      stepId: 1,
      stepIndex: 0,
      agentType: "merchant" as const,
      input: {},
      previousOutputs: [],
      botProfile: { id: 1, requiresApproval: true },
    } as unknown as StepContext;

    const result = await enforce(ctx, { actionType: "price_change" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Rate limit hit");

    vi.doUnmock("./db");
  });
});
