/**
 * WorkspaceActivity — per-store activity stream.
 *
 * The eighth and final workspace surface — completes the "everything in
 * this store" promise. Folds the most-relevant cross-cutting events for
 * the active store into a single timeline so the operator doesn't have
 * to hop between Inbox / Workflows / Approvals to see what's happening.
 *
 * Stream shape:
 *   - Approvals waiting on this store's storeId
 *   - Recent workflow lifecycle events (run start, finish, fail) for this store
 *   - Future: order events (low stock, large refund), connector failures
 *
 * The shell auto-scopes via WorkspaceContext.activeStoreId so existing
 * approval / workflow queries return only this store's rows.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { WorkspaceShell, useWorkspaceStore } from "@/components/workspace/WorkspaceShell";
import { QueryErrorBanner } from "@/components/QueryErrorBanner";
import {
  Activity as ActivityIcon,
  CheckCircle2,
  Clock,
  GitBranch,
  Loader2,
  ShieldCheck,
  XCircle,
  ArrowRight,
} from "lucide-react";

type EventKind = "approval" | "workflow_started" | "workflow_completed" | "workflow_failed" | "workflow_pending";

interface UnifiedEvent {
  id: string;
  kind: EventKind;
  title: string;
  detail?: string;
  ts: Date;
  href?: string;
}

const KIND_ICON: Record<EventKind, { Icon: any; tone: string; dot: string }> = {
  approval:           { Icon: ShieldCheck, tone: "text-amber-300",   dot: "bg-amber-400 animate-pulse" },
  workflow_started:   { Icon: Loader2,    tone: "text-sky-300",     dot: "bg-sky-400 animate-pulse"   },
  workflow_pending:   { Icon: Clock,      tone: "text-amber-300",   dot: "bg-amber-400 animate-pulse" },
  workflow_completed: { Icon: CheckCircle2, tone: "text-emerald-300", dot: "bg-emerald-400"             },
  workflow_failed:    { Icon: XCircle,    tone: "text-red-300",     dot: "bg-red-400 animate-pulse"   },
};

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function WorkspaceActivity() {
  const { storeId, store, brand } = useWorkspaceStore();

  const workflowsQuery = trpc.workflows.list.useQuery(
    { storeId: storeId!, limit: 30 },
    { enabled: !!storeId, refetchInterval: 15_000 },
  );
  const approvalsQuery = trpc.approvals.pending.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const events: UnifiedEvent[] = useMemo(() => {
    const out: UnifiedEvent[] = [];
    const wfRows = (workflowsQuery.data as any[]) ?? [];
    for (const w of wfRows) {
      const ts = new Date(w.updatedAt ?? w.createdAt);
      let kind: EventKind = "workflow_pending";
      if (w.status === "completed") kind = "workflow_completed";
      else if (w.status === "failed") kind = "workflow_failed";
      else if (w.status === "running" || w.status === "pending") kind = "workflow_started";
      else if (w.status === "awaiting_approval") kind = "workflow_pending";
      out.push({
        id: `wf-${w.id}`,
        kind,
        title: w.title,
        detail: w.workflowType ? String(w.workflowType).replace(/_/g, " ") : undefined,
        ts,
        href: `/store/${storeId}/workflows`,
      });
    }
    const approvalRows = (approvalsQuery.data as any[]) ?? [];
    for (const a of approvalRows) {
      // The approvals.pending feed isn't store-tagged today, but the
      // surrounding metadata often carries `storeId`. Filter to our
      // store when we can; otherwise include (it's still in this org).
      if (a.storeId && a.storeId !== storeId) continue;
      out.push({
        id: `ap-${a.id}`,
        kind: "approval",
        title: a.title ?? "Awaiting approval",
        detail: a.summary ?? a.action ?? undefined,
        ts: new Date(a.createdAt ?? Date.now()),
        href: `/inbox#approvals`,
      });
    }
    return out.sort((a, b) => b.ts.getTime() - a.ts.getTime());
  }, [workflowsQuery.data, approvalsQuery.data, storeId]);

  return (
    <WorkspaceShell activeTab="activity" extraTabs={["activity"]}>
      <div
        className="px-3 sm:px-4 md:px-6 py-4 sm:py-5 space-y-4"
        style={
          {
            "--brand": brand.color,
            "--brand-accent": brand.accent,
          } as React.CSSProperties
        }
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-heading font-bold text-white">
              <ActivityIcon className="w-4 h-4 text-sky-300" /> Activity · {store?.name ?? "this store"}
            </h2>
            <p className="text-[12px] text-white/55 mt-0.5">
              Approvals, workflow lifecycle events, and signals from connectors — folded into one timeline.
            </p>
          </div>
          <div className="text-[10px] font-mono text-white/45">
            {events.length} event{events.length === 1 ? "" : "s"}
          </div>
        </div>

        <QueryErrorBanner queries={[workflowsQuery, approvalsQuery]} label="Activity feed unavailable" />

        {workflowsQuery.isLoading || approvalsQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl border border-white/[0.05] bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-3">
              <ActivityIcon className="w-4 h-4 text-sky-300" />
            </div>
            <h3 className="text-[14px] font-semibold text-white/85">No activity yet</h3>
            <p className="text-[12px] text-white/55 mt-1 max-w-md mx-auto leading-relaxed">
              Once the Store Bot runs workflows or queues approvals for this store, every event lands here in real time.
            </p>
            <Link
              href={`/store/${storeId}/chat`}
              className="inline-flex items-center gap-1 mt-3 text-[11px] text-sky-300 hover:text-sky-200 transition-colors"
            >
              Open Store Bot <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <ol className="relative pl-6 space-y-2.5">
            {/* Vertical timeline rail keyed off the workspace brand */}
            <span
              className="absolute left-2 top-1 bottom-1 w-px"
              style={{
                background: `linear-gradient(180deg, ${brand.color}55, ${brand.accent}11, transparent)`,
              }}
              aria-hidden="true"
            />
            {events.map((e) => {
              const cfg = KIND_ICON[e.kind];
              const Icon = cfg.Icon;
              const Inner = (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 hover:border-sky-500/25 hover:bg-white/[0.035] transition-all">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.tone} ${e.kind === "workflow_started" ? "animate-spin" : ""}`} />
                    <p className="text-[12.5px] font-medium text-white/90 flex-1 min-w-0 truncate">{e.title}</p>
                    <span className="text-[10px] font-mono text-white/35 shrink-0">{formatRelative(e.ts)}</span>
                  </div>
                  {e.detail && (
                    <p className="text-[11px] text-white/45 leading-relaxed mt-0.5 capitalize">{e.detail}</p>
                  )}
                </div>
              );
              return (
                <li key={e.id} className="relative">
                  <span
                    className={`absolute left-[-18px] top-3.5 w-2 h-2 rounded-full ring-2 ring-[#050507] ${cfg.dot}`}
                    aria-hidden="true"
                  />
                  {e.href ? (
                    <Link href={e.href} className="block">
                      {Inner}
                    </Link>
                  ) : (
                    Inner
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </WorkspaceShell>
  );
}
