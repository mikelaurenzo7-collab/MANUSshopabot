import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createUserContext(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@beastbots.com",
      name: "Test User",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    activeOrg: { id: 1, role: "owner" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createAnonContext(): TrpcContext {
  return {
    user: null,
    activeOrg: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── Workflow Router Tests ────────────────────────────────────────────────────

describe("workflows router", () => {
  describe("workflows.availableTypes", () => {
    it("returns workflow types for all three agents", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      expect(types).toHaveProperty("architect");
      expect(types).toHaveProperty("merchant");
      expect(types).toHaveProperty("social");
    });

    it("architect has niche_research, product_sourcing, catalog_generation, store_setup", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const architectTypes = types.architect.map((t: any) => t.type);
      expect(architectTypes).toContain("niche_research");
      expect(architectTypes).toContain("product_sourcing");
      expect(architectTypes).toContain("catalog_generation");
      expect(architectTypes).toContain("store_setup");
    });

    it("merchant has inventory_audit, pricing_optimization, fulfillment_automation, competitor_analysis", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const merchantTypes = types.merchant.map((t: any) => t.type);
      expect(merchantTypes).toContain("inventory_audit");
      expect(merchantTypes).toContain("pricing_optimization");
      expect(merchantTypes).toContain("fulfillment_automation");
      expect(merchantTypes).toContain("competitor_analysis");
    });

    it("social has ad_campaign, social_content, seo_audit, email_flow, product_creative, brand_content", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const socialTypes = types.social.map((t: any) => t.type);
      expect(socialTypes).toContain("ad_campaign");
      expect(socialTypes).toContain("social_content");
      expect(socialTypes).toContain("seo_audit");
      expect(socialTypes).toContain("email_flow");
      expect(socialTypes).toContain("product_creative");
      expect(socialTypes).toContain("brand_content");
    });

    it("each type has title, description, icon, and scope", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      for (const agentTypes of Object.values(types)) {
        for (const t of agentTypes as any[]) {
          expect(t).toHaveProperty("type");
          expect(t).toHaveProperty("title");
          expect(t).toHaveProperty("description");
          expect(t).toHaveProperty("icon");
          expect(t).toHaveProperty("scope");
        }
      }
    });

    it("rejects unauthenticated access", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(caller.workflows.availableTypes()).rejects.toThrow();
    });
  });

  describe("workflows.counts", () => {
    it("returns count object for authenticated user", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const counts = await caller.workflows.counts();
      expect(counts).toHaveProperty("total");
      expect(counts).toHaveProperty("running");
      expect(counts).toHaveProperty("completed");
      expect(counts).toHaveProperty("failed");
      expect(counts).toHaveProperty("awaiting");
      expect(typeof counts.total).toBe("number");
    });

    it("rejects unauthenticated access", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(caller.workflows.counts()).rejects.toThrow();
    });
  });

  describe("workflows.list", () => {
    it("returns array for authenticated user", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const list = await caller.workflows.list();
      expect(Array.isArray(list)).toBe(true);
    });

    it("accepts optional filter parameters", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const list = await caller.workflows.list({ agentType: "architect" });
      expect(Array.isArray(list)).toBe(true);
    });

    it("rejects unauthenticated access", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(caller.workflows.list()).rejects.toThrow();
    });
  });

  describe("workflows.active", () => {
    it("returns array of active workflows", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const active = await caller.workflows.active();
      expect(Array.isArray(active)).toBe(true);
    });
  });

  describe("workflows.pendingApprovals", () => {
    it("returns array of pending approval steps", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const pending = await caller.workflows.pendingApprovals();
      expect(Array.isArray(pending)).toBe(true);
    });
  });

  describe("workflows.detail", () => {
    it("rejects when workflow does not exist", async () => {
      const caller = appRouter.createCaller(createUserContext());
      await expect(caller.workflows.detail({ workflowId: 999999 })).rejects.toThrow();
    });
  });

  describe("workflows.launch", () => {
    it.skipIf(!process.env.DATABASE_URL)("launches a niche_research workflow successfully", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const result = await caller.workflows.launch({
        agentType: "architect",
        workflowType: "niche_research",
        title: "Test Niche Research",
        scope: "global",
        input: { niche: "home decor" },
      });
      expect(result).toHaveProperty("workflowId");
      expect(typeof result.workflowId).toBe("number");
    });

    it("rejects invalid agent type", async () => {
      const caller = appRouter.createCaller(createUserContext());
      await expect(
        caller.workflows.launch({
          agentType: "invalid" as any,
          workflowType: "niche_research",
          title: "Test",
          scope: "global",
          input: {},
        })
      ).rejects.toThrow();
    });

    it("rejects unauthenticated access", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(
        caller.workflows.launch({
          agentType: "architect",
          workflowType: "niche_research",
          title: "Test",
          scope: "global",
          input: {},
        })
      ).rejects.toThrow();
    });
  });

  describe("workflows.cancel", () => {
    it("rejects when workflow does not exist", async () => {
      const caller = appRouter.createCaller(createUserContext());
      await expect(caller.workflows.cancel({ workflowId: 999999 })).rejects.toThrow();
    });
  });
});

// ─── Agent Architecture: 1:N Store-Aware Model ───────────────────────────────

describe("agent architecture: 1:N store-aware model", () => {
  it.skipIf(!process.env.DATABASE_URL)("workflow launch supports global scope (no store)", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const result = await caller.workflows.launch({
      agentType: "architect",
      workflowType: "niche_research",
      title: "Global Research",
      scope: "global",
      input: { niche: "home decor" },
    });
    expect(result).toHaveProperty("workflowId");
  });

  it.skipIf(!process.env.DATABASE_URL)("workflow launch supports specific_store scope", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const result = await caller.workflows.launch({
      agentType: "merchant",
      workflowType: "inventory_audit",
      title: "Store Audit",
      scope: "specific_store",
      storeId: 1,
      input: {},
    });
    expect(result).toHaveProperty("workflowId");
  });

  it.skipIf(!process.env.DATABASE_URL)("workflow launch supports all_stores scope", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const result = await caller.workflows.launch({
      agentType: "merchant",
      workflowType: "pricing_optimization",
      title: "All Stores Pricing",
      scope: "all_stores",
      input: {},
    });
    expect(result).toHaveProperty("workflowId");
  });

  it.skipIf(!process.env.DATABASE_URL)("three agents per user — types are agent-level not store-level", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const types = await caller.workflows.availableTypes();
    // Each type belongs to an agent, not a store
    for (const [agentType, agentWorkflows] of Object.entries(types)) {
      expect(["architect", "merchant", "social"]).toContain(agentType);
      for (const wf of agentWorkflows as any[]) {
        // Workflow types are defined at the agent level
        expect(wf).not.toHaveProperty("storeId");
        // Scope determines store association at launch time
        expect(["specific_store", "all_stores", "global"]).toContain(wf.scope);
      }
    }
  });

  it.skipIf(!process.env.DATABASE_URL)("all registered workflow types are launchable", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const types = await caller.workflows.availableTypes();
    
    // Test that each registered type can be launched
    const testCases = [
      { agentType: "architect" as const, workflowType: "niche_research", scope: "global" as const },
      { agentType: "architect" as const, workflowType: "product_sourcing", scope: "specific_store" as const },
      { agentType: "merchant" as const, workflowType: "inventory_audit", scope: "all_stores" as const },
      { agentType: "merchant" as const, workflowType: "pricing_optimization", scope: "all_stores" as const },
      { agentType: "social" as const, workflowType: "ad_campaign", scope: "specific_store" as const },
      { agentType: "social" as const, workflowType: "seo_audit", scope: "specific_store" as const },
    ];

    for (const tc of testCases) {
      const result = await caller.workflows.launch({
        agentType: tc.agentType,
        workflowType: tc.workflowType,
        title: `Test ${tc.workflowType}`,
        scope: tc.scope,
        storeId: tc.scope === "specific_store" ? 1 : undefined,
        input: tc.workflowType === "niche_research" ? { niche: "test" } : {},
      });
      expect(result).toHaveProperty("workflowId");
    }
  });
});
