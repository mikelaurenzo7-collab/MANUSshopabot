/**
 * Workflows.tsx — Bot Workflow Management Dashboard
 * Lists active workflows, history, retry failed jobs, and launch new workflows
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ECOMMERCE_BRANDS, SOCIAL_BRANDS, TOOL_BRANDS } from "@/lib/platformBrand";
import { CountUp } from "@/components/CountUp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Play,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Plus,
  Bot,
  Zap,
  GitBranch,
} from "lucide-react";
import SubscriptionGate from "@/components/SubscriptionGate";
import { PageHeader } from "@/components/PageHeader";
import { LiveWorkflowRunner } from "@/components/LiveWorkflowRunner";
// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    pending: { label: "Pending", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", icon: <Clock className="h-3 w-3" /> },
    running: { label: "Running", className: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    completed: { label: "Completed", className: "bg-green-500/10 text-green-400 border-green-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
    failed: { label: "Failed", className: "bg-red-500/10 text-red-400 border-red-500/30", icon: <AlertCircle className="h-3 w-3" /> },
    cancelled: { label: "Cancelled", className: "bg-slate-500/10 text-slate-400 border-slate-500/30", icon: <XCircle className="h-3 w-3" /> },
    awaiting_approval: { label: "Awaiting Approval", className: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: <Clock className="h-3 w-3" /> },
  };
  const config = map[status] ?? { label: status, className: "bg-slate-500/10 text-slate-400 border-slate-500/30", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

// ─── Agent Badge ──────────────────────────────────────────────────────────────

function AgentBadge({ agentType }: { agentType: string }) {
  const map: Record<string, string> = {
    architect: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    merchant: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    social: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${map[agentType] ?? "bg-slate-500/10 text-slate-400 border-slate-500/30"}`}>
      <Bot className="h-3 w-3" />
      {agentType}
    </span>
  );
}

// ─── Workflow Card ────────────────────────────────────────────────────────────

function WorkflowCard({
  workflow,
  onRetry,
  isRetryingThis,
  anyRetryInFlight,
  onRerun,
  isRerunningThis,
  anyRerunInFlight,
}: {
  workflow: any;
  onRetry: (id: number) => void;
  /** True only when *this* workflow's retry is the one currently in flight. */
  isRetryingThis: boolean;
  /** True when any retry mutation is pending — used to disable other retry buttons. */
  anyRetryInFlight: boolean;
  /** Optional rerun handler (only present on history surfaces). */
  onRerun?: (id: number) => void;
  isRerunningThis?: boolean;
  anyRerunInFlight?: boolean;
}) {
  const canRetry = workflow.status === "failed" || workflow.status === "cancelled";
  const canRerun = workflow.status === "completed" && !!onRerun;
  const createdAt = new Date(workflow.createdAt).toLocaleString();

  const statusGlow: Record<string, string> = {
    running: "border-l-2 border-l-sky-500/60 bg-sky-500/[0.03] shadow-[inset_2px_0_16px_rgba(14,165,233,0.10)] workflow-running-glow",
    failed: "border-l-2 border-l-red-500/50 bg-red-500/[0.02]",
    completed: "border-l-2 border-l-emerald-500/40 bg-emerald-500/[0.02]",
    pending: "border-l-2 border-l-amber-500/40 bg-amber-500/[0.02]",
    cancelled: "border-l-2 border-l-slate-500/30",
    awaiting_approval: "border-l-2 border-l-amber-500/40 bg-amber-500/[0.02]",
  };

  return (
    <div className={`card-hover rounded-xl border border-white/[0.06] p-4 transition-all hover:border-white/[0.12] hover:shadow-[0_4px_20px_rgba(0,0,0,0.25)] ${statusGlow[workflow.status] ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <AgentBadge agentType={workflow.agentType} />
            <StatusBadge status={workflow.status} />
          </div>
          <h3 className="font-semibold text-sm text-white/90 truncate mt-1">{workflow.title}</h3>
          {workflow.description && (
            <p className="text-xs text-white/45 mt-0.5 line-clamp-2 leading-relaxed">{workflow.description}</p>
          )}
          <p className="text-xs text-white/25 mt-1 font-mono">{createdAt}</p>
        </div>
        {canRetry && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 disabled:opacity-60"
            onClick={() => onRetry(workflow.id)}
            disabled={anyRetryInFlight}
          >
            {isRetryingThis ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span className="ml-1 text-xs">{isRetryingThis ? "Retrying…" : "Retry"}</span>
          </Button>
        )}
        {canRerun && onRerun && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-60"
            onClick={() => onRerun(workflow.id)}
            disabled={anyRerunInFlight}
            title="Run this workflow again with the same inputs"
          >
            {isRerunningThis ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span className="ml-1 text-xs">{isRerunningThis ? "Launching…" : "Rerun"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Launch Workflow Dialog ────────────────────────────────────────────────────

function LaunchWorkflowDialog({ onLaunched }: { onLaunched: () => void }) {
  const [open, setOpen] = useState(false);
  const [agentType, setAgentType] = useState<"architect" | "merchant" | "social">("architect");
  const [workflowType, setWorkflowType] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<"specific_store" | "all_stores" | "global">("global");

  const { data: types } = trpc.workflows.availableTypes.useQuery();

  const launchMutation = trpc.workflows.launch.useMutation({
    onSuccess: () => {
      toast.success("Workflow launched successfully");
      setOpen(false);
      setTitle("");
      setWorkflowType("");
      onLaunched();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to launch workflow");
    },
  });

  const availableTypes = types?.[agentType] ?? [];
  const selectedType = availableTypes.find((t: any) => t.type === workflowType);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-black font-semibold">
          <Plus className="h-4 w-4 mr-1" />
          Launch Workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-surface-overlay border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-400" />
            Launch New Workflow
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs text-slate-400 mb-1 block">Store Bot mode</Label>
            <Select value={agentType} onValueChange={(v) => { setAgentType(v as any); setWorkflowType(""); }}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-surface-overlay border-white/10">
                <SelectItem value="architect">Launch mode</SelectItem>
                <SelectItem value="merchant">Operator mode</SelectItem>
                <SelectItem value="social">Growth mode</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-400 mb-1 block">Workflow Type</Label>
            <Select value={workflowType} onValueChange={(v) => {
              setWorkflowType(v);
              const t = availableTypes.find((x: any) => x.type === v);
              if (t && !title) setTitle(t.title);
              if (t) setScope(t.scope as any);
            }}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select workflow..." />
              </SelectTrigger>
              <SelectContent className="bg-surface-overlay border-white/10 max-h-60">
                {availableTypes.map((t: any) => {
                  // Prefix the workflow with the platform brand icon when
                  // the workflow type is platform-specific
                  // (e.g. "depop_hashtag_refresh" → 👗,
                  //  "google_pmax_optimization" → 📊). Tries the first
                  // token, then the first two joined ("google_ads",
                  // "tiktok_shop"); falls back to ⚡ for cross-platform
                  // recipes like "competitor_pricing_scan". Autonomous
                  // workflows (the bot decides what to do) get a
                  // distinct 🛠 marker + an "AUTO" pill so operators
                  // can spot them at a glance in the dropdown.
                  const tokens = t.type.split("_");
                  const lookup = (id: string) => ECOMMERCE_BRANDS[id] || SOCIAL_BRANDS[id] || TOOL_BRANDS[id];
                  const brand =
                    lookup(tokens.slice(0, 2).join("_")) ||
                    lookup(tokens[0]);
                  const icon = t.autonomous ? "🛠" : (brand?.icon ?? "⚡");
                  return (
                    <SelectItem key={t.type} value={t.type}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-sm leading-none">{icon}</span>
                        {t.title}
                        {t.autonomous && (
                          <span className="ml-1 inline-flex items-center text-[8px] font-bold uppercase tracking-[0.1em] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5">
                            Auto
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedType && (
              <div className="mt-1.5 space-y-1">
                <p className="text-xs text-slate-500">{selectedType.description}</p>
                {(selectedType as any).autonomous && (
                  <p className="text-[10px] text-emerald-300/85 inline-flex items-center gap-1.5 bg-emerald-500/[0.06] border border-emerald-500/25 rounded px-2 py-1">
                    <span aria-hidden="true">🛠</span>
                    Autonomous workflow — the bot decides which tools to call. Audit trail surfaces every dispatch in the live runner under "Show details."
                  </p>
                )}
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs text-slate-400 mb-1 block">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Workflow title..."
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-400 mb-1 block">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-surface-overlay border-white/10">
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="all_stores">All Stores</SelectItem>
                <SelectItem value="specific_store">Specific Store</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-semibold"
            disabled={!workflowType || !title || launchMutation.isPending}
            onClick={() => launchMutation.mutate({ agentType, workflowType, title, scope })}
          >
            {launchMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Launching...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Launch</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Workflows() {
  const utils = trpc.useUtils();

  const { data: activeWorkflows, isLoading: activeLoading } = trpc.workflows.active.useQuery();
  const { data: allWorkflows, isLoading: historyLoading } = trpc.workflows.list.useQuery({
    limit: 50,
    offset: 0,
  });
  const { data: counts } = trpc.workflows.counts.useQuery();

  const [retryingId, setRetryingId] = useState<number | null>(null);

  const retryMutation = trpc.workflows.retry.useMutation({
    onMutate: (vars) => setRetryingId(vars.workflowId),
    onSuccess: () => {
      toast.success("Workflow queued for retry");
      utils.workflows.active.invalidate();
      utils.workflows.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to retry workflow");
    },
    onSettled: () => setRetryingId(null),
  });

  const retryLoading = retryMutation.isPending;

  function onRetry(workflowId: number) {
    retryMutation.mutate({ workflowId });
  }

  const [rerunningId, setRerunningId] = useState<number | null>(null);
  const rerunMutation = trpc.workflows.rerun.useMutation({
    onMutate: (vars) => setRerunningId(vars.workflowId),
    onSuccess: () => {
      toast.success("Workflow queued for rerun");
      utils.workflows.active.invalidate();
      utils.workflows.list.invalidate();
      utils.workflows.counts.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to rerun workflow");
    },
    onSettled: () => setRerunningId(null),
  });

  function onRerun(workflowId: number) {
    rerunMutation.mutate({ workflowId });
  }

  const historyWorkflows = (allWorkflows ?? []).filter(
    (w: any) => w.status === "completed" || w.status === "failed" || w.status === "cancelled"
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="page-enter p-5 space-y-4 overflow-y-auto flex-1">
      <PageHeader
        icon={<GitBranch className="h-4 w-4" />}
        title="Workflows"
        subtitle="Monitor and manage all bot workflows"
        accent="violet"
        right={
          <SubscriptionGate feature="Workflow Automation" soft>
            <LaunchWorkflowDialog onLaunched={() => {
              utils.workflows.active.invalidate();
              utils.workflows.list.invalidate();
              utils.workflows.counts.invalidate();
            }} />
          </SubscriptionGate>
        }
      />

      {/* Stats Row */}
      <div className="stagger-list grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: "Total", value: counts?.total ?? 0, color: "text-white", bg: "" },
          { label: "Running", value: counts?.running ?? 0, color: "text-sky-400", bg: "bg-sky-500/5 border-sky-500/15" },
          { label: "Completed", value: counts?.completed ?? 0, color: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/15" },
          { label: "Failed", value: counts?.failed ?? 0, color: "text-red-400", bg: "bg-red-500/5 border-red-500/15" },
        ].map((stat) => (
          <div key={stat.label} className={`bento-card p-3 ${stat.bg}`}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/45 mb-0.5">{stat.label}</p>
            <p className={`text-xl font-black metric-number ${stat.color}`}>
              <CountUp value={stat.value} />
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active">
        <TabsList className="tab-bar-shell">
          <TabsTrigger value="active" className="tab-trigger-shell">
            Active
            {(activeWorkflows?.length ?? 0) > 0 && (
              <Badge className="ml-1.5 bg-sky-500/20 text-sky-300 border-sky-500/20 text-[10px] px-1.5 py-0">
                {activeWorkflows?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="tab-trigger-shell">
            History
          </TabsTrigger>
        </TabsList>

        {/* Active Tab */}
        <TabsContent value="active" className="mt-4">
          {activeLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl bg-white/5" />)}
            </div>
          ) : (activeWorkflows?.length ?? 0) === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" style={{ background: "rgba(14, 165, 233, 0.1)", borderColor: "rgba(14, 165, 233, 0.25)" }}>
                <Bot className="h-5 w-5 text-sky-400" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">No active workflows</h3>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">
                Launch one above and watch your bots execute the full plan, step by step. Workflows that finish move to the History tab.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Live runner takes over from the static card while the
                  workflow is in flight — shows every step lighting up
                  in real-time. Falls back to the standard card for
                  paused/queued workflows so the layout stays familiar. */}
              {activeWorkflows!.map((w: any) => (
                <div key={w.id} className="space-y-3">
                  {(w.status === "running" || w.status === "awaiting_approval" || w.status === "pending") ? (
                    <LiveWorkflowRunner workflowId={w.id} />
                  ) : (
                    <WorkflowCard
                      workflow={w}
                      onRetry={onRetry}
                      isRetryingThis={retryLoading && retryingId === w.id}
                      anyRetryInFlight={retryLoading}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl bg-white/5" />)}
            </div>
          ) : historyWorkflows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Clock className="h-5 w-5 text-white/45" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">No workflow history yet</h3>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">
                Completed, failed, and cancelled workflows land here. Completed runs get a one-click <span className="text-emerald-300/85">Rerun</span>; failed ones get <span className="text-amber-300/85">Retry</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyWorkflows.map((w: any) => (
                <WorkflowCard
                  key={w.id}
                  workflow={w}
                  onRetry={onRetry}
                  isRetryingThis={retryLoading && retryingId === w.id}
                  anyRetryInFlight={retryLoading}
                  onRerun={onRerun}
                  isRerunningThis={rerunMutation.isPending && rerunningId === w.id}
                  anyRerunInFlight={rerunMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
