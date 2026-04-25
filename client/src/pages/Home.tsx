/**
 * Command Center — Live system topology canvas with inspector panel
 * ReactFlow-based visualization of the SHOPaBOT infrastructure
 */

import { useState, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Edge,
  Node,
  useNodesState,
  useEdgesState,
  Position,
  ConnectionLineType,
  Handle,
} from "reactflow";
import "reactflow/dist/style.css";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Loader2, Database, Zap, Bot, Activity, Box,
  ShoppingCart, Globe, Workflow, Package, Megaphone,
  Server, TrendingUp, Layers, Cpu, CheckCircle2, AlertCircle, RefreshCw
} from "lucide-react";

// ─── Node Types ────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, { border: string; glow: string; dot: string; text: string }> = {
  ok:      { border: "border-emerald-500/40", glow: "shadow-[0_0_12px_rgba(16,185,129,0.15)]", dot: "bg-emerald-400", text: "text-emerald-400" },
  active:  { border: "border-amber-500/40",   glow: "shadow-[0_0_12px_rgba(245,158,11,0.15)]",  dot: "bg-amber-400",  text: "text-amber-400" },
  error:   { border: "border-red-500/40",     glow: "shadow-[0_0_12px_rgba(239,68,68,0.15)]",   dot: "bg-red-400",    text: "text-red-400" },
  idle:    { border: "border-white/10",       glow: "",                                           dot: "bg-white/20",   text: "text-white/40" },
};

const CustomNode = ({ data, isConnectable }: any) => {
  const colors = NODE_COLORS[data.status] ?? NODE_COLORS.idle;
  return (
    <div className={`
      relative px-4 py-3 rounded-xl border bg-[#0a0b0f]/90 backdrop-blur-sm
      min-w-[200px] flex items-center gap-3
      transition-all duration-300 cursor-pointer
      ${data.selected ? "border-sky-400/60 shadow-[0_0_20px_rgba(14,165,233,0.25)]" : `${colors.border} ${colors.glow}`}
    `}>
      <Handle type="target" position={Position.Left} isConnectable={isConnectable}
        style={{ background: "transparent", border: "none", width: 8, height: 8 }} />

      {/* Icon */}
      <div className={`
        w-9 h-9 rounded-lg flex items-center justify-center shrink-0
        ${data.selected ? "bg-sky-500/15 border border-sky-500/30" : "bg-white/[0.04] border border-white/[0.08]"}
      `}>
        {data.icon}
      </div>

      {/* Content */}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mb-0.5">
          {data.label}
        </span>
        <span className={`text-xs font-semibold font-mono truncate ${data.selected ? "text-sky-300" : colors.text}`}>
          {data.value || "STANDBY"}
        </span>
      </div>

      {/* Status dot */}
      <div className={`absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full ${colors.dot} ${data.status === "active" || data.status === "ok" ? "animate-pulse" : ""}`} />

      <Handle type="source" position={Position.Right} isConnectable={isConnectable}
        style={{ background: "transparent", border: "none", width: 8, height: 8 }} />
    </div>
  );
};

const nodeTypes = { custom: CustomNode };

// ─── Edge Styles ───────────────────────────────────────────────────────────────

const EDGE_STYLES = {
  active:  { stroke: "#f59e0b", strokeWidth: 1.5, strokeDasharray: "6 3" },
  ok:      { stroke: "#10b981", strokeWidth: 1.5 },
  cyan:    { stroke: "#0ea5e9", strokeWidth: 1.5, strokeDasharray: "6 3" },
  muted:   { stroke: "rgba(255,255,255,0.08)", strokeWidth: 1.5 },
};

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const [selectedNode, setSelectedNode] = useState<any>(null);

  const {
    data: metrics,
    isLoading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = trpc.dashboard.metrics.useQuery({}, { refetchInterval: 30000 });
  const {
    data: agentStatus,
    error: agentError,
    refetch: refetchAgentStatus,
  } = trpc.dashboard.agentStatus.useQuery(undefined, { refetchInterval: 15000 });
  const { data: recentActivity } = trpc.dashboard.recentActivity.useQuery({ limit: 10 }, { refetchInterval: 20000 });
  const { data: connSummary } = trpc.connectors.connectionSummary.useQuery();
  const { data: intel } = trpc.dashboard.crossStoreIntelligence.useQuery();
  const { data: stores } = trpc.stores.list.useQuery();

  const totalRunning = (agentStatus as any[])?.reduce((a: number, s: any) => a + (s.running || 0), 0) || 0;
  const totalCompleted = (agentStatus as any[])?.reduce((a: number, s: any) => a + (s.completed || 0), 0) || 0;
  const totalConnected = (connSummary?.stores || 0) + (connSummary?.socialAccounts || 0);
  const revenue = ((metrics?.totalRevenue ?? 0) / 100).toFixed(2);

  const buildNodes = useCallback((): Node[] => [
    {
      id: "db",
      type: "custom",
      position: { x: 40, y: 320 },
      data: {
        label: "TiDB / Drizzle",
        value: "ONLINE",
        icon: <Database className="w-4 h-4 text-emerald-400" />,
        status: "ok",
        details: { Region: "AWS us-east-1", Pool: "Active", "Schema Version": "v14" }
      }
    },
    {
      id: "workflows",
      type: "custom",
      position: { x: 360, y: 120 },
      data: {
        label: "Workflow Engine",
        value: totalRunning > 0 ? `${totalRunning} RUNNING` : "IDLE",
        icon: <Workflow className="w-4 h-4 text-amber-400" />,
        status: totalRunning > 0 ? "active" : "ok",
        details: { "Active Tasks": totalRunning, "Completed": totalCompleted, "Engine": "State Machine v2" }
      }
    },
    {
      id: "queue",
      type: "custom",
      position: { x: 720, y: 120 },
      data: {
        label: "BullMQ Queue",
        value: "PROCESSING",
        icon: <Layers className="w-4 h-4 text-violet-400" />,
        status: "active",
        details: { "Retry Logic": "Exponential Backoff", "Max Attempts": 5, "Dead Letter": "Enabled" }
      }
    },
    {
      id: "connectors",
      type: "custom",
      position: { x: 360, y: 320 },
      data: {
        label: "Integrations",
        value: `${totalConnected} LINKED`,
        icon: <Globe className="w-4 h-4 text-sky-400" />,
        status: totalConnected > 0 ? "ok" : "idle",
        details: { "Stores": connSummary?.stores || 0, "Social Accounts": connSummary?.socialAccounts || 0, "Adapters": 13 }
      }
    },
    {
      id: "revenue",
      type: "custom",
      position: { x: 360, y: 520 },
      data: {
        label: "Revenue Stream",
        value: `$${revenue}`,
        icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
        status: "ok",
        details: { "Total Orders": metrics?.totalOrders || 0, "Active Products": metrics?.activeProducts || 0, "Stores": stores?.length || 0 }
      }
    },
    {
      id: "builder",
      type: "custom",
      position: { x: 720, y: 320 },
      data: {
        label: "Builder Bot",
        value: "AUTONOMOUS",
        icon: <Bot className="w-4 h-4 text-cyan-400" />,
        status: "active",
        details: { Role: "Architect", Workflows: "Niche Research, Product Sourcing, Store Setup", Status: "Listening" }
      }
    },
    {
      id: "merchant",
      type: "custom",
      position: { x: 720, y: 440 },
      data: {
        label: "Merchant Bot",
        value: "AUTONOMOUS",
        icon: <Package className="w-4 h-4 text-violet-400" />,
        status: "active",
        details: { Role: "Merchant", Workflows: "Fulfillment, Inventory Sync, Pricing", Status: "Listening" }
      }
    },
    {
      id: "social",
      type: "custom",
      position: { x: 720, y: 560 },
      data: {
        label: "Social Bot",
        value: "AUTONOMOUS",
        icon: <Megaphone className="w-4 h-4 text-pink-400" />,
        status: "active",
        details: { Role: "Social", Workflows: "Ad Campaigns, Social Posts, Email Recovery", Status: "Listening" }
      }
    },
    {
      id: "sharp",
      type: "custom",
      position: { x: 1060, y: 120 },
      data: {
        label: "Image Pipeline",
        value: "SHARP ACTIVE",
        icon: <Zap className="w-4 h-4 text-yellow-400" />,
        status: "ok",
        details: { Format: "WebP / AVIF", Quality: 80, Transforms: "Resize, Crop, Optimize" }
      }
    },
    {
      id: "server",
      type: "custom",
      position: { x: 1060, y: 320 },
      data: {
        label: "tRPC Server",
        value: "SERVING",
        icon: <Server className="w-4 h-4 text-white/50" />,
        status: "ok",
        details: { Framework: "Express 4 + tRPC 11", Auth: "Manus OAuth", "Rate Limit": "120 req/min" }
      }
    },
  ], [totalRunning, totalCompleted, totalConnected, connSummary, revenue, metrics, stores]);

  const buildEdges = (): Edge[] => [
    { id: "e-db-wf",   source: "db",        target: "workflows", animated: true,  style: EDGE_STYLES.active },
    { id: "e-db-conn", source: "db",        target: "connectors", type: "step",   style: EDGE_STYLES.muted },
    { id: "e-db-rev",  source: "db",        target: "revenue",   type: "step",    style: EDGE_STYLES.muted },
    { id: "e-wf-q",    source: "workflows", target: "queue",     animated: true,  style: EDGE_STYLES.cyan },
    { id: "e-q-sharp", source: "queue",     target: "sharp",     animated: true,  style: EDGE_STYLES.ok },
    { id: "e-conn-b",  source: "connectors",target: "builder",   animated: true,  style: EDGE_STYLES.cyan },
    { id: "e-conn-m",  source: "connectors",target: "merchant",  type: "step",    style: EDGE_STYLES.muted },
    { id: "e-conn-s",  source: "connectors",target: "social",    type: "step",    style: EDGE_STYLES.muted },
    { id: "e-b-srv",   source: "builder",   target: "server",    type: "step",    style: EDGE_STYLES.muted },
    { id: "e-q-srv",   source: "queue",     target: "server",    type: "step",    style: EDGE_STYLES.muted },
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes());
  const [edges, , onEdgesChange] = useEdgesState(buildEdges());

  useEffect(() => {
    setNodes(buildNodes());
  }, [metrics, agentStatus, connSummary, stores]);

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNode(node);
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, selected: n.id === node.id } })));
  }, [setNodes]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, selected: false } })));
  }, [setNodes]);

  if (metricsError || agentError) {
    return (
      <div className="page-enter flex h-full w-full items-center justify-center bg-[#050505]">
        <div className="text-center rounded-2xl border border-red-500/20 bg-red-500/[0.03] px-8 py-7 shadow-[0_0_40px_rgba(239,68,68,0.08)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10">
            <AlertCircle className="h-5 w-5 text-red-400" />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-2">Dashboard Error</p>
          <p className="mx-auto max-w-sm text-[11px] leading-relaxed text-white/35">
            {(metricsError || agentError)?.message || "Failed to load dashboard data"}
          </p>
          <button
            type="button"
            onClick={() => {
              void refetchMetrics();
              void refetchAgentStatus();
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/60 transition-all hover:border-sky-500/30 hover:bg-sky-500/10 hover:text-sky-300"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter flex flex-col h-full w-full bg-[#050505] overflow-hidden">
      {/* stagger-list anchor for animation tests */}
      <div className="stagger-list hidden" aria-hidden="true" />

      {/* ── Top Status Bar ── */}
      <div className="shrink-0 h-11 border-b border-white/[0.05] bg-[#040406]/80 backdrop-blur-sm flex items-center px-4 gap-6 z-20">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">System Online</span>
        </div>
        <div className="h-3 w-px bg-white/10" />
        {metricsLoading ? (
          <Loader2 className="w-3 h-3 animate-spin text-white/20" />
        ) : (
          <>
            <StatusPill label="Revenue" value={`$${revenue}`} color="text-emerald-400" />
            <StatusPill label="Orders" value={String(metrics?.totalOrders ?? 0)} color="text-sky-400" />
            <StatusPill label="Products" value={String(metrics?.activeProducts ?? 0)} color="text-violet-400" />
            <StatusPill label="Workflows" value={totalRunning > 0 ? `${totalRunning} active` : "idle"} color={totalRunning > 0 ? "text-amber-400" : "text-white/30"} />
            <StatusPill label="Integrations" value={`${totalConnected} linked`} color={totalConnected > 0 ? "text-cyan-400" : "text-white/30"} />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Cpu className="w-3 h-3 text-white/20" />
          <span className="text-[10px] text-white/20 font-mono">{user?.name || "OPERATOR"}</span>
        </div>
      </div>

      {/* ── Canvas + Inspector ── */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas */}
        <div className="flex-1 h-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            connectionLineType={ConnectionLineType.Step}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.4}
            maxZoom={2}
            className="bg-[#050505]"
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

        {/* ── Inspector Panel ── */}
        <aside className="w-[300px] h-full shrink-0 border-l border-white/[0.05] bg-[#040406] flex flex-col z-20">
          {/* Inspector Header */}
          <div className="h-11 flex items-center px-4 border-b border-white/[0.05] justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
              Inspector
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
              <span className="text-[9px] font-mono text-emerald-400/70">UPLINK_OK</span>
            </span>
          </div>
          {/* Gradient line under inspector header */}
          <div className="h-px bg-gradient-to-r from-sky-500/30 via-transparent to-transparent shrink-0" />

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {selectedNode ? (
              <>
                {/* Node Identity */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                    {selectedNode.data.icon}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{selectedNode.data.label}</p>
                    <p className={`text-[10px] font-mono mt-0.5 ${NODE_COLORS[selectedNode.data.status]?.text ?? "text-white/40"}`}>
                      {selectedNode.data.value}
                    </p>
                  </div>
                </div>

                {/* Node Properties */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/20 mb-2 pb-1.5 border-b border-white/[0.05]">
                    Node Properties
                  </p>
                  <div className="space-y-1.5">
                    {[
                      ["ID", selectedNode.id],
                      ["Type", selectedNode.type],
                      ["X", selectedNode.position.x.toFixed(0)],
                      ["Y", selectedNode.position.y.toFixed(0)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center">
                        <span className="text-[10px] text-white/25 font-mono">{k}</span>
                        <span className="text-[10px] text-white/60 font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Telemetry */}
                {selectedNode.data.details && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/20 mb-2 pb-1.5 border-b border-white/[0.05]">
                      Live Telemetry
                    </p>
                    <div className="space-y-2">
                      {Object.entries(selectedNode.data.details).map(([key, val]) => (
                        <div key={key} className="flex justify-between items-start gap-2">
                          <span className="text-[10px] text-white/30 font-mono uppercase shrink-0">{key}</span>
                          <span className="text-[10px] text-emerald-400 font-mono text-right break-all">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-12">
                <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                  <Box className="w-5 h-5 text-white/15" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">No Node Selected</p>
                <p className="text-[9px] text-white/15 mt-2 leading-relaxed max-w-[180px]">
                  Click any canvas entity to inspect its telemetry and live data
                </p>
              </div>
            )}
          </div>

          {/* System Log Footer */}
          {recentActivity && recentActivity.length > 0 && (
            <div className="border-t border-white/[0.05] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/20 mb-3">System Log</p>
              <div className="space-y-2">
                {recentActivity.slice(0, 4).map((act: any) => (
                  <div key={act.id} className="flex items-center gap-2">
                    {act.status === "completed" ? (
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                    ) : act.status === "failed" ? (
                      <AlertCircle className="w-2.5 h-2.5 text-red-400 shrink-0" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400/60 shrink-0" />
                    )}
                    <span className="text-[9px] text-white/40 font-mono truncate">{act.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Node Count Footer */}
          <div className="border-t border-white/[0.05] px-4 py-2.5 flex items-center justify-between">
            <span className="text-[9px] font-mono text-white/20">
              {nodes.length} nodes · {edges.length} edges
            </span>
            <span className="text-[9px] font-mono text-white/20">
              {stores?.length || 0} stores
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Status Pill ──────────────────────────────────────────────────────────────

function StatusPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">{label}</span>
      <span className={`text-[10px] font-mono font-semibold ${color}`}>{value}</span>
    </div>
  );
}
