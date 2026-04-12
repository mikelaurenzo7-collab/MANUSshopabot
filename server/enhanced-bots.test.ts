import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createUserContext(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@shopbot.com",
      name: "Test User",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createAnonContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── REBRAND: ShopBot Naming ─────────────────────────────────────────────────

describe("ShopBot rebrand verification", () => {
  it("workflow types still return all three bot categories", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const types = await caller.workflows.availableTypes();
    expect(types).toHaveProperty("architect");
    expect(types).toHaveProperty("merchant");
    expect(types).toHaveProperty("social");
  });
});

// ─── ENHANCED ARCHITECT BOT ─────────────────────────────────────────────────

describe("enhanced Architect Bot capabilities", () => {
  describe("new workflow types", () => {
    it("architect has multi_store_expansion workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const architectTypes = types.architect.map((t: any) => t.type);
      expect(architectTypes).toContain("multi_store_expansion");
    });

    it("architect has brand_audit workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const architectTypes = types.architect.map((t: any) => t.type);
      expect(architectTypes).toContain("brand_audit");
    });

    it("architect has product_optimization workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const architectTypes = types.architect.map((t: any) => t.type);
      expect(architectTypes).toContain("product_optimization");
    });

    it("new architect workflows have proper metadata", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const newTypes = types.architect.filter((t: any) =>
        ["multi_store_expansion", "brand_audit", "product_optimization"].includes(t.type)
      );
      expect(newTypes).toHaveLength(3);
      for (const t of newTypes) {
        expect(t).toHaveProperty("title");
        expect(t).toHaveProperty("description");
        expect(t).toHaveProperty("icon");
        expect(t).toHaveProperty("scope");
        expect(t.title.length).toBeGreaterThan(0);
        expect(t.description.length).toBeGreaterThan(0);
      }
    });

    it("can launch multi_store_expansion workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const result = await caller.workflows.launch({
        agentType: "architect",
        workflowType: "multi_store_expansion",
        title: "Test Multi-Store Expansion",
        scope: "all_stores",
        input: {},
      });
      expect(result).toHaveProperty("workflowId");
      expect(typeof result.workflowId).toBe("number");
    });

    it("can launch brand_audit workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const result = await caller.workflows.launch({
        agentType: "architect",
        workflowType: "brand_audit",
        title: "Test Brand Audit",
        scope: "specific_store",
        storeId: 1,
        input: {},
      });
      expect(result).toHaveProperty("workflowId");
    });

    it("can launch product_optimization workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const result = await caller.workflows.launch({
        agentType: "architect",
        workflowType: "product_optimization",
        title: "Test Product Optimization",
        scope: "specific_store",
        storeId: 1,
        input: {},
      });
      expect(result).toHaveProperty("workflowId");
    });
  });

  describe("new router mutations", () => {
    it("architect.storeHealthCheck exists and requires auth", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(
        caller.architect.storeHealthCheck({ storeId: 1 })
      ).rejects.toThrow();
    });

    it("architect.rewriteProductDescriptions exists and requires auth", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(
        caller.architect.rewriteProductDescriptions({
          storeId: 1,
          productIds: [1],
          tone: "persuasive",
          seoOptimize: true,
        })
      ).rejects.toThrow();
    });

    it("architect.competitorPriceScanner exists and requires auth", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(
        caller.architect.competitorPriceScanner({
          storeId: 1,
          niche: "home decor",
        })
      ).rejects.toThrow();
    });
  });
});

// ─── ENHANCED MERCHANT BOT ──────────────────────────────────────────────────

describe("enhanced Merchant Bot capabilities", () => {
  describe("new workflow types", () => {
    it("merchant has supply_chain_intelligence workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const merchantTypes = types.merchant.map((t: any) => t.type);
      expect(merchantTypes).toContain("supply_chain_intelligence");
    });

    it("merchant has profit_loss_analysis workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const merchantTypes = types.merchant.map((t: any) => t.type);
      expect(merchantTypes).toContain("profit_loss_analysis");
    });

    it("merchant has customer_segmentation workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const merchantTypes = types.merchant.map((t: any) => t.type);
      expect(merchantTypes).toContain("customer_segmentation");
    });

    it("new merchant workflows have proper metadata", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const newTypes = types.merchant.filter((t: any) =>
        ["supply_chain_intelligence", "profit_loss_analysis", "customer_segmentation"].includes(t.type)
      );
      expect(newTypes).toHaveLength(3);
      for (const t of newTypes) {
        expect(t).toHaveProperty("title");
        expect(t).toHaveProperty("description");
        expect(t).toHaveProperty("icon");
        expect(t).toHaveProperty("scope");
      }
    });

    it("can launch supply_chain_intelligence workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const result = await caller.workflows.launch({
        agentType: "merchant",
        workflowType: "supply_chain_intelligence",
        title: "Test Supply Chain Intel",
        scope: "specific_store",
        storeId: 1,
        input: {},
      });
      expect(result).toHaveProperty("workflowId");
    });

    it("can launch profit_loss_analysis workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const result = await caller.workflows.launch({
        agentType: "merchant",
        workflowType: "profit_loss_analysis",
        title: "Test P&L Analysis",
        scope: "all_stores",
        input: {},
      });
      expect(result).toHaveProperty("workflowId");
    });

    it("can launch customer_segmentation workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const result = await caller.workflows.launch({
        agentType: "merchant",
        workflowType: "customer_segmentation",
        title: "Test Customer Segmentation",
        scope: "specific_store",
        storeId: 1,
        input: {},
      });
      expect(result).toHaveProperty("workflowId");
    });
  });

  describe("new router mutations", () => {
    it("merchant.demandForecasting exists and requires auth", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(
        caller.merchant.demandForecasting({ storeId: 1 })
      ).rejects.toThrow();
    });

    it("merchant.marginAnalyzer exists and requires auth", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(
        caller.merchant.marginAnalyzer({ storeId: 1 })
      ).rejects.toThrow();
    });

    it("merchant.returnAnalysis exists and requires auth", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(
        caller.merchant.returnAnalysis({ storeId: 1 })
      ).rejects.toThrow();
    });
  });
});

// ─── ENHANCED HYPE-MAN BOT ─────────────────────────────────────────────────

describe("enhanced Social Bot Bot capabilities", () => {
  describe("new workflow types", () => {
    it("social has viral_trend_detector workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const socialTypes = types.social.map((t: any) => t.type);
      expect(socialTypes).toContain("viral_trend_detector");
    });

    it("social has influencer_outreach workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const socialTypes = types.social.map((t: any) => t.type);
      expect(socialTypes).toContain("influencer_outreach");
    });

    it("social has conversion_funnel workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const socialTypes = types.social.map((t: any) => t.type);
      expect(socialTypes).toContain("conversion_funnel");
    });

    it("new social workflows have proper metadata", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const types = await caller.workflows.availableTypes();
      const newTypes = types.social.filter((t: any) =>
        ["viral_trend_detector", "influencer_outreach", "conversion_funnel"].includes(t.type)
      );
      expect(newTypes).toHaveLength(3);
      for (const t of newTypes) {
        expect(t).toHaveProperty("title");
        expect(t).toHaveProperty("description");
        expect(t).toHaveProperty("icon");
        expect(t).toHaveProperty("scope");
      }
    });

    it("can launch viral_trend_detector workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const result = await caller.workflows.launch({
        agentType: "social",
        workflowType: "viral_trend_detector",
        title: "Test Viral Trend Detector",
        scope: "global",
        input: {},
      });
      expect(result).toHaveProperty("workflowId");
    });

    it("can launch influencer_outreach workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const result = await caller.workflows.launch({
        agentType: "social",
        workflowType: "influencer_outreach",
        title: "Test Influencer Outreach",
        scope: "specific_store",
        storeId: 1,
        input: {},
      });
      expect(result).toHaveProperty("workflowId");
    });

    it("can launch conversion_funnel workflow", async () => {
      const caller = appRouter.createCaller(createUserContext());
      const result = await caller.workflows.launch({
        agentType: "social",
        workflowType: "conversion_funnel",
        title: "Test Conversion Funnel",
        scope: "specific_store",
        storeId: 1,
        input: {},
      });
      expect(result).toHaveProperty("workflowId");
    });
  });

  describe("new router mutations", () => {
    it("social.abTestCopyGenerator exists and requires auth", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(
        caller.social.abTestCopyGenerator({
          headline: "Test headline",
          platform: "tiktok",
          variants: 3,
        })
      ).rejects.toThrow();
    });

    it("social.smsRecoveryFlow exists and requires auth", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(
        caller.social.smsRecoveryFlow({
          flowType: "cart_abandonment",
          storeName: "Test Store",
          storeUrl: "https://test.com",
        })
      ).rejects.toThrow();
    });

    it("social.socialProofGenerator exists and requires auth", async () => {
      const caller = appRouter.createCaller(createAnonContext());
      await expect(
        caller.social.socialProofGenerator({
          storeId: 1,
          proofTypes: ["testimonials"],
        })
      ).rejects.toThrow();
    });
  });
});

// ─── TOTAL CAPABILITY COUNT ─────────────────────────────────────────────────

describe("total platform capabilities", () => {
  it("architect has at least 7 workflow types (4 original + 3 new)", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const types = await caller.workflows.availableTypes();
    expect(types.architect.length).toBeGreaterThanOrEqual(7);
  });

  it("merchant has at least 7 workflow types (4 original + 3 new)", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const types = await caller.workflows.availableTypes();
    expect(types.merchant.length).toBeGreaterThanOrEqual(7);
  });

  it("social has at least 9 workflow types (6 original + 3 new)", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const types = await caller.workflows.availableTypes();
    expect(types.social.length).toBeGreaterThanOrEqual(9);
  });

  it("total platform has at least 23 workflow types", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const types = await caller.workflows.availableTypes();
    const total = types.architect.length + types.merchant.length + types.social.length;
    expect(total).toBeGreaterThanOrEqual(23);
  });
});
