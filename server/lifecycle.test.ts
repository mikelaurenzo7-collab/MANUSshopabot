/**
 * Lifecycle router — Builder→Merchant handoff.
 *
 * These tests run without a database. They verify:
 *   1. The router is wired into the appRouter.
 *   2. The shared taxonomy stays consistent (stage ids, lead bots).
 *   3. `isHandoffReady` is conservative in the way the UX promises.
 */
import { describe, it, expect } from "vitest";
import {
  BOTS, BOT_BY_ID, LIFECYCLE_STAGES, LIFECYCLE_BY_ID,
  HANDOFF_NARRATIVE, isHandoffReady, botName,
} from "../shared/bots";

describe("shared/bots — lifecycle taxonomy", () => {
  it("exposes exactly three bots in canonical order", () => {
    expect(BOTS.map((b) => b.id)).toEqual(["architect", "merchant", "social"]);
  });

  it("BOT_BY_ID round-trips every bot", () => {
    for (const b of BOTS) {
      expect(BOT_BY_ID[b.id]).toBe(b);
    }
  });

  it("botName returns user-facing mode names", () => {
    expect(botName("architect")).toBe("Launch mode");
    expect(botName("merchant")).toBe("Operator mode");
    expect(botName("social")).toBe("Growth mode");
  });

  it("botName never throws on unknown ids", () => {
    expect(botName("unknown-bot")).toBe("unknown-bot");
  });

  it("exposes three lifecycle stages with the right lead bots", () => {
    expect(LIFECYCLE_STAGES.map((s) => s.id)).toEqual(["building", "transitioning", "operating"]);
    expect(LIFECYCLE_BY_ID.building.leadBotId).toBe("architect");
    expect(LIFECYCLE_BY_ID.transitioning.leadBotId).toBe("merchant");
    expect(LIFECYCLE_BY_ID.operating.leadBotId).toBe("merchant");
  });

  it("HANDOFF_NARRATIVE has both sides of the handoff", () => {
    expect(HANDOFF_NARRATIVE.merchantTakesOver.length).toBeGreaterThan(0);
    expect(HANDOFF_NARRATIVE.builderRemains.length).toBeGreaterThan(0);
  });
});

describe("isHandoffReady", () => {
  const empty = { storeConnected: false, productCount: 0, hasFirstOrder: false, setupMarkedComplete: false };

  it("is false for a brand new store", () => {
    expect(isHandoffReady(empty)).toBe(false);
  });

  it("is true when setup is explicitly marked complete", () => {
    expect(isHandoffReady({ ...empty, setupMarkedComplete: true })).toBe(true);
  });

  it("is true when the store has its first paid order", () => {
    expect(isHandoffReady({ ...empty, hasFirstOrder: true })).toBe(true);
  });

  it("requires both connection and >=5 products to graduate organically", () => {
    expect(isHandoffReady({ ...empty, storeConnected: true, productCount: 4 })).toBe(false);
    expect(isHandoffReady({ ...empty, storeConnected: false, productCount: 12 })).toBe(false);
    expect(isHandoffReady({ ...empty, storeConnected: true, productCount: 5 })).toBe(true);
  });
});

describe("lifecycle router wiring", () => {
  it("is registered on the appRouter", async () => {
    const mod = await import("./routers");
    const procedures = mod.appRouter._def.procedures as Record<string, any>;
    expect(procedures["lifecycle.get"]).toBeDefined();
    expect(procedures["lifecycle.listAll"]).toBeDefined();
    expect(procedures["lifecycle.markSetupComplete"]).toBeDefined();
    expect(procedures["lifecycle.acknowledgeHandoff"]).toBeDefined();
    expect(procedures["lifecycle.reopenBuilder"]).toBeDefined();
  });
});
