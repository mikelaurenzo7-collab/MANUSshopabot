import { describe, it, expect } from "vitest";
import {
  getEcommerceAdapter,
  SUPPORTED_ECOMMERCE_PLATFORMS,
  getEcommerceCapabilityMatrix,
  buildCredentials,
  getDepopEliteExtensions,
  getBigCommerceEliteExtensions,
  getSquareEliteExtensions,
  getFaireEliteExtensions,
  getBonanzaEliteExtensions,
  getStockXEliteExtensions,
  getReverbEliteExtensions,
} from "./adapters/ecommerce";
import {
  getToolAdapter,
  GoogleAdsAdapter,
  SUPPORTED_TOOL_CONNECTORS,
} from "./adapters/tools";
import { listWorkflowTypes } from "./engine/workflowEngine";
// Importing the workflow registries so registerWorkflow side-effects fire.
// Without this, `listWorkflowTypes()` returns an empty array because no
// module has triggered the registry yet.
import "./engine/architectWorkflows";
import "./engine/merchantWorkflows";
import "./engine/socialWorkflows";
import "./engine/platformEliteWorkflows";

const NEW_ECOM_PLATFORMS = [
  "depop",
  "bigcommerce",
  "square",
  "faire",
  "bonanza",
  "stockx",
  "reverb",
] as const;

describe("Sprint 27 — ecommerce platform expansion", () => {
  it("registry exposes 14 platforms (7 original + 7 new)", () => {
    expect(SUPPORTED_ECOMMERCE_PLATFORMS).toHaveLength(14);
    for (const id of NEW_ECOM_PLATFORMS) {
      expect(SUPPORTED_ECOMMERCE_PLATFORMS).toContain(id);
    }
  });

  it.each(NEW_ECOM_PLATFORMS)("%s adapter implements the full interface", (id) => {
    const adapter = getEcommerceAdapter(id);
    expect(adapter.platform).toBe(id);
    // Interface contract — never throw type-check, never silently no-op.
    for (const fn of [
      "verifyConnection",
      "listProducts",
      "getProduct",
      "createProduct",
      "updateProduct",
      "deleteProduct",
      "listOrders",
      "getOrder",
      "fulfillOrder",
      "getInventory",
      "updateInventory",
      "getStoreInfo",
      "healthCheck",
      "getCapabilities",
    ] as const) {
      expect(typeof (adapter as any)[fn]).toBe("function");
    }
  });

  it.each(NEW_ECOM_PLATFORMS)("%s adapter declares a coherent capability matrix", (id) => {
    const caps = getEcommerceAdapter(id).getCapabilities();
    expect(caps.recommendedBatchSize).toBeGreaterThan(0);
    expect(caps.rateLimitTokensPerSec).toBeGreaterThan(0);
    expect(caps.strengths.length).toBeGreaterThan(0);
    expect(caps.limitations.length).toBeGreaterThan(0);
    expect(["marketplace", "storefront", "social_commerce"]).toContain(caps.category);
    expect(["subscription", "commission", "hybrid", "free"]).toContain(caps.feeStructure);
  });

  it("capability matrix factory includes every new platform", () => {
    const matrix = getEcommerceCapabilityMatrix();
    for (const id of NEW_ECOM_PLATFORMS) {
      expect(matrix[id]).toBeTruthy();
      expect(matrix[id].strengths.length).toBeGreaterThan(0);
    }
  });

  it("BigCommerce adapter resolves storeHash from metadata", () => {
    const adapter = getEcommerceAdapter("bigcommerce");
    // The private `storeHash` is exercised through the public surface;
    // we verify the failure path here so misconfigured stores fail loud.
    const creds = buildCredentials({
      platform: "bigcommerce",
      accessToken: "tok",
      metadata: {},
    });
    expect(() => (adapter as any).storeHash(creds)).toThrow(/storeHash/);

    const credsWithHash = buildCredentials({
      platform: "bigcommerce",
      accessToken: "tok",
      metadata: { storeHash: "abc123" },
    });
    expect((adapter as any).storeHash(credsWithHash)).toBe("abc123");
  });

  it("Bonanza adapter requires the dev_id + cert_id + user_token trio", async () => {
    const adapter = getEcommerceAdapter("bonanza");
    const creds = buildCredentials({
      platform: "bonanza",
      accessToken: null,
      metadata: {},
    });
    const health = await adapter.healthCheck(creds);
    expect(health.healthy).toBe(false);
    expect(health.message).toMatch(/dev_id|cert_id|user_token/i);
  });

  it("Faire adapter flags missing API token as unhealthy", async () => {
    const adapter = getEcommerceAdapter("faire");
    const creds = buildCredentials({ platform: "faire", metadata: {} });
    const health = await adapter.healthCheck(creds);
    expect(health.healthy).toBe(false);
    expect(health.message).toMatch(/token/i);
  });

  it("StockX createProduct refuses to invent listings (catalog-only model)", async () => {
    const adapter = getEcommerceAdapter("stockx");
    await expect(
      adapter.createProduct({ platform: "stockx", accessToken: "tok" }, {
        title: "Some made-up sneaker",
        priceCents: 10000,
      }),
    ).rejects.toThrow(/stockxProductId|variantId/i);
  });
});

describe("Sprint 27 — elite extensions", () => {
  const noopCreds = { platform: "x" } as any;

  it("each new platform has a working elite-extension factory", async () => {
    expect(typeof (await getDepopEliteExtensions(noopCreds)).updateHashtags).toBe("function");
    expect(typeof (await getBigCommerceEliteExtensions(noopCreds)).bulkUpdatePrices).toBe("function");
    expect(typeof (await getSquareEliteExtensions(noopCreds)).adjustInventory).toBe("function");
    expect(typeof (await getFaireEliteExtensions(noopCreds)).acknowledgeOrder).toBe("function");
    expect(typeof (await getBonanzaEliteExtensions(noopCreds)).setSyndicationTier).toBe("function");
    expect(typeof (await getStockXEliteExtensions(noopCreds)).getOrderBook).toBe("function");
    expect(typeof (await getReverbEliteExtensions(noopCreds)).respondToOffer).toBe("function");
  });
});

describe("Sprint 27 — workflow registry", () => {
  const NEW_WORKFLOWS = [
    "depop_hashtag_refresh",
    "bigcommerce_webhook_bootstrap",
    "square_multilocation_sync",
    "faire_ack_watcher",
    "bonanza_syndication_optimizer",
    "stockx_ask_repricer",
    "reverb_offer_responder",
  ];

  it.each(NEW_WORKFLOWS)("registers %s with the workflow engine", (name) => {
    expect(listWorkflowTypes()).toContain(name);
  });
});

describe("Sprint 27 — tools registry now covers Google Ads", () => {
  it("getToolAdapter returns the GoogleAdsAdapter", () => {
    expect(getToolAdapter("google_ads")).toBeInstanceOf(GoogleAdsAdapter);
  });

  it("registry size matches the router's exposed tool catalog", () => {
    expect(SUPPORTED_TOOL_CONNECTORS).toContain("google_ads");
    // The Sprint 27 catalog grew when Firecrawl was wired in. Guard
    // the floor and the named entries; let the ceiling float so
    // future tools don't churn this assertion.
    expect(SUPPORTED_TOOL_CONNECTORS.length).toBeGreaterThanOrEqual(9);
  });
});

describe("Sprint 27 — workflow engine actually executes the new actions", () => {
  // The engine's executeStoreActionStep is the choke point — without
  // case branches for each new action, the workflow registers but
  // dead-ends at runtime. These tests guard that every action declared
  // by a Sprint 27 workflow has a handler in the engine.
  it("every Sprint-27 action has a case branch in executeStoreActionStep", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "engine/workflowEngine.ts"),
      "utf-8",
    );
    const ACTIONS = [
      "depop_update_hashtags",
      "bigcommerce_subscribe_webhooks",
      "square_apply_transfers",
      "faire_acknowledge_orders",
      "bonanza_set_tiers",
      "stockx_apply_repricing",
      "reverb_respond_offers",
    ];
    for (const a of ACTIONS) {
      expect(src, `expected case "${a}" in executeStoreActionStep`).toContain(`case "${a}":`);
    }
  });

  it("exposes a pluckPriorOutput helper used by the new handlers", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "engine/workflowEngine.ts"),
      "utf-8",
    );
    expect(src).toContain("function pluckPriorOutput");
    // The helper must walk previousOutputs in reverse so a later
    // approval-gate step doesn't shadow the LLM step's data.
    expect(src).toMatch(/for \(let i = context\.previousOutputs\.length - 1/);
  });
});
