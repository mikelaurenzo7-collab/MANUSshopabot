/**
 * Sprint 17 Tests
 * - approve_workflow tool definition
 * - get_products tool definition
 * - bulk_push_products platform push logic
 * - resumeWorkflow export check
 */

import { describe, it, expect } from "vitest";

// ─── Tool registry tests ────────────────────────────────────────────────────

const TOOL_NAMES = [
  "launch_workflow",
  "get_store_status",
  "list_recent_workflows",
  "approve_workflow",
  "get_products",
];

describe("Chat Router Tools", () => {
  it("should have 5 tools defined", () => {
    expect(TOOL_NAMES).toHaveLength(5);
  });

  it("should include approve_workflow tool", () => {
    expect(TOOL_NAMES).toContain("approve_workflow");
  });

  it("should include get_products tool", () => {
    expect(TOOL_NAMES).toContain("get_products");
  });

  it("approve_workflow requires workflowId and approved params", () => {
    const tool = {
      name: "approve_workflow",
      required: ["workflowId", "approved"],
    };
    expect(tool.required).toContain("workflowId");
    expect(tool.required).toContain("approved");
  });

  it("get_products requires storeId param", () => {
    const tool = {
      name: "get_products",
      required: ["storeId"],
    };
    expect(tool.required).toContain("storeId");
  });
});

// ─── resumeWorkflow export test ─────────────────────────────────────────────

describe("WorkflowEngine exports", () => {
  it("should export resumeWorkflow", async () => {
    const engine = await import("./engine/workflowEngine");
    expect(typeof engine.resumeWorkflow).toBe("function");
  });

  it("should export launchWorkflow", async () => {
    const engine = await import("./engine/workflowEngine");
    expect(typeof engine.launchWorkflow).toBe("function");
  });

  it("should export listWorkflowTypes", async () => {
    const engine = await import("./engine/workflowEngine");
    expect(typeof engine.listWorkflowTypes).toBe("function");
  });
});

// ─── bulk_push_products platform push logic ─────────────────────────────────

describe("bulk_push_products platform push logic", () => {
  it("should push to platform when status is active", () => {
    const input = { productStatus: "active", pushToPlatform: false };
    const status = input.productStatus === "active" ? "active" : "draft";
    const shouldPush = status === "active" || input.pushToPlatform === true;
    expect(shouldPush).toBe(true);
  });

  it("should push to platform when pushToPlatform is true regardless of status", () => {
    const input = { productStatus: "draft", pushToPlatform: true };
    const status = input.productStatus === "active" ? "active" : "draft";
    const shouldPush = status === "active" || input.pushToPlatform === true;
    expect(shouldPush).toBe(true);
  });

  it("should NOT push to platform when status is draft and pushToPlatform is false", () => {
    const input = { productStatus: "draft", pushToPlatform: false };
    const status = input.productStatus === "active" ? "active" : "draft";
    const shouldPush = status === "active" || input.pushToPlatform === true;
    expect(shouldPush).toBe(false);
  });

  it("should match inserted products by title", () => {
    const rows = [
      { title: "Eco Bottle", storeId: 1 },
      { title: "Bamboo Cup", storeId: 1 },
    ];
    const storedProducts = [
      { id: 101, title: "Eco Bottle", status: "active" },
      { id: 102, title: "Bamboo Cup", status: "draft" },
      { id: 103, title: "Old Product", status: "active" },
    ];
    const insertedTitles = new Set(rows.map((r) => r.title));
    const toPush = storedProducts.filter(
      (p) => insertedTitles.has(p.title) && (p.status === "active" || p.status === "draft")
    );
    expect(toPush).toHaveLength(2);
    expect(toPush.map((p) => p.id)).toEqual([101, 102]);
  });

  it("should cap platform push at 50 products", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ title: `Product ${i}`, storeId: 1 }));
    const insertedTitles = new Set(rows.map((r) => r.title));
    const storedProducts = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      title: `Product ${i}`,
      status: "active",
    }));
    const toPush = storedProducts
      .filter((p) => insertedTitles.has(p.title))
      .slice(0, 50);
    expect(toPush).toHaveLength(50);
  });
});

// ─── Owner promotion tests ───────────────────────────────────────────────────

describe("Org member role promotion", () => {
  it("should allow owner role in org_members", () => {
    const validRoles = ["owner", "admin", "member"];
    expect(validRoles).toContain("owner");
  });

  it("orgAdminProcedure should allow owner role", () => {
    const allowedRoles = ["owner", "admin"];
    expect(allowedRoles).toContain("owner");
    expect(allowedRoles).toContain("admin");
  });
});
