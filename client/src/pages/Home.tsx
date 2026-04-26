/**
 * Home.tsx — Personalized Command Center.
 *
 * This is the user's actual operation, not the product's plumbing:
 *   • A KPI strip at the top with live numbers from THEIR stores.
 *   • A radial graph centered on the user, with rings for storefronts,
 *     bots, and channels — all generated from real data
 *     (`stores.list`, `connectors.connectionSummary`,
 *     `connectors.listSocialAccounts`, `dashboard.agentStatus`).
 *   • An empty-state "build your operation" canvas with ghost nodes
 *     when nothing is connected yet.
 *   • Click a node to inspect it; click "Chat with this bot" or
 *     "Open store dashboard" to drill in.
 *
 * The TiDB / BullMQ / Sharp / tRPC infra topology that used to live
 * here was moved to Platform Health (operator concern).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  Position,
  ConnectionLineType,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  Bot, Package, Megaphone, Store, ShoppingCart,
  Sparkles, Plus, MessageSquare, ArrowRight, AlertTriangle,
  Loader2, GitBranch, TrendingUp, ShieldCheck,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type AgentType = "architect" | "merchant" | "social";

type NodeKind =
  | "user"
  | "store"
  | "bot"
  | "channel"
  | "ghost-store"
  | "ghost-bot"
  | "ghost-channel";

interface OperationNodeData {
  kind: NodeKind;
  label: string;
  sublabel?: string;
  status?: "ok" | "running" | "error" | "idle";
  icon: React.ReactNode;
  /** Action target when the user clicks the inspector primary button. */
  href?: string;
  /** Refers to the `id` of the underlying entity (storeId, agentType, etc). */
  entityId?: string | number;
  /** Optional extra payload shown in the inspector. */
  details?: Record<string, string | number>;
  selected?: boolean;
}

// ─── Node renderer ─────────────────────────────────────────────────────────────

const KIND_THEME: Record<
  NodeKind,
  { border: string; bg: string; text: string; iconBg: string }
> = {
  user:           { border: "border-sky-400/50",     bg: "bg-sky-500/10",         text: "text-sky-300",     iconBg: "bg-sky-500/20 border-sky-500/40" },
  store:          { border: "border-emerald-500/40", bg: "bg-emerald-500/[0.06]", text: "text-emerald-300", iconBg: "bg-emerald-500/15 border-emerald-500/30" },
  bot:            { border: "border-violet-500/40",  bg: "bg-violet-500/[0.05]",  text: "text-violet-300",  iconBg: "bg-violet-500/15 border-violet-500/30" },
  channel:        { border: "border-pink-500/40",    bg: "bg-pink-500/[0.05]",    text: "text-pink-300",    iconBg: "bg-pink-500/15 border-pink-500/30" },
  "ghost-store":  { border: "border-white/15 border-dashed", bg: "bg-white/[0.02]", text: "text-white/45",   iconBg: "bg-white/[0.04] border-white/[0.1]" },
  "ghost-bot":    { border: "border-white/15 border-dashed", bg: "bg-white/[0.02]", text: "text-white/45",   iconBg: "bg-white/[0.04] border-white/[0.1]" },
  "ghost-channel":{ border: "border-white/15 border-dashed", bg: "bg-white/[0.02]", text: "text-white/45",   iconBg: "bg-white/[0.04] border-white/[0.1]" },
};

const STATUS_DOT: Record<NonNullable<OperationNodeData["status"]>, string> = {
  ok:      "bg-emerald-400",
  running: "bg-amber-400 animate-pulse",
  error:   "bg-red-400 animate-pulse",
  idle:    "bg-white/30",
};

function OperationNode({ data, isConnectable }: { data: OperationNodeData; isConnectable?: boolean }) {
  const theme = KIND_THEME[data.kind];
  const isUser = data.kind === "user";
  return (
    <div
      className={`
        relative px-3.5 py-2.5 rounded-xl border backdrop-blur-sm transition-all duration-300 cursor-pointer
        ${isUser ? "min-w-[220px]" : "min-w-[200px]"}
        ${data.selected ? "border-sky-400/80 bg-sky-500/15 shadow-[0_0_24px_rgba(14,165,233,0.3)]" : `${theme.border} ${theme.bg}`}
      `}
    >
      <Handle type="target" position={Position.Left} isConnectable={isConnectable}
        style={{ background: "transparent", border: "none", width: 8, height: 8 }} />
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${theme.iconBg}`}>
          {data.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${theme.text} mb-0.5 truncate`}>
            {data.label}
          </p>
          {data.sublabel && (
            <p className="text-[10px] font-mono text-white/55 truncate">{data.sublabel}</p>
          )}
        </div>
        {data.status && (
          <span
            className={`shrink-0 w-1.5 h-1.5 rounded-full ${STATUS_DOT[data.status]}`}
            aria-label={`status ${data.status}`}
          />
        )}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={isConnectable}
        style={{ background: "transparent", border: "none", width: 8, height: 8 }} />
    </div>
  );
}

const nodeTypes = { op: OperationNode };

// ─── Geometry ─────────────────────────────────────────────────────────────────

function radialPosition(index: number, count: number, radius: number, originX = 600, originY = 320, startAngleDeg = -90) {
  const angle = ((startAngleDeg + (index * 360) / Math.max(count, 1)) * Math.PI) / 180;
  return { x: originX + radius * Math.cos(angle), y: originY + radius * Math.sin(angle) };
}

const PLATFORM_LABEL: Record<string, string> = {
  shopify: "Shopify", woocommerce: "WooCommerce", amazon: "Amazon", etsy: "Etsy",
  ebay: "eBay", tiktok_shop: "TikTok Shop", walmart: "Walmart",
  meta: "Meta", instagram: "Instagram", tiktok: "TikTok", twitter: "X",
  pinterest: "Pinterest", google_ads: "Google Ads", gmail: "Gmail",
};

const BOT_META: Record<AgentType, { label: string; href: string; icon: React.ReactNode; description: string }> = {
  architect: { label: "Builder Bot",  href: "/architect", icon: <Bot className="w-4 h-4 text-sky-300" />,    description: "Niche research & store scaffolding" },
  merchant:  { label: "Merchant Bot", href: "/merchant",  icon: <Package className="w-4 h-4 text-violet-300" />, description: "Inventory, pricing & fulfilment" },
  social:    { label: "Social Bot",   href: "/social",    icon: <Megaphone className="w-4 h-4 text-amber-300" />, description: "Ads, posts & campaigns" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const { activeStoreId } = useWorkspace();
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState<Node<OperationNodeData> | null>(null);

  // Live data
  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const {
    data: agentStatus,
    error: agentError,
    refetch: refetchAgentStatus,
  } = trpc.dashboard.agentStatus.useQuery(undefined, { refetchInterval: 15_000 });
  const { data: socialAccounts } = trpc.connectors.listSocialAccounts.useQuery();
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

  // Derive bot status
  const botStatusFor = (t: AgentType): NonNullable<OperationNodeData["status"]> => {
    const row = ((agentStatus as any[]) ?? []).find((r) => r?.agentType === t);
    if (!row) return "idle";
    if ((row.failed ?? 0) > 0) return "error";
    if ((row.running ?? 0) > 0) return "running";
    return "ok";
  };

  const totalRunning = ((agentStatus as any[]) ?? []).reduce(
    (a: number, s: any) => a + (s?.running ?? 0), 0,
  );
  const pendingCount = pendingApprovals?.length ?? 0;
  const enabledBots: AgentType[] = ["architect", "merchant", "social"];

  // Bot health summary string
  const botHealth = (() => {
    const errors = enabledBots.filter((b) => botStatusFor(b) === "error").length;
    if (errors > 0) return { tone: "warn" as const, text: `${errors} bot${errors > 1 ? "s" : ""} need attention` };
    const running = enabledBots.filter((b) => botStatusFor(b) === "running").length;
    if (running > 0) return { tone: "active" as const, text: `${running} running, all healthy` };
    return { tone: "ok" as const, text: `${enabledBots.length} bots green` };
  })();

  // Build nodes/edges from data
  const { initialNodes, initialEdges } = useMemo(() => {
    const ns: Node<OperationNodeData>[] = [];
    const es: Edge[] = [];

    const center = { x: 600, y: 320 };

    // Center: user / workspace
    ns.push({
      id: "user",
      type: "op",
      position: { x: center.x - 110, y: center.y - 26 },
      draggable: false,
      data: {
        kind: "user",
        label: "You",
        sublabel: user?.name ?? "Your workspace",
        icon: <Sparkles className="w-4 h-4 text-sky-300" />,
        details: {
          "Active stores": (stores ?? []).filter((s: any) => s.status === "active").length,
          "Pending approvals": pendingCount,
        },
      },
    });

    // Ring 1: storefronts (radius ~260, top half)
    const storeList = (stores ?? []).filter((s: any) => s);
    const hasStores = storeList.length > 0;
    if (!hasStores) {
      const pos = radialPosition(0, 1, 280, center.x, center.y, -90);
      ns.push({
        id: "ghost-store",
        type: "op",
        position: { x: pos.x - 100, y: pos.y - 26 },
        draggable: false,
        data: {
          kind: "ghost-store",
          label: "Connect a store",
          sublabel: "Shopify, Etsy, Amazon…",
          icon: <Plus className="w-4 h-4 text-white/45" />,
          href: "/storefronts",
        },
      });
      es.push({
        id: "e-user-ghoststore",
        source: "user",
        target: "ghost-store",
        style: { stroke: "rgba(255,255,255,0.18)", strokeDasharray: "4 4", strokeWidth: 1.2 },
      });
    } else {
      // place stores in upper arc (-150 .. -30 deg)
      storeList.forEach((s: any, i: number) => {
        const arcStart = -150;
        const arcEnd = -30;
        const t = storeList.length === 1 ? 0.5 : i / (storeList.length - 1);
        const angle = arcStart + (arcEnd - arcStart) * t;
        const rad = (angle * Math.PI) / 180;
        const r = 280;
        const x = center.x + r * Math.cos(rad);
        const y = center.y + r * Math.sin(rad);
        const id = `store-${s.id}`;
        const isActive = s.status === "active";
        const storeMetrics = (intel as any)?.storeMetrics?.find?.((m: any) => m.storeId === s.id);
        ns.push({
          id,
          type: "op",
          position: { x: x - 100, y: y - 26 },
          draggable: false,
          data: {
            kind: "store",
            label: s.name,
            sublabel: `${PLATFORM_LABEL[s.platform] ?? s.platform}${storeMetrics ? ` · $${((storeMetrics.revenue ?? 0) / 100).toFixed(0)}` : ""}`,
            status: isActive ? "ok" : "idle",
            icon: <Store className="w-4 h-4 text-emerald-300" />,
            href: `/stores/${s.id}`,
            entityId: s.id,
            details: {
              Platform: PLATFORM_LABEL[s.platform] ?? s.platform,
              Status: s.status,
              Revenue: storeMetrics ? `$${((storeMetrics.revenue ?? 0) / 100).toFixed(2)}` : "—",
              Orders: storeMetrics?.orders ?? 0,
              "Low stock": storeMetrics?.lowStockCount ?? 0,
            },
          },
        });
        es.push({
          id: `e-user-${id}`,
          source: "user",
          target: id,
          animated: isActive,
          style: { stroke: isActive ? "rgba(16,185,129,0.45)" : "rgba(255,255,255,0.12)", strokeWidth: 1.4 },
        });
      });
    }

    // Ring 2: bots (right side, vertical column at radius ~260)
    enabledBots.forEach((bot, i) => {
      const meta = BOT_META[bot];
      const status = botStatusFor(bot);
      const x = center.x + 320;
      const y = center.y - 110 + i * 110;
      const id = `bot-${bot}`;
      ns.push({
        id,
        type: "op",
        position: { x: x - 100, y: y - 26 },
        draggable: false,
        data: {
          kind: "bot",
          label: meta.label,
          sublabel: meta.description,
          status,
          icon: meta.icon,
          href: meta.href,
          entityId: bot,
          details: {
            Status: status,
            "Running tasks": ((agentStatus as any[]) ?? []).find((r) => r?.agentType === bot)?.running ?? 0,
            Completed: ((agentStatus as any[]) ?? []).find((r) => r?.agentType === bot)?.completed ?? 0,
          },
        },
      });
      // Connect bot to user, and (if active stores exist) to each store as
      // dotted edges to indicate "this bot acts on these stores".
      es.push({
        id: `e-user-${id}`,
        source: "user",
        target: id,
        animated: status === "running",
        style: { stroke: status === "running" ? "rgba(245,158,11,0.55)" : "rgba(168,85,247,0.35)", strokeWidth: 1.4 },
      });
      storeList.forEach((s: any) => {
        if (s.status !== "active") return;
        es.push({
          id: `e-${id}-store-${s.id}`,
          source: id,
          target: `store-${s.id}`,
          animated: status === "running",
          style: {
            stroke: status === "running" ? "rgba(245,158,11,0.35)" : "rgba(168,85,247,0.18)",
            strokeWidth: 1,
            strokeDasharray: "4 3",
          },
        });
      });
    });

    // Ring 3: channels (social accounts) — bottom arc
    const channels = (socialAccounts ?? []).filter((a: any) => a?.status === "active");
    if (channels.length === 0) {
      const pos = radialPosition(0, 1, 280, center.x, center.y, 90);
      ns.push({
        id: "ghost-channel",
        type: "op",
        position: { x: pos.x - 100, y: pos.y - 26 },
        draggable: false,
        data: {
          kind: "ghost-channel",
          label: "Add a channel",
          sublabel: "TikTok, Meta, Pinterest…",
          icon: <Plus className="w-4 h-4 text-white/45" />,
          href: "/storefronts",
        },
      });
      es.push({
        id: "e-user-ghostchannel",
        source: "user",
        target: "ghost-channel",
        style: { stroke: "rgba(255,255,255,0.18)", strokeDasharray: "4 4", strokeWidth: 1.2 },
      });
    } else {
      channels.forEach((c: any, i: number) => {
        const arcStart = 30;
        const arcEnd = 150;
        const t = channels.length === 1 ? 0.5 : i / (channels.length - 1);
        const angle = arcStart + (arcEnd - arcStart) * t;
        const rad = (angle * Math.PI) / 180;
        const r = 280;
        const x = center.x + r * Math.cos(rad);
        const y = center.y + r * Math.sin(rad);
        const id = `channel-${c.id}`;
        ns.push({
          id,
          type: "op",
          position: { x: x - 100, y: y - 26 },
          draggable: false,
          data: {
            kind: "channel",
            label: c.accountName ?? PLATFORM_LABEL[c.platform] ?? c.platform,
            sublabel: PLATFORM_LABEL[c.platform] ?? c.platform,
            status: "ok",
            icon: <Megaphone className="w-4 h-4 text-pink-300" />,
            href: "/social",
            entityId: c.id,
            details: {
              Platform: PLATFORM_LABEL[c.platform] ?? c.platform,
              Status: c.status,
            },
          },
        });
        // Channel sits "downstream" of Social bot
        es.push({
          id: `e-bot-social-${id}`,
          source: "bot-social",
          target: id,
          animated: false,
          style: { stroke: "rgba(236,72,153,0.35)", strokeWidth: 1, strokeDasharray: "4 3" },
        });
      });
    }

    return { initialNodes: ns, initialEdges: es };
  }, [stores, agentStatus, socialAccounts, intel, user, pendingCount]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Re-sync nodes/edges when the underlying data changes.
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((_: any, node: Node<OperationNodeData>) => {
    setSelected(node);
    setNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, selected: n.id === node.id } })),
    );
  }, [setNodes]);

  const onPaneClick = useCallback(() => {
    setSelected(null);
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, selected: false } })));
  }, [setNodes]);

  const todayRevenue = (((metrics?.totalRevenue ?? 0) as number) / 100).toFixed(2);
  const todayOrders = (metrics?.totalOrders ?? 0) as number;
  const recommendation = (intel as any)?.totalLowStock > 0
    ? `${(intel as any).totalLowStock} SKU${(intel as any).totalLowStock > 1 ? "s" : ""} low on inventory across your stores — review`
    : (intel as any)?.topStore
      ? `${(intel as any).topStore.name} is your top store this period — $${(((intel as any).topStore.revenue ?? 0) / 100).toFixed(0)}`
      : "No recommendations yet — connect a store to see insights";

  return (
    <div className="page-enter flex flex-col h-full w-full bg-[#050505]/70 overflow-hidden relative">
      {/* stagger-list anchor for animation tests */}
      <div className="stagger-list hidden" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-25" />

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
            Retry
          </button>
        </div>
      )}

      {/* ── KPI Strip ── */}
      <div className="shrink-0 border-b border-white/[0.06] bg-[#040406]/70 backdrop-blur-xl px-4 md:px-6 py-3 flex flex-wrap items-center gap-3 md:gap-5 z-20">
        <Kpi
          icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
          label="Today's revenue"
          value={`$${todayRevenue}`}
          sub={`${todayOrders} order${todayOrders === 1 ? "" : "s"}`}
        />
        <Kpi
          icon={<ShieldCheck className="w-3.5 h-3.5 text-amber-400" />}
          label="Pending approvals"
          value={String(pendingCount)}
          sub={pendingCount > 0 ? "needs review" : "all clear"}
          href="/inbox#approvals"
        />
        <Kpi
          icon={<GitBranch className="w-3.5 h-3.5 text-sky-400" />}
          label="Active workflows"
          value={String(totalRunning)}
          sub={totalRunning > 0 ? "running" : "idle"}
          href="/workflows"
        />
        <Kpi
          icon={<Bot className={`w-3.5 h-3.5 ${botHealth.tone === "warn" ? "text-red-400" : botHealth.tone === "active" ? "text-amber-400" : "text-emerald-400"}`} />}
          label="Bots"
          value={botHealth.tone === "warn" ? "Attention" : botHealth.tone === "active" ? "Active" : "Healthy"}
          sub={botHealth.text}
        />
        <div className="ml-auto flex items-center gap-2 max-w-[420px] truncate rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-3 py-1.5">
          <Sparkles className="w-3.5 h-3.5 text-sky-300 shrink-0" />
          <span className="text-[11px] text-white/70 truncate" title={recommendation}>{recommendation}</span>
        </div>
      </div>

      {/* ── Canvas + Inspector ── */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 h-full relative">
          {storesLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <Loader2 className="w-5 h-5 animate-spin text-white/30" />
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            connectionLineType={ConnectionLineType.SmoothStep}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.4}
            maxZoom={1.5}
            className="bg-transparent"
          >
            <Background color="rgba(255,255,255,0.03)" gap={28} size={1} />
            <Controls
              className="!bg-[#0a0b0f] !border-white/[0.08] !rounded-xl !shadow-none [&>button]:!border-b-white/[0.06] [&>button]:!bg-transparent [&>button>svg]:!fill-white/40 [&>button:hover]:!bg-white/[0.06]"
              position="bottom-left"
              showInteractive={false}
            />
            <MiniMap
              className="!bg-[#0a0b0f] !border-white/[0.08] !rounded-xl"
              nodeColor={() => "rgba(14,165,233,0.3)"}
              maskColor="rgba(5,5,5,0.7)"
              position="bottom-right"
            />
          </ReactFlow>
        </div>

        {/* Inspector */}
        <aside className="w-[300px] h-full shrink-0 border-l border-white/[0.06] bg-[#040406]/82 backdrop-blur-2xl flex flex-col z-20">
          <div className="h-11 flex items-center px-4 border-b border-white/[0.05] justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Inspector</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
              <span className="text-[9px] font-mono text-emerald-400/70">LIVE</span>
            </span>
          </div>
          <div className="h-px bg-gradient-to-r from-sky-500/30 via-transparent to-transparent shrink-0" />
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {selected ? (
              <NodeInspector
                node={selected}
                onAction={(href) => setLocation(href)}
              />
            ) : (
              <EmptyInspector hasStores={(stores?.length ?? 0) > 0} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── KPI helper ───────────────────────────────────────────────────────────────

function Kpi({ icon, label, value, sub, href }: { icon: React.ReactNode; label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 transition-all hover:border-sky-500/30 hover:bg-sky-500/[0.06]">
      <div className="w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/35">{label}</p>
        <p className="text-sm font-semibold text-white leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-white/40 leading-tight truncate">{sub}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

// ─── Inspector views ──────────────────────────────────────────────────────────

function NodeInspector({
  node,
  onAction,
}: {
  node: Node<OperationNodeData>;
  onAction: (href: string) => void;
}) {
  const { data } = node;
  const theme = KIND_THEME[data.kind];

  const isGhost = data.kind.startsWith("ghost");
  const isBot = data.kind === "bot";
  const isStore = data.kind === "store";
  const primary = isGhost
    ? { label: "Connect now", icon: <Plus className="w-3.5 h-3.5" />, href: data.href ?? "/storefronts" }
    : isBot
      ? { label: `Open ${data.label}`, icon: <ArrowRight className="w-3.5 h-3.5" />, href: data.href ?? "/" }
      : isStore
        ? { label: "Open store", icon: <ArrowRight className="w-3.5 h-3.5" />, href: data.href ?? "/storefronts" }
        : { label: "Open", icon: <ArrowRight className="w-3.5 h-3.5" />, href: data.href ?? "/" };

  return (
    <>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${theme.iconBg}`}>
          {data.icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-white truncate">{data.label}</p>
          {data.sublabel && (
            <p className={`text-[10px] font-mono mt-0.5 ${theme.text} truncate`}>{data.sublabel}</p>
          )}
        </div>
      </div>

      {data.details && Object.keys(data.details).length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/20 mb-2 pb-1.5 border-b border-white/[0.05]">
            Live data
          </p>
          <div className="space-y-1.5">
            {Object.entries(data.details).map(([k, v]) => (
              <div key={k} className="flex justify-between items-start gap-2">
                <span className="text-[10px] text-white/35 font-mono uppercase shrink-0">{k}</span>
                <span className="text-[10px] text-emerald-400 font-mono text-right break-all">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onAction(primary.href)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/15 px-3 py-2 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/25 hover:border-sky-400/40 transition-all"
        >
          {primary.icon}
          {primary.label}
        </button>
        {isBot && (
          <button
            type="button"
            onClick={() => onAction(`/chat?bot=${data.entityId}`)}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white/90 transition-all"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chat with this bot
          </button>
        )}
        {isStore && (
          <button
            type="button"
            onClick={() => onAction("/insights")}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white/90 transition-all"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            View store analytics
          </button>
        )}
      </div>
    </>
  );
}

function EmptyInspector({ hasStores }: { hasStores: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-2 py-10">
      <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
        <Sparkles className="w-5 h-5 text-white/20" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Your operation</p>
      <p className="text-[10px] text-white/35 mt-2 leading-relaxed max-w-[210px]">
        {hasStores
          ? "Click any node to inspect live data and drill into actions."
          : "Click a ghost node to start connecting your stores, bots, and channels."}
      </p>
      <div className="mt-5 grid grid-cols-1 gap-1.5 w-full">
        <QuickLink to="/storefronts" icon={<ShoppingCart className="w-3.5 h-3.5 text-emerald-300" />} label="Connect a store" />
        <QuickLink to="/architect" icon={<Bot className="w-3.5 h-3.5 text-sky-300" />} label="Run the Builder bot" />
        <QuickLink to="/social" icon={<Megaphone className="w-3.5 h-3.5 text-pink-300" />} label="Add a social channel" />
      </div>
    </div>
  );
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={to}
      className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/70 hover:border-sky-500/30 hover:bg-sky-500/[0.06] hover:text-white transition-all"
    >
      {icon}
      <span className="truncate flex-1 text-left">{label}</span>
      <ArrowRight className="w-3 h-3 text-white/30" />
    </Link>
  );
}
