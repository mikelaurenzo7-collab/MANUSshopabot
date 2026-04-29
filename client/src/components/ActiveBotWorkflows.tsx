/**
 * ActiveBotWorkflows.tsx — inline workflow viewport on bot pages.
 *
 * When the user fires a workflow from the Architect / Merchant /
 * Social page, the running run appears right here next to the
 * controls instead of forcing a tab-switch to /workflows. Each
 * active run renders as a LiveWorkflowRunner so the user watches
 * the bot execute step by step in the same view they launched it
 * from.
 *
 * Filters workflows.active to the bot's agentType and auto-hides
 * when nothing is running so the bot page doesn't carry an empty
 * card at idle.
 */
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Activity, ArrowUpRight } from "lucide-react";
import { LiveWorkflowRunner } from "@/components/LiveWorkflowRunner";

type AgentType = "architect" | "merchant" | "social";

interface ActiveBotWorkflowsProps {
  /** Restrict the panel to one bot's runs. */
  agentType: AgentType;
  /**
   * Cap the number of in-flight workflows shown inline so the bot
   * page doesn't grow unbounded if the user fires many runs at once.
   * Default 2 — anything more, the panel surfaces a "view all" link.
   */
  maxInline?: number;
}

const AGENT_LABEL: Record<AgentType, string> = {
  architect: "Builder",
  merchant: "Merchant",
  social: "Social",
};

export function ActiveBotWorkflows({ agentType, maxInline = 2 }: ActiveBotWorkflowsProps) {
  const { data, isLoading } = trpc.workflows.active.useQuery(undefined, {
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  // The active endpoint returns runs across every bot; we filter to
  // the one whose page we're on. Sort so the freshest run sits on top.
  const own = ((data as any[]) ?? [])
    .filter((w) => w.agentType === agentType)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (isLoading || own.length === 0) {
    // Auto-hide on empty so the bot page doesn't carry a hollow
    // wrapper. The LiveActivityTicker on Home picks up the slack
    // for "what is the bot doing" at the org level.
    return null;
  }

  const visible = own.slice(0, maxInline);
  const hidden = own.length - visible.length;

  return (
    <div className="active-bot-workflows">
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-2">
          <span className="active-bot-workflows-eyebrow">
            <span className="active-bot-workflows-eyebrow-dot" />
            {AGENT_LABEL[agentType]} · live runs
          </span>
          <span className="text-[10px] font-mono text-white/45 tabular-nums">
            {own.length} active
          </span>
        </div>
        {hidden > 0 ? (
          <Link
            href="/workflows"
            className="text-[11px] text-white/55 hover:text-white inline-flex items-center gap-1"
          >
            +{hidden} more <ArrowUpRight className="w-3 h-3" />
          </Link>
        ) : (
          <Link
            href="/workflows"
            className="text-[11px] text-white/45 hover:text-white inline-flex items-center gap-1"
          >
            <Activity className="w-3 h-3" /> All workflows
          </Link>
        )}
      </div>
      <div className="space-y-3">
        {visible.map((w) => (
          <LiveWorkflowRunner key={w.id} workflowId={w.id} />
        ))}
      </div>
    </div>
  );
}
