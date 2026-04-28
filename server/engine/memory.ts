/**
 * Memory tool — Claude-callable persistence for bots.
 *
 * Each bot profile owns a "memory" — a key/value store backed by the
 * `bot_memory` table. The LLM can call `memory_write`, `memory_read`,
 * `memory_search`, and `memory_forget` to persist learnings across
 * workflow runs (e.g., "supplier ABC has 14-day lead times",
 * "customers in Texas convert better at price < $40").
 *
 * Tool schemas follow the standard Anthropic tool-use shape, which
 * means they drop directly into `client.messages.create({ tools })`.
 * The dispatcher (`executeMemoryTool`) is what an outer agent loop
 * invokes when Claude returns a tool_use block.
 *
 * This module is a STUB by design — it wires the tool surface and
 * the persistence helpers, but the call-site that injects these tools
 * into the workflow engine's LLM call is opt-in per workflow step.
 * See `workflowEngine.executeLLMStep` for the integration point
 * (gated by `step.memoryEnabled`).
 */
import * as db from "../db";

export type MemoryType = "fact" | "pattern" | "decision" | "outcome" | "context";

export interface MemoryToolContext {
  botProfileId: number;
  userId: number;
}

/**
 * Tool definitions in Anthropic's `tools` array shape. Drop these
 * straight into `messages.create({ tools: MEMORY_TOOL_DEFS })`.
 *
 * Naming convention: snake_case, prefixed with `memory_` so an outer
 * agent can also expose unrelated tools without collision.
 */
export const MEMORY_TOOL_DEFS = [
  {
    name: "memory_write",
    description:
      "Store or update a durable learning for this bot. Use this when you discover a non-obvious fact, a recurring pattern, a decision-rule, or an outcome that future runs would benefit from knowing. Use a stable, descriptive `key` so reads can find it later. Set `confidence` lower (e.g., 30-50) if the observation is weak; raise it after corroborating evidence accumulates.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Stable identifier, e.g. 'supplier_zendrop_lead_time_days' — used as the lookup handle.",
        },
        value: {
          type: "string",
          description: "The learning itself. Plain prose; another model run will re-read this verbatim.",
        },
        memoryType: {
          type: "string",
          enum: ["fact", "pattern", "decision", "outcome", "context"],
          description: "fact = concrete data; pattern = recurring behavior; decision = a chosen course; outcome = a result; context = situational hint.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional categorical tags for later filtering, e.g. ['pricing','holiday'].",
        },
        confidence: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "0-100 confidence score. Defaults to 50.",
        },
        expiresInDays: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "Optional auto-expire. Use for time-sensitive observations like 'Q4 sale active'.",
        },
        relatedStoreId: {
          type: "integer",
          description: "Optional store this memory is scoped to. Omit for cross-store learnings.",
        },
      },
      required: ["key", "value", "memoryType"],
    },
  },
  {
    name: "memory_read",
    description:
      "Fetch a memory entry by exact key. Returns null if no entry exists. Bumps the access counter so unused memories can be reaped later.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Exact key as written via memory_write." },
      },
      required: ["key"],
    },
  },
  {
    name: "memory_search",
    description:
      "Substring search across memory keys and values for this bot. Use this when you need to recall something but only know the topic, not the exact key. Optional filters narrow the result set.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring to match against keys and values." },
        memoryType: {
          type: "string",
          enum: ["fact", "pattern", "decision", "outcome", "context"],
        },
        tag: { type: "string", description: "Filter to memories tagged with this string." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max results. Default 20." },
      },
    },
  },
  {
    name: "memory_forget",
    description:
      "Permanently delete a memory entry by id. Use this when a stored learning is contradicted by newer evidence and shouldn't influence future runs.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "The memory id (from memory_search results)." },
      },
      required: ["id"],
    },
  },
] as const;

export type MemoryToolName = (typeof MEMORY_TOOL_DEFS)[number]["name"];

/**
 * Dispatcher — call this from an agent loop when Claude returns a
 * tool_use block whose `name` starts with `memory_`. The result
 * becomes the tool_result content on the next turn.
 *
 * Output shape is plain JSON so it serializes cleanly into the
 * `tool_result.content` string. Callers can JSON.stringify the
 * return value before handing it back to the model.
 */
export async function executeMemoryTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: MemoryToolContext,
): Promise<unknown> {
  switch (toolName) {
    case "memory_write": {
      const key = String(input.key ?? "");
      const value = String(input.value ?? "");
      const memoryType = (input.memoryType ?? "fact") as MemoryType;
      const tags = Array.isArray(input.tags) ? (input.tags as unknown[]).map(String) : undefined;
      const confidence = typeof input.confidence === "number" ? input.confidence : 50;
      const expiresInDays = typeof input.expiresInDays === "number" ? input.expiresInDays : undefined;
      const relatedStoreId = typeof input.relatedStoreId === "number" ? input.relatedStoreId : undefined;
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;

      // Upsert: if a row with the same key exists, update it; else
      // insert. Keeps the per-bot key-space stable so memory_read
      // works against the latest version.
      const existing = await db.getBotMemoryByKey(ctx.botProfileId, key);
      if (existing) {
        await db.updateBotMemoryById(existing.id, {
          value,
          tags,
          confidence,
          expiresAt,
        });
        return { ok: true, action: "updated", id: existing.id };
      }
      const id = await db.addBotMemory({
        botProfileId: ctx.botProfileId,
        userId: ctx.userId,
        key,
        value,
        memoryType,
        tags,
        confidence,
        expiresAt,
        relatedStoreId,
      });
      return { ok: true, action: "created", id };
    }

    case "memory_read": {
      const key = String(input.key ?? "");
      const row = await db.getBotMemoryByKey(ctx.botProfileId, key);
      if (!row) return { found: false };
      // Async — don't await; the read result shouldn't block on the
      // counter bump.
      void db.touchBotMemory(row.id);
      return {
        found: true,
        id: row.id,
        key: row.key,
        value: row.value,
        memoryType: row.memoryType,
        tags: row.tags,
        confidence: row.confidence,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }

    case "memory_search": {
      const rows = await db.searchBotMemory({
        botProfileId: ctx.botProfileId,
        query: typeof input.query === "string" ? input.query : undefined,
        memoryType: input.memoryType as MemoryType | undefined,
        tag: typeof input.tag === "string" ? input.tag : undefined,
        limit: typeof input.limit === "number" ? input.limit : undefined,
      });
      return {
        count: rows.length,
        results: rows.map((r: any) => ({
          id: r.id,
          key: r.key,
          value: r.value,
          memoryType: r.memoryType,
          tags: r.tags,
          confidence: r.confidence,
        })),
      };
    }

    case "memory_forget": {
      const id = typeof input.id === "number" ? input.id : Number(input.id);
      if (!Number.isFinite(id)) return { ok: false, reason: "invalid_id" };
      const removed = await db.deleteBotMemoryById(id, ctx.botProfileId);
      return { ok: removed > 0, removed };
    }

    default:
      return { ok: false, reason: "unknown_tool", toolName };
  }
}

/**
 * Small system-prompt fragment to attach when memory tools are enabled.
 * Keep this short so it doesn't compete with the workflow-specific
 * prompt for attention. The shared system bundle (sharedPrompts.ts)
 * already explains the bot's identity.
 */
export function getMemoryToolPreamble(): string {
  return `
You have access to a memory tool (memory_read, memory_write, memory_search, memory_forget) that persists across runs. Before answering, call memory_search for the topic at hand to recall prior learnings. After completing a task with a non-obvious insight, call memory_write to preserve it for future runs. Keep keys stable and descriptive. Don't write trivial restatements of the user's request — only durable, reusable observations.
`.trim();
}
