/**
 * Defense-in-depth contract tests covering three independent gaps the
 * audit flagged after the round-1 production-readiness arc landed:
 *
 *   1. `getProductsByStore` previously had NO LIMIT clause → a store
 *      with 50k SKUs would stream the entire table into memory. Now
 *      capped at 1000 by default with a hard ceiling of 5000 even when
 *      a caller requests more.
 *   2. `getOrdersByStore` had a default of 50 but no upper bound on
 *      the `limit` parameter; an LLM-fed argument could request a
 *      full-table scan. Same capping pattern applied.
 *   3. The Stripe webhook wrote `metadata.plan_id` directly to
 *      `users.stripePlan` without validating against the closed plan
 *      allowlist. An attacker (or misconfigured Stripe price) could
 *      plant `plan_id="scale"` and silently skip the upgrade bill.
 *      Now passed through `safePlanId` → `isValidPlanId`.
 *
 * Source-pin pattern matches the rest of the audit suite.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { isValidPlanId, VALID_PLAN_IDS } from "./stripe/products";

const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("getProductsByStore + getOrdersByStore enforce LIMIT bounds", () => {
  const dbSrc = read("server/db.ts");

  it("getProductsByStore defaults to 1000, exposes MAX_PRODUCTS_PER_QUERY=5000, clamps to it", () => {
    expect(dbSrc).toMatch(/export const MAX_PRODUCTS_PER_QUERY = 5000/);
    expect(dbSrc).toMatch(/getProductsByStore\(storeId: number,\s*limit\s*=\s*1000\)/);
    // Both the defensive math AND the .limit() call site are pinned.
    expect(dbSrc).toMatch(/Math\.min\(Math\.max\(1,\s*Math\.floor\(limit\)\),\s*MAX_PRODUCTS_PER_QUERY\)/);
    expect(dbSrc).toMatch(/getProductsByStore[\s\S]+?\.limit\(cappedLimit\)/);
  });

  it("getOrdersByStore retains its default of 50 and now clamps to MAX_ORDERS_PER_QUERY=5000", () => {
    expect(dbSrc).toMatch(/export const MAX_ORDERS_PER_QUERY = 5000/);
    expect(dbSrc).toMatch(/getOrdersByStore\(storeId: number,\s*limit\s*=\s*50\)/);
    expect(dbSrc).toMatch(/getOrdersByStore[\s\S]+?\.limit\(cappedLimit\)/);
  });

  it("chat router fetches only what it renders (limit=50 instead of unbounded)", () => {
    // Pre-this-PR `chat.message`'s `get_products` tool fetched ALL
    // products and sliced to 20 in JS. For a store with 10k+ products
    // that was a megabyte-scale memory + serialization tax on every
    // chat turn. The slice survives — but the upstream fetch is now
    // capped server-side.
    const chatSrc = read("server/routers/chat.ts");
    expect(chatSrc).toMatch(/db\.getProductsByStore\(storeId,\s*50\)/);
    expect(chatSrc).not.toMatch(/db\.getProductsByStore\(storeId\)\s*;/);
  });
});

describe("Stripe planId allowlist", () => {
  it("VALID_PLAN_IDS matches the documented PlanId tuple exactly", () => {
    expect(VALID_PLAN_IDS).toEqual(["starter", "growth", "pro", "scale"]);
  });

  it("isValidPlanId accepts every documented plan", () => {
    for (const id of VALID_PLAN_IDS) {
      expect(isValidPlanId(id)).toBe(true);
    }
  });

  it("isValidPlanId rejects strings outside the allowlist", () => {
    expect(isValidPlanId("admin")).toBe(false);
    expect(isValidPlanId("enterprise")).toBe(false);
    expect(isValidPlanId("scale_stolen")).toBe(false);
    expect(isValidPlanId("")).toBe(false);
  });

  it("isValidPlanId rejects non-string types (numbers, null, objects)", () => {
    expect(isValidPlanId(42)).toBe(false);
    expect(isValidPlanId(null)).toBe(false);
    expect(isValidPlanId(undefined)).toBe(false);
    expect(isValidPlanId({ id: "scale" })).toBe(false);
    expect(isValidPlanId(["scale"])).toBe(false);
  });

  it("Stripe webhook wraps every wire-supplied planId in safePlanId", () => {
    const src = read("server/stripe/webhook.ts");
    // Helper exists and uses isValidPlanId.
    expect(src).toMatch(/function safePlanId\(value: unknown, context: string\): PlanId \| undefined/);
    expect(src).toMatch(/safePlanId[\s\S]+?if \(isValidPlanId\(value\)\) return value/);
    // Both lifecycle handlers route metadata.plan_id through it.
    expect(src).toMatch(/safePlanId\(session\.metadata\?\.plan_id,\s*"checkout\.session\.completed"\)/);
    expect(src).toMatch(/safePlanId\(sub\.metadata\?\.plan_id,\s*"customer\.subscription\.updated"\)/);
    // Rejection emits a structured warn so tampering surfaces in the
    // operator's audit trail.
    expect(src).toContain("stripe_invalid_plan_id_rejected");
    // The legacy `(planId as any)` cast is gone — the value being
    // written to db.updateUserStripe is the typed PlanId | undefined.
    expect(src).not.toMatch(/stripePlan:\s*\(planId as any\)/);
  });

  it("Subscription-updated handler keeps user's existing plan when wire planId is invalid", () => {
    // The `?? user.stripePlan ?? undefined` chain is critical: if we
    // dropped to plain `?? undefined` an invalid wire value would
    // silently CLEAR the user's plan column.
    const src = read("server/stripe/webhook.ts");
    expect(src).toMatch(/customer\.subscription\.updated[\s\S]+?stripePlan:\s*planId \?\? user\.stripePlan \?\? undefined/);
  });
});
