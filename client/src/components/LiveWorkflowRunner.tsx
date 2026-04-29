/**
 * LiveWorkflowRunner.tsx — real-time workflow execution viz.
 *
 * Replaces the spartan "running" badge with a step-by-step rail that
 * shows every step as it lights up: completed steps tick off in
 * emerald, the running step pulses in amber with a flowing edge to
 * the next, upcoming steps stay muted, approval gates flash a wait
 * banner. The user sees their workflow execute, not just spin.
 *
 * Reads `workflows.detail` and polls every 3s while running.
 * Auto-stops polling once the workflow lands in a terminal state.
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Cpu,
  ImageIcon,
  Zap,
  Pause,
  Globe,
  PenLine,
  Search,
  Bell,
  Bot,
  Package,
  Megaphone,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";

type StepType =
  | "llm_call"
  | "api_call"
  | "image_generation"
  | "data_transform"
  | "approval_gate"
  | "notification"
  | "store_action"
  | "analysis"
  | "parallel_group";

const STEP_GLYPH: Record<StepType, typeof Cpu> = {
  llm_call: Cpu,
  api_call: Globe,
  image_generation: ImageIcon,
  data_transform: PenLine,
  approval_gate: Pause,
  notification: Bell,
  store_action: Zap,
  analysis: Search,
  parallel_group: Cpu,
};

type AgentType = "architect" | "merchant" | "social";
const AGENT_META: Record<AgentType, { name: string; color: string; rgb: string; icon: typeof Bot }> = {
  architect: { name: "Builder", color: "#38bdf8", rgb: "14, 165, 233", icon: Bot },
  merchant: { name: "Merchant", color: "#22d3ee", rgb: "6, 182, 212", icon: Package },
  social: { name: "Social", color: "#fb923c", rgb: "249, 115, 22", icon: Megaphone },
};

type RunnerStatus = "running" | "awaiting_approval" | "completed" | "failed" | "cancelled" | "pending";

export function LiveWorkflowRunner({ workflowId }: { workflowId: number }) {
  // We poll fast (3s) while the workflow is in flight and back off the
  // moment it lands. The query handle's `dataUpdatedAt` keeps us honest
  // about the freshness of what we render.
  const { data, isLoading } = trpc.workflows.detail.useQuery(
    { workflowId },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.workflow?.status as RunnerStatus | undefined;
        if (!status) return 3000;
        if (status === "running" || status === "pending") return 2500;
        if (status === "awaiting_approval") return 8000;
        return false; // terminal — stop polling
      },
      refetchIntervalInBackground: false,
    },
  );

  const wf = data?.workflow;
  const steps = data?.steps || [];
  const status = (wf?.status ?? "pending") as RunnerStatus;
  const agentType = (wf?.agentType ?? "architect") as AgentType;
  const agent = AGENT_META[agentType];

  const currentIdx = wf?.currentStepIndex ?? 0;
  const totalSteps = steps.length || wf?.totalSteps || 0;

  // Pre-compute the step states so the JSX stays clean.
  const stepStates = useMemo(() => {
    return steps.map((s: any) => {
      // Each step's lifecycle: pending → running → completed | failed | skipped.
      // The DB step row carries its own status, but the engine-level
      // currentStepIndex on the workflow is the canonical "what's
      // executing now" pointer; we trust the step row first, fall
      // back to the index, and render `awaiting_approval` when the
      // workflow is paused on this step.
      let phase: "done" | "running" | "awaiting" | "failed" | "upcoming";
      if (s.status === "completed" || s.status === "approved") phase = "done";
      else if (s.status === "failed" || s.status === "rejected") phase = "failed";
      else if (s.status === "running" || s.status === "pending_approval") phase = "running";
      else if (s.stepIndex === currentIdx && status === "awaiting_approval" && s.requiresApproval) phase = "awaiting";
      else if (s.stepIndex === currentIdx && status === "running") phase = "running";
      else if (s.stepIndex < currentIdx) phase = "done";
      else phase = "upcoming";
      return { ...s, phase };
    });
  }, [steps, currentIdx, status]);

  const completedCount = stepStates.filter((s: any) => s.phase === "done").length;
  const progressPct = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  if (isLoading || !wf) {
    return (
      <div className="live-workflow-runner live-workflow-runner--skeleton">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-white/40" />
          <span className="text-xs text-white/55">Hydrating workflow…</span>
        </div>
      </div>
    );
  }

  const Icon = agent.icon;
  const isLive = status === "running" || status === "awaiting_approval" || status === "pending";

  return (
    <div
      className={`live-workflow-runner live-workflow-runner--${status}`}
      style={{
        ["--runner-color" as any]: agent.rgb,
      }}
    >
      {/* Header — agent badge, title, status pill */}
      <div className="live-workflow-runner-header">
        <div className="flex items-center gap-3 min-w-0">
          <div className="live-workflow-runner-glyph" style={{ color: agent.color }}>
            <Icon className="w-5 h-5" strokeWidth={2.2} />
            {isLive && <span className="live-workflow-runner-glyph-pulse" />}
          </div>
          <div className="min-w-0">
            <div className="live-workflow-runner-eyebrow">
              <span className="live-workflow-runner-eyebrow-dot" />
              {agent.name} · running workflow
            </div>
            <h3 className="text-sm font-heading font-bold tracking-tight text-white truncate leading-tight">
              {wf.title}
            </h3>
          </div>
        </div>
        <Link
          href={`/workflows#${wf.id}`}
          className="text-[11px] text-white/55 hover:text-white inline-flex items-center gap-1 shrink-0"
        >
          Open <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Progress bar */}
      <div className="live-workflow-runner-progress" aria-label={`${completedCount} of ${totalSteps} steps complete`}>
        <div
          className="live-workflow-runner-progress-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-white/45 mt-1.5 mb-3">
        <span className="font-mono">
          STEP <span className="text-white/85 tabular-nums">{Math.min(currentIdx + 1, totalSteps)}</span>
          <span className="text-white/30"> / </span>
          <span className="text-white/85 tabular-nums">{totalSteps}</span>
        </span>
        <RunnerStatusPill status={status} />
      </div>

      {/* Step rail */}
      <ol className="live-workflow-runner-rail">
        {stepStates.map((s: any, i: number) => {
          const Glyph = STEP_GLYPH[s.stepType as StepType] || Cpu;
          return (
            <li key={s.id} className={`live-workflow-runner-step live-workflow-runner-step--${s.phase}`}>
              <div className="live-workflow-runner-step-glyph" aria-hidden="true">
                {s.phase === "done" && <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.4} />}
                {s.phase === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.4} />}
                {s.phase === "awaiting" && <Pause className="w-3.5 h-3.5" strokeWidth={2.4} />}
                {s.phase === "failed" && <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.4} />}
                {s.phase === "upcoming" && <Glyph className="w-3.5 h-3.5" strokeWidth={2} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="live-workflow-runner-step-title">{s.title}</span>
                  <span className="live-workflow-runner-step-type">{prettyStepType(s.stepType)}</span>
                  {s.requiresApproval && (
                    <span className="live-workflow-runner-step-gate">approval-gated</span>
                  )}
                </div>
                {s.description && (
                  <p className="live-workflow-runner-step-desc">{s.description}</p>
                )}
              </div>
              {/* Vertical edge connecting to the next step. The CSS
                  paints it as a flowing dash when the next step is
                  running so the eye follows execution. */}
              {i < stepStates.length - 1 && <span className="live-workflow-runner-step-edge" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function RunnerStatusPill({ status }: { status: RunnerStatus }) {
  const variants: Record<RunnerStatus, { label: string; className: string }> = {
    running: { label: "Running", className: "is-running" },
    pending: { label: "Queued", className: "is-pending" },
    awaiting_approval: { label: "Awaiting approval", className: "is-awaiting" },
    completed: { label: "Completed", className: "is-completed" },
    failed: { label: "Failed", className: "is-failed" },
    cancelled: { label: "Cancelled", className: "is-cancelled" },
  };
  const v = variants[status];
  return (
    <span className={`live-workflow-runner-pill ${v.className}`}>
      <span className="live-workflow-runner-pill-dot" />
      {v.label}
    </span>
  );
}

function prettyStepType(t: string): string {
  switch (t) {
    case "llm_call": return "LLM";
    case "api_call": return "API";
    case "image_generation": return "image gen";
    case "data_transform": return "transform";
    case "approval_gate": return "approval gate";
    case "notification": return "notify";
    case "store_action": return "store action";
    case "analysis": return "analysis";
    case "parallel_group": return "parallel";
    default: return t;
  }
}
