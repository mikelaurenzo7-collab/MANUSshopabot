/**
 * Tier-2 production-readiness hardening contract.
 *
 * Pins three independent fixes the audit flagged after the top-5
 * gaps shipped:
 *
 *   1. shopifyOAuth.ts no longer carries the legacy in-memory
 *      `nonceStore` fallback. The DB consume path is atomic
 *      (`db.consumeOAuthStateToken` deletes inside the same SQL
 *      transaction as the read); the fallback was a `.get()` then
 *      `.delete()` pair that allowed two concurrent callbacks to
 *      both pass through. The migration aid is no longer needed.
 *
 *   2. dashboard.dailyBrief replaced its N+1 `Promise.all` over
 *      `getOrdersByStoreSince` with a single `getOrdersByStoresSince`
 *      query that groups by storeId. Errors are now logged via
 *      `daily_brief_orders_fetch_failed` instead of silently
 *      swallowed by `.catch(() => [])`.
 *
 *   3. chat.message no longer uses `as any` casts on its LLM
 *      message arrays. Typing the arrays as `LLMMessage[]` from
 *      `_core/llm` lets TypeScript catch role-typo or
 *      missing-field bugs at compile time instead of silently
 *      shipping malformed payloads to the model.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("OAuth state token replay race — fixed", () => {
  it("shopifyOAuth.ts has no legacy in-memory nonceStore", () => {
    const src = read("server/shopifyOAuth.ts");
    // Pre-this-PR: `const nonceStore = new Map<...>();` then
    // `.get(state)` / `.delete(state)` two-step (non-atomic).
    // Fixed: only the DB consume path remains.
    expect(src).not.toMatch(/const nonceStore = new Map/);
    expect(src).not.toMatch(/nonceStore\.get\(/);
    expect(src).not.toMatch(/nonceStore\.set\(/);
    expect(src).not.toMatch(/nonceStore\.delete\(/);
  });

  it("OAuth callback uses the atomic DB consume path with no fallback", () => {
    const src = read("server/shopifyOAuth.ts");
    expect(src).toMatch(/const dbState = await db\.consumeOAuthStateToken\(state, "shopify"\)/);
    // Single failure path: if the DB consume returns null, reject
    // the callback. No "try DB then try memory" branching.
    expect(src).toMatch(/if \(!dbState\)\s*\{[\s\S]+?Invalid or expired state parameter/);
    // The legacy `legacyState` variable is gone.
    expect(src).not.toMatch(/legacyState/);
  });
});

describe("Dashboard N+1 — single bulk query", () => {
  it("db.getOrdersByStoresSince exists, accepts a list of storeIds, returns Map<storeId, orders[]>", () => {
    const src = read("server/db.ts");
    expect(src).toMatch(/export async function getOrdersByStoresSince\(\s*storeIds: number\[\],\s*sinceDate: Date,\s*hardCap = 10_000/);
    expect(src).toMatch(/Promise<Map<number, Array<typeof orders\.\$inferSelect>>>/);
    // Filter uses `inArray(orders.storeId, storeIds)` not a loop.
    expect(src).toMatch(/where\(and\(inArray\(orders\.storeId, storeIds\)/);
    // Pre-seeds empty arrays for stores with zero orders so callers
    // get a stable shape regardless of data.
    expect(src).toMatch(/Pre-seed empty arrays/);
  });

  it("dashboard.dailyBrief calls the bulk helper instead of the per-store loop", () => {
    const src = read("server/routers/dashboard.ts");
    expect(src).toContain("db.getOrdersByStoresSince(");
    // Legacy N+1 pattern is gone.
    expect(src).not.toMatch(/activeStores\.map\(\(s: any\) => db\.getOrdersByStoreSince\(s\.id, since\)\.catch\(\(\) => \[\]\)\)/);
  });

  it("dashboard.dailyBrief logs structured failure instead of swallowing errors", () => {
    const src = read("server/routers/dashboard.ts");
    // Now logs through the structured logger so a flake surfaces in
    // the operator's audit trail.
    expect(src).toContain("daily_brief_orders_fetch_failed");
  });
});

describe("chat.message — typed LLM message arrays (no more `as any`)", () => {
  const src = read("server/routers/chat.ts");

  it("imports the canonical Message type from _core/llm", () => {
    expect(src).toMatch(/import \{[^}]*type Message as LLMMessage[^}]*\} from "\.\.\/_core\/llm"/);
  });

  it("llmMessages array is typed as LLMMessage[] (not Array<{ role: string; content: string }>)", () => {
    expect(src).toMatch(/const llmMessages: LLMMessage\[\] = \[/);
    // Loose-typed legacy declaration is gone.
    expect(src).not.toMatch(/const llmMessages: Array<\{ role: string; content: string \}>/);
  });

  it("toolResultMessages array is typed as LLMMessage[] not Array<any>", () => {
    expect(src).toMatch(/const toolResultMessages: LLMMessage\[\] = \[/);
    expect(src).not.toMatch(/const toolResultMessages: Array<any>/);
  });

  it("finalMessages array is typed and the second invokeLLM call drops the `as any` cast", () => {
    expect(src).toMatch(/const finalMessages: LLMMessage\[\] = \[/);
    // Both invokeLLM calls now pass typed messages directly.
    expect(src).toMatch(/messages: llmMessages,\s*\n\s*tools: TOOLS/);
    expect(src).toMatch(/messages: finalMessages,\s*\n\s*maxTokens: 1024/);
    // No `messages: ... as any` patterns survive.
    expect(src).not.toMatch(/messages: llmMessages as any/);
    expect(src).not.toMatch(/messages: finalMessages as any/);
  });
});
