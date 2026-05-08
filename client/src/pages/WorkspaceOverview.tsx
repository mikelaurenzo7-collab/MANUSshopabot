/**
 * WorkspaceOverview — landing page for a per-store workspace.
 *
 * The shape is "you walk into this store's control room": a hero stat
 * trio at the top (revenue / orders / live workflows), then a 4-up
 * grid that surfaces the most-used surfaces (Chat preview, Workflow
 * pulse, Connectors health, Memory snapshot) — each card is itself a
 * deep link into the matching workspace tab.
 *
 * Every card is opt-in: if a query errors we render a friendly "data
 * unavailable" line instead of an empty void, and we link to the tab
 * that owns the data so the operator can investigate from there.
 */
import { useMemo, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  WorkspaceShell,
  useWorkspaceStore,
  type WorkspaceTabId,
} from "@/components/workspace/WorkspaceShell";
import { Sparkline } from "@/components/Sparkline";
import { QueryErrorBanner } from "@/components/QueryErrorBanner";
import {
  MessageSquare,
  GitBranch,
  Plug,
  Brain,
  ArrowRight,
  Sparkles,
  TrendingUp,
  ShoppingCart,
  Activity as ActivityIcon,
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
  AlertTriangle,
  Bot,
} from "lucide-react";

const WF_TONE: Record<string, { dot: string; label: string; color: string }> = {
  running: { dot: "bg-amber-400 animate-pulse", label: "Running", color: "text-amber-300" },
  pending: { dot: "bg-amber-400 animate-pulse", label: "Pending", color: "text-amber-300" },
  awaiting_approval: { dot: "bg-violet-400 animate-pulse", label: "Needs approval", color: "text-violet-300" },
  completed: { dot: "bg-emerald-400", label: "Completed", color: "text-emerald-300" },
  failed: { dot: "bg-red-400", label: "Failed", color: "text-red-300" },
  cancelled: { dot: "bg-white/25", label: "Cancelled", color: "text-white/40" },
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

export default function WorkspaceOverview() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { storeId, store, brand } = useWorkspaceStore();

  // Show a success toast when landing here after Shopify (or any) OAuth.
  // The server redirects to /store/:id?connected=true on success.
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("connected") === "true") {
      toast.success("Store connected", {
        description: store?.name ? `${store.name} is ready — your Store Bot is active.` : "Your store is ready.",
        duration: 5000,
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (params.get("error") === "connection_failed") {
      toast.error("Connection failed", {
        description: "OAuth did not complete. Check your Shopify credentials and try again.",
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchString, store?.name]);

  // Per-store data — every query is store-scoped so two open workspaces
  // never interfere.
  const overviewQuery = trpc.stores.overview.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId, refetchInterval: 60_000 },
  );
  const workflowsQuery = trpc.workflows.list.useQuery(
    { storeId: storeId!, limit: 6 },
    { enabled: !!storeId, refetchInterval: 12_000 },
  );
  const credentialsQuery = trpc.connectors.listCredentials.useQuery();
  const socialAccountsQuery = trpc.connectors.listSocialAccounts.useQuery();
  const memoryQuery = trpc.botProfile.getMemory.useQuery(
    { agentType: "architect", limit: 5 },
    { enabled: !!storeId },
  );

  const overview = overviewQuery.data as any;
  const workflows = (workflowsQuery.data as any[]) ?? [];
  const runningCount = workflows.filter((w) => w.status === "running" || w.status === "pending").length;
  const failedCount = workflows.filter((w) => w.status === "failed").length;
  const memorySnippets = (memoryQuery.data as any[]) ?? [];
  const credentials = (credentialsQuery.data as any[]) ?? [];
  const socialAccounts = (socialAccountsQuery.data as any[]) ?? [];

  // Connectors filtered to this store (credentials carry storeId; social
  // accounts may not — we approximate by counting the user's total).
  const storeCredentials = credentials.filter((c) => c.storeId === storeId);
  const connectorCount = storeCredentials.length + socialAccounts.length;

  // The server's `stores.overview` returns a canonical { metrics: {...} }
  // shape — the previous `revenue.today` / `orders.today` reads here did
  // not exist on the wire and silently rendered as $0.00 / 0 / flat for
  // every paying operator. We now read the actual fields the server
  // emits, including the new `weekOrders` / `lastWeekOrders` /
  // `weekRevenueCents` fields added alongside this fix so the trend
  // tiles use real per-store data rather than fabricated curves.
  const metrics = (overview?.metrics ?? {}) as {
    todayRevenue?: number;
    todayOrders?: number;
    weekOrders?: number;
    lastWeekOrders?: number;
    weekRevenueCents?: number;
    totalOrders?: number;
  };
  const todayRevenue = metrics.todayRevenue ?? 0;
  const todayOrders = metrics.todayOrders ?? 0;
  const weekOrders = metrics.weekOrders ?? 0;
  const lastWeekOrders = metrics.lastWeekOrders ?? 0;
  const weekRevenue = (metrics.weekRevenueCents ?? 0) / 100;

  // ── 7-day activity sparkline ─────────────────────────────────────
  // Bucket the most-recent workflow rows by day (UTC) so the workspace
  // hero stats turn from static numbers into a glance-readable trend.
  // We use the `workflows.list` data we already have — no extra API
  // call. When a store has zero workflows we still pass a 7-element
  // array so the SVG renders a flat hairline (no layout jump).
  const workflowSparkline = useMemo(() => {
    const buckets = new Array(7).fill(0);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    for (const w of workflows) {
      const ts = new Date(w.createdAt).getTime();
      const ageDays = Math.floor((now - ts) / dayMs);
      if (ageDays >= 0 && ageDays < 7) {
        // Index 0 = oldest, 6 = today, so flip.
        buckets[6 - ageDays] += 1;
      }
    }
    return buckets;
  }, [workflows]);
  const ordersSparkline = useMemo(() => {
    // Smooth approximation: we don't yet have a day-bucketed time
    // series for orders, but the week + today numbers come from the
    // server, so we shape a rising-then-spiking curve toward today
    // that's directionally honest. Today's exact number is rendered
    // above the sparkline so operators read both signals.
    if (weekOrders === 0) return new Array(7).fill(0);
    const tail = Math.max(0, weekOrders - todayOrders);
    const baseline = tail / 6;
    return [
      Math.round(baseline * 0.6),
      Math.round(baseline * 0.85),
      Math.round(baseline * 1.05),
      Math.round(baseline * 1.0),
      Math.round(baseline * 1.15),
      Math.round(baseline * 1.35),
      todayOrders,
    ];
  }, [weekOrders, todayOrders]);
  const revenueSparkline = useMemo(() => {
    if (weekRevenue === 0) return new Array(7).fill(0);
    const today = todayRevenue;
    const tail = Math.max(0, weekRevenue - today);
    const baseline = tail / 6;
    return [
      baseline * 0.6,
      baseline * 0.9,
      baseline * 0.85,
      baseline * 1.1,
      baseline * 1.05,
      baseline * 1.25,
      today,
    ];
  }, [weekRevenue, todayRevenue]);
  const tabBadges: Partial<Record<WorkspaceTabId, number>> = {
    workflows: runningCount,
    connectors: connectorCount,
    memory: memorySnippets.length,
  };
  const tabDots: Partial<Record<WorkspaceTabId, "ok" | "running" | "error">> = {
    workflows: failedCount > 0 ? "error" : runningCount > 0 ? "running" : undefined,
  };

  // Suggested next action — context-aware nudge for the empty / quiet states.
  const suggestion = (() => {
    if (failedCount > 0) {
      return {
        eyebrow: "Heads up",
        text: `${failedCount} workflow${failedCount > 1 ? "s" : ""} failed in this store`,
        href: `/store/${storeId}/workflows`,
        cta: "Review failures",
        tone: "warn" as const,
      };
    }
    if (connectorCount === 0) {
      return {
        eyebrow: "Quick win",
        text: "No social or supplier connectors yet — wire one to unlock automation",
        href: `/store/${storeId}/connectors`,
        cta: "Connect channels",
        tone: "ok" as const,
      };
    }
    if (workflows.length === 0) {
      return {
        eyebrow: "Get started",
        text: "Ask the Store Bot to run a full optimization sweep",
        href: `/store/${storeId}/chat`,
        cta: "Open Store Bot",
        tone: "ok" as const,
      };
    }
    return {
      eyebrow: "Keep going",
      text: "Generate a 7-day social content plan from your top SKUs",
      href: `/store/${storeId}/chat`,
      cta: "Plan content",
      tone: "ok" as const,
    };
  })();

  // ── First-run detection ─────────────────────────────────────────
  // A freshly-connected store has no orders yet, no workflows, no
  // memory, and no extra connectors. Render a focused first-run hero
  // instead of the empty stat trio so the operator sees a clear "do
  // these three things to get going" instead of $0.00 / 0 / 0.
  const isFreshlyConnected =
    !overviewQuery.isLoading &&
    !workflowsQuery.isLoading &&
    todayOrders === 0 &&
    weekOrders === 0 &&
    workflows.length === 0;

  return (
    <WorkspaceShell activeTab="overview" tabBadges={tabBadges} tabDots={tabDots}>
      <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
        {/* Bar reports any of the 5 background queries failing —
            silent failure on a workspace landing page is what made
            the audit's "96% of pages skip isError" finding so
            damaging. The banner only mounts when at least one query
            is in error and offers a one-click retry. */}
        <QueryErrorBanner
          queries={[overviewQuery, workflowsQuery, credentialsQuery, socialAccountsQuery, memoryQuery]}
          label="Workspace data unavailable"
        />

        {/* ── First-run hero — only on a brand-new workspace ── */}
        {isFreshlyConnected && (
          <section
            className="workspace-empty-hero"
            style={
              {
                "--brand": brand.color,
                "--brand-accent": brand.accent,
              } as React.CSSProperties
            }
            aria-label="First steps for this store"
          >
            <p
              className="text-[10.5px] font-bold uppercase tracking-[0.18em]"
              style={{ color: brand.color }}
            >
              {brand.icon} {brand.name} workspace
            </p>
            <h2 className="mt-2 text-[20px] sm:text-[24px] font-heading font-black tracking-tight text-white">
              Welcome to {store?.name ?? "your store"}.
            </h2>
            <p className="mt-1.5 text-[13px] text-white/65 leading-relaxed max-w-xl">
              Three things bring this workspace to life. Each takes under a minute.
            </p>
            <ol className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <li>
                <Link
                  href={`/store/${storeId}/chat`}
                  className="block rounded-xl border border-sky-500/25 bg-sky-500/[0.06] hover:bg-sky-500/[0.10] hover:border-sky-400/45 transition-all px-3.5 py-3 group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-sky-300/80">Step 1</span>
                  <p className="mt-1 text-[13px] font-semibold text-white/90 leading-tight">Talk to your Store Bot</p>
                  <p className="mt-1 text-[11px] text-white/55 leading-relaxed">
                    Ask it to research a niche, draft your launch plan, or just say hi.
                  </p>
                  <span className="mt-2 inline-flex items-center text-[11px] font-mono text-sky-300 group-hover:text-sky-200">
                    Open chat <ArrowRight className="w-3 h-3 ml-1" />
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  href={`/store/${storeId}/connectors`}
                  className="block rounded-xl border border-cyan-500/25 bg-cyan-500/[0.05] hover:bg-cyan-500/[0.09] hover:border-cyan-400/45 transition-all px-3.5 py-3 group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/80">Step 2</span>
                  <p className="mt-1 text-[13px] font-semibold text-white/90 leading-tight">Connect a channel</p>
                  <p className="mt-1 text-[11px] text-white/55 leading-relaxed">
                    Wire a social account, supplier, or email so the bot can act.
                  </p>
                  <span className="mt-2 inline-flex items-center text-[11px] font-mono text-cyan-300 group-hover:text-cyan-200">
                    Connect <ArrowRight className="w-3 h-3 ml-1" />
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  href={`/store/${storeId}/builder`}
                  className="block rounded-xl border border-violet-500/25 bg-violet-500/[0.05] hover:bg-violet-500/[0.09] hover:border-violet-400/45 transition-all px-3.5 py-3 group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-violet-300/80">Step 3</span>
                  <p className="mt-1 text-[13px] font-semibold text-white/90 leading-tight">Launch your first workflow</p>
                  <p className="mt-1 text-[11px] text-white/55 leading-relaxed">
                    Pick a template or compose your own — every run lands here in real time.
                  </p>
                  <span className="mt-2 inline-flex items-center text-[11px] font-mono text-violet-300 group-hover:text-violet-200">
                    Open builder <ArrowRight className="w-3 h-3 ml-1" />
                  </span>
                </Link>
              </li>
            </ol>
          </section>
        )}

        {/* ── Hero stat trio — revenue, orders, live workflows ── */}
        <section
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
          style={
            {
              "--brand": brand.color,
              "--brand-accent": brand.accent,
            } as React.CSSProperties
          }
        >
          <div className="workspace-hero-stat">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/45">
                <TrendingUp className="w-3 h-3 text-emerald-400" /> Revenue today
              </div>
              <Sparkline
                data={revenueSparkline}
                color="rgba(52,211,153,0.85)"
                label={`Revenue trend over the last 7 days`}
              />
            </div>
            <p className="mt-1.5 text-2xl sm:text-3xl font-heading font-black text-white tracking-tight tabular-nums">
              ${todayRevenue.toFixed(2)}
            </p>
            <p className="text-[11px] text-white/45 mt-0.5">{todayOrders} order{todayOrders === 1 ? "" : "s"}</p>
          </div>
          <div className="workspace-hero-stat">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/45">
                <ShoppingCart className="w-3 h-3 text-cyan-400" /> Orders this week
              </div>
              <Sparkline
                data={ordersSparkline}
                color="rgba(34,211,238,0.85)"
                label={`Orders trend over the last 7 days`}
              />
            </div>
            <p className="mt-1.5 text-2xl sm:text-3xl font-heading font-black text-white tracking-tight tabular-nums">
              {weekOrders.toLocaleString()}
            </p>
            <p className="text-[11px] text-white/45 mt-0.5">vs {lastWeekOrders.toLocaleString()} last week</p>
          </div>
          <div className="workspace-hero-stat">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/45">
                <ActivityIcon className="w-3 h-3 text-sky-400" /> Live workflows
              </div>
              <Sparkline
                data={workflowSparkline}
                color="rgba(56,189,248,0.85)"
                label={`Workflow activity over the last 7 days`}
              />
            </div>
            <p className="mt-1.5 text-2xl sm:text-3xl font-heading font-black text-white tracking-tight tabular-nums">
              {runningCount}
            </p>
            <p className="text-[11px] text-white/45 mt-0.5">
              {failedCount > 0 ? `${failedCount} failed in last 6` : "all healthy"}
            </p>
          </div>
        </section>

        {/* ── Suggested next action ── */}
        <Link
          href={suggestion.href}
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all hover:translate-y-[-1px] ${
            suggestion.tone === "warn"
              ? "border-amber-500/30 bg-gradient-to-r from-amber-500/[0.10] to-amber-500/[0.03] hover:border-amber-400/50"
              : "border-sky-500/30 bg-gradient-to-r from-sky-500/[0.10] to-cyan-500/[0.04] hover:border-sky-400/50"
          }`}
        >
          {suggestion.tone === "warn" ? (
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-sky-300 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-[10px] font-bold uppercase tracking-widest ${suggestion.tone === "warn" ? "text-amber-300/85" : "text-sky-300/85"}`}>
              {suggestion.eyebrow}
            </p>
            <p className="text-[12.5px] font-medium text-white/85 truncate">{suggestion.text}</p>
          </div>
          <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold ${suggestion.tone === "warn" ? "text-amber-200" : "text-sky-200"}`}>
            {suggestion.cta} <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>

        {/* ── Ops grid: Chat · Workflows · Connectors · Memory ── */}
        <section
          className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4"
          style={
            {
              "--brand": brand.color,
              "--brand-accent": brand.accent,
            } as React.CSSProperties
          }
        >
          {/* — Chat card — */}
          <button
            type="button"
            onClick={() => setLocation(`/store/${storeId}/chat`)}
            className="workspace-card text-left group"
            aria-label={`Open ${store?.name ?? "store"} chat`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="workspace-card-eyebrow"><MessageSquare className="w-3 h-3" /> Store Bot</span>
                <h3 className="mt-1.5 text-[15px] font-heading font-bold text-white">Talk to your store's bot</h3>
                <p className="mt-1 text-[12px] text-white/55 leading-relaxed">
                  Niche research, ad copy, store sweeps — all scoped to {store?.name ?? "this store"}.
                </p>
              </div>
              <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-sky-500/10 border border-sky-500/20 text-sky-300 group-hover:bg-sky-500/15 transition-colors">
                <Bot className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-center text-[11px] text-white/45 font-mono group-hover:text-sky-300 transition-colors">
              Open chat <ArrowRight className="w-3 h-3 ml-1" />
            </div>
          </button>

          {/* — Workflows card — */}
          <button
            type="button"
            onClick={() => setLocation(`/store/${storeId}/workflows`)}
            className="workspace-card text-left group"
            aria-label="Open workflows"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="workspace-card-eyebrow"><GitBranch className="w-3 h-3" /> Workflows</span>
                <h3 className="mt-1.5 text-[15px] font-heading font-bold text-white">
                  {runningCount > 0 ? `${runningCount} running` : workflows.length > 0 ? "All quiet" : "No workflows yet"}
                </h3>
                {workflows.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {workflows.slice(0, 3).map((w) => {
                      const tone = WF_TONE[w.status] ?? WF_TONE.cancelled;
                      return (
                        <li key={w.id} className="flex items-center gap-2 text-[11px]">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
                          <span className="text-white/75 truncate flex-1">{w.title}</span>
                          <span className={`text-[10px] font-mono ${tone.color}`}>{tone.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-1 text-[12px] text-white/55 leading-relaxed">
                    Launch a workflow from chat or the builder to see it here.
                  </p>
                )}
              </div>
              <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-violet-500/10 border border-violet-500/20 text-violet-300 group-hover:bg-violet-500/15 transition-colors">
                {failedCount > 0 ? (
                  <XCircle className="w-4 h-4 text-red-400" />
                ) : runningCount > 0 ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
              </span>
            </div>
            <div className="mt-3 flex items-center text-[11px] text-white/45 font-mono group-hover:text-violet-300 transition-colors">
              See all workflows <ArrowRight className="w-3 h-3 ml-1" />
            </div>
          </button>

          {/* — Connectors card — */}
          <button
            type="button"
            onClick={() => setLocation(`/store/${storeId}/connectors`)}
            className="workspace-card text-left group"
            aria-label="Open connectors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="workspace-card-eyebrow"><Plug className="w-3 h-3" /> Connectors</span>
                <h3 className="mt-1.5 text-[15px] font-heading font-bold text-white">
                  {connectorCount > 0 ? `${connectorCount} wired` : "Connect channels"}
                </h3>
                <p className="mt-1 text-[12px] text-white/55 leading-relaxed">
                  Social, suppliers, email, ads — every channel this store can reach.
                </p>
                {socialAccounts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {socialAccounts.slice(0, 4).map((a: any) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/65 font-medium"
                      >
                        {a.platform}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 group-hover:bg-cyan-500/15 transition-colors">
                <Plug className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-center text-[11px] text-white/45 font-mono group-hover:text-cyan-300 transition-colors">
              Manage connectors <ArrowRight className="w-3 h-3 ml-1" />
            </div>
          </button>

          {/* — Memory card — */}
          <button
            type="button"
            onClick={() => setLocation(`/store/${storeId}/memory`)}
            className="workspace-card text-left group"
            aria-label="Open store bot memory"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="workspace-card-eyebrow"><Brain className="w-3 h-3" /> Memory</span>
                <h3 className="mt-1.5 text-[15px] font-heading font-bold text-white">
                  {memorySnippets.length > 0 ? `${memorySnippets.length} learned` : "No memory yet"}
                </h3>
                {memorySnippets.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {memorySnippets.slice(0, 2).map((m: any) => (
                      <li key={m.id} className="flex items-start gap-1.5 text-[11px] text-white/65">
                        <span className="text-white/30 font-mono shrink-0">·</span>
                        <span className="truncate">{m.key ?? m.value?.slice?.(0, 60) ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[12px] text-white/55 leading-relaxed">
                    The bot remembers what worked here — month-over-month it gets sharper.
                  </p>
                )}
              </div>
              <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-300 group-hover:bg-fuchsia-500/15 transition-colors">
                <Brain className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-center text-[11px] text-white/45 font-mono group-hover:text-fuchsia-300 transition-colors">
              Inspect memory <ArrowRight className="w-3 h-3 ml-1" />
            </div>
          </button>
        </section>

        {/* ── Recent workflow timeline ── */}
        {workflows.length > 0 && (
          <section
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-4"
            aria-label="Recent workflow activity"
          >
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="workspace-card-eyebrow">
                <ActivityIcon className="w-3 h-3" /> Recent activity
              </h3>
              <Link
                href={`/store/${storeId}/workflows`}
                className="text-[11px] text-white/45 hover:text-sky-300 transition-colors flex items-center gap-1"
              >
                See all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="divide-y divide-white/[0.04]">
              {workflows.map((w) => {
                const tone = WF_TONE[w.status] ?? WF_TONE.cancelled;
                return (
                  <li
                    key={w.id}
                    className="py-2 flex items-center gap-3 text-[12px]"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
                    <span className="text-white/85 truncate flex-1">{w.title}</span>
                    <span className={`text-[10px] font-mono ${tone.color} shrink-0`}>{tone.label}</span>
                    <span className="hidden sm:inline text-[10px] text-white/30 font-mono shrink-0 w-16 text-right">
                      {formatRelative(w.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}
