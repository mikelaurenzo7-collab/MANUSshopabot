/**
 * Workflows.tsx — Bot Workflow Management Dashboard
 * Lists active workflows, history, retry failed jobs, and launch new workflows
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
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
} from "lucide-react";
import SubscriptionGate from "@/components/SubscriptionGate";
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
    architect: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    merchant: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    social: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${map[agentType] ?? "bg-slate-500/10 text-slate-400 border-slate-500/30"}`}>
      <Bot className="h-3 w-3" />
      {agentType}
    </span>
  );
}

// ─── Workflow Card ────────────────────────────────────────────────────────────

function WorkflowCard({ workflow, onRetry, retryLoading }: {
  workflow: any;
  onRetry: (id: number) => void;
  retryLoading: boolean;
}) {
  const canRetry = workflow.status === "failed" || workflow.status === "cancelled";
  const createdAt = new Date(workflow.createdAt).toLocaleString();

  return (
    <div className="card-hover rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-white/10 hover:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <AgentBadge agentType={workflow.agentType} />
            <StatusBadge status={workflow.status} />
          </div>
          <h3 className="font-medium text-sm text-white truncate mt-1">{workflow.title}</h3>
          {workflow.description && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{workflow.description}</p>
          )}
          <p className="text-xs text-slate-500 mt-1">{createdAt}</p>
        </div>
        {canRetry && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            onClick={() => onRetry(workflow.id)}
            disabled={retryLoading}
          >
            {retryLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span className="ml-1 text-xs">Retry</span>
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
      <DialogContent className="bg-[#0a0a0f] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-400" />
            Launch New Workflow
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs text-slate-400 mb-1 block">Bot Agent</Label>
            <Select value={agentType} onValueChange={(v) => { setAgentType(v as any); setWorkflowType(""); }}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0a0a0f] border-white/10">
                <SelectItem value="architect">Architect Bot</SelectItem>
                <SelectItem value="merchant">Merchant Bot</SelectItem>
                <SelectItem value="social">Social Bot</SelectItem>
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
              <SelectContent className="bg-[#0a0a0f] border-white/10 max-h-60">
                {availableTypes.map((t: any) => (
                  <SelectItem key={t.type} value={t.type}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-xs text-slate-500 mt-1">{selectedType.description}</p>
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
              <SelectContent className="bg-[#0a0a0f] border-white/10">
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

  const historyWorkflows = (allWorkflows ?? []).filter(
    (w: any) => w.status === "completed" || w.status === "failed" || w.status === "cancelled"
  );

  return (
    <div className="page-enter p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between page-header">
        <div>
          <p className="micro-label mb-1">Operations</p>
          <h1 className="text-2xl font-heading font-bold text-white">Workflows</h1>
          <p className="text-sm text-white/40 mt-0.5">Monitor and manage all bot workflows</p>
        </div>
        <SubscriptionGate feature="Workflow Automation" soft>
          <LaunchWorkflowDialog onLaunched={() => {
            utils.workflows.active.invalidate();
            utils.workflows.list.invalidate();
            utils.workflows.counts.invalidate();
          }} />
        </SubscriptionGate>
      </div>

      {/* Stats Row */}
      <div className="stagger-list grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: counts?.total ?? 0, color: "text-white", bg: "" },
          { label: "Running", value: counts?.running ?? 0, color: "text-sky-400", bg: "bg-sky-500/5 border-sky-500/15" },
          { label: "Completed", value: counts?.completed ?? 0, color: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/15" },
          { label: "Failed", value: counts?.failed ?? 0, color: "text-red-400", bg: "bg-red-500/5 border-red-500/15" },
        ].map((stat) => (
          <div key={stat.label} className={`bento-card p-4 ${stat.bg}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">{stat.label}</p>
            <p className={`text-2xl font-black metric-number ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="active" className="data-[state=active]:bg-white/10">
            Active
            {(activeWorkflows?.length ?? 0) > 0 && (
              <Badge className="ml-1.5 bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0">
                {activeWorkflows?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-white/10">
            History
          </TabsTrigger>
        </TabsList>

        {/* Active Tab */}
        <TabsContent value="active" className="mt-4">
          {activeLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/5" />)}
            </div>
          ) : (activeWorkflows?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-white/[0.08] text-center bg-white/[0.01]">
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-sky-400/60" />
              </div>
              <p className="text-white/50 font-medium">No active workflows</p>
              <p className="text-white/25 text-sm mt-1">Launch a workflow to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeWorkflows!.map((w: any) => (
                <WorkflowCard
                  key={w.id}
                  workflow={w}
                  onRetry={onRetry}
                  retryLoading={retryLoading && retryingId === w.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/5" />)}
            </div>
          ) : historyWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-white/[0.08] text-center bg-white/[0.01]">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-white/20" />
              </div>
              <p className="text-white/50 font-medium">No workflow history yet</p>
              <p className="text-white/25 text-sm mt-1">Completed workflows will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyWorkflows.map((w: any) => (
                <WorkflowCard
                  key={w.id}
                  workflow={w}
                  onRetry={onRetry}
                  retryLoading={retryLoading && retryingId === w.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
