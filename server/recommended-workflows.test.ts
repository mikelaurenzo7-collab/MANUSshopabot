/**
 * Persona-aware workflow recommender — both lanes get the right
 * "next three" surface.
 *
 * Two real customer segments hit this app: fresh-start operators
 * and operators with an existing store. The previous /home dropped
 * both into the same generic 30-item picker. This commit ships a
 * data-aware recommender that classifies the org's lifecycle stage
 * (fresh / launching / operating / scaling) and returns a curated
 * three-card sequence with reasons tied to the org's actual data.
 *
 * Source-level wiring tests — the stage logic itself is exercised
 * via integration with real DB in `server/orgs-isolation.test.ts`.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

describe("workflows.recommendedForOrg — server query", () => {
  it("registered as an org-scoped query on workflowRouter", async () => {
    const mod = await import("./routers/workflows");
    const procedures = mod.workflowRouter._def.procedures as Record<string, any>;
    expect(procedures.recommendedForOrg).toBeDefined();
  });

  it("uses orgProcedure (cross-org safety)", () => {
    const src = read("server/routers/workflows.ts");
    expect(src).toMatch(/recommendedForOrg:\s*orgProcedure/);
  });

  it("classifies lifecycle stage from real org data (storeCount + productCount)", () => {
    const src = read("server/routers/workflows.ts");
    expect(src).toContain("getStoreCountForOrg(ctx.org.id)");
    expect(src).toContain("getProductCountForOrg(ctx.org.id)");
    expect(src).toContain("getStoresByOrg(ctx.org.id)");
  });

  it("emits four canonical stages with the documented thresholds", () => {
    const src = read("server/routers/workflows.ts");
    // 0 stores → fresh
    expect(src).toMatch(/storeCount === 0\s*\?\s*"fresh"/);
    // <5 products → launching
    expect(src).toMatch(/productCount < 5\s*\?\s*"launching"/);
    // multi-store OR 50+ products → scaling
    expect(src).toMatch(/storeCount > 1 \|\| productCount >= 50\s*\?\s*"scaling"/);
    // otherwise → operating
    expect(src).toContain('"operating"');
  });

  it("each stage returns three recommendations with a stage-specific reason", () => {
    const src = read("server/routers/workflows.ts");
    // Fresh: discovery (Builder leads)
    expect(src).toContain('"niche_research"');
    expect(src).toContain('"brand_identity_kit"');
    expect(src).toContain('"competitor_pricing_scan"');
    // Launching: end-to-end Builder buildout leads
    expect(src).toContain('"complete_store_buildout"');
    expect(src).toContain('"product_sourcing"');
    expect(src).toContain('"brand_audit"');
    // Operating: Merchant sweep leads + standalone audits
    expect(src).toContain('"store_optimization_sweep"');
    expect(src).toContain('"margin_guard_audit"');
    expect(src).toContain('"inventory_audit"');
    // Scaling: cross-store + competitor + P&L
    expect(src).toContain('"competitor_analysis"');
    expect(src).toContain('"profit_loss_analysis"');
    expect(src).toContain('"multi_store_expansion"');
  });

  it("recommendations carry data-driven reasons (not generic copy)", () => {
    // The reasons should reference the actual org state — e.g.,
    // "${productCount} products" — so users see why each is for them.
    const src = read("server/routers/workflows.ts");
    expect(src).toMatch(/Your store has only \$\{productCount\}/);
    expect(src).toMatch(/You have \$\{productCount\} active products/);
    expect(src).toMatch(/storeCount > 1 \? `Operating \$\{storeCount\} stores`/);
  });

  it("returns a defaultStoreId for specific_store-scoped recommendations", () => {
    const src = read("server/routers/workflows.ts");
    expect(src).toContain("defaultStoreId: orgStores[0]?.id ?? null");
  });
});

describe("getProductCountForOrg — db helper", () => {
  it("exists in db.ts and counts across all stores in the org", () => {
    const src = read("server/db.ts");
    expect(src).toContain("export async function getProductCountForOrg");
    // Must collect store ids from the org first, then count products
    expect(src).toContain("inArray(products.storeId, ids)");
  });
});

describe("RecommendedWorkflows — client UI", () => {
  const SRC = "client/src/components/RecommendedWorkflows.tsx";

  it("calls trpc.workflows.recommendedForOrg.useQuery", () => {
    const src = read(SRC);
    expect(src).toContain("trpc.workflows.recommendedForOrg.useQuery");
  });

  it("renders four stage-specific eyebrows so the user knows their bucket", () => {
    const src = read(SRC);
    for (const stage of ["fresh", "launching", "operating", "scaling"]) {
      expect(src, `STAGE_COPY should cover ${stage}`).toContain(`${stage}:`);
    }
  });

  it("each card has a Launch button wired to trpc.workflows.launch", () => {
    const src = read(SRC);
    expect(src).toContain("trpc.workflows.launch.useMutation");
    expect(src).toContain("launchMutation.mutate");
    // Per-card spinner state
    expect(src).toContain("setLaunchingType");
  });

  it("specific_store-scoped recs gate on a connected store + offer a connect link", () => {
    // Fresh-start users land here with zero stores; we shouldn't let
    // them hit a 'specific_store' workflow with no storeId. The card
    // disables Launch and points at /storefronts#integrations.
    const src = read(SRC);
    expect(src).toContain("Connect a store first");
    expect(src).toContain('href="/storefronts#integrations"');
  });

  it("invalidates active + list + counts caches on launch success", () => {
    const src = read(SRC);
    expect(src).toContain("utils.workflows.active.invalidate()");
    expect(src).toContain("utils.workflows.list.invalidate()");
    expect(src).toContain("utils.workflows.counts.invalidate()");
  });

  it("shows storeCount + productCount in the right gutter", () => {
    // Tells the user *why* they're seeing this stage's recommendations.
    const src = read(SRC);
    expect(src).toContain("{storeCount === 1 ? \"store\" : \"stores\"}");
    expect(src).toContain("{productCount}");
    expect(src).toContain("products");
  });
});

describe("Home page — recommender mounted", () => {
  it("imports RecommendedWorkflows", () => {
    const src = read("client/src/pages/Home.tsx");
    expect(src).toContain('import { RecommendedWorkflows }');
  });

  it("renders <RecommendedWorkflows /> below the activation coach", () => {
    const src = read("client/src/pages/Home.tsx");
    expect(src).toContain("<RecommendedWorkflows />");
    // Position check: appears AFTER ActivationCoach so first-time users
    // still see the activation guide first.
    const coachIdx = src.indexOf("<ActivationCoach />");
    const recsIdx = src.indexOf("<RecommendedWorkflows />");
    expect(coachIdx).toBeGreaterThan(0);
    expect(recsIdx).toBeGreaterThan(coachIdx);
  });
});
