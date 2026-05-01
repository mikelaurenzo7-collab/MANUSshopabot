/**
 * Chat.tsx — Store Bot Workspace
 *
 * One autonomous Store Bot expert per workspace. It is positioned for new
 * store owners first, but can also operate an existing connected store and
 * handle social growth in the same conversation. Workflow results sit beside
 * the chat.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { StoreWorkflowsTab } from "@/components/StoreWorkflowsTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  Bot,
  Brain,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  Loader2,
  Megaphone,
  Package,
  Plug,
  Rocket,
  Sparkles,
  Store,
  Truck,
  Wrench,
  XCircle,
} from "lucide-react";

const GLOBAL_WORKSPACE = "all";

type WorkspaceKey = typeof GLOBAL_WORKSPACE | `store:${number}`;

const SUGGESTIONS_WITHOUT_STORE = [
  "I'm a new store owner — guide me from zero and start the first workflow",
  "Research a profitable niche and create a launch plan",
  "Build a brand identity kit for a new store",
  "Find products and suppliers for a store I can launch this week",
];

const SUGGESTIONS_WITH_STORE = [
  "Show me what's happening in this store and what to fix first",
  "Run a full store optimization sweep",
  "Create a social content plan for my best products",
  "Check workflows and summarize the latest results",
];

const WORKFLOW_TONE: Record<string, { dot: string; icon: typeof Clock; label: string }> = {
  running: { dot: "bg-amber-400 animate-pulse", icon: Loader2, label: "Running" },
  pending: { dot: "bg-amber-400 animate-pulse", icon: Clock, label: "Pending" },
  awaiting_approval: { dot: "bg-violet-400 animate-pulse", icon: Clock, label: "Needs approval" },
  completed: { dot: "bg-emerald-400", icon: CheckCircle2, label: "Completed" },
  failed: { dot: "bg-red-400", icon: XCircle, label: "Failed" },
  cancelled: { dot: "bg-white/25", icon: XCircle, label: "Cancelled" },
};

const SUPPLIER_WORKFLOW_TYPES = new Set([
  "product_sourcing",
  "supply_chain_intelligence",
  "fulfillment_automation",
  "velocity_restock_predictor",
]);

function keyForStore(storeId: number | null | undefined): WorkspaceKey {
  return storeId ? `store:${storeId}` : GLOBAL_WORKSPACE;
}

function parseStoreId(value: string): number | null {
  if (value === GLOBAL_WORKSPACE || value === "new") return null;
  const id = Number(value.replace(/^store:/, ""));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function previewJson(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}

export default function Chat() {
  const [, setLocation] = useLocation();
  const { activeStoreId, setActiveStoreId } = useWorkspace();
  const [history, setHistory] = useState<Record<WorkspaceKey, Message[]>>({ all: [] });
  const [showAside, setShowAside] = useState(false);

  const storesQuery = trpc.chat.stores.useQuery();
  const workflowsQuery = trpc.workflows.list.useQuery(
    activeStoreId ? { storeId: activeStoreId, limit: 8 } : { limit: 8 },
    { refetchInterval: 10_000 },
  );
  const credentialsQuery = trpc.connectors.listCredentials.useQuery();
  const socialAccountsQuery = trpc.connectors.listSocialAccounts.useQuery();
  const toolsQuery = trpc.tools.listConnected.useQuery();

  const stores = storesQuery.data ?? [];
  const activeStore = stores.find((s: any) => s.id === activeStoreId) ?? null;
  const workspaceKey = keyForStore(activeStore?.id ?? activeStoreId);
  const messages = history[workspaceKey] ?? [];
  const hasStores = stores.length > 0;

  useEffect(() => {
    if (!activeStoreId) return;
    setHistory((prev) => (prev[keyForStore(activeStoreId)] ? prev : { ...prev, [keyForStore(activeStoreId)]: [] }));
  }, [activeStoreId]);

  // Consume Quick Ask prefill from CommandPalette (stored in sessionStorage).
  // The delay lets React flush the initial render and register tRPC state
  // before we fire the mutation — avoids a race where the mutation fires
  // before the workspace key is stabilised.
  const PREFILL_MOUNT_DELAY_MS = 120;
  useEffect(() => {
    const prefill = sessionStorage.getItem("cp-prefill");
    if (prefill) {
      sessionStorage.removeItem("cp-prefill");
      const t = setTimeout(() => handleSend(prefill), PREFILL_MOUNT_DELAY_MS);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const workspaceLabel = activeStore
    ? `Store Bot: ${activeStore.name}`
    : hasStores
      ? "All Stores Bot"
      : "New Store Expert";

  const connectorCount = (credentialsQuery.data?.length ?? 0) + (socialAccountsQuery.data?.length ?? 0);
  const toolCount = toolsQuery.data?.length ?? 0;
  const supplierRuns = useMemo(
    () => (workflowsQuery.data ?? []).filter((w: any) => SUPPLIER_WORKFLOW_TYPES.has(w.workflowType)),
    [workflowsQuery.data],
  );

  const chatMutation = trpc.chat.message.useMutation({
    onSuccess: (data) => {
      setHistory((prev) => ({
        ...prev,
        [workspaceKey]: [
          ...(prev[workspaceKey] ?? []),
          { role: "assistant", content: data.reply },
        ],
      }));
      if (data.toolsUsed?.length) {
        void workflowsQuery.refetch();
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to get bot response");
    },
  });

  function handleWorkspaceChange(value: string) {
    const nextStoreId = parseStoreId(value);
    setActiveStoreId(nextStoreId);
    setHistory((prev) => ({ ...prev, [keyForStore(nextStoreId)]: prev[keyForStore(nextStoreId)] ?? [] }));
  }

  function handleSend(content: string) {
    const newMsg: Message = { role: "user", content };
    const updatedHistory = [...messages, newMsg];
    setHistory((prev) => ({ ...prev, [workspaceKey]: updatedHistory }));
    chatMutation.mutate({
      agentType: "store",
      messages: updatedHistory.filter(
        (m): m is { role: "user" | "assistant"; content: string } =>
          m.role === "user" || m.role === "assistant",
      ),
      storeId: activeStore?.id ?? activeStoreId ?? undefined,
    });
  }

  return (
    <div className="page-enter flex h-full min-h-0 flex-col bg-terminal-bg/70">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-white/[0.06] relative overflow-hidden">
        {/* Ambient gradient behind header */}
        <div className="absolute inset-0 bg-gradient-to-r from-sky-500/[0.06] via-transparent to-cyan-500/[0.04] pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/50 to-transparent pointer-events-none" />

        <div className="relative px-3 py-3 sm:px-4 md:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex items-center gap-3">
              {/* Bot avatar */}
              <div className="shrink-0 w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center shadow-[0_0_16px_rgba(14,165,233,0.2)]">
                <Sparkles className="h-4.5 w-4.5 text-sky-300" />
              </div>
              <div className="min-w-0">
                <p className="micro-label mb-0.5">Store workspace</p>
                <h1 className="flex items-center gap-2 text-base sm:text-lg font-heading font-bold tracking-tight text-foreground">
                  <span className="truncate">{workspaceLabel}</span>
                  {/* Live indicator */}
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-300 shrink-0">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                </h1>
                <p className="mt-0.5 max-w-3xl text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                  One autonomous Store Bot expert for launch, operations, social growth, workflows, memory, connectors, tools, and suppliers.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row w-full lg:w-auto items-stretch sm:items-center gap-2">
              <Select value={activeStore ? `store:${activeStore.id}` : GLOBAL_WORKSPACE} onValueChange={handleWorkspaceChange}>
                <SelectTrigger className="h-9 w-full sm:w-56 border-white/10 bg-white/[0.04] text-sm">
                  <Store className="mr-1.5 h-3.5 w-3.5 shrink-0 text-white/60" />
                  <SelectValue placeholder="Choose workspace" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-surface-overlay">
                  <SelectItem value={GLOBAL_WORKSPACE}>{hasStores ? "All stores" : "New store launch"}</SelectItem>
                  {stores.map((s: any) => (
                    <SelectItem key={s.id} value={`store:${s.id}`}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full sm:w-auto border-sky-500/25 bg-sky-500/[0.08] text-sky-200 hover:bg-sky-500/20 hover:border-sky-500/40 hover:shadow-[0_0_16px_rgba(14,165,233,0.15)] transition-all whitespace-nowrap"
                onClick={() => setLocation("/storefronts#integrations")}
              >
                <Plug className="mr-1.5 h-3.5 w-3.5" />
                <span className="truncate">{hasStores ? "Connect store" : "Create/connect store"}</span>
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {/* Horizontally scrollable badge bar — prevents wrapping on narrow screens */}
            <div className="flex-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-0.5">
              <WorkspaceBadge icon={Bot} label="Unified bot" value="Launch · Operator · Growth" />
              <WorkspaceBadge icon={Brain} label="Memory" value={activeStore ? activeStore.name : "workspace scoped"} />
              <WorkspaceBadge icon={Plug} label="Connectors" value={String(connectorCount)} />
              <WorkspaceBadge icon={Wrench} label="Tools" value={String(toolCount)} />
              <WorkspaceBadge icon={Truck} label="Supplier runs" value={String(supplierRuns.length)} />
            </div>
            {/* Mobile-only toggle for the results panel (opens as bottom sheet) */}
            <button
              type="button"
              onClick={() => setShowAside((v) => !v)}
              className="xl:hidden shrink-0 flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-white/55 hover:text-white/80 hover:bg-white/[0.06] transition-all"
              aria-label={showAside ? "Hide results panel" : "Show results panel"}
            >
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="hidden xs:inline">{showAside ? "Hide" : "Results"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Chat panel — always visible; never hidden behind the results panel on mobile */}
        <div className="min-h-0 p-3 sm:p-4 md:p-5">
          <AIChatBox
            messages={messages}
            onSendMessage={handleSend}
            isLoading={chatMutation.isPending}
            placeholder={activeStore ? `Ask the ${activeStore.name} Store Bot to build, operate, market, or inspect results…` : "Ask the Store Bot to start from zero, create Shopify launch steps, research a niche, or build a store…"}
            suggestedPrompts={messages.length === 0 ? (activeStore ? SUGGESTIONS_WITH_STORE : SUGGESTIONS_WITHOUT_STORE) : undefined}
            className="h-full"
            height="100%"
            emptyStateMessage={`${workspaceLabel} is ready.`}
            botType="store"
          />
        </div>

        {/* Results panel — persistent aside on xl+, hidden on smaller screens */}
        <aside className="min-h-0 overflow-y-auto border-t border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent p-3 sm:p-4 xl:border-l xl:border-t-0 md:p-5 custom-scrollbar hidden xl:block">
          <ResultsPanel
            workflowsQuery={workflowsQuery}
            activeStore={activeStore}
            hasStores={hasStores}
            connectorCount={connectorCount}
            toolCount={toolCount}
            stores={stores}
            socialAccountsQuery={socialAccountsQuery}
            credentialsQuery={credentialsQuery}
            supplierRuns={supplierRuns}
            setLocation={setLocation}
          />
        </aside>
      </div>

      {/* ── Mobile results bottom sheet ───────────────────────────────────────
           On smaller screens the aside is a slide-up Sheet so the chat stays
           fully visible and users can dismiss results with a swipe or tap.     */}
      <Sheet open={showAside} onOpenChange={setShowAside}>
        <SheetContent
          side="bottom"
          className="xl:hidden h-[72vh] rounded-t-2xl border-t border-white/[0.08] bg-surface-overlay backdrop-blur-2xl p-0"
        >
          {/* Handle affordance */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/[0.15]" />
          </div>
          <div className="overflow-y-auto h-full custom-scrollbar px-4 pb-6 space-y-4">
            <ResultsPanel
              workflowsQuery={workflowsQuery}
              activeStore={activeStore}
              hasStores={hasStores}
              connectorCount={connectorCount}
              toolCount={toolCount}
              stores={stores}
              socialAccountsQuery={socialAccountsQuery}
              credentialsQuery={credentialsQuery}
              supplierRuns={supplierRuns}
              setLocation={setLocation}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function WorkspaceBadge({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: string }) {
  return (
    <Badge className="border border-sky-500/[0.15] bg-sky-500/[0.06] px-2 sm:px-2.5 py-1 text-[10px] text-white/60 shrink-0 hover:border-sky-500/30 hover:bg-sky-500/[0.10] transition-colors">
      <Icon className="mr-1 sm:mr-1.5 h-3 w-3 text-sky-300 shrink-0" />
      <span className="mr-1 text-white/35 hidden sm:inline">{label}</span>
      <span className="font-bold text-white/80 truncate max-w-[120px] sm:max-w-none">{value}</span>
    </Badge>
  );
}

function Panel({ title, icon: Icon, children, actionLabel, onAction }: { title: string; icon: typeof Bot; children: React.ReactNode; actionLabel?: string; onAction?: () => void }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md bg-sky-500/[0.08] border border-sky-500/[0.15] flex items-center justify-center">
            <Icon className="h-3 w-3 text-sky-300" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">{title}</span>
        </div>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction} className="flex items-center gap-1 text-[10px] text-white/30 transition-colors hover:text-sky-300 hover:underline underline-offset-2">
            {actionLabel} <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

const WF_STATUS_STYLES: Record<string, { barColor: string; bg: string; border: string; textColor: string }> = {
  running:           { barColor: "bg-sky-400",     bg: "bg-sky-500/[0.05]",     border: "border-sky-500/[0.18]",   textColor: "text-sky-300" },
  completed:         { barColor: "bg-emerald-400", bg: "bg-emerald-500/[0.04]", border: "border-emerald-500/[0.14]", textColor: "text-emerald-300" },
  failed:            { barColor: "bg-red-400",     bg: "bg-red-500/[0.04]",     border: "border-red-500/[0.14]",   textColor: "text-red-300" },
  pending:           { barColor: "bg-amber-400",   bg: "bg-amber-500/[0.04]",   border: "border-amber-500/[0.14]", textColor: "text-amber-300" },
  awaiting_approval: { barColor: "bg-amber-400",   bg: "bg-amber-500/[0.04]",   border: "border-amber-500/[0.14]", textColor: "text-amber-300" },
  cancelled:         { barColor: "bg-white/20",    bg: "bg-white/[0.01]",       border: "border-white/[0.06]",     textColor: "text-white/30" },
};

function WorkflowCard({ workflow }: { workflow: any }) {
  const tone = WORKFLOW_TONE[workflow.status] ?? WORKFLOW_TONE.cancelled;
  const style = WF_STATUS_STYLES[workflow.status] ?? WF_STATUS_STYLES.cancelled;
  const Icon = tone.icon;
  const output = previewJson(workflow.output);

  return (
    <div className={`relative rounded-xl border ${style.border} ${style.bg} p-3 transition-all hover:brightness-110 overflow-hidden`}>
      {/* Top accent line for running workflows */}
      {workflow.status === "running" && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />
      )}
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-white/90">{workflow.title}</p>
          <div className={`mt-1 flex items-center gap-2 text-[9px] uppercase tracking-widest ${style.textColor}`}>
            <Icon className={`h-3 w-3 ${workflow.status === "running" ? "animate-spin" : ""}`} />
            {tone.label}
            <span className="text-white/20">·</span>
            <span className="text-white/30">{workflow.workflowType?.replace(/_/g, " ")}</span>
          </div>
          {workflow.status === "completed" && output && (
            <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap rounded-lg border border-emerald-500/10 bg-emerald-500/[0.035] p-2 text-[10px] leading-relaxed text-emerald-100/65">
              {output.length > 360 ? `${output.slice(0, 360)}…` : output}
            </pre>
          )}
          {workflow.error && (
            <p className="mt-2 rounded-lg border border-red-500/15 bg-red-500/[0.04] p-2 text-[10px] text-red-200/70">
              {workflow.error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const MINI_STAT_ACCENTS: Record<string, { bg: string; border: string; icon: string; value: string }> = {
  sky:    { bg: "bg-sky-500/[0.06]",    border: "border-sky-500/[0.15]",    icon: "text-sky-300",    value: "text-sky-200" },
  cyan:   { bg: "bg-cyan-500/[0.06]",   border: "border-cyan-500/[0.15]",   icon: "text-cyan-300",   value: "text-cyan-200" },
  orange: { bg: "bg-orange-500/[0.06]", border: "border-orange-500/[0.15]", icon: "text-orange-300", value: "text-orange-200" },
  violet: { bg: "bg-violet-500/[0.06]", border: "border-violet-500/[0.15]", icon: "text-violet-300", value: "text-violet-200" },
};

function MiniStat({ icon: Icon, label, value, accent = "sky" }: { icon: typeof Bot; label: string; value: string; accent?: string }) {
  const a = MINI_STAT_ACCENTS[accent] ?? MINI_STAT_ACCENTS.sky;
  const hasData = Number(value) > 0;
  return (
    <div className={`rounded-xl border ${hasData ? a.border : "border-white/[0.06]"} ${hasData ? a.bg : "bg-white/[0.02]"} p-2.5 sm:p-3 min-w-0 transition-all`}>
      <Icon className={`h-3.5 w-3.5 ${hasData ? a.icon : "text-white/25"}`} />
      <p className="mt-1.5 sm:mt-2 text-[9px] uppercase tracking-widest text-white/35 truncate">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${hasData ? a.value : "text-white/60"} truncate`}>{value}</p>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-sky-500/[0.12] bg-sky-500/[0.03] p-3 text-[11px] text-sky-300/60">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
      Loading workflows…
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-white/[0.07] bg-white/[0.01] p-3.5 text-[10px] leading-relaxed text-white/30 italic">{text}</p>;
}

// ── ResultsPanel ──────────────────────────────────────────────────────────────
// Extracted so it can be rendered both in the xl+ aside column and in the
// mobile bottom Sheet without duplicating JSX.

interface ResultsPanelProps {
  workflowsQuery: any;
  activeStore: any;
  hasStores: boolean;
  connectorCount: number;
  toolCount: number;
  stores: any[];
  socialAccountsQuery: any;
  credentialsQuery: any;
  supplierRuns: any[];
  setLocation: (path: string) => void;
}

function ResultsPanel({
  workflowsQuery,
  activeStore,
  hasStores,
  toolCount,
  stores,
  socialAccountsQuery,
  credentialsQuery,
  supplierRuns,
  setLocation,
}: ResultsPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-sky-500/[0.08] border border-sky-500/[0.15] flex items-center justify-center">
              <GitBranch className="h-3 w-3 text-sky-300" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Workflows</span>
          </div>
        </div>
        <StoreWorkflowsTab storeId={activeStore?.id ?? null} storeName={activeStore?.name} />
      </div>

      <Panel title="Memory" icon={Brain}>
        <div className="rounded-xl border border-sky-500/[0.12] bg-gradient-to-br from-sky-500/[0.06] to-transparent p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            <p className="text-[11px] font-bold text-sky-200 break-words">
              {activeStore ? activeStore.name : hasStores ? "Cross-store workspace" : "Launch workspace"}
            </p>
          </div>
          <p className="text-[10px] leading-relaxed text-white/60">
            Conversation history stays separated by workspace in this session, so each connected store gets its own specialized bot context.
          </p>
        </div>
      </Panel>

      <Panel title="Connectors & tools" icon={Plug} actionLabel="Manage" onAction={() => setLocation("/storefronts")}>
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <MiniStat icon={Store} label="Stores" value={String(stores.length)} accent="sky" />
          <MiniStat icon={Megaphone} label="Social" value={String(socialAccountsQuery.data?.length ?? 0)} accent="orange" />
          <MiniStat icon={Plug} label="Credentials" value={String(credentialsQuery.data?.length ?? 0)} accent="cyan" />
          <MiniStat icon={Wrench} label="Tools" value={String(toolCount)} accent="violet" />
        </div>
        {stores.length > 0 && (
          <div className="mt-2 space-y-1">
            {stores.slice(0, 3).map((s: any) => (
              <div key={s.id} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/[0.12] bg-emerald-500/[0.05] px-2.5 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[10px] font-medium text-emerald-200/80 truncate">{s.name}</span>
                <span className="ml-auto text-[9px] text-white/30 uppercase tracking-widest shrink-0">{s.platform ?? "store"}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Suppliers" icon={Package} actionLabel="Supplier POs" onAction={() => setLocation("/storefronts#supplier")}>
        {supplierRuns.length === 0 ? (
          <EmptyLine text="Ask the Store Bot to source products or audit fulfillment to populate supplier work." />
        ) : (
          <div className="space-y-2">
            {supplierRuns.slice(0, 3).map((wf: any) => (
              <div key={wf.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                <p className="truncate text-[11px] font-semibold text-white/75">{wf.title}</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-widest text-white/30">{wf.status}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
