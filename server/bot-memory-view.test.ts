/**
 * Bot Memory View — surfaces the durable learnings the memory agent
 * accumulates during workflow runs.
 *
 * The memory agent (server/engine/memoryAgent.ts) writes during runs
 * via memory_write tool calls; this view is the read surface. Without
 * it, users would have no way to inspect what their bot has learned,
 * making the entire memory feature invisible.
 *
 * Source-level wiring tests — no rendering, no DB access.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

describe("BotMemoryView component — public API + filtering", () => {
  it("component exists and accepts a typed agentType prop", () => {
    const src = read("client/src/components/BotMemoryView.tsx");
    expect(src).toContain("export function BotMemoryView");
    expect(src).toMatch(/agentType:\s*AgentType/);
    expect(src).toMatch(/AgentType\s*=\s*"architect"\s*\|\s*"merchant"\s*\|\s*"social"/);
  });

  it("queries trpc.botProfile.getMemory with a generous default limit", () => {
    const src = read("client/src/components/BotMemoryView.tsx");
    expect(src).toContain("trpc.botProfile.getMemory.useQuery");
    // Bots can accumulate hundreds; pull enough so client-side filter
    // sees the whole haystack.
    expect(src).toMatch(/limit:\s*200/);
  });

  it("filters by query (key + value + tags) and memoryType", () => {
    const src = read("client/src/components/BotMemoryView.tsx");
    // The filter combines all three searchable fields into a single haystack
    expect(src).toContain('`${m.key ?? ""} ${m.value ?? ""} ${(m.tags ?? []).join(" ")}`');
    expect(src).toContain('typeFilter !== "all" && m.memoryType !== typeFilter');
  });

  it("offers three sort orders: recent, confidence, most-accessed", () => {
    const src = read("client/src/components/BotMemoryView.tsx");
    expect(src).toContain('sort === "confidence"');
    expect(src).toContain('sort === "most-accessed"');
    // Recent fallback sorts by lastAccessedAt → updatedAt → createdAt
    expect(src).toContain("a.lastAccessedAt || a.updatedAt || a.createdAt");
  });
});

describe("BotMemoryView — empty states + error recovery", () => {
  it("zero-memories empty state offers a launch-workflow CTA", () => {
    // The 'true' empty state (no memories at all) should pull users
    // toward the action that fills the memory store — not just say
    // "nothing here yet"
    const src = read("client/src/components/BotMemoryView.tsx");
    expect(src).toContain("No memories yet");
    expect(src).toContain('href="/architect"');
    expect(src).toContain("Launch a workflow");
  });

  it("filter-empty state offers a clear-filters affordance", () => {
    const src = read("client/src/components/BotMemoryView.tsx");
    expect(src).toContain("No memories match your filter");
    expect(src).toContain("Clear filters");
    // Clicking the affordance must reset both the query and type
    expect(src).toMatch(/setQuery\("\"\)[\s\S]*setTypeFilter\("all"\)/);
  });
});

describe("BotMemoryView — rich entry rendering", () => {
  it("renders each memory's type as a colored chip, not flat text", () => {
    const src = read("client/src/components/BotMemoryView.tsx");
    expect(src).toContain("TYPE_ACCENT");
    // All five memory types present
    for (const t of ["fact", "pattern", "decision", "outcome", "context"]) {
      expect(src, `should style ${t}`).toContain(`${t}:`);
    }
  });

  it("renders confidence as a colored bar (not a plain number)", () => {
    const src = read("client/src/components/BotMemoryView.tsx");
    expect(src).toContain("function ConfidenceBar");
    expect(src).toContain("bg-emerald-400"); // high
    expect(src).toContain("bg-amber-400");   // medium
    expect(src).toContain("bg-rose-400");    // low
  });

  it("collapses long memory values behind a Show full memory toggle", () => {
    const src = read("client/src/components/BotMemoryView.tsx");
    expect(src).toContain("Show full memory");
    expect(src).toContain("Show less");
    // 220-char threshold matches the line-clamp visual cutoff
    expect(src).toMatch(/valueStr\.length > 220/);
  });

  it("displays access count and relative-time hints for memory heat", () => {
    const src = read("client/src/components/BotMemoryView.tsx");
    expect(src).toContain("function relativeTime");
    expect(src).toMatch(/accessCount/);
    // Relative-time bands cover the realistic range
    for (const band of ["just now", "m ago", "h ago", "d ago", "mo ago"]) {
      expect(src, `relativeTime should handle ${band}`).toContain(band);
    }
  });
});

describe("BotSettings — memory tab uses the new view", () => {
  it("imports BotMemoryView and renders it on the memory tab", () => {
    const src = read("client/src/pages/BotSettings.tsx");
    expect(src).toContain('import { BotMemoryView } from "@/components/BotMemoryView"');
    expect(src).toContain("<BotMemoryView agentType={selectedBot} />");
  });

  it("removes the inline memoryQuery (now owned by the view)", () => {
    // Pre-fix BotSettings called trpc.botProfile.getMemory directly. Now
    // that lives inside BotMemoryView, so a duplicate query at the
    // page level would re-fetch on every tab switch.
    const src = read("client/src/pages/BotSettings.tsx");
    expect(src).not.toContain("trpc.botProfile.getMemory.useQuery");
  });

  it("only mounts the view when the memory tab is active (lazy-load)", () => {
    const src = read("client/src/pages/BotSettings.tsx");
    expect(src).toContain('selectedTab === "memory" && <BotMemoryView');
  });
});
