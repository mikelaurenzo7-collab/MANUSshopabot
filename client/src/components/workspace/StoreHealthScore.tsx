/**
 * StoreHealthScore — 0–100 pulse metric for a single store workspace.
 *
 * Five components contribute to the score (Catalog · Bot · Inventory ·
 * Channels · Orders). The grade (S / A / B / C / D / F) and a short
 * list of improvement tips sit alongside mini progress bars so the
 * operator immediately knows both where they stand and what to fix.
 *
 * Data comes from `stores.healthScore` — the endpoint runs four
 * parallel DB queries (products, orders, workflows, social accounts)
 * and returns a pre-computed payload, so this component does zero
 * heavy lifting on the client.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { CountUp } from "@/components/CountUp";
import { Sparkles, AlertTriangle, ArrowRight, TrendingUp } from "lucide-react";

interface Props {
  storeId: number;
}

const GRADE_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; glow: string }
> = {
  S: { label: "Elite",   bg: "bg-violet-500/20", text: "text-violet-200", border: "border-violet-500/40", glow: "shadow-[0_0_20px_rgba(139,92,246,0.3)]" },
  A: { label: "Strong",  bg: "bg-emerald-500/15", text: "text-emerald-200", border: "border-emerald-500/35", glow: "shadow-[0_0_20px_rgba(16,185,129,0.25)]" },
  B: { label: "Good",    bg: "bg-sky-500/15",     text: "text-sky-200",     border: "border-sky-500/35",     glow: "shadow-[0_0_16px_rgba(14,165,233,0.2)]" },
  C: { label: "Fair",    bg: "bg-amber-500/15",   text: "text-amber-200",   border: "border-amber-500/35",   glow: "" },
  D: { label: "Weak",    bg: "bg-orange-500/15",  text: "text-orange-200",  border: "border-orange-500/35",  glow: "" },
  F: { label: "Critical",bg: "bg-red-500/15",     text: "text-red-200",     border: "border-red-500/35",     glow: "" },
};

const COMPONENT_ACCENT: Record<string, string> = {
  catalog:   "bg-sky-400",
  bot:       "bg-violet-400",
  inventory: "bg-emerald-400",
  channels:  "bg-fuchsia-400",
  orders:    "bg-amber-400",
};

const COMPONENT_LINK: Record<string, string> = {
  catalog:   "builder",
  bot:       "workflows",
  inventory: "overview",
  channels:  "connectors",
  orders:    "overview",
};

export function StoreHealthScore({ storeId }: Props) {
  const { data, isLoading, error } = trpc.stores.healthScore.useQuery(
    { storeId },
    { staleTime: 60_000, refetchInterval: 120_000 },
  );

  const gradeConfig = useMemo(
    () => GRADE_CONFIG[data?.grade ?? "F"],
    [data?.grade],
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-white/[0.06]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-white/[0.06]" />
            <div className="h-4 w-16 rounded bg-white/[0.08]" />
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {[30, 60, 45, 75, 50].map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-20 h-2 rounded bg-white/[0.04]" />
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.04]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) return null;

  return (
    <div
      className={`rounded-xl border ${gradeConfig.border} bg-white/[0.025] ${gradeConfig.glow} overflow-hidden`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        {/* Score dial */}
        <div
          className={`flex-shrink-0 w-[64px] h-[64px] rounded-2xl ${gradeConfig.bg} border ${gradeConfig.border} flex flex-col items-center justify-center`}
        >
          <span className={`text-[26px] font-black leading-none tabular-nums ${gradeConfig.text}`}>
            <CountUp value={data.score} duration={900} />
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/35 mt-0.5">
            / 100
          </span>
        </div>

        {/* Grade + title */}
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-[0.15em] ${gradeConfig.text}`}
            >
              Store Health
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black ${gradeConfig.bg} ${gradeConfig.text} border ${gradeConfig.border}`}
            >
              {data.grade} · {gradeConfig.label}
            </span>
          </div>

          {/* Component bars */}
          <div className="mt-2.5 space-y-1.5">
            {data.components.map((c) => {
              const pct = Math.round((c.score / c.max) * 100);
              return (
                <Link
                  key={c.key}
                  href={`/store/${storeId}/${COMPONENT_LINK[c.key] ?? "overview"}`}
                  className="flex items-center gap-2 group"
                  aria-label={`${c.label}: ${c.score} / ${c.max}`}
                >
                  <span className="w-[90px] text-[10px] text-white/45 group-hover:text-white/70 transition-colors truncate">
                    {c.label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${COMPONENT_ACCENT[c.key] ?? "bg-white/50"} transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[10px] tabular-nums text-white/35">
                    {c.score}/{c.max}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tips strip — only rendered when tips exist */}
      {data.tips.length > 0 && (
        <div className="border-t border-white/[0.05] px-4 py-2.5 space-y-1">
          {data.tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-400/80 flex-shrink-0 mt-0.5" />
              <span className="text-[11px] text-white/55 leading-snug">{tip}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer — improve CTA */}
      {data.score >= 90 ? (
        <div className="border-t border-white/[0.05] px-4 py-2 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-violet-300" />
          <span className="text-[11px] text-violet-300/80">
            Elite status — keep automating to stay ahead
          </span>
        </div>
      ) : (
        <Link
          href={`/store/${storeId}/${COMPONENT_LINK[
            data.components.reduce((a, b) =>
              b.score / b.max < a.score / a.max ? b : a,
            ).key
          ] ?? "overview"}`}
          className="flex items-center justify-between border-t border-white/[0.05] px-4 py-2 hover:bg-white/[0.03] transition-colors group"
        >
          <span className="flex items-center gap-1.5 text-[11px] text-white/40 group-hover:text-white/65 transition-colors">
            <TrendingUp className="w-3 h-3" />
            Improve your score
          </span>
          <ArrowRight className="w-3 h-3 text-white/25 group-hover:text-white/55 transition-colors" />
        </Link>
      )}
    </div>
  );
}
