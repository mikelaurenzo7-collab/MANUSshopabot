/**
 * Memory agent — agentic write loop wiring.
 *
 * The base memory module ships passive recall (memories pre-injected
 * into the system prompt). This module ships the active half: a
 * tool-use loop that lets Claude actually call memory_write /
 * memory_read / memory_search / memory_forget during the LLM step.
 *
 * Source-level wiring tests — the loop logic itself can't be unit-
 * tested without mocking the SDK, which adds more brittleness than
 * value. Integration tests with a real ANTHROPIC_API_KEY live in
 * `enhanced-bots.test.ts` (skipped in CI without the key).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getBotMemoryByKey: vi.fn(),
  addBotMemory: vi.fn(),
  updateBotMemoryById: vi.fn(),
  searchBotMemory: vi.fn(),
  touchBotMemory: vi.fn(),
  deleteBotMemoryById: vi.fn(),
}));

import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runMemoryAgent — public API surface", () => {
  it("exports runMemoryAgent + isMemoryAgentAvailable", async () => {
    const mod = await import("./engine/memoryAgent");
    expect(typeof mod.runMemoryAgent).toBe("function");
    expect(typeof mod.isMemoryAgentAvailable).toBe("function");
  });

  it("isMemoryAgentAvailable returns false without ANTHROPIC_API_KEY", async () => {
    const mod = await import("./engine/memoryAgent");
    // Test env doesn't set the key; this is the falsy default.
    expect(mod.isMemoryAgentAvailable()).toBe(false);
  });

  it("returns the documented MemoryAgentResult shape", () => {
    const src = read("server/engine/memoryAgent.ts");
    expect(src).toContain("export interface MemoryAgentResult");
    for (const field of ["text", "iterations", "toolCallCount", "hitIterationCap", "stopReason"]) {
      expect(src, `result should expose ${field}`).toContain(field);
    }
  });
});

describe("runMemoryAgent — loop semantics", () => {
  it("caps iterations at 6 by default to prevent runaway", () => {
    const src = read("server/engine/memoryAgent.ts");
    expect(src).toMatch(/MAX_ITERATIONS\s*=\s*6/);
  });

  it("appends the full assistant content (text + tool_use) back on each turn", () => {
    // Critical: the SDK requires the prior turn's tool_use blocks to
    // be present in messages so the tool_result_id matches up.
    const src = read("server/engine/memoryAgent.ts");
    expect(src).toContain('messages.push({ role: "assistant", content: response.content })');
  });

  it("dispatches every tool_use through executeMemoryTool", () => {
    const src = read("server/engine/memoryAgent.ts");
    expect(src).toContain("executeMemoryTool(");
    expect(src).toContain("toolUse.name");
    // Each tool result must reference its tool_use_id
    expect(src).toContain("tool_use_id: toolUse.id");
  });

  it("converts tool errors into is_error tool_results (lets the model recover)", () => {
    const src = read("server/engine/memoryAgent.ts");
    expect(src).toContain("is_error: true");
    // The error path returns a structured payload, not a thrown exception
    expect(src).toMatch(/ok:\s*false,\s*error:/);
  });

  it("exits when the model returns no tool_use OR signals end_turn", () => {
    const src = read("server/engine/memoryAgent.ts");
    expect(src).toMatch(/toolUses\.length === 0\s*\|\|\s*response\.stop_reason === "end_turn"/);
  });

  it("returns last-known assistant text when the iteration cap fires", () => {
    const src = read("server/engine/memoryAgent.ts");
    expect(src).toContain("hitIterationCap: true");
    expect(src).toContain("Memory agent reached max iterations");
  });
});

describe("workflowEngine — opt-in routing through the memory agent", () => {
  it("branches on input.useMemoryTools + isMemoryAgentAvailable + botProfile.id", () => {
    const src = read("server/engine/workflowEngine.ts");
    expect(src).toMatch(/input\.useMemoryTools\s*&&[\s\S]*isMemoryAgentAvailable\(\)[\s\S]*botProfile\?\.id/);
  });

  it("respects botProfile.memoryEnabled !== false", () => {
    const src = read("server/engine/workflowEngine.ts");
    expect(src).toContain("botProfile.memoryEnabled !== false");
  });

  it("falls back to the single-shot path when the agent throws", () => {
    // Agent failures must not hard-fail the workflow — the engine has
    // its own retry layer around steps, and a flaky agentic call
    // shouldn't cost the user a step's worth of work.
    const src = read("server/engine/workflowEngine.ts");
    expect(src).toContain("memory agent failed, falling back to single-shot");
  });

  it("returns __memoryAgent telemetry alongside the text output", () => {
    const src = read("server/engine/workflowEngine.ts");
    expect(src).toContain("__memoryAgent");
    expect(src).toContain("iterations");
    expect(src).toContain("toolCalls");
    expect(src).toContain("hitCap");
  });
});

describe("Memory tools advertised to Claude match the dispatcher", () => {
  it("MEMORY_TOOL_DEFS names line up with executeMemoryTool's switch cases", async () => {
    const mod = await import("./engine/memory");
    const names = mod.MEMORY_TOOL_DEFS.map((t: any) => t.name).sort();
    expect(names).toEqual([
      "memory_forget",
      "memory_read",
      "memory_search",
      "memory_write",
    ]);
    // All four names must be handled by the dispatcher (otherwise
    // Claude could call a tool the loop can't execute → infinite
    // is_error responses)
    const dispatcherSrc = read("server/engine/memory.ts");
    for (const name of names) {
      expect(dispatcherSrc, `dispatcher must handle ${name}`).toContain(`case "${name}":`);
    }
  });
});
