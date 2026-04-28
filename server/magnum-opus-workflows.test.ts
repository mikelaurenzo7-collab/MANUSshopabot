/**
 * Magnum-opus workflows — Builder + Merchant pipelines that
 * actually execute, not just analyze.
 *
 * Most "AI for e-commerce" tools stop at generating copy. These
 * two workflows go end-to-end:
 *
 *   • complete_store_buildout (Builder) — niche → brand → catalog
 *     → approval → bulk push as drafts → legal pages → summary.
 *     Turns "I have a niche" into "my Shopify has 10 draft products
 *     waiting for me to publish."
 *
 *   • store_optimization_sweep (Merchant) — sync → inventory →
 *     margin guard → pricing change-set → approval → top-N listing
 *     rewrites → summary. Turns "my store is running" into "my
 *     store is demonstrably better."
 *
 * Source-level tests assert the workflows are registered, the
 * step shapes are right, and the dispatcher can execute every
 * step type each one uses.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

describe("complete_store_buildout — Builder magnum opus", () => {
  it("is registered in architectWorkflows.ts", () => {
    const src = read("server/engine/architectWorkflows.ts");
    expect(src).toContain('registerWorkflow("complete_store_buildout"');
  });

  it("is registered in availableTypes as the lead architect workflow", () => {
    const src = read("server/routers/workflows.ts");
    // Must be the FIRST architect workflow so the picker shows it as
    // the recommended choice for fresh starts.
    const archStart = src.indexOf("architect: [");
    const firstWorkflowIdx = src.indexOf("type:", archStart);
    expect(src.slice(firstWorkflowIdx, firstWorkflowIdx + 200)).toContain('"complete_store_buildout"');
  });

  it("walks the full pipeline (niche → brand → catalog → approval → push → legal → notify)", () => {
    const src = read("server/engine/architectWorkflows.ts");
    // Pull the buildout block and assert every step in order
    const block = src.split('registerWorkflow("complete_store_buildout"')[1] ?? "";
    const niche = block.indexOf('title: "Niche Research"');
    const brand = block.indexOf('title: "Brand Identity"');
    const catalog = block.indexOf('title: "Generate Starter Catalog"');
    const approval = block.indexOf('title: "Review Starter Catalog"');
    const push = block.indexOf('title: "Push Products to Store (drafts)"');
    const legal = block.indexOf('title: "Generate Legal Pages"');
    const notify = block.indexOf('title: "Store Buildout Complete"');
    // Every step must exist and they must be in the documented order
    expect([niche, brand, catalog, approval, push, legal, notify]).not.toContain(-1);
    expect(niche).toBeLessThan(brand);
    expect(brand).toBeLessThan(catalog);
    expect(catalog).toBeLessThan(approval);
    expect(approval).toBeLessThan(push);
    expect(push).toBeLessThan(legal);
    expect(legal).toBeLessThan(notify);
  });

  it("approval gate sits between catalog-gen and push (operator review)", () => {
    // Critical correctness: nothing writes to the store before the
    // operator approves. Catalog generation comes BEFORE approval;
    // bulk_push_products comes AFTER.
    const src = read("server/engine/architectWorkflows.ts");
    const block = src.split('registerWorkflow("complete_store_buildout"')[1] ?? "";
    expect(block).toMatch(
      /Generate Starter Catalog[\s\S]*?stepType:\s*"approval_gate"[\s\S]*?Push Products to Store/,
    );
  });

  it("push step uses bulk_push_products with productsFromPriorStep + draft status", () => {
    const src = read("server/engine/architectWorkflows.ts");
    const block = src.split('registerWorkflow("complete_store_buildout"')[1] ?? "";
    expect(block).toContain('action: "bulk_push_products"');
    expect(block).toContain("productsFromPriorStep: true");
    expect(block).toContain('productStatus: "draft"');
  });

  it("workflowEngine.executeStoreActionStep handles bulk_push_products", () => {
    const src = read("server/engine/workflowEngine.ts");
    expect(src).toContain('case "bulk_push_products":');
    // Must walk previousOutputs to find the products array
    expect(src).toContain("productsFromPriorStep");
    expect(src).toContain("bulkInsertProducts");
  });

  it("clamps the catalog size to a reasonable range (5-20 products)", () => {
    const src = read("server/engine/architectWorkflows.ts");
    const block = src.split('registerWorkflow("complete_store_buildout"')[1] ?? "";
    expect(block).toContain("Math.max(5, Math.min(20, Number(input.productCount ?? 10)))");
  });
});

describe("store_optimization_sweep — Merchant magnum opus", () => {
  it("is registered in merchantWorkflows.ts", () => {
    const src = read("server/engine/merchantWorkflows.ts");
    expect(src).toContain('registerWorkflow("store_optimization_sweep"');
  });

  it("is registered in availableTypes as the lead merchant workflow", () => {
    const src = read("server/routers/workflows.ts");
    const merStart = src.indexOf("merchant: [");
    const firstWorkflowIdx = src.indexOf("type:", merStart);
    expect(src.slice(firstWorkflowIdx, firstWorkflowIdx + 200)).toContain('"store_optimization_sweep"');
  });

  it("walks the full pipeline (sync → inventory → margin → pricing → approval → rewrites → notify)", () => {
    const src = read("server/engine/merchantWorkflows.ts");
    const block = src.split('registerWorkflow("store_optimization_sweep"')[1] ?? "";
    const sync = block.indexOf('title: "Sync products from store"');
    const inventory = block.indexOf('title: "Inventory health"');
    const margin = block.indexOf('title: "Margin guard"');
    const pricing = block.indexOf('title: "Pricing optimization"');
    const approval = block.indexOf('title: "Approve pricing change-set"');
    const rewrites = block.indexOf('title: "Rewrite underperforming listings"');
    const notify = block.indexOf('title: "Optimization sweep complete"');
    expect([sync, inventory, margin, pricing, approval, rewrites, notify]).not.toContain(-1);
    expect(sync).toBeLessThan(inventory);
    expect(inventory).toBeLessThan(margin);
    expect(margin).toBeLessThan(pricing);
    expect(pricing).toBeLessThan(approval);
    expect(approval).toBeLessThan(rewrites);
    expect(rewrites).toBeLessThan(notify);
  });

  it("first step pulls fresh state via store_action sync_products", () => {
    // Critical: every recommendation downstream depends on the
    // current platform state, not the cached DB view. Sync first.
    const src = read("server/engine/merchantWorkflows.ts");
    const block = src.split('registerWorkflow("store_optimization_sweep"')[1] ?? "";
    expect(block).toMatch(/stepType:\s*"store_action"[\s\S]*?action:\s*"sync_products"/);
  });

  it("pricing step returns a structured change-set with dollar-impact estimate", () => {
    const src = read("server/engine/merchantWorkflows.ts");
    const block = src.split('registerWorkflow("store_optimization_sweep"')[1] ?? "";
    // Schema must include the per-SKU change shape AND a total
    // weeklyRevenueDelta — that's what makes the approval gate
    // meaningful (the operator sees the projected $ impact).
    expect(block).toContain("totalEstimatedWeeklyDeltaCents");
    expect(block).toContain("weeklyRevenueDeltaCents");
    expect(block).toContain("currentPriceCents");
    expect(block).toContain("proposedPriceCents");
  });

  it("approval gate sits between pricing change-set and listing rewrites", () => {
    const src = read("server/engine/merchantWorkflows.ts");
    const block = src.split('registerWorkflow("store_optimization_sweep"')[1] ?? "";
    expect(block).toMatch(
      /Pricing optimization[\s\S]*?stepType:\s*"approval_gate"[\s\S]*?Rewrite underperforming listings/,
    );
  });

  it("clamps top-N listing rewrites to 3-10 (sensible default)", () => {
    const src = read("server/engine/merchantWorkflows.ts");
    const block = src.split('registerWorkflow("store_optimization_sweep"')[1] ?? "";
    expect(block).toContain("Math.max(3, Math.min(10, Number(input.topN ?? 5)))");
  });
});

describe("Recommender — magnum-opus workflows lead each lane", () => {
  it("launching stage leads with complete_store_buildout (Builder)", () => {
    const src = read("server/routers/workflows.ts");
    const launchingStart = src.indexOf("launching: [");
    const firstRec = src.slice(launchingStart, launchingStart + 600);
    expect(firstRec).toContain('"complete_store_buildout"');
    // Must include the data-driven reason referencing productCount
    expect(firstRec).toMatch(/Your store has only \$\{productCount\}/);
  });

  it("operating stage leads with store_optimization_sweep (Merchant)", () => {
    const src = read("server/routers/workflows.ts");
    const operatingStart = src.indexOf("operating: [");
    const firstRec = src.slice(operatingStart, operatingStart + 600);
    expect(firstRec).toContain('"store_optimization_sweep"');
    expect(firstRec).toMatch(/You have \$\{productCount\} active products/);
  });
});
