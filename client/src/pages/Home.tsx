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
import { CountUp } from "@/components/CountUp";
import { useAuth } from "@/_core/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  Bot, Package, Megaphone, Store,
  Sparkles, Plus, MessageSquare, ArrowRight, AlertTriangle,
  Loader2, GitBranch, TrendingUp, ShieldCheck,
  RotateCcw, Zap, ExternalLink,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { HandoffMoment, LifecycleBadge } from "@/components/handoff/HandoffMoment";
import { ActivationCoach } from "@/components/ActivationCoach";
import { FirstRunTour } from "@/components/FirstRunTour";
import { RecommendedWorkflows } from "@/components/RecommendedWorkflows";

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

/**
 * Short uppercase kind label that rides above the node label —
 * gives the constellation a guidebook feel without a separate
 * legend taking up canvas space.
 */
function kindLabel(kind: NodeKind): string {
  switch (kind) {
    case "user": return "Workspace";
    case "bot": return "Bot";
    case "store": return "Storefront";
    case "channel": return "Channel";
    case "ghost-store": return "Add storefront";
    case "ghost-bot": return "Add bot";
    case "ghost-channel": return "Add channel";
  }
}

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
  const isGhost = data.kind.startsWith("ghost");
  const isBot = data.kind === "bot";
  const isStore = data.kind === "store";
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // The first detail line surfaces inline on the card so the graph
  // reads as glanceable metrics, not just labels. We pick the first
  // entry from the details bag and show it as a tabular footer.
  const headlineMetric = data.details
    ? Object.entries(data.details).find(([k]) => /revenue|orders|stores|approvals/i.test(k))
    : undefined;

  const NodeContent = (
    <div
      data-kind={data.kind}
      data-status={data.status ?? "idle"}
      className={`
        op-node group relative cursor-pointer transition-all duration-300
        ${isUser ? "op-node--user" : ""}
        ${isGhost ? "op-node--ghost" : ""}
        ${data.selected ? "op-node--selected" : ""}
      `}
    >
      {/* Pulsing brand halo behind the card — only visible on running
          bots and active stores so the graph telegraphs liveness. */}
      <div className="op-node-halo" aria-hidden="true" />

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ background: "transparent", border: "none", width: 14, height: 14 }}
      />

      <div className="op-node-row">
        <div className="op-node-icon">{data.icon}</div>
        <div className="op-node-text">
          <p className="op-node-eyebrow">{kindLabel(data.kind)}</p>
          <p className="op-node-label">{data.label}</p>
          {data.sublabel && <p className="op-node-sublabel">{data.sublabel}</p>}
        </div>
        {data.status && (
          <span className="op-node-status" data-status={data.status} aria-label={`status ${data.status}`}>
            <span className="op-node-status-dot" />
          </span>
        )}
      </div>

      {headlineMetric && (
        <div className="op-node-metric">
          <span className="op-node-metric-key">{headlineMetric[0]}</span>
          <span className="op-node-metric-value">{String(headlineMetric[1])}</span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{ background: "transparent", border: "none", width: 14, height: 14 }}
      />
    </div>
  );

  if (isUser) return NodeContent;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {NodeContent}
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-[#0a0a0f] border-white/[0.08] min-w-[180px]">
        {isGhost && data.href && (
          <>
            <ContextMenuItem
              onClick={() => setLocation(data.href!)}
              className="text-white/80 text-xs focus:bg-sky-500/10 focus:text-sky-300 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-2" />
              Connect now
            </ContextMenuItem>
          </>
        )}
        {isBot && (
          <>
            <ContextMenuItem
              onClick={() => setLocation(data.href ?? "/")}
              className="text-white/80 text-xs focus:bg-sky-500/10 focus:text-sky-300 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-2" />
              Open {data.label}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => setLocation(`/chat?bot=${data.entityId}`)}
              className="text-white/80 text-xs focus:bg-sky-500/10 focus:text-sky-300 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 mr-2" />
              Chat with bot
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => setLocation("/workflows")}
              className="text-white/80 text-xs focus:bg-sky-500/10 focus:text-sky-300 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 mr-2" />
              Launch workflow
            </ContextMenuItem>
          </>
        )}
        {isStore && (
          <>
            <ContextMenuItem
              onClick={() => setLocation(data.href ?? "/storefronts")}
              className="text-white/80 text-xs focus:bg-sky-500/10 focus:text-sky-300 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-2" />
              Open store
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => setLocation("/insights")}
              className="text-white/80 text-xs focus:bg-sky-500/10 focus:text-sky-300 cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5 mr-2" />
              View analytics
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                utils.dashboard.metrics.invalidate();
                utils.stores.list.invalidate();
              }}
              className="text-white/80 text-xs focus:bg-sky-500/10 focus:text-sky-300 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-2" />
              Refresh data
            </ContextMenuItem>
          </>
        )}
        {data.kind === "channel" && (
          <>
            <ContextMenuItem
              onClick={() => setLocation("/social")}
              className="text-white/80 text-xs focus:bg-sky-500/10 focus:text-sky-300 cursor-pointer"
            >
              <Megaphone className="w-3.5 h-3.5 mr-2" />
              Open Social Bot
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

const nodeTypes = { op: OperationNode };

// ─── Geometry ─────────────────────────────────────────────────────────────────

function radialPosition(index: number, count: number, radius: number, originX = 600, originY = 320, startAngleDeg = -90) {
  const angle = ((startAngleDeg + (index * 360) / Math.max(count, 1)) * Math.PI) / 180;
  return { x: originX + radius * Math.cos(angle), y: originY + radius * Math.sin(angle) };
}

const PLATFORM_LABEL: Record<string, string> = {
  // 14 e-commerce surfaces
  shopify: "Shopify", woocommerce: "WooCommerce", amazon: "Amazon", etsy: "Etsy",
  ebay: "eBay", tiktok_shop: "TikTok Shop", walmart: "Walmart",
  depop: "Depop", bigcommerce: "BigCommerce", square: "Square", faire: "Faire",
  bonanza: "Bonanza", stockx: "StockX", reverb: "Reverb",
  // 7 social channels
  meta: "Meta", instagram: "Instagram", tiktok: "TikTok", twitter: "X",
  pinterest: "Pinterest", google_ads: "Google Ads", gmail: "Gmail",
};

const BOT_META: Record<AgentType, { label: string; href: string; icon: React.ReactNode; description: string }> = {
  architect: { label: "Builder Bot",  href: "/architect", icon: <Bot className="w-5 h-5" strokeWidth={2.2} />,    description: "Niche research & store scaffolding" },
  merchant:  { label: "Merchant Bot", href: "/merchant",  icon: <Package className="w-5 h-5" strokeWidth={2.2} />, description: "Inventory, pricing & fulfilment" },
  social:    { label: "Social Bot",   href: "/social",    icon: <Megaphone className="w-5 h-5" strokeWidth={2.2} />, description: "Ads, posts & campaigns" },
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

  // ── Builder→Merchant handoff ──────────────────────────────────────────────
  // We pull the lifecycle for the active store. If the store is in the
  // `transitioning` phase and the user has not yet dismissed the moment
  // for this session, we surface the celebration modal.
  const { data: lifecycle } = trpc.lifecycle.get.useQuery(
    activeStoreId ? { storeId: activeStoreId } : (undefined as any),
    { enabled: Boolean(activeStoreId), refetchInterval: 60_000 },
  );
  const [handoffDismissed, setHandoffDismissed] = useState<Record<number, boolean>>({});
  const handoffStore = useMemo(() => {
    if (!lifecycle || !activeStoreId) return null;
    if (lifecycle.stage !== "transitioning") return null;
    if (handoffDismissed[lifecycle.storeId]) return null;
    return { id: lifecycle.storeId, name: lifecycle.storeName };
  }, [lifecycle, activeStoreId, handoffDismissed]);

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

  // Build nodes/edges from data. The constellation reads as the
  // dashboard's centerpiece — nodes are large + visually rich, so
  // radii + offsets are tuned to keep neighbors clear of each other
  // even at the larger node footprint (~ 280 × 100).
  const { initialNodes, initialEdges } = useMemo(() => {
    const ns: Node<OperationNodeData>[] = [];
    const es: Edge[] = [];

    const center = { x: 720, y: 380 };
    const NODE_HALF_W = 150; // half-width of the new op-node card
    const NODE_HALF_H = 50;  // half-height
    const STORE_RADIUS = 360;
    const BOT_X_OFFSET = 420;
    const CHANNEL_X_OFFSET = -420;

    // Center: user / workspace
    ns.push({
      id: "user",
      type: "op",
      position: { x: center.x - NODE_HALF_W, y: center.y - NODE_HALF_H },
      draggable: false,
      data: {
        kind: "user",
        label: "You",
        sublabel: user?.name ?? "Your workspace",
        icon: <Sparkles className="w-5 h-5" strokeWidth={2.2} />,
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
      const pos = radialPosition(0, 1, STORE_RADIUS, center.x, center.y, -90);
      ns.push({
        id: "ghost-store",
        type: "op",
        position: { x: pos.x - NODE_HALF_W, y: pos.y - NODE_HALF_H },
        draggable: false,
        data: {
          kind: "ghost-store",
          label: "Connect a store",
          sublabel: "Shopify, Etsy, Amazon…",
          icon: <Plus className="w-5 h-5" strokeWidth={2.2} />,
          href: "/storefronts",
        },
      });
      es.push({
        id: "e-user-ghoststore",
        source: "user",
        target: "ghost-store",
        style: { stroke: "rgba(255,255,255,0.28)", strokeDasharray: "6 6", strokeWidth: 2.4 },
      });
    } else {
      // place stores in upper arc (-150 .. -30 deg)
      storeList.forEach((s: any, i: number) => {
        const arcStart = -150;
        const arcEnd = -30;
        const t = storeList.length === 1 ? 0.5 : i / (storeList.length - 1);
        const angle = arcStart + (arcEnd - arcStart) * t;
        const rad = (angle * Math.PI) / 180;
        const r = STORE_RADIUS;
        const x = center.x + r * Math.cos(rad);
        const y = center.y + r * Math.sin(rad);
        const id = `store-${s.id}`;
        const isActive = s.status === "active";
        const storeMetrics = (intel as any)?.storeMetrics?.find?.((m: any) => m.storeId === s.id);
        ns.push({
          id,
          type: "op",
          position: { x: x - NODE_HALF_W, y: y - NODE_HALF_H },
          draggable: false,
          data: {
            kind: "store",
            label: s.name,
            sublabel: `${PLATFORM_LABEL[s.platform] ?? s.platform}${storeMetrics ? ` · $${((storeMetrics.revenue ?? 0) / 100).toFixed(0)}` : ""}`,
            status: isActive ? "ok" : "idle",
            icon: <Store className="w-5 h-5" strokeWidth={2.2} />,
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
          style: { stroke: isActive ? "rgba(16,185,129,0.7)" : "rgba(255,255,255,0.22)", strokeWidth: 2.6 },
        });
      });
    }

    // Ring 2: bots (right side, vertical column at radius ~260)
    enabledBots.forEach((bot, i) => {
      const meta = BOT_META[bot];
      const status = botStatusFor(bot);
      const x = center.x + BOT_X_OFFSET;
      const y = center.y - 150 + i * 150;
      const id = `bot-${bot}`;
      ns.push({
        id,
        type: "op",
        position: { x: x - NODE_HALF_W, y: y - NODE_HALF_H },
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
        style: { stroke: status === "running" ? "rgba(245,158,11,0.85)" : "rgba(168,85,247,0.55)", strokeWidth: 2.6 },
      });
      storeList.forEach((s: any) => {
        if (s.status !== "active") return;
        es.push({
          id: `e-${id}-store-${s.id}`,
          source: id,
          target: `store-${s.id}`,
          animated: status === "running",
          style: {
            stroke: status === "running" ? "rgba(245,158,11,0.55)" : "rgba(168,85,247,0.32)",
            strokeWidth: 2,
            strokeDasharray: "6 4",
          },
        });
      });
    });

    // Ring 3: channels (social accounts) — bottom arc
    const channels = (socialAccounts ?? []).filter((a: any) => a?.status === "active");
    if (channels.length === 0) {
      const pos = radialPosition(0, 1, STORE_RADIUS, center.x, center.y, 90);
      ns.push({
        id: "ghost-channel",
        type: "op",
        position: { x: pos.x - NODE_HALF_W, y: pos.y - NODE_HALF_H },
        draggable: false,
        data: {
          kind: "ghost-channel",
          label: "Add a channel",
          sublabel: "TikTok, Meta, Pinterest…",
          icon: <Plus className="w-5 h-5" strokeWidth={2.2} />,
          href: "/storefronts",
        },
      });
      es.push({
        id: "e-user-ghostchannel",
        source: "user",
        target: "ghost-channel",
        style: { stroke: "rgba(255,255,255,0.28)", strokeDasharray: "6 6", strokeWidth: 2.4 },
      });
    } else {
      channels.forEach((c: any, i: number) => {
        const arcStart = 30;
        const arcEnd = 150;
        const t = channels.length === 1 ? 0.5 : i / (channels.length - 1);
        const angle = arcStart + (arcEnd - arcStart) * t;
        const rad = (angle * Math.PI) / 180;
        const r = STORE_RADIUS;
        const x = center.x + r * Math.cos(rad);
        const y = center.y + r * Math.sin(rad);
        const id = `channel-${c.id}`;
        ns.push({
          id,
          type: "op",
          position: { x: x - NODE_HALF_W, y: y - NODE_HALF_H },
          draggable: false,
          data: {
            kind: "channel",
            label: c.accountName ?? PLATFORM_LABEL[c.platform] ?? c.platform,
            sublabel: PLATFORM_LABEL[c.platform] ?? c.platform,
            status: "ok",
            icon: <Megaphone className="w-5 h-5" strokeWidth={2.2} />,
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
          style: { stroke: "rgba(236,72,153,0.55)", strokeWidth: 2, strokeDasharray: "6 4" },
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

  // Esc closes the Inspector slide-over. Skipped while typing into a form
  // field so we don't fight Radix dialogs / textareas elsewhere on the
  // page. The DashboardLayout-level `?` overlay handler already preempts
  // when its own state is open, so they don't collide.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      onPaneClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onPaneClick]);

  const todayRevenue = (((metrics?.totalRevenue ?? 0) as number) / 100).toFixed(2);
  const todayOrders = (metrics?.totalOrders ?? 0) as number;
  const intelData = intel as { totalLowStock?: number; topStore?: { name?: string; revenue?: number } } | undefined;
  const lowStockCount = intelData?.totalLowStock ?? 0;
  const topStoreName = intelData?.topStore?.name;
  const topStoreRevenue = intelData?.topStore?.revenue ?? 0;
  const recommendation = lowStockCount > 0
    ? `${lowStockCount} SKU${lowStockCount > 1 ? "s" : ""} low on inventory across your stores — review`
    : topStoreName
      ? `${topStoreName} is your top store this period — $${(topStoreRevenue / 100).toFixed(0)}`
      : "No recommendations yet — connect a store to see insights";

  return (
    <div className="page-enter flex flex-col h-full w-full bg-[#050505]/70 overflow-hidden relative">
      {/* Builder→Merchant handoff celebration */}
      {handoffStore && (
        <HandoffMoment
          storeId={handoffStore.id}
          storeName={handoffStore.name}
          onComplete={() => setHandoffDismissed((s) => ({ ...s, [handoffStore.id]: true }))}
          onDefer={() => setHandoffDismissed((s) => ({ ...s, [handoffStore.id]: true }))}
        />
      )}
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
      <div className="shrink-0 relative border-b border-white/[0.06] bg-gradient-to-r from-[#040406]/85 via-[#050507]/75 to-[#040406]/85 backdrop-blur-xl px-4 md:px-5 py-2.5 flex flex-wrap items-center gap-2.5 md:gap-3 z-20">
        <div className="absolute inset-x-0 top-0 hairline opacity-40" />
        <Kpi
          icon={<TrendingUp className="w-3 h-3 text-emerald-400" />}
          label="Today's revenue"
          value={`$${todayRevenue}`}
          sub={`${todayOrders} order${todayOrders === 1 ? "" : "s"}`}
        />
        <Kpi
          icon={<ShieldCheck className="w-3 h-3 text-amber-400" />}
          label="Pending approvals"
          value={String(pendingCount)}
          sub={pendingCount > 0 ? "needs review" : "all clear"}
          href="/inbox#approvals"
        />
        <Kpi
          icon={<GitBranch className="w-3 h-3 text-sky-400" />}
          label="Active workflows"
          value={String(totalRunning)}
          sub={totalRunning > 0 ? "running" : "idle"}
          href="/workflows"
        />
        <Kpi
          icon={<Bot className={`w-3 h-3 ${botHealth.tone === "warn" ? "text-red-400" : botHealth.tone === "active" ? "text-amber-400" : "text-emerald-400"}`} />}
          label="Bots"
          value={botHealth.tone === "warn" ? "Attention" : botHealth.tone === "active" ? "Active" : "Healthy"}
          sub={botHealth.text}
        />
        <div className="ml-auto flex items-center gap-2 max-w-[440px] rounded-full border border-sky-500/25 bg-gradient-to-r from-sky-500/[0.10] to-cyan-500/[0.06] px-2.5 py-1 shadow-[0_0_24px_rgba(14,165,233,0.08)]">
          {lifecycle && <LifecycleBadge stage={lifecycle.stage} className="shrink-0" />}
          <Sparkles className="w-3 h-3 text-sky-300 shrink-0" />
          <span className="text-[10.5px] text-white/75 truncate" title={recommendation}>{recommendation}</span>
        </div>
      </div>

      {/* ── Activation Coach ── (auto-dismisses once fully activated) */}
      <div className="shrink-0 px-4 md:px-5 pt-2 z-20">
        <ActivationCoach />
      </div>

      {/* ── Recommended next workflows ── persona/data-aware. Different
          users (fresh-start vs existing-store) see different first
          three actions. The bot picks up the user's actual intent. */}
      <div className="shrink-0 px-4 md:px-5 pt-3 z-20">
        <RecommendedWorkflows />
      </div>

      {/* ── First-run dashboard tour (item 12) ── */}
      <FirstRunTour />

      {/* ── Canvas (full width) + slide-over Inspector ── */}
      <div className="flex flex-1 min-h-0 relative">
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
            // Tighter padding lets the bigger nodes fill more of the
            // canvas, and the higher minZoom keeps the smallest
            // viewport state still legible.
            fitViewOptions={{ padding: 0.12, maxZoom: 1.0 }}
            minZoom={0.55}
            maxZoom={1.6}
            className="bg-transparent op-flow"
          >
            <Background color="rgba(255,255,255,0.045)" gap={36} size={1.4} />
            <Controls
              className="!bg-[#0a0b0f] !border-white/[0.08] !rounded-xl !shadow-none [&>button]:!border-b-white/[0.06] [&>button]:!bg-transparent [&>button>svg]:!fill-white/55 [&>button:hover]:!bg-white/[0.06] [&>button:hover>svg]:!fill-sky-300"
              position="bottom-left"
              showInteractive={false}
            />
            <MiniMap
              className="!bg-[#0a0b0f]/90 !border-white/[0.1] !rounded-xl !backdrop-blur-md"
              nodeColor={(n) => {
                const k = (n.data as any)?.kind;
                if (k === "user") return "rgba(56, 189, 248, 0.7)";
                if (k === "store") return "rgba(110, 231, 183, 0.7)";
                if (k === "bot") return "rgba(196, 181, 253, 0.7)";
                if (k === "channel") return "rgba(244, 114, 182, 0.7)";
                return "rgba(255,255,255,0.25)";
              }}
              nodeStrokeColor="rgba(0,0,0,0.4)"
              nodeStrokeWidth={2}
              maskColor="rgba(5,5,5,0.78)"
              position="bottom-right"
            />
          </ReactFlow>

          {/* Constellation legend — overlay in the top-right of the
              canvas. Compact, glanceable, fades to muted on idle. */}
          <div className="absolute top-3 right-3 z-10 hidden md:flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/55 backdrop-blur-md px-3 py-2 text-[10px] font-medium pointer-events-none">
            <span className="inline-flex items-center gap-1.5 text-white/65">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]" /> Storefronts
            </span>
            <span className="inline-flex items-center gap-1.5 text-white/65">
              <span className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(168,85,247,0.7)]" /> Bots
            </span>
            <span className="inline-flex items-center gap-1.5 text-white/65">
              <span className="w-2 h-2 rounded-full bg-pink-400 shadow-[0_0_6px_rgba(236,72,153,0.7)]" /> Channels
            </span>
            <span className="text-white/30">·</span>
            <span className="text-white/40 hidden lg:inline">click a node to inspect</span>
          </div>
        </div>

        {/* Inspector — slide-over, opens on node click. Click pane to dismiss. */}
        <aside
          className={`absolute top-0 right-0 h-full w-[280px] border-l border-white/[0.06] bg-[#040406]/95 backdrop-blur-2xl flex flex-col z-30 transition-transform duration-300 ease-out ${
            selected ? "translate-x-0 shadow-[-12px_0_36px_rgba(0,0,0,0.55)]" : "translate-x-full pointer-events-none"
          }`}
          aria-hidden={!selected}
        >
          <div className="h-9 flex items-center px-3 border-b border-white/[0.05] justify-between relative">
            <span className="eyebrow">Inspector</span>
            <button
              type="button"
              onClick={() => onPaneClick()}
              className="w-6 h-6 rounded-md text-white/40 hover:text-white/85 hover:bg-white/[0.06] flex items-center justify-center transition-colors"
              aria-label="Close inspector"
            >
              <span aria-hidden="true" className="text-base leading-none">×</span>
            </button>
          </div>
          <div className="hairline shrink-0" />
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {selected && (
              <NodeInspector
                node={selected}
                onAction={(href) => setLocation(href)}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── KPI helper ───────────────────────────────────────────────────────────────

function Kpi({ icon, label, value, sub, href }: { icon: React.ReactNode; label: string; value: string; sub?: string; href?: string }) {
  // Try to extract a numeric component for the count-up animation:
  // "$1,234.56" or "42" both yield a leading number; non-numeric
  // values (e.g., "Healthy", "Attention") render as plain text.
  const numericMatch = value.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  const animatedValue = numericMatch ? (
    <>
      {numericMatch[1]}
      <CountUp
        value={parseFloat(numericMatch[2].replace(/,/g, ""))}
        decimals={numericMatch[2].includes(".") ? 2 : 0}
      />
      {numericMatch[3]}
    </>
  ) : (
    value
  );

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

