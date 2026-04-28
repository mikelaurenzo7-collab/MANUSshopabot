/**
 * Post-launch cook — capability matrix UI + passive memory recall.
 *
 * Two new surfaces shipped in the post-launch cook:
 *   1. CapabilitiesTab — per-store capability matrix rendered in the
 *      Storefronts hub. Reads connectors.capabilityMatrix and pairs it
 *      against listCredentials + listSocialAccounts to mark connected
 *      vs. available platforms.
 *   2. workflowEngine.executeLLMStep now prepends a "Recall" preamble
 *      to the system prompt when the bot profile has stored memories.
 *      Read-only activation — the agentic write loop comes later.
 *
 * Source-level pattern checks lock both in. Real DB access stays in
 * the integration suite.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

describe("Capabilities tab — Storefronts hub integration", () => {
  it("CapabilitiesTab component renders ecommerce + social matrices", () => {
    const src = read("client/src/components/integrations/CapabilitiesTab.tsx");
    expect(src).toContain("export function CapabilitiesTab");
    expect(src).toContain("trpc.connectors.capabilityMatrix.useQuery");
    expect(src).toContain("trpc.connectors.listCredentials.useQuery");
    expect(src).toContain("trpc.connectors.listSocialAccounts.useQuery");
    expect(src).toContain("E-commerce platforms");
    expect(src).toContain("Social channels");
  });

  it("Renders the full PlatformCapabilities surface (variants, fulfillment, pricing, etc.)", () => {
    const src = read("client/src/components/integrations/CapabilitiesTab.tsx");
    for (const cap of [
      "variants",
      "metafields",
      "bulkImport",
      "categories",
      "webhooks",
      "autoFulfillment",
      "partialFulfillment",
      "realTimeInventory",
      "compareAtPrice",
      "bulkPriceUpdate",
      "scheduledSale",
      "maxImagesPerProduct",
      "recommendedBatchSize",
      "rateLimitTokensPerSec",
    ]) {
      expect(src, `should surface ${cap}`).toContain(cap);
    }
  });

  it("Flags connected vs. available platforms with explicit Badge", () => {
    const src = read("client/src/components/integrations/CapabilitiesTab.tsx");
    expect(src).toContain("Connected");
    expect(src).toContain("Available");
    // Sort connected first so users see what they have at a glance
    expect(src).toContain("sortByConnected");
  });

  it("Storefronts hub registers Capabilities as a routable tab", () => {
    const src = read("client/src/pages/Storefronts.tsx");
    expect(src).toContain('import { CapabilitiesTab }');
    expect(src).toContain('<TabsTrigger value="capabilities">');
    expect(src).toContain('"capabilities"');
    expect(src).toContain("<CapabilitiesTab />");
  });
});

describe("Memory tool — passive recall in workflowEngine.executeLLMStep", () => {
  it("Prepends a RECALL block to the system prompt when bot has memories", () => {
    const src = read("server/engine/workflowEngine.ts");
    expect(src).toContain("RECALL — durable learnings from prior runs");
    // The recall block must be conditional on profile.memoryEnabled
    expect(src).toContain("botProfile?.memoryEnabled !== false");
    // Must be opt-out per-step via input.useMemory === false (so a step
    // that doesn't want memory bleed can disable it)
    expect(src).toContain("input.useMemory !== false");
  });

  it("Caps the recall block at 12 entries to keep token cost bounded", () => {
    const src = read("server/engine/workflowEngine.ts");
    expect(src).toMatch(/botMemory\.slice\(0,\s*12\)/);
  });

  it("Renders memoryType + confidence + key + value for each entry", () => {
    const src = read("server/engine/workflowEngine.ts");
    // The format is `- [type] (conf:N) key: value` — locks in the
    // shape so future prompt rewrites preserve the semantics
    expect(src).toMatch(/\[\$\{m\.memoryType\}\]/);
    expect(src).toMatch(/conf:\$\{m\.confidence\}/);
    expect(src).toMatch(/\$\{m\.key\}:\s*\$\{m\.value\}/);
  });
});
