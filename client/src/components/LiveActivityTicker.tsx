/**
 * LiveActivityTicker.tsx — always-on bot newsfeed.
 *
 * Sits in the Home dashboard chrome and continuously rotates through
 * the most-recent agent tasks (completed, running, failed) so the
 * page never feels static. Reads dashboard.recentActivity, polls
 * every 12s, animates each item up-into-view as it rotates.
 *
 * The ticker is intentionally compact (single 24px row) — it
 * complements the Daily Brief without competing for attention.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Bot, Package, Megaphone, Activity, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

type AgentType = "architect" | "merchant" | "social";
const AGENT_META: Record<AgentType, { icon: typeof Bot; color: string }> = {
  architect: { icon: Bot, color: "#38bdf8" },
  merchant: { icon: Package, color: "#22d3ee" },
  social: { icon: Megaphone, color: "#fb923c" },
};

interface ActivityRow {
  id: number;
  agentType: string;
  taskType: string;
  title: string;
  status: string;
  createdAt: string | Date;
}

export function LiveActivityTicker() {
  const { data } = trpc.dashboard.recentActivity.useQuery(
    { limit: 12 },
    { refetchInterval: 12_000, refetchIntervalInBackground: false },
  );
  const items: ActivityRow[] = (data as ActivityRow[] | undefined) ?? [];

  // Rotate through items with a 4.5s cadence. Pause on hover so a
  // long task name can be read without a fight against the clock.
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % Math.max(items.length, 1));
    }, 4500);
    return () => clearInterval(t);
  }, [paused, items.length]);

  // Reset to 0 when the underlying dataset changes so we don't drift
  // off the end of a shorter list.
  useEffect(() => {
    if (idx >= items.length) setIdx(0);
  }, [items.length, idx]);

  const current = items[idx];

  if (!current) {
    return (
      <div className="live-activity-ticker live-activity-ticker--empty">
        <Activity className="w-3 h-3 text-white/40" />
        <span className="text-[11px] text-white/45">Bots are quiet — fire a workflow to start the feed.</span>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="live-activity-ticker"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-live="polite"
    >
      <span className="live-activity-ticker-rail-dot" aria-hidden="true" />
      <span className="live-activity-ticker-eyebrow">Live</span>
      <span key={current.id} className="live-activity-ticker-item">
        <ActivityRowCompact row={current} />
      </span>
      <span className="live-activity-ticker-counter">
        <span className="tabular-nums">{idx + 1}</span>
        <span className="text-white/25">/</span>
        <span className="tabular-nums">{items.length}</span>
      </span>
    </div>
  );
}

function ActivityRowCompact({ row }: { row: ActivityRow }) {
  const meta = AGENT_META[row.agentType as AgentType] || AGENT_META.architect;
  const Icon = meta.icon;
  const StatusIcon = useMemo(() => {
    if (row.status === "completed") return CheckCircle2;
    if (row.status === "failed") return AlertTriangle;
    return Loader2;
  }, [row.status]);
  const statusColor =
    row.status === "completed" ? "text-emerald-400" :
    row.status === "failed" ? "text-red-400" :
    "text-amber-400";

  // "X minutes ago" — short form so the ticker stays under the
  // single-row height budget. Falls back to absolute time for older
  // rows.
  const timeLabel = useMemo(() => {
    const created = new Date(row.createdAt).getTime();
    const ageMs = Date.now() - created;
    const minutes = Math.floor(ageMs / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }, [row.createdAt]);

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Icon className="w-3 h-3 shrink-0" style={{ color: meta.color }} strokeWidth={2.4} />
      <StatusIcon className={`w-3 h-3 shrink-0 ${statusColor} ${row.status === "running" ? "animate-spin" : ""}`} strokeWidth={2.4} />
      <span className="text-[11px] text-white/85 truncate">{row.title}</span>
      <span className="text-[10px] text-white/35 shrink-0 hidden sm:inline">{timeLabel}</span>
    </span>
  );
}
