/**
 * WorkflowBuilder.tsx — Visual drag-and-drop workflow canvas.
 *
 * Architecture:
 *  - Left panel: node palette (drag source for each step type)
 *  - Center: ReactFlow canvas (drop target, edge drawing, node selection)
 *  - Right slide-over: node config panel (edits selected node's params)
 *  - Top toolbar: workflow name, bot assignment, save, launch
 *
 * Node types: llm_analysis, api_call, approval_gate, store_action,
 *             notification, condition
 */
import {
  useCallback,
  useRef,
  useState,
  useMemo,
  useEffect,
  DragEvent,
} from "react";
import { useIsMobile } from "@/hooks/useMobile";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  BackgroundVariant,
  Panel,
  MarkerType,
  Handle,
  Position,
  getBezierPath,
  EdgeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import {
  Brain,
  Globe,
  CheckSquare,
  Store,
  Bell,
  GitBranch,
  Zap,
  Play,
  Save,
  Trash2,
  X,
  ChevronRight,
  Sparkles,
  Info,
  Loader2,
  LayoutTemplate,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// ─── Node Type Definitions ────────────────────────────────────────────────────

export type StepKind =
  | "llm_analysis"
  | "api_call"
  | "approval_gate"
  | "store_action"
  | "notification"
  | "condition";

interface StepMeta {
  kind: StepKind;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;        // tailwind text color
  border: string;       // tailwind border color
  bg: string;           // tailwind bg color
  glow: string;         // box-shadow inline style
  defaultConfig: Record<string, string>;
}

const STEP_META: Record<StepKind, StepMeta> = {
  llm_analysis: {
    kind: "llm_analysis",
    label: "LLM Analysis",
    description: "Run an AI reasoning step — research, summarize, score, or generate content.",
    icon: Brain,
    color: "text-sky-300",
    border: "border-sky-500/40",
    bg: "bg-sky-500/8",
    glow: "0 0 18px rgba(14,165,233,0.18)",
    defaultConfig: { prompt: "", outputKey: "analysis" } as Record<string, string>,
  },
  api_call: {
    kind: "api_call",
    label: "API Call",
    description: "Fetch supplier data, prices, or inventory from Printful, CJ, or a custom endpoint.",
    icon: Globe,
    color: "text-emerald-300",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/8",
    glow: "0 0 18px rgba(16,185,129,0.18)",
    defaultConfig: { endpoint: "suppliers.printful.search", query: "" } as Record<string, string>,
  },
  approval_gate: {
    kind: "approval_gate",
    label: "Approval Gate",
    description: "Pause execution and wait for your manual review before continuing.",
    icon: CheckSquare,
    color: "text-amber-300",
    border: "border-amber-500/40",
    bg: "bg-amber-500/8",
    glow: "0 0 18px rgba(245,158,11,0.18)",
    defaultConfig: { message: "Please review before continuing." } as Record<string, string>,
  },
  store_action: {
    kind: "store_action",
    label: "Store Action",
    description: "Push products, update prices, create collections, or publish pages to Shopify.",
    icon: Store,
    color: "text-violet-300",
    border: "border-violet-500/40",
    bg: "bg-violet-500/8",
    glow: "0 0 18px rgba(139,92,246,0.18)",
    defaultConfig: { action: "push_products", status: "draft" } as Record<string, string>,
  },
  notification: {
    kind: "notification",
    label: "Notification",
    description: "Send yourself an alert when a milestone is reached or a step completes.",
    icon: Bell,
    color: "text-pink-300",
    border: "border-pink-500/40",
    bg: "bg-pink-500/8",
    glow: "0 0 18px rgba(236,72,153,0.18)",
    defaultConfig: { title: "Workflow update", message: "" } as Record<string, string>,
  },
  condition: {
    kind: "condition",
    label: "Condition",
    description: "Branch the workflow based on a score, value, or boolean expression.",
    icon: GitBranch,
    color: "text-cyan-300",
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/8",
    glow: "0 0 18px rgba(6,182,212,0.18)",
    defaultConfig: { expression: "score >= 70", truePath: "continue", falsePath: "stop" } as Record<string, string>,
  },
};

const PALETTE_ORDER: StepKind[] = [
  "llm_analysis",
  "api_call",
  "approval_gate",
  "store_action",
  "notification",
  "condition",
];

// ─── Custom Node Component ────────────────────────────────────────────────────

interface WorkflowNodeData {
  kind: StepKind;
  label: string;
  config: Record<string, string>;
  selected?: boolean;
}

function WorkflowNode({ data, selected }: { data: WorkflowNodeData; selected: boolean }) {
  const meta = STEP_META[data.kind];
  const Icon = meta.icon;
  return (
    <div
      className={`relative rounded-lg border ${meta.border} ${meta.bg} px-3.5 py-3 min-w-[180px] max-w-[220px] cursor-pointer transition-all duration-200 ${
        selected ? "ring-2 ring-white/20 scale-[1.02]" : "hover:scale-[1.01]"
      }`}
      style={{ boxShadow: selected ? meta.glow : "0 2px 12px rgba(0,0,0,0.5)" }}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !border-2 !border-white/30 !bg-surface-overlay hover:!border-white/70 transition-colors"
      />

      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${meta.bg} border ${meta.border}`}>
          <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-bold uppercase tracking-wider ${meta.color} leading-tight`}>
            {meta.label}
          </p>
          <p className="text-[10px] text-white/50 mt-0.5 truncate font-mono">
            {data.label || "Untitled step"}
          </p>
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !border-2 !border-white/30 !bg-surface-overlay hover:!border-white/70 transition-colors"
      />
    </div>
  );
}

// ─── Custom Edge ──────────────────────────────────────────────────────────────

function AnimatedEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, selected,
}: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        strokeWidth={selected ? 2 : 1.5}
        stroke={selected ? "rgba(139,92,246,0.8)" : "rgba(255,255,255,0.15)"}
        fill="none"
        strokeDasharray={selected ? "none" : "none"}
        markerEnd={`url(#arrow-${id})`}
      />
      <defs>
        <marker
          id={`arrow-${id}`}
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path
            d="M0,0 L0,6 L8,3 z"
            fill={selected ? "rgba(139,92,246,0.8)" : "rgba(255,255,255,0.15)"}
          />
        </marker>
      </defs>
    </>
  );
}

const nodeTypes: NodeTypes = {
  workflowStep: WorkflowNode as any,
};

const edgeTypes = {
  animated: AnimatedEdge,
};

// ─── Templates ───────────────────────────────────────────────────────────────

type TemplateNode = { kind: StepKind; label: string; config: Record<string, string>; x: number; y: number };
type Template = { name: string; description: string; agentType: "architect" | "merchant" | "social"; nodes: TemplateNode[] };

const TEMPLATES: Template[] = [
  {
    name: "Product Drop",
    description: "Research → Source → Approve → Push",
    agentType: "architect",
    nodes: [
      { kind: "llm_analysis", label: "Niche Research", config: { prompt: "Analyze market demand and competition for this niche.", outputKey: "research" }, x: 200, y: 50 },
      { kind: "api_call", label: "Source Products", config: { endpoint: "suppliers.all.search", query: "" }, x: 200, y: 180 },
      { kind: "approval_gate", label: "Review Catalog", config: { message: "Review the sourced products before pushing to store." }, x: 200, y: 310 },
      { kind: "store_action", label: "Push to Store", config: { action: "push_products", status: "draft" }, x: 200, y: 440 },
    ],
  },
  {
    name: "Pricing Sweep",
    description: "Fetch costs → Analyze margins → Update prices",
    agentType: "merchant",
    nodes: [
      { kind: "api_call", label: "Fetch Supplier Costs", config: { endpoint: "suppliers.cj.search", query: "" }, x: 200, y: 50 },
      { kind: "llm_analysis", label: "Margin Analysis", config: { prompt: "Analyze profit margins and suggest optimal pricing.", outputKey: "pricing" }, x: 200, y: 180 },
      { kind: "store_action", label: "Update Prices", config: { action: "update_prices", status: "active" }, x: 200, y: 310 },
      { kind: "notification", label: "Pricing Complete", config: { title: "Pricing sweep done", message: "All prices have been updated." }, x: 200, y: 440 },
    ],
  },
  {
    name: "Campaign Launch",
    description: "Generate copy → Approve → Post",
    agentType: "social",
    nodes: [
      { kind: "llm_analysis", label: "Generate Copy", config: { prompt: "Write engaging social media posts for this product.", outputKey: "copy" }, x: 200, y: 50 },
      { kind: "approval_gate", label: "Review Posts", config: { message: "Review the generated social media posts before publishing." }, x: 200, y: 180 },
      { kind: "store_action", label: "Publish Posts", config: { action: "publish_social", status: "active" }, x: 200, y: 310 },
      { kind: "notification", label: "Campaign Live", config: { title: "Campaign launched", message: "Your social campaign is now live." }, x: 200, y: 440 },
    ],
  },
];

// ─── Config Panel ─────────────────────────────────────────────────────────────

function ConfigPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
}: {
  node: Node<WorkflowNodeData>;
  onUpdate: (id: string, data: Partial<WorkflowNodeData>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const meta = STEP_META[node.data.kind];
  const Icon = meta.icon;

  return (
    <div className="absolute top-0 right-0 h-full w-[300px] bg-surface-base/98 border-l border-white/[0.08] flex flex-col z-30 shadow-[-12px_0_40px_rgba(0,0,0,0.7)]">
      {/* Header */}
      <div className={`h-12 flex items-center px-4 border-b border-white/[0.08] justify-between shrink-0 ${meta.bg}`}>
        <span className={`font-mono text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 ${meta.color}`}>
          <Icon className="w-3.5 h-3.5" />
          {meta.label}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { onDelete(node.id); onClose(); }}
            className="w-7 h-7 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors"
            aria-label="Delete node"
            title="Delete node"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close node inspector"
            className="w-7 h-7 rounded text-white/60 hover:text-white/85 hover:bg-white/[0.06] flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Step label */}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">Step Name</Label>
          <Input
            value={node.data.label}
            onChange={(e) => onUpdate(node.id, { label: e.target.value })}
            className="bg-black/40 border-white/10 text-white text-xs font-mono focus:border-white/30"
            placeholder="Name this step…"
          />
        </div>

        {/* Description */}
        <div className={`rounded-md border ${meta.border} ${meta.bg} p-3`}>
          <p className="text-[10px] text-white/50 leading-relaxed font-mono">{meta.description}</p>
        </div>

        {/* Kind-specific config */}
        {node.data.kind === "llm_analysis" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">System Prompt</Label>
              <Textarea
                value={node.data.config.prompt ?? ""}
                onChange={(e) => onUpdate(node.id, { config: { ...node.data.config, prompt: e.target.value } })}
                className="bg-black/40 border-white/10 text-white text-[11px] font-mono focus:border-white/30 min-h-[100px] resize-none"
                placeholder="Describe what this LLM step should do…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">Output Key</Label>
              <Input
                value={node.data.config.outputKey ?? ""}
                onChange={(e) => onUpdate(node.id, { config: { ...node.data.config, outputKey: e.target.value } })}
                className="bg-black/40 border-white/10 text-white text-xs font-mono focus:border-white/30"
                placeholder="e.g. analysis, research, copy"
              />
            </div>
          </>
        )}

        {node.data.kind === "api_call" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">Endpoint</Label>
              <Select
                value={node.data.config.endpoint ?? "suppliers.printful.search"}
                onValueChange={(v) => onUpdate(node.id, { config: { ...node.data.config, endpoint: v } })}
              >
                <SelectTrigger className="bg-black/40 border-white/10 text-white text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-overlay border-white/10 font-mono text-xs">
                  <SelectItem value="suppliers.printful.search">Printful — Search Products</SelectItem>
                  <SelectItem value="suppliers.cj.search">CJ Dropshipping — Search Products</SelectItem>
                  <SelectItem value="suppliers.all.search">All Suppliers — Parallel Search</SelectItem>
                  <SelectItem value="shopify.products.list">Shopify — List Products</SelectItem>
                  <SelectItem value="shopify.orders.list">Shopify — List Orders</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">Query / Keyword</Label>
              <Input
                value={node.data.config.query ?? ""}
                onChange={(e) => onUpdate(node.id, { config: { ...node.data.config, query: e.target.value } })}
                className="bg-black/40 border-white/10 text-white text-xs font-mono focus:border-white/30"
                placeholder="e.g. minimalist golf apparel"
              />
            </div>
          </>
        )}

        {node.data.kind === "approval_gate" && (
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">Review Message</Label>
            <Textarea
              value={node.data.config.message ?? ""}
              onChange={(e) => onUpdate(node.id, { config: { ...node.data.config, message: e.target.value } })}
              className="bg-black/40 border-white/10 text-white text-[11px] font-mono focus:border-white/30 min-h-[80px] resize-none"
              placeholder="What should you review before approving?"
            />
          </div>
        )}

        {node.data.kind === "store_action" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">Action</Label>
              <Select
                value={node.data.config.action ?? "push_products"}
                onValueChange={(v) => onUpdate(node.id, { config: { ...node.data.config, action: v } })}
              >
                <SelectTrigger className="bg-black/40 border-white/10 text-white text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-overlay border-white/10 font-mono text-xs">
                  <SelectItem value="push_products">Push Products to Store</SelectItem>
                  <SelectItem value="update_prices">Update Product Prices</SelectItem>
                  <SelectItem value="create_collection">Create Collection</SelectItem>
                  <SelectItem value="publish_social">Publish Social Posts</SelectItem>
                  <SelectItem value="update_inventory">Update Inventory</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">Product Status</Label>
              <Select
                value={node.data.config.status ?? "draft"}
                onValueChange={(v) => onUpdate(node.id, { config: { ...node.data.config, status: v } })}
              >
                <SelectTrigger className="bg-black/40 border-white/10 text-white text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-overlay border-white/10 font-mono text-xs">
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active (Live)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {node.data.kind === "notification" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">Title</Label>
              <Input
                value={node.data.config.title ?? ""}
                onChange={(e) => onUpdate(node.id, { config: { ...node.data.config, title: e.target.value } })}
                className="bg-black/40 border-white/10 text-white text-xs font-mono focus:border-white/30"
                placeholder="Notification title…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">Message</Label>
              <Textarea
                value={node.data.config.message ?? ""}
                onChange={(e) => onUpdate(node.id, { config: { ...node.data.config, message: e.target.value } })}
                className="bg-black/40 border-white/10 text-white text-[11px] font-mono focus:border-white/30 min-h-[80px] resize-none"
                placeholder="What should the notification say?"
              />
            </div>
          </>
        )}

        {node.data.kind === "condition" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-white/60 font-mono">Expression</Label>
              <Input
                value={node.data.config.expression ?? ""}
                onChange={(e) => onUpdate(node.id, { config: { ...node.data.config, expression: e.target.value } })}
                className="bg-black/40 border-white/10 text-white text-xs font-mono focus:border-white/30"
                placeholder="e.g. score >= 70"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest text-emerald-400/60 font-mono">True Path</Label>
                <Input
                  value={node.data.config.truePath ?? "continue"}
                  onChange={(e) => onUpdate(node.id, { config: { ...node.data.config, truePath: e.target.value } })}
                  className="bg-black/40 border-emerald-500/20 text-white text-xs font-mono focus:border-emerald-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest text-red-400/60 font-mono">False Path</Label>
                <Input
                  value={node.data.config.falsePath ?? "stop"}
                  onChange={(e) => onUpdate(node.id, { config: { ...node.data.config, falsePath: e.target.value } })}
                  className="bg-black/40 border-red-500/20 text-white text-xs font-mono focus:border-red-500/40"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

let nodeIdCounter = 1;
function nextId() { return `node_${Date.now()}_${nodeIdCounter++}`; }

export default function WorkflowBuilder() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("My Workflow");
  const [agentType, setAgentType] = useState<"architect" | "merchant" | "social">("architect");
  const [showTemplates, setShowTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const { activeStoreId } = useWorkspace();
  const isMobile = useIsMobile();

  // Mobile: show graceful degradation
  if (isMobile) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl border border-violet-500/20 bg-violet-500/5 flex items-center justify-center">
          <Zap className="w-7 h-7 text-violet-400/50" />
        </div>
        <div>
          <p className="font-mono text-sm font-bold text-white/60 uppercase tracking-widest">Workflow Builder</p>
          <p className="font-mono text-[11px] text-white/30 mt-2 leading-relaxed max-w-xs">
            The drag-and-drop canvas works best on a desktop or large tablet. Open this page on a bigger screen to build workflows.
          </p>
        </div>
      </div>
    );
  }

  const launchMutation = trpc.workflows.launch.useMutation({
    onSuccess: () => {
      toast.success("Workflow launched! Track it in the Workflows tab.");
      setLaunching(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to launch workflow");
      setLaunching(false);
    },
  });

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  // ── Drag from palette ──────────────────────────────────────────────────────
  const onDragStart = (e: DragEvent, kind: StepKind) => {
    e.dataTransfer.setData("application/reactflow-kind", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("application/reactflow-kind") as StepKind;
      if (!kind || !reactFlowInstance) return;

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      const position = reactFlowInstance.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });

      const meta = STEP_META[kind];
      const id = nextId();
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: "workflowStep",
          position,
          data: {
            kind,
            label: meta.label,
            config: { ...meta.defaultConfig },
          },
        },
      ]);
      setSelectedNodeId(id);
    },
    [reactFlowInstance, setNodes]
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  // ── Edge connection ────────────────────────────────────────────────────────
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "animated",
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds
        )
      ),
    [setEdges]
  );

  // ── Node update / delete ───────────────────────────────────────────────────
  const updateNode = useCallback(
    (id: string, data: Partial<WorkflowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n
        )
      );
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges]
  );

  // Delete / Backspace key removes selected node
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        deleteNode(selectedNodeId);
        setSelectedNodeId(null);
        toast("Step deleted");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNodeId, deleteNode]);

  // ── Load template ──────────────────────────────────────────────────────────
  const loadTemplate = (tpl: typeof TEMPLATES[number]) => {
    const newNodes: Node<WorkflowNodeData>[] = tpl.nodes.map((n, i) => ({
      id: `tpl_${i}_${Date.now()}`,
      type: "workflowStep",
      position: { x: n.x, y: n.y },
      data: { kind: n.kind, label: n.label, config: { ...n.config } },
    }));
    const newEdges: Edge[] = newNodes.slice(0, -1).map((n, i) => ({
      id: `e_${i}`,
      source: n.id,
      target: newNodes[i + 1].id,
      type: "animated",
      markerEnd: { type: MarkerType.ArrowClosed },
    }));
    setNodes(newNodes);
    setEdges(newEdges);
    setWorkflowName(tpl.name);
    setAgentType(tpl.agentType);
    setShowTemplates(false);
    toast.success(`Template "${tpl.name}" loaded`);
  };

  // ── Save + Launch ──────────────────────────────────────────────────────────
  // Honest save UX: the backend draft mutation hasn't shipped yet, so we
  // persist to localStorage on this device only. The toast says exactly
  // that — operators who switch browsers/devices need to know their
  // draft will not follow them. Once the server-side draft endpoint
  // lands, swap this for the trpc.workflows.saveDraft mutation and lift
  // the warning. (Tracked in the production-readiness audit roadmap.)
  const handleSave = async () => {
    if (nodes.length === 0) { toast.error("Add at least one step before saving"); return; }
    setSaving(true);
    // Build steps from nodes in topological order (by y position as proxy)
    const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
    const steps = sorted.map((n, i) => ({
      order: i,
      type: n.data.kind,
      title: n.data.label,
      config: n.data.config,
    }));
    const draft = { name: workflowName, agentType, steps, savedAt: Date.now() };
    try {
      localStorage.setItem("workflow_builder_draft", JSON.stringify(draft));
      setSaving(false);
      toast.success("Draft saved on this device", {
        description: "Backend draft sync isn't wired yet — switch devices and you'll need to rebuild.",
      });
    } catch {
      setSaving(false);
      toast.error("Couldn't save draft — local storage may be full.");
    }
  };

  const handleLaunch = () => {
    if (nodes.length === 0) { toast.error("Add at least one step before launching"); return; }
    setLaunching(true);
    // Map the first LLM or API step's config to the workflow type
    const firstStep = [...nodes].sort((a, b) => a.position.y - b.position.y)[0];
    const workflowType = firstStep.data.kind === "api_call"
      ? "product_sourcing"
      : firstStep.data.kind === "llm_analysis"
      ? "niche_research"
      : "complete_store_buildout";

    launchMutation.mutate({
      agentType,
      workflowType,
      title: workflowName,
      scope: activeStoreId ? "specific_store" : "global",
      storeId: activeStoreId ?? undefined,
    });
  };

  const handleClear = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    toast("Canvas cleared");
  };

  return (
    <div className="flex flex-col h-full bg-surface-base overflow-hidden">
      {/* ── Top Toolbar ──────────────────────────────────────────────────── */}
      <div className="h-12 border-b border-white/[0.07] bg-surface-base/90 flex items-center px-4 gap-3 shrink-0 backdrop-blur-sm">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-6 h-6 rounded bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/60 font-bold">Workflow Builder</span>
        </div>

        <div className="h-4 w-px bg-white/[0.07]" />

        {/* Workflow name */}
        <input
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="bg-transparent border-b border-white/[0.12] text-white text-sm font-semibold focus:outline-none focus:border-violet-400/60 transition-colors w-48 pb-0.5 placeholder:text-white/30"
          placeholder="Workflow name…"
        />

        {/* Bot assignment */}
        <Select value={agentType} onValueChange={(v: any) => setAgentType(v)}>
          <SelectTrigger className="h-7 w-36 bg-white/[0.04] border-white/[0.08] text-white text-[11px] font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface-overlay border-white/10 font-mono text-xs">
            <SelectItem value="architect">Launch mode</SelectItem>
            <SelectItem value="merchant">Operator mode</SelectItem>
            <SelectItem value="social">Growth mode</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="flex items-center gap-1.5 h-7 px-3 rounded border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] text-white/60 hover:text-white text-[11px] font-mono transition-all"
        >
          <LayoutTemplate className="w-3 h-3" />
          Templates
        </button>

        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 h-7 px-3 rounded border border-white/[0.08] bg-white/[0.04] hover:bg-red-500/10 hover:border-red-500/30 text-white/60 hover:text-red-400 text-[11px] font-mono transition-all"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 h-7 px-3 rounded border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white text-[11px] font-mono transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>

        <button
          onClick={handleLaunch}
          disabled={launching || nodes.length === 0}
          className="flex items-center gap-1.5 h-7 px-4 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold font-mono transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_16px_rgba(139,92,246,0.3)]"
        >
          {launching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          Launch
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Left Palette ─────────────────────────────────────────────────── */}
        <div className="w-[200px] border-r border-white/[0.07] bg-surface-base/80 flex flex-col shrink-0 overflow-y-auto">
          <div className="px-3 pt-3 pb-2">
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 font-bold mb-2.5">Step Types</p>
            <div className="space-y-1.5">
              {PALETTE_ORDER.map((kind) => {
                const meta = STEP_META[kind];
                const Icon = meta.icon;
                return (
                  <div
                    key={kind}
                    draggable
                    onDragStart={(e) => onDragStart(e, kind)}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md border ${meta.border} ${meta.bg} cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] hover:shadow-lg select-none`}
                    style={{ boxShadow: `0 2px 8px rgba(0,0,0,0.4)` }}
                    title={meta.description}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
                    <div className="min-w-0">
                      <p className={`text-[10px] font-bold uppercase tracking-wide ${meta.color} leading-tight`}>{meta.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-auto px-3 pb-3 pt-2 border-t border-white/[0.05]">
            <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/25 font-bold mb-1.5 flex items-center gap-1">
                <Info className="w-2.5 h-2.5" /> How to use
              </p>
              <p className="text-[9px] text-white/30 leading-relaxed font-mono">
                Drag steps onto the canvas. Connect them by drawing from the bottom handle of one node to the top handle of another. Click any node to configure it.
              </p>
            </div>
          </div>
        </div>

        {/* ── Canvas ───────────────────────────────────────────────────────── */}
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{ type: "animated" }}
            style={{ background: "#050508" }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(255,255,255,0.04)"
            />
            <Controls
              className="!bg-surface-overlay !border-white/[0.08] !rounded-lg overflow-hidden"
              showInteractive={false}
            />
            <MiniMap
              className="!bg-surface-base !border-white/[0.08] !rounded-lg"
              nodeColor={(n) => {
                const meta = STEP_META[(n.data as WorkflowNodeData)?.kind];
                return meta ? meta.glow.match(/rgba\(([^)]+)\)/)?.[0]?.replace("0.18", "0.6") ?? "#333" : "#333";
              }}
              maskColor="rgba(5,5,8,0.85)"
            />

            {/* Empty state */}
            {nodes.length === 0 && (
              <Panel position="top-center" className="pointer-events-none">
                <div className="mt-20 flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-2xl border border-violet-500/20 bg-violet-500/5 flex items-center justify-center">
                    <Workflow className="w-7 h-7 text-violet-400/50" />
                  </div>
                  <div>
                    <p className="font-mono text-sm font-bold text-white/30 uppercase tracking-widest">Drop steps here</p>
                    <p className="font-mono text-[10px] text-white/20 mt-1">
                      Drag from the palette on the left, or load a template
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-white/15 font-mono text-[9px] uppercase tracking-widest">
                    <span>←</span>
                    <span>Drag a step type to start</span>
                  </div>
                </div>
              </Panel>
            )}

            {/* Node count badge */}
            {nodes.length > 0 && (
              <Panel position="bottom-left">
                <div className="flex items-center gap-2 text-[10px] font-mono text-white/30 bg-black/40 border border-white/[0.06] rounded px-2.5 py-1.5">
                  <span className="text-violet-400 font-bold">{nodes.length}</span> steps
                  <span className="text-white/15">·</span>
                  <span className="text-violet-400 font-bold">{edges.length}</span> connections
                </div>
              </Panel>
            )}
          </ReactFlow>

          {/* Templates overlay */}
          {showTemplates && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-20 flex items-center justify-center p-8">
              <div className="bg-surface-base border border-white/[0.1] rounded-xl w-full max-w-2xl shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
                  <div>
                    <h2 className="font-mono text-sm font-bold text-white uppercase tracking-widest">Starter Templates</h2>
                    <p className="font-mono text-[10px] text-white/60 mt-0.5">Load a pre-built workflow to get started fast</p>
                  </div>
                  <button
                    onClick={() => setShowTemplates(false)}
                    aria-label="Close templates panel"
                    className="w-7 h-7 rounded text-white/60 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.name}
                      onClick={() => loadTemplate(tpl)}
                      className="text-left p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-violet-500/8 hover:border-violet-500/30 transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400 group-hover:text-violet-300" />
                        <span className="font-mono text-[11px] font-bold text-white uppercase tracking-wide">{tpl.name}</span>
                      </div>
                      <p className="font-mono text-[10px] text-white/60 leading-relaxed">{tpl.description}</p>
                      <div className="mt-3 flex items-center gap-1 text-[9px] font-mono text-white/25 uppercase tracking-widest">
                        {tpl.nodes.length} steps
                        <ChevronRight className="w-2.5 h-2.5 ml-auto text-violet-400/50 group-hover:text-violet-400 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Config Panel ─────────────────────────────────────────────────── */}
        {selectedNode && (
          <ConfigPanel
            node={selectedNode}
            onUpdate={updateNode}
            onDelete={deleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}
