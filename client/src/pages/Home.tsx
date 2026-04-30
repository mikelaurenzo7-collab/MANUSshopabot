/**
 * Home.tsx — Command Center
 *
 * The operator's live dashboard. No decorative node maps — just the
 * information you need to run your business right now:
 *   • KPI strip (revenue, approvals, active workflows, bot health)
 *   • Daily brief + recommendation ticker
 *   • Activation coach (auto-dismisses once fully activated)
 *   • Recommended next workflows (persona/data-aware)
 *   • 3-column ops grid:
 *       - Unified Store Bot status card
 *       - Active workflow feed (live, auto-refreshes)
 *       - Store health panel (connected stores + quick actions)
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { CountUp } from "@/components/CountUp";
import { useAuth } from "@/_core/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  Bot, Package, Megaphone, Store,
  Sparkles, Plus, MessageSquare, AlertTriangle,
  Loader2, GitBranch, TrendingUp, ShieldCheck,
  Zap, CheckCircle2, XCircle,
  Clock, Activity, ChevronRight, RefreshCw,
} from "lucide-react";
import { HandoffMoment, LifecycleBadge } from "@/components/handoff/HandoffMoment";
import { ActivationCoach } from "@/components/ActivationCoach";
import { DailyBrief } from "@/components/DailyBrief";
import { LiveActivityTicker } from "@/components/LiveActivityTicker";
import { FirstRunTour } from "@/components/FirstRunTour";
import { RecommendedWorkflows } from "@/components/RecommendedWorkflows";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────────

type AgentType = "architect" | "merchant" | "social";

const BOT_META: Record<AgentType, {
  label: string;
  icon: React.ReactNode; description: string;
  accent: string; border: string; glow: string; dot: string;
}> = {
  architect: {
    label: "Build lane",
    icon: <Bot className="w-5 h-5" strokeWidth={2.2} />,
    description: "Niche research · brand generation · store scaffolding",
    accent: "text-sky-300", border: "border-sky-500/20", glow: "shadow-[0_0_32px_rgba(14,165,233,0.15)]",
    dot: "bg-sky-400",
  },
  merchant: {
    label: "Operate lane",
    icon: <Package className="w-5 h-5" strokeWidth={2.2} />,
    description: "Inventory sync · auto-fulfillment · pricing matrices",
    accent: "text-cyan-300", border: "border-cyan-500/20", glow: "shadow-[0_0_32px_rgba(34,211,238,0.12)]",
    dot: "bg-cyan-400",
  },
  social: {
    label: "Social lane",
    icon: <Megaphone className="w-5 h-5" strokeWidth={2.2} />,
    description: "Ads · posts · campaigns · email recovery",
    accent: "text-fuchsia-300", border: "border-fuchsia-500/20", glow: "shadow-[0_0_32px_rgba(217,70,239,0.12)]",
    dot: "bg-fuchsia-400",
  },
};

const STATUS_CONFIG = {
  running: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />, label: "Running", color: "text-amber-400", dot: "bg-amber-400 animate-pulse" },
  ok:      { icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,       label: "Healthy",  color: "text-emerald-400", dot: "bg-emerald-400" },
  error:   { icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,                label: "Error",    color: "text-red-400",     dot: "bg-red-400 animate-pulse" },
  idle:    { icon: <Clock className="w-3.5 h-3.5 text-white/30" />,                 label: "Idle",     color: "text-white/40",    dot: "bg-white/20" },
};

const WF_STATUS: Record<string, { color: string; dot: string }> = {
  running:           { color: "text-sky-400",     dot: "bg-sky-400 animate-pulse" },
  completed:         { color: "text-emerald-400", dot: "bg-emerald-400" },
  failed:            { color: "text-red-400",     dot: "bg-red-400" },
  pending:           { color: "text-amber-400",   dot: "bg-amber-400 animate-pulse" },
  awaiting_approval: { color: "text-amber-400",   dot: "bg-amber-400 animate-pulse" },
  cancelled:         { color: "text-white/30",    dot: "bg-white/20" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const { activeStoreId } = useWorkspace();
  const [, setLocation] = useLocation();
  const [handoffDismissed, setHandoffDismissed] = useState<Record<number, boolean>>({});

  // ── Live data ──────────────────────────────────────────────────────────────
  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const {
    data: agentStatus,
    error: agentError,
    refetch: refetchAgentStatus,
  } = trpc.dashboard.agentStatus.useQuery(undefined, { refetchInterval: 15_000 });
  const {
    data: metrics,
    error: metricsError,
    refetch: refetchMetrics,
  } = trpc.dashboard.metrics.useQuery(
    activeStoreId ? { storeId: activeStoreId } : {},
    { refetchInterval: 30_000 },
  );
  const { data: pendingApprovals } = trpc.approvals.pending.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: intel } = trpc.dashboard.crossStoreIntelligence.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: activeWorkflows, refetch: refetchWorkflows } = trpc.workflows.active.useQuery(undefined, { refetchInterval: 8_000 });
  const { data: recentWorkflows } = trpc.workflows.list.useQuery({ limit: 5 }, { refetchInterval: 30_000 });

  // ── Builder→Merchant handoff ───────────────────────────────────────────────
  const { data: lifecycle } = trpc.lifecycle.get.useQuery(
    activeStoreId ? { storeId: activeStoreId } : (undefined as any),
    { enabled: Boolean(activeStoreId), refetchInterval: 60_000 },
  );
  const handoffStore = useMemo(() => {
    if (!lifecycle || !activeStoreId) return null;
    if (lifecycle.stage !== "transitioning") return null;
    if (handoffDismissed[lifecycle.storeId]) return null;
    return { id: lifecycle.storeId, name: lifecycle.storeName };
  }, [lifecycle, activeStoreId, handoffDismissed]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const botStatusFor = (t: AgentType): keyof typeof STATUS_CONFIG => {
    const row = ((agentStatus as any[]) ?? []).find((r) => r?.agentType === t);
    if (!row) return "idle";
    if ((row.failed ?? 0) > 0) return "error";
    if ((row.running ?? 0) > 0) return "running";
    return "ok";
  };
  const totalRunning = ((agentStatus as any[]) ?? []).reduce((a: number, s: any) => a + (s?.running ?? 0), 0);
  const pendingCount = pendingApprovals?.length ?? 0;

  const botHealth = (() => {
    const errors = (["architect", "merchant", "social"] as AgentType[]).filter((b) => botStatusFor(b) === "error").length;
    if (errors > 0) return { tone: "warn" as const, text: "Store Bot needs attention" };
    const running = (["architect", "merchant", "social"] as AgentType[]).filter((b) => botStatusFor(b) === "running").length;
    if (running > 0) return { tone: "active" as const, text: `${running} workflow lane${running > 1 ? "s" : ""} running` };
    return { tone: "ok" as const, text: "Store Bot healthy" };
  })();

  const todayRevenue = (((metrics?.totalRevenue ?? 0) as number) / 100).toFixed(2);
  const todayOrders = (metrics?.totalOrders ?? 0) as number;
  const intelData = intel as { totalLowStock?: number; topStore?: { name?: string; revenue?: number } } | undefined;
  const lowStockCount = intelData?.totalLowStock ?? 0;
  const topStoreName = intelData?.topStore?.name;
  const topStoreRevenue = intelData?.topStore?.revenue ?? 0;
  const recommendation = lowStockCount > 0
    ? `${lowStockCount} SKU${lowStockCount > 1 ? "s" : ""} low on inventory — review`
    : topStoreName
      ? `${topStoreName} is your top store — $${(topStoreRevenue / 100).toFixed(0)}`
      : "Connect a store to see live insights";

  const allWorkflows = [
    ...((activeWorkflows as any[]) ?? []),
    ...((recentWorkflows as any[]) ?? []).filter((w: any) => w.status !== "running"),
  ].slice(0, 8);

  return (
    <div className="page-enter flex flex-col w-full bg-terminal-bg/70 relative">
      {/* Builder→Merchant handoff celebration */}
      {handoffStore && (
        <HandoffMoment
          storeId={handoffStore.id}
          storeName={handoffStore.name}
          onComplete={() => setHandoffDismissed((s) => ({ ...s, [handoffStore.id]: true }))}
          onDefer={() => setHandoffDismissed((s) => ({ ...s, [handoffStore.id]: true }))}
        />
      )}
      <div className="stagger-list hidden" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-25" />

      {/* ── Error Banner ── */}
      {(metricsError || agentError) && (
        <div className="shrink-0 mx-4 md:mx-6 mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.05] px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-red-400">Dashboard Error</p>
            <p className="text-[11px] text-white/60 truncate">
              {(metricsError || agentError)?.message ?? "Failed to load live metrics"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void refetchMetrics(); void refetchAgentStatus(); }}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/60 hover:border-sky-500/30 hover:text-sky-300 transition-all"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* ── KPI Strip ── */}
      <div className="shrink-0 relative border-b border-white/[0.06] bg-gradient-to-r from-surface-deep/85 via-surface-base/75 to-surface-deep/85 backdrop-blur-xl px-4 md:px-5 py-3 flex flex-wrap items-center gap-2.5 md:gap-3 z-20">
        <div className="absolute inset-x-0 top-0 hairline opacity-40" />
        <Kpi icon={<TrendingUp className="w-3 h-3 text-emerald-400" />} label="Today's revenue" value={`$${todayRevenue}`} sub={`${todayOrders} order${todayOrders === 1 ? "" : "s"}`} />
        <Kpi icon={<ShieldCheck className="w-3 h-3 text-amber-400" />} label="Pending approvals" value={String(pendingCount)} sub={pendingCount > 0 ? "needs review" : "all clear"} href="/inbox#approvals" />
        <Kpi icon={<GitBranch className="w-3 h-3 text-sky-400" />} label="Active workflows" value={String(totalRunning)} sub={totalRunning > 0 ? "running" : "idle"} href="/workflows" />
        <Kpi
          icon={<Bot className={`w-3 h-3 ${botHealth.tone === "warn" ? "text-red-400" : botHealth.tone === "active" ? "text-amber-400" : "text-emerald-400"}`} />}
          label="Store Bot" value={botHealth.tone === "warn" ? "Attention" : botHealth.tone === "active" ? "Active" : "Healthy"} sub={botHealth.text}
        />
        <div className="ml-auto flex items-center gap-2 max-w-[440px] rounded-full border border-sky-500/30 bg-gradient-to-r from-sky-500/[0.12] to-cyan-500/[0.07] px-2.5 py-1 shadow-[0_0_28px_rgba(14,165,233,0.10),inset_0_1px_0_rgba(14,165,233,0.10)]">
          {lifecycle && <LifecycleBadge stage={lifecycle.stage} className="shrink-0" />}
          <Sparkles className="w-3 h-3 text-sky-300 shrink-0" />
          <span className="text-[11px] font-medium text-white/90 truncate" title={recommendation}>{recommendation}</span>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-4 md:px-5 py-3 space-y-5">

          {/* Daily brief */}
          <DailyBrief />

          {/* Live activity ticker */}
          <LiveActivityTicker />

          {/* Activation coach */}
          <ActivationCoach />

          {/* Recommended workflows */}
          <RecommendedWorkflows />

          {/* ── Ops Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pb-6">

            {/* ── Col 1: Unified Store Bot ── */}
            <div className="space-y-3">
              <SectionHeader icon={<Zap className="w-3.5 h-3.5 text-sky-400" />} title="Store Bot" href="/chat" linkLabel="Open workspace" />
              <div
                className="group relative rounded-xl border border-sky-500/22 bg-gradient-to-br from-sky-500/[0.04] to-white/[0.015] p-4 transition-all duration-300 hover:border-sky-500/35 hover:bg-sky-500/[0.06] hover:shadow-[0_8px_32px_rgba(14,165,233,0.12)] hover:-translate-y-1 shadow-[0_0_28px_rgba(14,165,233,0.08),inset_0_1px_0_rgba(14,165,233,0.06)] cursor-pointer"
                onClick={() => setLocation("/chat")}
              >
                <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${botHealth.tone === "warn" ? "bg-red-400 animate-pulse" : botHealth.tone === "active" ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg border border-sky-500/25 bg-sky-500/[0.10] flex items-center justify-center shrink-0 text-sky-300 transition-all duration-300 group-hover:bg-sky-500/[0.18] group-hover:shadow-[0_0_16px_rgba(14,165,233,0.3)]">
                    <Bot className="w-5 h-5" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-sky-300">One Store Bot</p>
                    <p className="text-[10px] text-muted-enhanced mt-0.5 leading-relaxed">
                      Built for new store owners: launch from zero, then operate connected stores, run social growth, and remember each workspace.
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`flex items-center gap-1 text-[10px] font-mono ${botHealth.tone === "warn" ? "text-red-400" : botHealth.tone === "active" ? "text-amber-400" : "text-emerald-400"}`}>
                        {botHealth.tone === "warn" ? <XCircle className="w-3.5 h-3.5" /> : botHealth.tone === "active" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {botHealth.text}
                      </span>
                      {totalRunning > 0 && (
                        <span className="text-[10px] font-mono text-white/35">{totalRunning} running</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setLocation("/chat"); }}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/[0.08] py-1.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/[0.14] transition-all"
                  >
                    <MessageSquare className="w-3 h-3" /> Chat + workspace
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setLocation("/storefronts#integrations"); }}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] py-1.5 text-[10px] font-semibold text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-all"
                  >
                    <Store className="w-3 h-3" /> Add store
                  </button>
                </div>
              </div>
            </div>

            {/* ── Col 2: Workflow Feed ── */}
            <div className="space-y-3">
              <SectionHeader icon={<Activity className="w-3.5 h-3.5 text-violet-400" />} title="Workflow Feed" href="/workflows" linkLabel="All workflows" />
              {allWorkflows.length === 0 ? (
                <EmptyCard
                  icon={<GitBranch className="w-5 h-5 text-white/20" />}
                  title="No workflows yet"
                  description="Launch a workflow from any bot page to see it here."
                  action={{ label: "Launch workflow", href: "/chat" }}
                />
              ) : (
                <div className="space-y-2">
                  {allWorkflows.map((wf: any) => {
                    const ws = WF_STATUS[wf.status] ?? WF_STATUS.cancelled;
                    const agentMeta = BOT_META[wf.agentType as AgentType];
                    const timeAgo = (() => {
                      const diff = Date.now() - new Date(wf.createdAt).getTime();
                      const m = Math.floor(diff / 60000);
                      if (m < 1) return "just now";
                      if (m < 60) return `${m}m ago`;
                      const h = Math.floor(m / 60);
                      if (h < 24) return `${h}h ago`;
                      return `${Math.floor(h / 24)}d ago`;
                    })();
                    return (
                      <div
                        key={wf.id}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all cursor-pointer"
                        onClick={() => setLocation("/workflows")}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${ws.dot}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-white/90 truncate">{wf.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {agentMeta && (
                                <span className={`text-[10px] font-mono uppercase ${agentMeta.accent}`}>{agentMeta.label}</span>
                              )}
                              <span className={`text-[10px] font-mono ${ws.color}`}>{wf.status.replace(/_/g, " ")}</span>
                              <span className="text-[10px] text-white/35 ml-auto">{timeAgo}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => void refetchWorkflows()}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-transparent py-2 text-[10px] font-mono text-white/30 hover:text-white/60 hover:border-white/[0.12] transition-all"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>
              )}
            </div>

            {/* ── Col 3: Store Health ── */}
            <div className="space-y-3">
              <SectionHeader icon={<Store className="w-3.5 h-3.5 text-emerald-400" />} title="Store Health" href="/storefronts" linkLabel="Manage stores" />
              {storesLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-white/20" />
                </div>
              ) : !stores || stores.length === 0 ? (
                <EmptyCard
                  icon={<Store className="w-5 h-5 text-white/20" />}
                  title="No stores connected"
                  description="Connect a Shopify store or start your first launch workflow to get started."
                  action={{ label: "Connect a store", href: "/storefronts#integrations?returnTo=/" }}
                />
              ) : (
                <div className="space-y-2">
                  {(stores as any[]).map((store: any) => {
                    const isActive = store.status === "active";
                    const storeMetrics = (intelData as any)?.storeMetrics?.find?.((m: any) => m.storeId === store.id);
                    return (
                      <div
                        key={store.id}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all cursor-pointer"
                        onClick={() => setLocation("/storefronts")}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] flex items-center justify-center shrink-0">
                            <Store className="w-4 h-4 text-emerald-400" strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-semibold text-white/90 truncate">{store.name}</p>
                            <p className="text-[10px] font-mono text-white/40 truncate capitalize">{store.platform} · {store.status}</p>
                          </div>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? "bg-emerald-400" : "bg-white/20"}`} />
                        </div>
                        {storeMetrics && (
                          <div className="mt-2.5 pt-2.5 border-t border-white/[0.05] flex items-center gap-4">
                            <div>
                              <p className="text-[10px] text-white/40 font-mono uppercase">Revenue</p>
                              <p className="text-[11px] font-mono text-emerald-400">${((storeMetrics.revenue ?? 0) / 100).toFixed(0)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-white/40 font-mono uppercase">Orders</p>
                              <p className="text-[11px] font-mono text-white/70">{storeMetrics.orders ?? 0}</p>
                            </div>
                            {(storeMetrics.lowStock ?? 0) > 0 && (
                              <div className="ml-auto">
                                <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400">
                                  <AlertTriangle className="w-3 h-3" /> {storeMetrics.lowStock} low stock
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setLocation("/insights"); }}
                            className="flex-1 flex items-center justify-center gap-1 rounded-md border border-white/[0.07] bg-transparent py-1 text-[10px] font-mono text-white/45 hover:text-white/70 hover:border-white/[0.15] transition-all"
                          >
                            <TrendingUp className="w-3 h-3" /> Analytics
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setLocation("/chat"); }}
                            className="flex-1 flex items-center justify-center gap-1 rounded-md border border-white/[0.07] bg-transparent py-1 text-[10px] font-mono text-white/45 hover:text-white/70 hover:border-white/[0.15] transition-all"
                          >
                            <Package className="w-3 h-3" /> Manage
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setLocation("/storefronts#integrations")}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.1] bg-transparent py-2.5 text-[11px] text-white/40 hover:text-white/60 hover:border-white/[0.2] transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Connect another store
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <FirstRunTour />
    </div>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, href, linkLabel }: { icon: React.ReactNode; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/55">{title}</span>
      </div>
      {href && linkLabel && (
        <Link href={href} className="flex items-center gap-0.5 text-[10px] text-white/35 hover:text-sky-400 transition-colors duration-200">
          {linkLabel} <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Empty Card ────────────────────────────────────────────────────────────────

function EmptyCard({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description: string;
  action?: { label: string; href: string };
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="empty-state p-6">
      <div className="empty-state-icon mb-0">
        {icon}
      </div>
      <div className="mt-3">
        <p className="text-[12px] font-semibold text-white/75">{title}</p>
        <p className="text-[11px] text-white/40 mt-1 leading-relaxed">{description}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={() => setLocation(action.href)}
          className="mt-1 flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/50 transition-all duration-200"
        >
          <Plus className="w-3 h-3" /> {action.label}
        </button>
      )}
    </div>
  );
}

// ─── KPI helper ───────────────────────────────────────────────────────────────

function Kpi({ icon, label, value, sub, href }: { icon: React.ReactNode; label: string; value: string; sub?: string; href?: string }) {
  const numericMatch = value.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  const animatedValue = numericMatch ? (
    <>
      {numericMatch[1]}
      <CountUp value={parseFloat(numericMatch[2].replace(/,/g, ""))} decimals={numericMatch[2].includes(".") ? 2 : 0} />
      {numericMatch[3]}
    </>
  ) : value;

  const body = (
    <div className="kpi-lux">
      <div className="kpi-icon">{icon}</div>
      <div className="min-w-0">
        <p className="kpi-label">{label}</p>
        <p className="kpi-value mt-0.5">{animatedValue}</p>
        {sub && <p className="kpi-sub truncate">{sub}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
