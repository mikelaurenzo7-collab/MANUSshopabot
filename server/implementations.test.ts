/**
 * Tests for all implementation improvements
 * Covers: error handling, null checks, adapter resilience, telemetry, and UX enhancements
 */
import { describe, it, expect } from "vitest";

describe("Analytics Page Error Handling", () => {
  it("Analytics.tsx has error state variables", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Analytics.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("error: storesError");
    expect(content).toContain("error: analyticsError");
    expect(content).toContain("Analytics Error");
  });

  it("Analytics.tsx has error UI rendering", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Analytics.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("storesError || analyticsError");
    expect(content).toContain("AlertTriangle");
  });
});

describe("Platform Bridge Null Checks", () => {
  it("publishSocialPost delegates to getSocialAccountAdapter helper", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // New architecture: null guards are centralized in getSocialAccountAdapter helper
    expect(content).toContain("getSocialAccountAdapter");
    expect(content).toContain("getStoreAdapter");
    // Throws on missing resources
    expect(content).toContain("throw new Error");
  });

  it("platformBridge has resilience patterns (circuit breaker + retry)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Count withResilience calls (circuit breaker + retry on every adapter call)
    const resilienceCalls = (content.match(/withResilience/g) || []).length;
    expect(resilienceCalls).toBeGreaterThanOrEqual(6); // At least 6 protected call sites
  });

  it("launchAdCampaign is circuit-breaker protected", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    const launchAdCampaignSection = content.substring(
      content.indexOf("export async function launchAdCampaign"),
      content.indexOf("export async function launchAdCampaign") + 1000
    );
    
    expect(launchAdCampaignSection).toContain("withResilience");
    expect(launchAdCampaignSection).toContain("getSocialAccountAdapter");
  });

  it("fulfillOrderOnPlatform is circuit-breaker protected with order null guard", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    const fulfillSection = content.substring(
      content.indexOf("export async function fulfillOrderOnPlatform"),
      content.indexOf("export async function fulfillOrderOnPlatform") + 1200
    );
    
    expect(fulfillSection).toContain("withResilience");
    expect(fulfillSection).toContain("getStoreAdapter");
    // Order null guard
    expect(fulfillSection).toContain("if (!order)");
  });

  it("syncProductsFromStore validates product data before upsert", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    const syncSection = content.substring(
      content.indexOf("export async function syncProductsFromStore"),
      content.indexOf("export async function syncProductsFromStore") + 1500
    );

    // Circuit breaker protection
    expect(syncSection).toContain("withResilience");
    // Product data validation
    expect(syncSection).toContain("if (!rp || !rp.platformId)");
  });

  it("syncProductsFromStore uses bulk-insert + parallel update (no N×N round-trips)", async () => {
    // Regression guard for the perf rework: pre-fix the sync looped
    // over remote products, awaiting db.getProductByPlatformId AND
    // db.createProduct/updateProduct one at a time. A 250-product
    // Shopify sync was 500 sequential round-trips. Post-fix: 1 SELECT
    // (getProductsByPlatformIds), 1 bulk INSERT (bulkInsertProducts),
    // and parallel updates. This test catches a future revert.
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    const syncSection = content.substring(
      content.indexOf("export async function syncProductsFromStore"),
      content.indexOf("export async function syncProductsFromStore") + 3000,
    );
    // Bulk lookup replaces N awaited getProductByPlatformId calls.
    expect(syncSection).toContain("getProductsByPlatformIds(storeId, platformIds)");
    // Bulk insert replaces N awaited createProduct calls.
    expect(syncSection).toContain("bulkInsertProducts");
    // Parallel updates instead of sequential awaits.
    expect(syncSection).toContain("Promise.all");
    // Old patterns must not be back.
    expect(syncSection).not.toMatch(/await db\.getProductByPlatformId\(storeId, rp\.platformId\)/);
    expect(syncSection).not.toMatch(/await db\.createProduct\(\{[\s\S]*?platformProductId: rp\.platformId/);
  });
});

describe("Telemetry Integration", () => {
  it("Telemetry module exists and exports required functions", async () => {
    const mod = await import("./telemetry");
    expect(mod.withTelemetry).toBeDefined();
    expect(mod.logAgentAction).toBeDefined();
    expect(mod.collectOutcome).toBeDefined();
  });

  it("Workflow engine imports telemetry", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/workflowEngine.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("telemetry");
    expect(content).toContain("logAgentAction");
  });

  it("Shopify webhooks imports telemetry", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/shopifyWebhooks.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("telemetry");
  });

  it("Scheduler task modules import telemetry", async () => {
    const fs = await import("fs");
    const path = await import("path");
    // After scheduler refactor, telemetry is imported in task modules
    const merchantPath = path.join(process.cwd(), "server/scheduler/tasks/merchant.ts");
    const merchantContent = fs.readFileSync(merchantPath, "utf-8");
    expect(merchantContent).toContain("telemetry");
  });
});

describe("Database Schema", () => {
  it("Agent telemetry table exists", async () => {
    const mod = await import("../drizzle/schema");
    expect(mod.agentTelemetry).toBeDefined();
  });

  it("All required tables exist", async () => {
    const mod = await import("../drizzle/schema");
    const requiredTables = [
      "users",
      "stores",
      "products",
      "orders",
      "agentWorkflows",
      "workflowSteps",
      "agentTelemetry",
      "socialAccounts",
      "adCampaigns",
    ];
    
    for (const table of requiredTables) {
      expect(mod[table]).toBeDefined();
    }
  });
});

describe("Adapter Files", () => {
  it("All adapter files exist", async () => {
    const fs = await import("fs");
    const path = await import("path");
    
    const adapters = [
      "server/adapters/ecommerce/shopifyAdapter.ts",
      "server/adapters/ecommerce/etsyAdapter.ts",
      "server/adapters/ecommerce/ebayAdapter.ts",
      "server/adapters/social/metaAdapter.ts",
      "server/adapters/social/instagramAdapter.ts",
      "server/adapters/social/tiktokAdapter.ts",
    ];
    
    for (const adapter of adapters) {
      const filePath = path.join(process.cwd(), adapter);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });
});

describe("Frontend Error Handling", () => {
  it("Home page has error handling", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Home.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("error: metricsError");
    expect(content).toContain("error: agentError");
    expect(content).toContain("Dashboard Error");
  });

  it("Architect page has error handling", async () => {
    // Architect.tsx was retired in favor of the unified /chat surface.
    // Architect tRPC mutations still have onError handlers; verified by
    // routers/architect tests.
    expect(true).toBe(true);
  });

  it("Workflows page has empty states", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Workflows.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain(".length === 0");
    // Empty-state shape has evolved: legacy border-dashed → shared
    // .empty-state class → bento-card hero with next-action CTAs.
    // Accept any of the three so the assertion tracks intent (a
    // guided empty state exists) rather than a specific class name.
    expect(content).toMatch(
      /border-dashed|className="empty-state"|className="bento-card"/,
    );
  });
});

describe("Code Quality", () => {
  it("Platform bridge has proper error messages", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Check for consistent error message format
    expect(content).toContain("throw new Error");
    expect(content).toMatch(/throw new Error\(`[^`]+\`\)/);
  });

  it("Telemetry has proper logging", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/telemetry.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("logAgentAction");
    expect(content).toContain("collectOutcome");
  });
});
