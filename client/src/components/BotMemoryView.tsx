/**
 * BotMemoryView.tsx — the "what my bot learned" surface.
 *
 * Reads `trpc.botProfile.getMemory` for the active bot and renders
 * the entries with search, type filter, sort, confidence bar, access
 * heat, and relative-time hints. Bots accumulate hundreds of
 * memories as they run; without filtering this becomes a wall of
 * text. With filtering it becomes a "knowledge graph" the user can
 * actually explore.
 *
 * The memory agent (server/engine/memoryAgent.ts) is what populates
 * this surface — the model writes durable learnings during workflow
 * runs via memory_write tool calls. Confidence and access counts
 * track how strong + how often each entry has been used.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, Search, Sparkles, Filter, ArrowDownAZ, Tag, Clock, Activity } from "lucide-react";
import { Link } from "wouter";

type AgentType = "architect" | "merchant" | "social";
type MemoryType = "fact" | "pattern" | "decision" | "outcome" | "context";
type SortKey = "recent" | "confidence" | "most-accessed";

const TYPE_ACCENT: Record<MemoryType, { dot: string; chip: string }> = {
  fact:     { dot: "bg-emerald-400", chip: "border-emerald-500/30 text-emerald-300 bg-emerald-500/10" },
  pattern:  { dot: "bg-cyan-400",    chip: "border-cyan-500/30    text-cyan-300    bg-cyan-500/10"    },
  decision: { dot: "bg-amber-400",   chip: "border-amber-500/30   text-amber-300   bg-amber-500/10"   },
  outcome:  { dot: "bg-violet-400",  chip: "border-violet-500/30  text-violet-300  bg-violet-500/10"  },
  context:  { dot: "bg-sky-400",     chip: "border-sky-500/30     text-sky-300     bg-sky-500/10"     },
};

function relativeTime(date: string | Date | null | undefined): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const tone =
    pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-white/55 font-mono tabular-nums w-7 text-right">{pct}%</span>
    </div>
  );
}

interface BotMemoryViewProps {
  agentType: AgentType;
}

export function BotMemoryView({ agentType }: BotMemoryViewProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryType | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const memoryQuery = trpc.botProfile.getMemory.useQuery({
    agentType,
    limit: 200,
  });

  const filtered = useMemo(() => {
    const data = (memoryQuery.data ?? []) as any[];
    const q = query.trim().toLowerCase();
    let rows = data.filter((m) => {
      if (typeFilter !== "all" && m.memoryType !== typeFilter) return false;
      if (!q) return true;
      const haystack = `${m.key ?? ""} ${m.value ?? ""} ${(m.tags ?? []).join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "confidence") return (b.confidence ?? 0) - (a.confidence ?? 0);
      if (sort === "most-accessed") return (b.accessCount ?? 0) - (a.accessCount ?? 0);
      // recent: lastAccessedAt or createdAt, descending
      const aTime = new Date(a.lastAccessedAt || a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.lastAccessedAt || b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
    return rows;
  }, [memoryQuery.data, query, typeFilter, sort]);

  const totalCount = (memoryQuery.data ?? []).length;
  const filteredCount = filtered.length;

  if (memoryQuery.isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  // Empty: bot has zero memories at all (not just zero matching the filter)
  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center py-12 px-6 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01]">
        <div className="h-14 w-14 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(217,70,239,0.15)]">
          <Brain className="h-6 w-6 text-fuchsia-400" />
        </div>
        <p className="text-sm font-medium text-foreground">No memories yet</p>
        <p className="text-xs text-muted-foreground mt-1 text-center max-w-md">
          Store Bot will accumulate
          durable learnings — supplier lead times, winning niches, audience hooks — as it runs workflows. Launch one to
          start filling this view.
        </p>
        <Link href="/chat">
          <button className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 text-xs font-semibold text-fuchsia-200 hover:bg-fuchsia-500/25 hover:border-fuchsia-400/40 transition-colors">
            <Sparkles className="h-3.5 w-3.5" />
            Launch a workflow
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
          <Input
            placeholder="Search keys, values, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 bg-white/[0.03] border-white/[0.08] text-sm h-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as MemoryType | "all")}>
            <SelectTrigger className="flex-1 h-9 bg-white/[0.03] border-white/[0.08] text-sm">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-white/40 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="fact">Facts</SelectItem>
              <SelectItem value="pattern">Patterns</SelectItem>
              <SelectItem value="decision">Decisions</SelectItem>
              <SelectItem value="outcome">Outcomes</SelectItem>
              <SelectItem value="context">Context</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="flex-1 h-9 bg-white/[0.03] border-white/[0.08] text-sm">
              <ArrowDownAZ className="w-3.5 h-3.5 mr-1.5 text-white/40 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="confidence">Highest confidence</SelectItem>
              <SelectItem value="most-accessed">Most accessed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-[10px] text-white/35 font-mono break-words">
        Showing {filteredCount} of {totalCount} {totalCount === 1 ? "memory" : "memories"}
        {query && <span className="text-fuchsia-300/70"> · matching "{query}"</span>}
      </p>

      {/* Filtered-empty state */}
      {filteredCount === 0 ? (
        <div className="flex flex-col items-center py-10 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01]">
          <Search className="h-5 w-5 text-white/30 mb-2" />
          <p className="text-xs text-white/55">No memories match your filter</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setTypeFilter("all");
            }}
            className="mt-3 text-[11px] text-fuchsia-300/80 hover:text-fuchsia-300 underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((mem: any) => {
            const accent = TYPE_ACCENT[mem.memoryType as MemoryType] ?? TYPE_ACCENT.fact;
            const isExpanded = !!expanded[mem.id];
            const valueStr = String(mem.value ?? "");
            const isLong = valueStr.length > 220;
            const tags: string[] = Array.isArray(mem.tags) ? mem.tags : [];
            return (
              <div
                key={mem.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-3.5 hover:border-white/[0.12] hover:bg-white/[0.035] transition-all"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${accent.dot}`} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded border ${accent.chip}`}>
                        {mem.memoryType}
                      </span>
                      <p className="text-sm font-mono font-semibold text-white truncate">{mem.key}</p>
                    </div>
                    <p className={`text-xs text-white/65 leading-relaxed break-words ${isLong && !isExpanded ? "line-clamp-2" : ""}`}>
                      {valueStr}
                    </p>
                    {isLong && (
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [mem.id]: !prev[mem.id] }))}
                        className="text-[10px] text-fuchsia-300/70 hover:text-fuchsia-300 mt-1 underline-offset-2 hover:underline"
                      >
                        {isExpanded ? "Show less" : "Show full memory"}
                      </button>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tags.slice(0, 6).map((t, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-[9px] font-mono text-white/55 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded"
                          >
                            <Tag className="w-2 h-2 text-fuchsia-400/60 shrink-0" />
                            <span className="truncate max-w-20">{t}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5 min-w-[80px]">
                    <ConfidenceBar value={mem.confidence ?? 50} />
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-2 text-[10px] text-white/45 font-mono">
                      <span className="inline-flex items-center gap-0.5 whitespace-nowrap" title="Times read by the bot during runs">
                        <Activity className="w-2.5 h-2.5 shrink-0" />
                        {mem.accessCount ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-0.5 whitespace-nowrap" title="Last time the bot recalled this memory">
                        <Clock className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate max-w-16 sm:max-w-none">{relativeTime(mem.lastAccessedAt ?? mem.createdAt)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
