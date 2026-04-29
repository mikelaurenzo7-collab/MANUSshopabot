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
import { useMemo, useState, useCallback } from "react";
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
  Sparkles,
  Layers,
  ThumbsUp,
  ThumbsDown,
  Wrench,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
  const [approving, setApproving] = useState(false);
  const utils = trpc.useUtils();
  const approveMutation = trpc.workflows.reviewStep.useMutation({
    onSuccess: (_data: unknown, vars: { approved: boolean }) => {
      toast.success(vars.approved ? "Workflow approved — continuing…" : "Workflow rejected.");
      utils.workflows.detail.invalidate({ workflowId });
      utils.workflows.list.invalidate();
      setApproving(false);
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed: ${err.message}`);
      setApproving(false);
    },
  });

  const handleApproval = (approved: boolean) => {
    // Find the awaiting step
    const awaitingStep = stepStates.find((s: any) => s.phase === "awaiting");
    if (!awaitingStep) return;
    setApproving(true);
    approveMutation.mutate({ workflowId, stepId: awaitingStep.id, approved });
  };
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

      {/* Approval Gate Banner */}
      {status === "awaiting_approval" && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06]">
          <Pause className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-300">Awaiting your approval</p>
            <p className="text-[11px] text-white/50 mt-0.5">Review the step output before the workflow continues.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60"
              disabled={approving}
              onClick={() => handleApproval(false)}
            >
              <ThumbsDown className="w-3 h-3 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
              disabled={approving}
              onClick={() => handleApproval(true)}
            >
              {approving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ThumbsUp className="w-3 h-3 mr-1" />}
              Approve
            </Button>
          </div>
        </div>
      )}

      {/* Step rail */}
      <ol className="live-workflow-runner-rail">
        {stepStates.map((s: any, i: number) => (
          <RunnerStep
            key={s.id}
            step={s}
            isLast={i === stepStates.length - 1}
          />
        ))}
      </ol>
    </div>
  );
}

function RunnerStep({ step: s, isLast }: { step: any; isLast: boolean }) {
  const Glyph = STEP_GLYPH[s.stepType as StepType] || Cpu;
  const hasCookbookDetail = stepHasCookbookDetail(s.output);
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  return (
    <li className={`live-workflow-runner-step live-workflow-runner-step--${s.phase}`}>
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
          <CookbookBadges output={s.output} />
          {hasCookbookDetail && (
            <button
              type="button"
              onClick={toggle}
              className={`live-workflow-runner-cookbook-toggle ${expanded ? "is-open" : ""}`}
              aria-expanded={expanded}
              aria-label={expanded ? "Hide cookbook details" : "Show cookbook details"}
            >
              <ChevronDown className="w-3 h-3" strokeWidth={2.4} aria-hidden="true" />
              <span>{expanded ? "Hide details" : "Show details"}</span>
            </button>
          )}
        </div>
        {s.description && (
          <p className="live-workflow-runner-step-desc">{s.description}</p>
        )}
        {expanded && hasCookbookDetail && <CookbookDetail output={s.output} />}
      </div>
      {/* Vertical edge connecting to the next step. The CSS paints it
          as a flowing dash when the next step is running so the eye
          follows execution. */}
      {!isLast && <span className="live-workflow-runner-step-edge" aria-hidden="true" />}
    </li>
  );
}

function stepHasCookbookDetail(output: any): boolean {
  if (!output || typeof output !== "object") return false;
  const reflect = output.__reflect;
  const multi = output.__multiDraft;
  const agent = output.__agentLoop;
  if (reflect && Array.isArray(reflect.critique) && reflect.critique.length > 0) return true;
  if (multi && (multi.judgeReasoning || (Array.isArray(multi?.allDrafts) && multi.allDrafts.length > 0))) return true;
  if (agent && Array.isArray(agent.toolCalls) && agent.toolCalls.length > 0) return true;
  return false;
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

/**
 * Cookbook-pattern badges. The workflow engine attaches __reflect /
 * __multiDraft / __agentLoop audit fields to step outputs when the
 * step opted into those Anthropic Cookbook recipes. We surface them
 * as small pills so operators can see the quality lift on the step
 * rail without opening the full result panel.
 *
 * Only renders when the underlying flag is true — when the path fell
 * back to single-shot (ANTHROPIC_API_KEY unset), the badges stay quiet
 * so the rail doesn't lie about what the bot actually did.
 */
function CookbookBadges({ output }: { output: any }) {
  if (!output || typeof output !== "object") return null;
  const reflect = output.__reflect as { reflectedAndRevised?: boolean; critique?: any[] } | undefined;
  const multi = output.__multiDraft as { multiDrafted?: boolean; chosenPersona?: string; personaCount?: number } | undefined;
  const agent = output.__agentLoop as { iterations?: number; toolCallCount?: number; hitIterationCap?: boolean; toolset?: string } | undefined;
  const reflected = reflect?.reflectedAndRevised === true;
  const multiDrafted = multi?.multiDrafted === true;
  const agentLooped = typeof agent?.toolCallCount === "number" && agent.toolCallCount > 0;
  if (!reflected && !multiDrafted && !agentLooped) return null;
  const issueCount = Array.isArray(reflect?.critique) ? reflect!.critique.length : 0;
  return (
    <span className="live-workflow-runner-cookbook">
      {reflected && (
        <span
          className="live-workflow-runner-cookbook-pill is-reflect"
          title={
            issueCount > 0
              ? `Reflected & revised — ${issueCount} issue${issueCount === 1 ? "" : "s"} addressed in the second pass`
              : `Reflected & revised — first draft cleared the rubric`
          }
        >
          <Sparkles className="w-2.5 h-2.5" strokeWidth={2.4} aria-hidden="true" />
          <span>Reflected</span>
        </span>
      )}
      {multiDrafted && (
        <span
          className="live-workflow-runner-cookbook-pill is-multi"
          title={
            multi?.chosenPersona
              ? `Multi-drafted across ${multi?.personaCount ?? "N"} personas — judge picked “${multi.chosenPersona}”`
              : "Multi-drafted across personas"
          }
        >
          <Layers className="w-2.5 h-2.5" strokeWidth={2.4} aria-hidden="true" />
          <span>{multi?.personaCount ?? ""}-draft</span>
        </span>
      )}
      {agentLooped && (
        <span
          className="live-workflow-runner-cookbook-pill is-agent"
          title={
            agent?.toolset
              ? `Agent-looped via ${agent.toolset} — ${agent.iterations ?? "?"} iterations, ${agent.toolCallCount} tool call${agent.toolCallCount === 1 ? "" : "s"}${agent.hitIterationCap ? " (hit cap)" : ""}`
              : `Agent-looped — ${agent?.toolCallCount} tool call${agent?.toolCallCount === 1 ? "" : "s"}`
          }
        >
          <Wrench className="w-2.5 h-2.5" strokeWidth={2.4} aria-hidden="true" />
          <span>{agent?.toolCallCount} tool{agent?.toolCallCount === 1 ? "" : "s"}</span>
        </span>
      )}
    </span>
  );
}

/**
 * Cookbook detail panel — the operator-facing surface for the audit
 * data the recipes attach to step outputs. Renders only the sections
 * that have content; an output with no recipe payload renders nothing.
 *
 * Three independently-rendering blocks:
 *   • Reflect critique — list of {issue, severity, fix} objects, with
 *     severity-driven coloring so blockers stand out.
 *   • Multi-draft personas — chosen persona + judge reasoning, plus a
 *     compact list of all drafts the judge considered.
 *   • Agent-loop trail — per-iteration tool-call timeline so operators
 *     see exactly which tools the agent dispatched and what came back.
 *
 * Defensive against partial / malformed payloads — the workflow's
 * step.output is JSON from the DB, and shape can drift across
 * cookbook recipe versions. Each block guards its inputs.
 */
function CookbookDetail({ output }: { output: any }) {
  const reflect = output?.__reflect;
  const multi = output?.__multiDraft;
  const agent = output?.__agentLoop;
  return (
    <div className="live-workflow-runner-cookbook-detail">
      {reflect && Array.isArray(reflect.critique) && reflect.critique.length > 0 && (
        <ReflectCritiqueBlock critique={reflect.critique} />
      )}
      {multi && (multi.chosenPersona || (Array.isArray(multi.allDrafts) && multi.allDrafts.length > 0)) && (
        <MultiDraftBlock multi={multi} />
      )}
      {agent && Array.isArray(agent.toolCalls) && agent.toolCalls.length > 0 && (
        <AgentTrailBlock agent={agent} />
      )}
    </div>
  );
}

function ReflectCritiqueBlock({ critique }: { critique: any[] }) {
  // Group by severity so blockers float to the top — operators care
  // most about the things the critique pass forced changed.
  const bySeverity: Record<string, any[]> = { blocker: [], major: [], minor: [] };
  for (const c of critique) {
    const sev = String(c?.severity ?? "minor").toLowerCase();
    (bySeverity[sev] ?? bySeverity.minor).push(c);
  }
  const order: Array<["blocker" | "major" | "minor", string]> = [
    ["blocker", "Blocker"],
    ["major", "Major"],
    ["minor", "Minor"],
  ];
  return (
    <section className="live-workflow-runner-cookbook-block is-reflect">
      <header className="live-workflow-runner-cookbook-block-head">
        <Sparkles className="w-3 h-3" strokeWidth={2.4} aria-hidden="true" />
        <span>Reflect critique — {critique.length} issue{critique.length === 1 ? "" : "s"} addressed</span>
      </header>
      <ul className="live-workflow-runner-cookbook-issues">
        {order.flatMap(([sev, label]) =>
          bySeverity[sev].map((c, i) => (
            <li key={`${sev}-${i}`} className={`live-workflow-runner-cookbook-issue is-${sev}`}>
              <span className="live-workflow-runner-cookbook-issue-sev">{label}</span>
              <div className="min-w-0">
                <p className="live-workflow-runner-cookbook-issue-text">{String(c?.issue ?? "")}</p>
                {c?.fix && (
                  <p className="live-workflow-runner-cookbook-issue-fix">→ {String(c.fix)}</p>
                )}
              </div>
            </li>
          )),
        )}
      </ul>
    </section>
  );
}

function MultiDraftBlock({ multi }: { multi: any }) {
  const drafts = Array.isArray(multi?.allDrafts) ? multi.allDrafts : [];
  return (
    <section className="live-workflow-runner-cookbook-block is-multi">
      <header className="live-workflow-runner-cookbook-block-head">
        <Layers className="w-3 h-3" strokeWidth={2.4} aria-hidden="true" />
        <span>
          Multi-draft — judge picked
          {multi?.chosenPersona ? (
            <> <strong>{String(multi.chosenPersona)}</strong></>
          ) : (
            " a draft"
          )}
          {drafts.length > 0 && <> from {drafts.length}</>}
        </span>
      </header>
      {multi?.judgeReasoning && (
        <p className="live-workflow-runner-cookbook-judge">{String(multi.judgeReasoning)}</p>
      )}
      {drafts.length > 0 && (
        <ul className="live-workflow-runner-cookbook-personas">
          {drafts.map((d: any, i: number) => {
            const isWinner = d?.persona && d.persona === multi?.chosenPersona;
            return (
              <li
                key={`${d?.persona ?? i}-${i}`}
                className={`live-workflow-runner-cookbook-persona ${isWinner ? "is-winner" : ""}`}
              >
                <span className="live-workflow-runner-cookbook-persona-label">{String(d?.persona ?? `draft ${i + 1}`)}</span>
                {isWinner && <span className="live-workflow-runner-cookbook-persona-tag">winner</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AgentTrailBlock({ agent }: { agent: any }) {
  const calls = Array.isArray(agent?.toolCalls) ? agent.toolCalls : [];
  return (
    <section className="live-workflow-runner-cookbook-block is-agent">
      <header className="live-workflow-runner-cookbook-block-head">
        <Wrench className="w-3 h-3" strokeWidth={2.4} aria-hidden="true" />
        <span>
          Agent trail — {agent?.iterations ?? "?"} iteration{agent?.iterations === 1 ? "" : "s"}, {calls.length} tool call{calls.length === 1 ? "" : "s"}
          {agent?.hitIterationCap && <span className="live-workflow-runner-cookbook-cap"> · hit cap</span>}
        </span>
      </header>
      <ol className="live-workflow-runner-cookbook-trail">
        {calls.map((c: any, i: number) => (
          <li
            key={i}
            className={`live-workflow-runner-cookbook-trail-row ${c?.isError ? "is-error" : ""}`}
          >
            <span className="live-workflow-runner-cookbook-trail-iter">#{c?.iteration ?? "?"}</span>
            <span className="live-workflow-runner-cookbook-trail-name">{String(c?.toolName ?? "tool")}</span>
            {c?.category && (
              <span className="live-workflow-runner-cookbook-trail-cat">{String(c.category)}</span>
            )}
            <span className="live-workflow-runner-cookbook-trail-snippet">
              {c?.isError ? "✗ " : ""}
              {String(c?.resultSnippet ?? "").slice(0, 120)}
              {String(c?.resultSnippet ?? "").length > 120 ? "…" : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
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
