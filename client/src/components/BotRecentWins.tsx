/**
 * BotRecentWins.tsx — small but signature card.
 *
 * Surfaces the bot's last 3 completed workflows on its own page so
 * the user has continuity across sessions: every time they open
 * /architect, they see "here's what Builder finished for you last
 * time, want to run it again?" — one-click rerun, no
 * navigation-to-Workflows tax.
 *
 * Reads workflows.list (status: completed, agentType filter), polls
 * every 30s. Auto-hides on empty so a fresh org doesn't show a
 * hollow card.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Trophy, RefreshCw, Loader2, ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

type AgentType = "architect" | "merchant" | "social";

const AGENT_META: Record<AgentType, { rgb: string; color: string }> = {
  architect: { rgb: "14, 165, 233", color: "#38bdf8" },
  merchant: { rgb: "6, 182, 212", color: "#22d3ee" },
  social: { rgb: "249, 115, 22", color: "#fb923c" },
};

export function BotRecentWins({ agentType }: { agentType: AgentType }) {
  const [rerunningId, setRerunningId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.workflows.list.useQuery(
    { agentType, status: "completed", limit: 3, offset: 0 },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );

  const rerunMutation = trpc.workflows.rerun.useMutation({
    onMutate: ({ workflowId }) => setRerunningId(workflowId),
    onSettled: () => setRerunningId(null),
    onSuccess: () => {
      toast.success("Rerunning — watch it go above.");
      utils.workflows.active.invalidate();
      utils.workflows.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !data || data.length === 0) {
    // Fresh org / quiet bot — don't show an empty card.
    return null;
  }

  const meta = AGENT_META[agentType];

  return (
    <div className="bot-recent-wins" style={{ ["--wins-color" as any]: meta.rgb }}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="inline-flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5" style={{ color: meta.color }} />
          <span className="text-[10px] uppercase tracking-widest font-bold text-white/55">
            Recent wins
          </span>
        </div>
        <Link
          href="/workflows#history"
          className="text-[10px] text-white/45 hover:text-white inline-flex items-center gap-1"
        >
          History <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
      <ul className="space-y-1.5">
        {data.map((w: any) => (
          <li key={w.id} className="bot-recent-wins-row group">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-white/85 truncate font-medium">{w.title}</div>
              <div className="text-[10px] text-white/40 tabular-nums">
                {relativeTime(w.completedAt ?? w.updatedAt ?? w.createdAt)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => rerunMutation.mutate({ workflowId: w.id })}
              disabled={rerunningId === w.id || rerunMutation.isPending}
              className="bot-recent-wins-rerun"
              aria-label={`Rerun ${w.title}`}
              title="Rerun with the same inputs"
            >
              {rerunningId === w.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">{rerunningId === w.id ? "Launching" : "Rerun"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function relativeTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const ts = new Date(input).getTime();
  if (!Number.isFinite(ts)) return "—";
  const minutes = Math.floor((Date.now() - ts) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
