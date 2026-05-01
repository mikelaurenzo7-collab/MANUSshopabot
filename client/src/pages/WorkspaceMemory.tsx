/**
 * WorkspaceMemory — operator-facing memory inspector for the Store Bot.
 *
 * The bot's memory is what makes it sharper month-over-month: the
 * operator should be able to see what's been learned, search/filter
 * it, and prune anything that doesn't match the brand. This page
 * surfaces every memory entry the bot has accrued for THIS store,
 * grouped by type with confidence scores and source workflow links.
 *
 * No data here is destructive on first ship — we render the audit
 * trail honestly. Pruning + addition come next once the operator-
 * facing schema settles.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { WorkspaceShell, useWorkspaceStore } from "@/components/workspace/WorkspaceShell";
import { QueryErrorBanner } from "@/components/QueryErrorBanner";
import {
  Brain,
  Search,
  Filter,
  Sparkles,
  CheckCircle2,
  Clock,
  Tag,
} from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  preference: "Preference",
  fact: "Fact",
  pattern: "Pattern",
  feedback: "Feedback",
  short_term: "Short term",
  long_term: "Long term",
};

function formatRelative(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function WorkspaceMemory() {
  const { storeId, store, brand } = useWorkspaceStore();
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // The Store Bot is unified in the UI but the server-side memory store
  // is still keyed by the legacy agent triad (architect / merchant /
  // social). We pull the architect bucket as the canonical "store
  // memory" since that's the launch persona that learns the store's
  // niche, brand voice, and supplier preferences.
  const memoryQuery = trpc.botProfile.getMemory.useQuery(
    { agentType: "architect", limit: 200 },
    { enabled: !!storeId },
  );
  const memory = (memoryQuery.data as any[]) ?? [];

  const memoryForStore = useMemo(
    () => memory.filter((m) => !m.relatedStoreId || m.relatedStoreId === storeId),
    [memory, storeId],
  );

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const m of memoryForStore) if (m.memoryType) set.add(m.memoryType);
    return Array.from(set).sort();
  }, [memoryForStore]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memoryForStore.filter((m) => {
      if (selectedType && m.memoryType !== selectedType) return false;
      if (!q) return true;
      const hay = [m.key, m.value, ...(m.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [memoryForStore, selectedType, query]);

  return (
    <WorkspaceShell activeTab="memory">
      <div
        className="px-3 sm:px-4 md:px-6 py-4 sm:py-5 space-y-4"
        style={
          {
            "--brand": brand.color,
            "--brand-accent": brand.accent,
          } as React.CSSProperties
        }
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-heading font-bold text-white">
              <Brain className="w-4 h-4 text-fuchsia-300" /> Bot memory · {store?.name ?? "this store"}
            </h2>
            <p className="text-[12px] text-white/55 mt-0.5">
              Every preference, fact, and pattern the Store Bot has learned about this workspace.
            </p>
          </div>
          <div className="text-[10px] font-mono text-white/45">
            {filtered.length} of {memoryForStore.length} entries
          </div>
        </div>

        <QueryErrorBanner queries={[memoryQuery]} label="Memory unavailable" />

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" aria-hidden="true" />
            <span className="sr-only">Search memory</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memory by keyword, fact, or tag…"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[13px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/15"
            />
          </label>
          {types.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <Filter className="w-3.5 h-3.5 text-white/35 shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setSelectedType(null)}
                className={`px-2.5 h-7 rounded-md text-[11px] font-mono uppercase tracking-widest border transition-colors ${
                  selectedType === null
                    ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                    : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:bg-white/[0.05]"
                }`}
              >
                All
              </button>
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedType(t)}
                  className={`px-2.5 h-7 rounded-md text-[11px] font-mono uppercase tracking-widest border transition-colors whitespace-nowrap ${
                    selectedType === t
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                      : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:bg-white/[0.05]"
                  }`}
                >
                  {TYPE_LABEL[t] ?? t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Memory list */}
        {memoryQuery.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[0.05] bg-white/[0.02] h-24 animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center mb-3">
              <Sparkles className="w-4 h-4 text-fuchsia-300" />
            </div>
            <h3 className="text-[14px] font-semibold text-white/85">
              {memoryForStore.length === 0 ? "No memory yet" : "No matches"}
            </h3>
            <p className="text-[12px] text-white/55 mt-1 max-w-md mx-auto leading-relaxed">
              {memoryForStore.length === 0
                ? "The Store Bot will record what worked, your preferences, and patterns it spots — then surface them here so you can audit, prune, or build on them."
                : "Try a different search term or clear the filter."}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((m: any) => (
              <li
                key={m.id}
                className="workspace-card text-left"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="workspace-card-eyebrow">
                    <Brain className="w-3 h-3" /> {TYPE_LABEL[m.memoryType] ?? m.memoryType ?? "Memory"}
                  </span>
                  <span className="text-[10px] font-mono text-white/35">
                    <Clock className="w-2.5 h-2.5 inline-block mr-0.5" />
                    {formatRelative(m.createdAt)}
                  </span>
                </div>
                {m.key && (
                  <p className="text-[13px] font-semibold text-white/90 leading-tight mb-1">
                    {m.key}
                  </p>
                )}
                {m.value && (
                  <p className="text-[12px] text-white/65 leading-relaxed whitespace-pre-wrap">
                    {String(m.value).slice(0, 280)}
                    {String(m.value).length > 280 && "…"}
                  </p>
                )}
                <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap text-[10px] font-mono">
                  {typeof m.confidence === "number" && (
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <CheckCircle2 className="w-2.5 h-2.5" /> {m.confidence}% confidence
                    </span>
                  )}
                  {m.tags && m.tags.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-white/45">
                      <Tag className="w-2.5 h-2.5" /> {m.tags.slice(0, 3).join(" · ")}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WorkspaceShell>
  );
}
