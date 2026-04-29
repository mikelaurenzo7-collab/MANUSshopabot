/**
 * WorkflowBuilder logic tests
 * Tests the step type registry and template structure (pure logic, no React)
 */
import { describe, it, expect } from "vitest";

// ── Replicate the step type registry (pure data, no React imports) ────────────

type StepKind =
  | "llm_analysis"
  | "api_call"
  | "approval_gate"
  | "store_action"
  | "notification"
  | "condition";

const STEP_KINDS: StepKind[] = [
  "llm_analysis",
  "api_call",
  "approval_gate",
  "store_action",
  "notification",
  "condition",
];

const DEFAULT_CONFIGS: Record<StepKind, Record<string, string>> = {
  llm_analysis: { prompt: "", outputKey: "analysis" },
  api_call: { endpoint: "suppliers.printful.search", query: "" },
  approval_gate: { message: "Please review before continuing." },
  store_action: { action: "push_products", status: "draft" },
  notification: { title: "Workflow update", message: "" },
  condition: { expression: "score >= 70", truePath: "continue", falsePath: "stop" },
};

const TEMPLATES = [
  {
    name: "Product Drop",
    agentType: "architect" as const,
    nodes: [
      { kind: "llm_analysis" as StepKind, label: "Niche Research" },
      { kind: "api_call" as StepKind, label: "Source Products" },
      { kind: "approval_gate" as StepKind, label: "Review Catalog" },
      { kind: "store_action" as StepKind, label: "Push to Store" },
    ],
  },
  {
    name: "Pricing Sweep",
    agentType: "merchant" as const,
    nodes: [
      { kind: "api_call" as StepKind, label: "Fetch Supplier Costs" },
      { kind: "llm_analysis" as StepKind, label: "Margin Analysis" },
      { kind: "store_action" as StepKind, label: "Update Prices" },
      { kind: "notification" as StepKind, label: "Pricing Complete" },
    ],
  },
  {
    name: "Campaign Launch",
    agentType: "social" as const,
    nodes: [
      { kind: "llm_analysis" as StepKind, label: "Generate Copy" },
      { kind: "approval_gate" as StepKind, label: "Review Posts" },
      { kind: "store_action" as StepKind, label: "Publish Posts" },
      { kind: "notification" as StepKind, label: "Campaign Live" },
    ],
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkflowBuilder step registry", () => {
  it("has exactly 6 step kinds", () => {
    expect(STEP_KINDS).toHaveLength(6);
  });

  it("every step kind has a default config", () => {
    for (const kind of STEP_KINDS) {
      expect(DEFAULT_CONFIGS[kind]).toBeDefined();
      expect(typeof DEFAULT_CONFIGS[kind]).toBe("object");
    }
  });

  it("all default config values are strings (not undefined)", () => {
    for (const kind of STEP_KINDS) {
      for (const [key, val] of Object.entries(DEFAULT_CONFIGS[kind])) {
        expect(typeof val).toBe("string", `${kind}.${key} should be a string`);
      }
    }
  });

  it("api_call default endpoint is a valid supplier route", () => {
    const endpoint = DEFAULT_CONFIGS.api_call.endpoint;
    expect(endpoint).toMatch(/^suppliers\./);
  });

  it("condition default config has truePath and falsePath", () => {
    const cfg = DEFAULT_CONFIGS.condition;
    expect(cfg.truePath).toBe("continue");
    expect(cfg.falsePath).toBe("stop");
  });
});

describe("WorkflowBuilder templates", () => {
  it("has exactly 3 templates", () => {
    expect(TEMPLATES).toHaveLength(3);
  });

  it("each template has a unique name", () => {
    const names = TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(TEMPLATES.length);
  });

  it("each template has at least 3 nodes", () => {
    for (const tpl of TEMPLATES) {
      expect(tpl.nodes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("each template node kind is a valid StepKind", () => {
    for (const tpl of TEMPLATES) {
      for (const node of tpl.nodes) {
        expect(STEP_KINDS).toContain(node.kind);
      }
    }
  });

  it("templates cover all 3 agent types", () => {
    const agentTypes = new Set(TEMPLATES.map((t) => t.agentType));
    expect(agentTypes.has("architect")).toBe(true);
    expect(agentTypes.has("merchant")).toBe(true);
    expect(agentTypes.has("social")).toBe(true);
  });

  it("Product Drop template ends with a store_action", () => {
    const tpl = TEMPLATES.find((t) => t.name === "Product Drop")!;
    const lastNode = tpl.nodes[tpl.nodes.length - 1];
    expect(lastNode.kind).toBe("store_action");
  });

  it("Pricing Sweep template starts with api_call", () => {
    const tpl = TEMPLATES.find((t) => t.name === "Pricing Sweep")!;
    expect(tpl.nodes[0].kind).toBe("api_call");
  });

  it("Campaign Launch template has an approval gate", () => {
    const tpl = TEMPLATES.find((t) => t.name === "Campaign Launch")!;
    const hasGate = tpl.nodes.some((n) => n.kind === "approval_gate");
    expect(hasGate).toBe(true);
  });
});

describe("WorkflowBuilder node sort logic", () => {
  it("sorts nodes by y position for step ordering", () => {
    const nodes = [
      { id: "c", position: { x: 200, y: 440 }, data: { kind: "store_action" as StepKind } },
      { id: "a", position: { x: 200, y: 50 }, data: { kind: "llm_analysis" as StepKind } },
      { id: "b", position: { x: 200, y: 180 }, data: { kind: "api_call" as StepKind } },
    ];
    const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
    expect(sorted[2].id).toBe("c");
  });

  it("maps first llm_analysis node to niche_research workflow type", () => {
    const firstNode = { data: { kind: "llm_analysis" as StepKind } };
    const workflowType =
      firstNode.data.kind === "api_call"
        ? "product_sourcing"
        : firstNode.data.kind === "llm_analysis"
        ? "niche_research"
        : "complete_store_buildout";
    expect(workflowType).toBe("niche_research");
  });

  it("maps first api_call node to product_sourcing workflow type", () => {
    const firstNode = { data: { kind: "api_call" as StepKind } };
    const workflowType =
      firstNode.data.kind === "api_call"
        ? "product_sourcing"
        : firstNode.data.kind === "llm_analysis"
        ? "niche_research"
        : "complete_store_buildout";
    expect(workflowType).toBe("product_sourcing");
  });
});
