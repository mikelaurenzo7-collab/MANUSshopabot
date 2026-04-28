/**
 * Memory tool — source-level wiring + dispatcher logic.
 *
 * The memory tool is a Claude-callable persistence layer on top of
 * the `bot_memory` table. These tests exercise the dispatcher
 * directly (no DB) by stubbing the db helpers it calls. The goal is
 * to lock in:
 *   - tool schemas are well-formed (name + input_schema present)
 *   - the dispatcher routes by tool name to the correct db helper
 *   - upsert behavior: existing key → update; new key → create
 *   - read returns null for missing keys without throwing
 *   - search forwards filters; forget short-circuits on bad input
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

import * as db from "./db";
import {
  MEMORY_TOOL_DEFS,
  executeMemoryTool,
  getMemoryToolPreamble,
} from "./engine/memory";

const ctx = { botProfileId: 7, userId: 42 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MEMORY_TOOL_DEFS", () => {
  it("exposes all four memory tools with valid Anthropic schemas", () => {
    const names = MEMORY_TOOL_DEFS.map((t) => t.name).sort();
    expect(names).toEqual([
      "memory_forget",
      "memory_read",
      "memory_search",
      "memory_write",
    ]);
    for (const tool of MEMORY_TOOL_DEFS) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.properties).toBeDefined();
    }
  });

  it("memory_write requires key + value + memoryType", () => {
    const writeTool = MEMORY_TOOL_DEFS.find((t) => t.name === "memory_write");
    expect(writeTool?.input_schema.required).toContain("key");
    expect(writeTool?.input_schema.required).toContain("value");
    expect(writeTool?.input_schema.required).toContain("memoryType");
  });

  it("memory_forget takes only id", () => {
    const forgetTool = MEMORY_TOOL_DEFS.find((t) => t.name === "memory_forget");
    expect(forgetTool?.input_schema.required).toEqual(["id"]);
  });
});

describe("executeMemoryTool — write", () => {
  it("creates a new row when no existing key matches", async () => {
    (db.getBotMemoryByKey as any).mockResolvedValue(null);
    (db.addBotMemory as any).mockResolvedValue(101);

    const result = await executeMemoryTool(
      "memory_write",
      {
        key: "supplier_zendrop_lead_time_days",
        value: "Lead time averages 12 days for the standard tier.",
        memoryType: "fact",
        tags: ["supplier", "lead-time"],
        confidence: 70,
      },
      ctx,
    );

    expect(db.addBotMemory).toHaveBeenCalledTimes(1);
    expect(db.updateBotMemoryById).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, action: "created", id: 101 });
  });

  it("updates an existing row when the key already exists", async () => {
    (db.getBotMemoryByKey as any).mockResolvedValue({ id: 55 });

    const result = await executeMemoryTool(
      "memory_write",
      {
        key: "supplier_zendrop_lead_time_days",
        value: "Updated: lead time now 9 days under premium.",
        memoryType: "fact",
        confidence: 85,
      },
      ctx,
    );

    expect(db.updateBotMemoryById).toHaveBeenCalledTimes(1);
    expect(db.addBotMemory).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, action: "updated", id: 55 });
  });

  it("converts expiresInDays to a future Date", async () => {
    (db.getBotMemoryByKey as any).mockResolvedValue(null);
    (db.addBotMemory as any).mockResolvedValue(1);

    const before = Date.now();
    await executeMemoryTool(
      "memory_write",
      { key: "k", value: "v", memoryType: "context", expiresInDays: 7 },
      ctx,
    );
    const args = (db.addBotMemory as any).mock.calls[0][0];
    expect(args.expiresAt).toBeInstanceOf(Date);
    const drift = args.expiresAt.getTime() - before - 7 * 24 * 60 * 60 * 1000;
    // Should be within a few hundred ms of "exactly 7 days from now".
    expect(Math.abs(drift)).toBeLessThan(5000);
  });
});

describe("executeMemoryTool — read", () => {
  it("returns found:false when no entry exists", async () => {
    (db.getBotMemoryByKey as any).mockResolvedValue(null);
    const result = await executeMemoryTool("memory_read", { key: "missing" }, ctx);
    expect(result).toEqual({ found: false });
    expect(db.touchBotMemory).not.toHaveBeenCalled();
  });

  it("returns the row + bumps the access counter on a hit", async () => {
    (db.getBotMemoryByKey as any).mockResolvedValue({
      id: 9,
      key: "k",
      value: "v",
      memoryType: "fact",
      tags: ["x"],
      confidence: 60,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-04-01"),
    });
    const result = await executeMemoryTool("memory_read", { key: "k" }, ctx);
    expect((result as any).found).toBe(true);
    expect((result as any).id).toBe(9);
    expect((result as any).value).toBe("v");
    expect(db.touchBotMemory).toHaveBeenCalledWith(9);
  });
});

describe("executeMemoryTool — search", () => {
  it("forwards query, type, tag, limit to db.searchBotMemory", async () => {
    (db.searchBotMemory as any).mockResolvedValue([
      { id: 1, key: "a", value: "av", memoryType: "fact", tags: ["t"], confidence: 50 },
    ]);
    const result = await executeMemoryTool(
      "memory_search",
      { query: "supplier", memoryType: "fact", tag: "shipping", limit: 5 },
      ctx,
    );
    expect(db.searchBotMemory).toHaveBeenCalledWith({
      botProfileId: 7,
      query: "supplier",
      memoryType: "fact",
      tag: "shipping",
      limit: 5,
    });
    expect((result as any).count).toBe(1);
    expect((result as any).results[0].key).toBe("a");
  });
});

describe("executeMemoryTool — forget", () => {
  it("rejects non-numeric ids without calling the db", async () => {
    const result = await executeMemoryTool("memory_forget", { id: "not-a-number" }, ctx);
    expect(result).toEqual({ ok: false, reason: "invalid_id" });
    expect(db.deleteBotMemoryById).not.toHaveBeenCalled();
  });

  it("returns ok:true when a row is removed", async () => {
    (db.deleteBotMemoryById as any).mockResolvedValue(1);
    const result = await executeMemoryTool("memory_forget", { id: 99 }, ctx);
    expect(db.deleteBotMemoryById).toHaveBeenCalledWith(99, 7);
    expect(result).toEqual({ ok: true, removed: 1 });
  });

  it("returns ok:false when no row matched", async () => {
    (db.deleteBotMemoryById as any).mockResolvedValue(0);
    const result = await executeMemoryTool("memory_forget", { id: 99 }, ctx);
    expect(result).toEqual({ ok: false, removed: 0 });
  });
});

describe("executeMemoryTool — unknown tool", () => {
  it("returns ok:false for an unrecognized tool name", async () => {
    const result = await executeMemoryTool("memory_dance", {}, ctx);
    expect((result as any).ok).toBe(false);
    expect((result as any).reason).toBe("unknown_tool");
  });
});

describe("getMemoryToolPreamble", () => {
  it("returns a short, non-empty string mentioning the four tools", () => {
    const preamble = getMemoryToolPreamble();
    expect(preamble.length).toBeGreaterThan(0);
    expect(preamble.length).toBeLessThan(800);
    expect(preamble).toContain("memory_read");
    expect(preamble).toContain("memory_write");
    expect(preamble).toContain("memory_search");
    expect(preamble).toContain("memory_forget");
  });
});
