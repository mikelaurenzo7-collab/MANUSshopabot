/**
 * Chat.tsx — Store Bot Workspace
 *
 * One all-encompassing bot per store workspace. The bot can start a store
 * from zero, operate an existing store, and handle social growth in the same
 * conversation while surfacing workflow results beside the chat.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  "I don't have a Shopify store yet — guide me from zero and start the first workflow",
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

  const workspaceLabel = activeStore
    ? `${activeStore.name} Store Bot`
    : hasStores
      ? "All Stores Bot"
      : "New Store Launch Bot";

  const connectorCount = (credentialsQuery.data?.length ?? 0) + (socialAccountsQuery.data?.length ?? 0);
  const toolCount = toolsQuery.data?.length ?? 0;
  const supplierRuns = useMemo(
    () => (workflowsQuery.data ?? []).filter((w: any) => /supplier|sourcing|purchase|fulfillment/i.test(`${w.workflowType} ${w.title}`)),
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
    <div className="page-enter flex h-full min-h-0 flex-col bg-[#050505]/70">
      <div className="shrink-0 border-b border-white/[0.06] bg-gradient-to-r from-[#040406]/90 via-[#06070a]/80 to-[#040406]/90 px-4 py-3 md:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="micro-label mb-1">Store workspace</p>
            <h1 className="flex items-center gap-2 text-lg font-heading font-bold tracking-tight text-foreground">
              <Sparkles className="h-4 w-4 text-sky-400" />
              {workspaceLabel}
            </h1>
            <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
              One bot for launch, operations, social growth, workflows, memory, connectors, tools, and suppliers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={activeStore ? `store:${activeStore.id}` : GLOBAL_WORKSPACE} onValueChange={handleWorkspaceChange}>
              <SelectTrigger className="h-9 w-56 border-white/10 bg-white/[0.04] text-sm">
                <Store className="mr-1.5 h-3.5 w-3.5 shrink-0 text-white/40" />
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
              className="h-9 border-sky-500/25 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
              onClick={() => setLocation("/storefronts#integrations")}
            >
              <Plug className="mr-1.5 h-3.5 w-3.5" />
              {hasStores ? "Connect store" : "Create/connect store"}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <WorkspaceBadge icon={Bot} label="Unified bot" value="Builder + operator + social" />
          <WorkspaceBadge icon={Brain} label="Memory" value={activeStore ? activeStore.name : "workspace scoped"} />
          <WorkspaceBadge icon={Plug} label="Connectors" value={String(connectorCount)} />
          <WorkspaceBadge icon={Wrench} label="Tools" value={String(toolCount)} />
          <WorkspaceBadge icon={Truck} label="Supplier runs" value={String(supplierRuns.length)} />
        </div>
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-0 p-4 md:p-5">
          <AIChatBox
            messages={messages}
            onSendMessage={handleSend}
            isLoading={chatMutation.isPending}
            placeholder={activeStore ? `Ask the ${activeStore.name} Store Bot to build, operate, market, or inspect results…` : "Ask the Store Bot to start from zero, create Shopify launch steps, research a niche, or build a store…"}
            suggestedPrompts={messages.length === 0 ? (activeStore ? SUGGESTIONS_WITH_STORE : SUGGESTIONS_WITHOUT_STORE) : undefined}
            className="h-full border-white/10 bg-white/[0.02]"
            height="100%"
            emptyStateMessage={`${workspaceLabel} is ready.`}
            botType="store"
          />
        </div>

        <aside className="min-h-0 overflow-y-auto border-t border-white/[0.06] bg-white/[0.015] p-4 xl:border-l xl:border-t-0 md:p-5 custom-scrollbar">
          <div className="space-y-4">
            <Panel title="Workflow results" icon={GitBranch} actionLabel="All workflows" onAction={() => setLocation("/workflows")}>
              {workflowsQuery.isLoading ? (
                <LoadingRow />
              ) : (workflowsQuery.data?.length ?? 0) === 0 ? (
                <EmptyLine text="Workflow outputs will appear here as soon as the Store Bot runs something." />
              ) : (
                <div className="space-y-2">
                  {workflowsQuery.data?.map((wf: any) => <WorkflowCard key={wf.id} workflow={wf} />)}
                </div>
              )}
            </Panel>

            <Panel title="Memory" icon={Brain}>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                <p className="text-[11px] font-semibold text-white/75">
                  {activeStore ? activeStore.name : hasStores ? "Cross-store workspace" : "Launch workspace"}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/35">
                  Conversation history stays separated by workspace in this session, so each connected store gets its own specialized bot context.
                </p>
              </div>
            </Panel>

            <Panel title="Connectors & tools" icon={Plug} actionLabel="Manage" onAction={() => setLocation("/storefronts") }>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat icon={Store} label="Stores" value={String(stores.length)} />
                <MiniStat icon={Megaphone} label="Social" value={String(socialAccountsQuery.data?.length ?? 0)} />
                <MiniStat icon={Plug} label="Credentials" value={String(credentialsQuery.data?.length ?? 0)} />
                <MiniStat icon={Wrench} label="Tools" value={String(toolCount)} />
              </div>
            </Panel>

            <Panel title="Suppliers" icon={Package} actionLabel="Supplier POs" onAction={() => setLocation("/storefronts#supplier") }>
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
        </aside>
      </div>
    </div>
  );
}

function WorkspaceBadge({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: string }) {
  return (
    <Badge className="border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[10px] text-white/60">
      <Icon className="mr-1.5 h-3 w-3 text-sky-300" />
      <span className="mr-1 text-white/35">{label}</span>
      <span className="font-semibold text-white/75">{value}</span>
    </Badge>
  );
}

function Panel({ title, icon: Icon, children, actionLabel, onAction }: { title: string; icon: typeof Bot; children: React.ReactNode; actionLabel?: string; onAction?: () => void }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{title}</span>
        </div>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction} className="flex items-center gap-1 text-[10px] text-white/30 transition-colors hover:text-sky-300">
            {actionLabel} <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function WorkflowCard({ workflow }: { workflow: any }) {
  const tone = WORKFLOW_TONE[workflow.status] ?? WORKFLOW_TONE.cancelled;
  const Icon = tone.icon;
  const output = previewJson(workflow.output);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-white/85">{workflow.title}</p>
          <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-widest text-white/30">
            <Icon className={`h-3 w-3 ${workflow.status === "running" ? "animate-spin" : ""}`} />
            {tone.label}
            <span>·</span>
            <span>{workflow.workflowType?.replace(/_/g, " ")}</span>
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

function MiniStat({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
      <Icon className="h-3.5 w-3.5 text-white/35" />
      <p className="mt-2 text-[9px] uppercase tracking-widest text-white/30">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-white/80">{value}</p>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-white/35">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading…
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-3 text-[10px] leading-relaxed text-white/35">{text}</p>;
}
