/**
 * Tests for codebase polish and refinement improvements.
 * Verifies error handling, validation, and resilience enhancements.
 */
import { describe, it, expect } from "vitest";

describe("Frontend Error Handling", () => {
  it("Home.tsx dashboard queries include error states", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Home.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("error: metricsError");
    expect(content).toContain("error: agentError");
    expect(content).toContain("Dashboard Error");
  });

  it("AI Tools mutations have error callbacks", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Architect.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("onError:");
    expect(content).toContain("toast.error");
  });

  it("Empty states implemented in Workflows page", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Workflows.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain(".length === 0");
    // Empty states moved from inline `border-dashed` divs to the
    // shared .empty-state class (with aurora drift) — assert either.
    expect(content).toMatch(/border-dashed|className="empty-state"/);
  });
});

describe("Backend Validation", () => {
  it("Workflows router file exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/routers/workflows.ts");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("Connectors router file exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/routers/connectors.ts");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("Stores router file exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/routers/stores.ts");
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

describe("Adapter Files Exist", () => {
  it("Shopify adapter file exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/adapters/ecommerce/shopifyAdapter.ts");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("Meta adapter file exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/adapters/social/metaAdapter.ts");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("Etsy adapter file exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/adapters/ecommerce/etsyAdapter.ts");
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

describe("Telemetry Integration", () => {
  it("Telemetry module exports required functions", async () => {
    const mod = await import("./telemetry");
    expect(mod.withTelemetry).toBeDefined();
    expect(mod.logAgentAction).toBeDefined();
  });

  it("Workflow engine imports telemetry", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/engine/workflowEngine.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("telemetry");
  });

  it("Shopify webhooks imports telemetry", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/shopifyWebhooks.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("telemetry");
  });
});

describe("Database Schema", () => {
  it("Schema includes agentTelemetry table", async () => {
    const mod = await import("../drizzle/schema");
    expect(mod.agentTelemetry).toBeDefined();
  });

  it("Schema includes all core tables", async () => {
    const mod = await import("../drizzle/schema");
    expect(mod.users).toBeDefined();
    expect(mod.stores).toBeDefined();
    expect(mod.products).toBeDefined();
    expect(mod.orders).toBeDefined();
  });
});
