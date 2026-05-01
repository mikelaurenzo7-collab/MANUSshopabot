/**
 * StoreWorkflowsTab.tsx — Per-Store Workflows & Results
 *
 * Displays workflows scoped to a single store inside the Chat workspace.
 * Shows active runs, completed results with full output, and allows retry/rerun.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HaloEmptyState } from "@/components/HaloEmptyState";

interface StoreWorkflowsTabProps {
  storeId: number | null;
  storeName?: string;
}

const WORKFLOW_TONE: Record<string, { dot: string; icon: typeof Clock; label: string }> = {
  running: { dot: "bg-amber-400 animate-pulse", icon: Loader2, label: "Running" },
  pending: { dot: "bg-amber-400 animate-pulse", icon: Clock, label: "Pending" },
  awaiting_approval: { dot: "bg-violet-400 animate-pulse", icon: Clock, label: "Needs approval" },
  completed: { dot: "bg-emerald-400", icon: CheckCircle2, label: "Completed" },
  failed: { dot: "bg-red-400", icon: XCircle, label: "Failed" },
  cancelled: { dot: "bg-white/25", icon: XCircle, label: "Cancelled" },
};

export function StoreWorkflowsTab({ storeId, storeName }: StoreWorkflowsTabProps) {
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<number | null>(null);

  // Query workflows scoped to this store
  const workflowsQuery = trpc.workflows.list.useQuery(
    storeId ? { storeId, limit: 100 } : { limit: 100 },
    { refetchInterval: 10_000 },
  );

  const retryMutation = trpc.workflows.retry.useMutation({
    onSuccess: () => {
      toast.success("Workflow retry launched");
      void workflowsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to retry workflow");
    },
  });

  const rerunMutation = trpc.workflows.rerun.useMutation({
    onSuccess: () => {
      toast.success("Workflow rerun launched");
      void workflowsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to rerun workflow");
    },
  });

  const workflows = workflowsQuery.data ?? [];
  const activeWorkflows = workflows.filter((w: any) => w.status === "running" || w.status === "pending");
  const completedWorkflows = workflows.filter((w: any) => w.status === "completed");
  const failedWorkflows = workflows.filter((w: any) => w.status === "failed" || w.status === "cancelled");

  if (!storeId) {
    return (
      <HaloEmptyState
        tone="sky"
        icon={AlertCircle}
        title="No store selected"
        description="Select a store from the workspace dropdown to view its workflows."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
          {storeName} Workflows
        </p>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-white/[0.04] border border-white/[0.08]">
          <TabsTrigger value="active" className="text-xs">
            Active
            {activeWorkflows.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                {activeWorkflows.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-xs">
            Completed
            {completedWorkflows.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">
                {completedWorkflows.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="failed" className="text-xs">
            Failed
            {failedWorkflows.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500/20 text-red-300 text-[9px] font-bold">
                {failedWorkflows.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-2 mt-3">
          {workflowsQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-sky-500/[0.12] bg-sky-500/[0.03] p-3 text-[11px] text-sky-300/60">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading workflows…
            </div>
          ) : activeWorkflows.length === 0 ? (
            <HaloEmptyState
              tone="amber"
              icon={Clock}
              title="No active workflows"
              description="Active workflows will appear here as they run."
            />
          ) : (
            activeWorkflows.map((wf: any) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                isExpanded={expandedWorkflowId === wf.id}
                onToggleExpand={() => setExpandedWorkflowId(expandedWorkflowId === wf.id ? null : wf.id)}
                onRetry={() => retryMutation.mutate({ workflowId: wf.id })}
                onRerun={() => rerunMutation.mutate({ workflowId: wf.id })}
                isRetrying={retryMutation.isPending}
                isRerunning={rerunMutation.isPending}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-2 mt-3">
          {completedWorkflows.length === 0 ? (
            <HaloEmptyState
              tone="emerald"
              icon={CheckCircle2}
              title="No completed workflows"
              description="Completed workflows will appear here with their full results."
            />
          ) : (
            completedWorkflows.map((wf: any) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                isExpanded={expandedWorkflowId === wf.id}
                onToggleExpand={() => setExpandedWorkflowId(expandedWorkflowId === wf.id ? null : wf.id)}
                onRetry={() => retryMutation.mutate({ workflowId: wf.id })}
                onRerun={() => rerunMutation.mutate({ workflowId: wf.id })}
                isRetrying={retryMutation.isPending}
                isRerunning={rerunMutation.isPending}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="failed" className="space-y-2 mt-3">
          {failedWorkflows.length === 0 ? (
            <HaloEmptyState
              tone="muted"
              icon={XCircle}
              title="No failed workflows"
              description="Failed workflows will appear here with error details."
            />
          ) : (
            failedWorkflows.map((wf: any) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                isExpanded={expandedWorkflowId === wf.id}
                onToggleExpand={() => setExpandedWorkflowId(expandedWorkflowId === wf.id ? null : wf.id)}
                onRetry={() => retryMutation.mutate({ workflowId: wf.id })}
                onRerun={() => rerunMutation.mutate({ workflowId: wf.id })}
                isRetrying={retryMutation.isPending}
                isRerunning={rerunMutation.isPending}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface WorkflowCardProps {
  workflow: any;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRetry: () => void;
  onRerun: () => void;
  isRetrying: boolean;
  isRerunning: boolean;
}

function WorkflowCard({
  workflow,
  isExpanded,
  onToggleExpand,
  onRetry,
  onRerun,
  isRetrying,
  isRerunning,
}: WorkflowCardProps) {
  const tone = WORKFLOW_TONE[workflow.status] ?? WORKFLOW_TONE.cancelled;
  const Icon = tone.icon;
  const canRetry = workflow.status === "failed" || workflow.status === "cancelled";
  const canRerun = workflow.status === "completed";

  const createdAt = new Date(workflow.createdAt).toLocaleString();

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all hover:border-white/[0.12] hover:bg-white/[0.04]">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full p-3 flex items-start justify-between gap-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
            <p className="text-[11px] font-semibold text-white/90 truncate">{workflow.title}</p>
          </div>
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-widest text-white/50">
            <Icon className={`h-3 w-3 ${workflow.status === "running" ? "animate-spin" : ""}`} />
            {tone.label}
            <span className="text-white/20">·</span>
            <span>{workflow.workflowType?.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-1 text-[9px] text-white/30 font-mono">{createdAt}</p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {canRetry && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[9px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              disabled={isRetrying}
            >
              {isRetrying ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
            </Button>
          )}
          {canRerun && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[9px] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              onClick={(e) => {
                e.stopPropagation();
                onRerun();
              }}
              disabled={isRerunning}
            >
              {isRerunning ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-white/30 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-white/30 shrink-0" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-white/[0.06] p-3 bg-white/[0.01] space-y-2">
          {workflow.description && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/40 mb-1">Description</p>
              <p className="text-[10px] text-white/60 leading-relaxed">{workflow.description}</p>
            </div>
          )}

          {workflow.status === "completed" && workflow.output && (
            <WorkflowResultDetail output={workflow.output} />
          )}

          {workflow.error && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-red-400 mb-1">Error</p>
              <p className="text-[10px] text-red-200/70 leading-relaxed font-mono">{workflow.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface WorkflowResultDetailProps {
  output: unknown;
}

function WorkflowResultDetail({ output }: WorkflowResultDetailProps) {
  if (!output) return null;

  let displayContent: React.ReactNode = null;

  if (typeof output === "string") {
    // Plain text output
    displayContent = (
      <div className="rounded-lg border border-emerald-500/[0.15] bg-emerald-500/[0.05] p-2.5">
        <p className="text-[10px] leading-relaxed text-emerald-100/80 whitespace-pre-wrap break-words">{output}</p>
      </div>
    );
  } else if (typeof output === "object" && output !== null) {
    // JSON output — format nicely
    const json = JSON.stringify(output, null, 2);
    displayContent = (
      <div className="rounded-lg border border-emerald-500/[0.15] bg-emerald-500/[0.05] p-2.5 max-h-48 overflow-y-auto">
        <pre className="text-[9px] leading-relaxed text-emerald-100/70 font-mono whitespace-pre-wrap break-words">
          {json}
        </pre>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-widest text-emerald-400 mb-1.5">Results</p>
      {displayContent}
    </div>
  );
}
