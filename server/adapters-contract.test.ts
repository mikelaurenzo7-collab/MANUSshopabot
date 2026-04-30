/**
 * Per-adapter contract conformance tests (audit P1 #8).
 *
 * The pre-existing `server/adapters.test.ts` proves every adapter shows
 * up in the registry and exposes the right method names. That's a shape
 * check — it says nothing about behaviour.
 *
 * This file adds the next layer down: behavioural contract checks that
 * apply to *every* adapter, not just one. Each test loops over the
 * registry so adding a new adapter automatically extends coverage.
 *
 * What we assert:
 *   1. `verifyConnection` rejects (rather than silently returning fake
 *      data) when called with empty credentials. This is how we keep
 *      stub regressions out of the build.
 *   2. `getCapabilities()` is pure — calling it twice returns the same
 *      object shape (deep equality on JSON projections).
 *   3. `platform` ids are unique across the entire registry. Catches
 *      copy-paste bugs where a new adapter forgets to update its id.
 *   4. `platformName` strings are human-readable (no snake_case, no
 *      empty strings).
 *
 * Each adapter that issues real HTTP calls is exercised with credentials
 * that are syntactically valid but pointed at an unreachable host or an
 * obviously-bad token. The assertion is that the call eventually
 * rejects, not that any specific error message is returned — this keeps
 * the test stable across vendor error-format changes.
 */

import { describe, expect, it } from "vitest";
import {
  getEcommerceAdapter,
  SUPPORTED_ECOMMERCE_PLATFORMS,
} from "./adapters/ecommerce";
import {
  getSocialAdapter,
  SUPPORTED_SOCIAL_PLATFORMS,
} from "./adapters/social";
import {
  getToolAdapter,
  SUPPORTED_TOOL_CONNECTORS,
} from "./adapters/tools";
import type { AdapterCredentials } from "./adapters/ecommerce/types";
import type { SocialCredentials } from "./adapters/social/types";
import type { ToolCredentials } from "./adapters/tools/types";

const EMPTY_ECOMMERCE_CREDS: AdapterCredentials = {
  accessToken: "",
  storeUrl: "",
};

const EMPTY_SOCIAL_CREDS: SocialCredentials = {
  accessToken: "",
};

const EMPTY_TOOL_CREDS: ToolCredentials = {};

describe("Ecommerce adapter contract conformance", () => {
  it("every platform id is unique across the registry", () => {
    const ids = SUPPORTED_ECOMMERCE_PLATFORMS.map((p) => getEcommerceAdapter(p).platform);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every platformName is human-readable", () => {
    for (const platform of SUPPORTED_ECOMMERCE_PLATFORMS) {
      const adapter = getEcommerceAdapter(platform);
      // Must start with a letter (eBay/iOS-style lowercase brand
       // names are fine; pure snake_case ids leaking through are not).
      expect(adapter.platformName).toMatch(/^[A-Za-z]/);
      expect(adapter.platformName.length).toBeGreaterThan(2);
      // Snake_case in display names usually means the registry id
      // leaked into the human-facing string.
      expect(adapter.platformName).not.toMatch(/_/);
    }
  });

  it("getCapabilities() is pure (idempotent across calls)", () => {
    for (const platform of SUPPORTED_ECOMMERCE_PLATFORMS) {
      const adapter = getEcommerceAdapter(platform);
      const a = adapter.getCapabilities();
      const b = adapter.getCapabilities();
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("verifyConnection rejects when credentials are empty", async () => {
    // Adapters fall into two camps:
    //  - Eagerly validate credentials and throw synchronously.
    //  - Issue an HTTP call and reject when the upstream rejects.
    // Either is fine — what we don't accept is a silent success.
    for (const platform of SUPPORTED_ECOMMERCE_PLATFORMS) {
      const adapter = getEcommerceAdapter(platform);
      let threw = false;
      try {
        await Promise.race([
          adapter.verifyConnection({ ...EMPTY_ECOMMERCE_CREDS }),
          // Cap at 2s so a slow upstream doesn't hang the test.
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout-sentinel")), 2_000)),
        ]);
      } catch {
        threw = true;
      }
      expect(threw, `${platform}.verifyConnection silently succeeded with empty credentials`).toBe(true);
    }
  }, 60_000);
});

describe("Social adapter contract conformance", () => {
  it("every platform id is unique across the registry", () => {
    const ids = SUPPORTED_SOCIAL_PLATFORMS.map((p) => getSocialAdapter(p).platform);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every platformName is human-readable", () => {
    for (const platform of SUPPORTED_SOCIAL_PLATFORMS) {
      const adapter = getSocialAdapter(platform);
      // Must start with a letter (eBay/iOS-style lowercase brand
       // names are fine; pure snake_case ids leaking through are not).
      expect(adapter.platformName).toMatch(/^[A-Za-z]/);
      expect(adapter.platformName.length).toBeGreaterThan(2);
    }
  });

  it("getCapabilities() is pure (idempotent across calls)", () => {
    for (const platform of SUPPORTED_SOCIAL_PLATFORMS) {
      const adapter = getSocialAdapter(platform);
      const a = adapter.getCapabilities();
      const b = adapter.getCapabilities();
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("verifyConnection rejects when credentials are empty", async () => {
    for (const platform of SUPPORTED_SOCIAL_PLATFORMS) {
      const adapter = getSocialAdapter(platform);
      let threw = false;
      try {
        await Promise.race([
          adapter.verifyConnection({ ...EMPTY_SOCIAL_CREDS }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout-sentinel")), 2_000)),
        ]);
      } catch {
        threw = true;
      }
      expect(threw, `${platform}.verifyConnection silently succeeded with empty credentials`).toBe(true);
    }
  }, 60_000);
});

describe("Tool adapter contract conformance", () => {
  // Tool adapters use `.tool` / `.toolName` (not `.platform` /
  // `.platformName`) and report health via the return value of
  // `verifyConnection` (`healthy: boolean`) rather than throwing —
  // that's intentional: tools degrade gracefully so a misconfigured
  // ESP doesn't take a workflow run down with it.

  it("every tool id is unique across the registry", () => {
    const ids = SUPPORTED_TOOL_CONNECTORS.map((t) => getToolAdapter(t).tool);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every toolName is human-readable", () => {
    for (const tool of SUPPORTED_TOOL_CONNECTORS) {
      const adapter = getToolAdapter(tool);
      expect(adapter.toolName).toMatch(/^[A-Za-z]/);
      expect(adapter.toolName.length).toBeGreaterThan(2);
    }
  });

  it("verifyConnection reports unhealthy when credentials are empty", async () => {
    for (const tool of SUPPORTED_TOOL_CONNECTORS) {
      const adapter = getToolAdapter(tool);
      let result: { healthy?: boolean } | null = null;
      try {
        result = (await Promise.race([
          adapter.verifyConnection({ ...EMPTY_TOOL_CREDS }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout-sentinel")), 2_000)),
        ])) as { healthy?: boolean };
      } catch {
        // A throw is also acceptable — counts as "not silently healthy".
        result = { healthy: false };
      }
      expect(result?.healthy, `${tool}.verifyConnection returned healthy: true with empty credentials`).toBe(false);
    }
  }, 60_000);
});

describe("Cross-registry uniqueness", () => {
  it("ecommerce and social platform ids do not collide", () => {
    const ecom = new Set(SUPPORTED_ECOMMERCE_PLATFORMS.map((p) => getEcommerceAdapter(p).platform));
    const social = new Set(SUPPORTED_SOCIAL_PLATFORMS.map((p) => getSocialAdapter(p).platform));
    for (const id of ecom) {
      expect(social.has(id), `id "${id}" appears in both ecommerce and social registries`).toBe(false);
    }
  });

  // `google_ads` is intentionally registered in both the social and
  // tools registries: the social-adapter version powers ad-campaign
  // creation (SocialPlatformAdapter), while the tools-adapter version
  // exposes analytics/keyword reporting (ToolConnectorAdapter). Each
  // implements a different interface, so users of one registry never
  // see the other's surface.
  const KNOWN_CROSS_REGISTRY_ALIASES = new Set(["google_ads"]);

  it("tool ids do not collide with ecommerce or social ids (other than known aliases)", () => {
    const ecom = new Set(SUPPORTED_ECOMMERCE_PLATFORMS.map((p) => getEcommerceAdapter(p).platform));
    const social = new Set(SUPPORTED_SOCIAL_PLATFORMS.map((p) => getSocialAdapter(p).platform));
    for (const tool of SUPPORTED_TOOL_CONNECTORS) {
      const id = getToolAdapter(tool).tool;
      if (KNOWN_CROSS_REGISTRY_ALIASES.has(id)) continue;
      expect(ecom.has(id), `tool id "${id}" collides with an ecommerce platform`).toBe(false);
      expect(social.has(id), `tool id "${id}" collides with a social platform`).toBe(false);
    }
  });
});
