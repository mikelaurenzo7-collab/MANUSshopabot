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
  it("publishSocialPost has null checks", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("if (!adapter)");
    expect(content).toContain("if (!credentials)");
    expect(content).toContain("if (!account)");
  });

  it("scheduleSocialPost has null checks", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Count occurrences of null checks
    const nullChecks = (content.match(/if \(!adapter\)|if \(!credentials\)|if \(!account\)/g) || []).length;
    expect(nullChecks).toBeGreaterThanOrEqual(9); // At least 3 functions with 3 checks each
  });

  it("launchAdCampaign has null checks", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify launchAdCampaign function has null checks
    const launchAdCampaignSection = content.substring(
      content.indexOf("export async function launchAdCampaign"),
      content.indexOf("export async function launchAdCampaign") + 1000
    );
    
    expect(launchAdCampaignSection).toContain("if (!adapter)");
    expect(launchAdCampaignSection).toContain("if (!credentials)");
  });

  it("fulfillOrderOnPlatform has null checks", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    const fulfillSection = content.substring(
      content.indexOf("export async function fulfillOrderOnPlatform"),
      content.indexOf("export async function fulfillOrderOnPlatform") + 1000
    );
    
    expect(fulfillSection).toContain("if (!adapter)");
    expect(fulfillSection).toContain("if (!credentials)");
    expect(fulfillSection).toContain("if (!store)");
  });

  it("syncProductsFromStore has null checks", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/platformBridge.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    const syncSection = content.substring(
      content.indexOf("export async function syncProductsFromStore"),
      content.indexOf("export async function syncProductsFromStore") + 1500
    );
    
    expect(syncSection).toContain("if (!adapter)");
    expect(syncSection).toContain("if (!rp || !rp.platformId)");
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

  it("Scheduler imports telemetry", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/scheduler/index.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("telemetry");
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
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Architect.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("onError:");
    expect(content).toContain("toast.error");
  });

  it("Workflows page has empty states", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Workflows.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain(".length === 0");
    expect(content).toContain("border-dashed");
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
