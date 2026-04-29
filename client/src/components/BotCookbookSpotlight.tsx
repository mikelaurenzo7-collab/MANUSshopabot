/**
 * BotCookbookSpotlight.tsx — per-bot autonomous-workflow launcher.
 *
 * Each bot now has an autonomous workflow built on the agent-loop
 * cookbook recipe — Builder runs `autonomous_competitor_stalker`,
 * Merchant runs `autonomous_repricer`, Social runs
 * `autonomous_trend_hunter`. These aren't surfaced anywhere else on
 * the bot pages — without this component, operators have to know the
 * names exist and dig into the workflows index to launch them.
 *
 * The spotlight lives high on the bot page, right under the active
 * runs panel, so operators see the differentiator at a glance:
 * "this bot has an autonomous mode that decides what to do, with an
 * audit trail." One click launches.
 *
 * Defensive: when the engine doesn't have ANTHROPIC_API_KEY wired,
 * the workflow still launches but the agent-loop branch falls back
 * to single-shot — the launcher doesn't pretend either way. The
 * audit trail in the live runner shows the real path taken.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Wrench, Sparkles, Layers, ArrowRight, Loader2 } from "lucide-react";

type AgentType = "architect" | "merchant" | "social";

interface AutonomousSpec {
  workflowType:
    | "autonomous_competitor_stalker"
    | "autonomous_repricer"
    | "autonomous_trend_hunter";
  scope: "global" | "all_stores";
  label: string;
  tagline: string;
  description: string;
  recipes: Array<"reflect" | "multi_draft" | "agent_loop">;
}

const SPEC_BY_AGENT: Record<AgentType, AutonomousSpec & { rgb: string; color: string }> = {
  architect: {
    workflowType: "autonomous_competitor_stalker",
    scope: "global",
    label: "Competitor Stalker",
    tagline: "Agent picks competitors, fetches pricing, recommends positioning",
    description:
      "Hand the bot a niche + a price band. It searches the field, fetches snapshots on the most representative competitors, compares to your pricing, and recommends a positioning. Audit trail shows every competitor it actually inspected.",
    recipes: ["agent_loop"],
    rgb: "14, 165, 233",
    color: "#38bdf8",
  },
  merchant: {
    workflowType: "autonomous_repricer",
    scope: "all_stores",
    label: "Autonomous Repricer",
    tagline: "Walks SKUs one at a time, with platform-policy safety net",
    description:
      "Snapshot → competitor band → propose. Decisions ≤25% auto-apply; moves >25% land in your approval queue per platform policy. Every SKU and decision shows up on the audit trail — no black box.",
    recipes: ["agent_loop"],
    rgb: "6, 182, 212",
    color: "#22d3ee",
  },
  social: {
    workflowType: "autonomous_trend_hunter",
    scope: "global",
    label: "Trend Hunter",
    tagline: "Crawls TikTok / Instagram / Twitter, scores 0-100, commits briefs",
    description:
      "Fetch top-N trends per platform, score relevance against your niche, and commit creative briefs only for trends ≥40 worth-testing. Plug the briefs into the next content_calendar run.",
    recipes: ["agent_loop"],
    rgb: "249, 115, 22",
    color: "#fb923c",
  },
};

const RECIPE_META = {
  reflect: { Icon: Sparkles, label: "Self-Critique" },
  multi_draft: { Icon: Layers, label: "Parallel Drafting" },
  agent_loop: { Icon: Wrench, label: "Autonomous Tools" },
} as const;

export function BotCookbookSpotlight({ agentType }: { agentType: AgentType }) {
  const spec = SPEC_BY_AGENT[agentType];
  const utils = trpc.useUtils();
  const [launching, setLaunching] = useState(false);
  const launch = trpc.workflows.launch.useMutation({
    onMutate: () => setLaunching(true),
    onSettled: () => setLaunching(false),
    onSuccess: (data) => {
      toast.success(
        `${spec.label} launched — workflow #${data.workflowId}. Watch the audit trail above.`,
      );
      utils.workflows.active.invalidate();
      utils.dashboard.agentStatus.invalidate();
      utils.dashboard.recentActivity.invalidate();
    },
    onError: (err) => toast.error(err.message || `Failed to launch ${spec.label}`),
  });

  const handleLaunch = () => {
    launch.mutate({
      agentType,
      workflowType: spec.workflowType,
      title: `${spec.label} (autonomous)`,
      scope: spec.scope,
      input: {},
    });
  };

  return (
    <div
      className="bot-cookbook-spotlight"
      style={{
        ["--spotlight-rgb" as any]: spec.rgb,
        ["--spotlight-color" as any]: spec.color,
      }}
    >
      <div className="bot-cookbook-spotlight-head">
        <div className="bot-cookbook-spotlight-glyph">
          <Wrench className="w-4 h-4" strokeWidth={2.4} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="bot-cookbook-spotlight-eyebrow">
            Autonomous workflow · Bot picks the path
          </p>
          <h3 className="bot-cookbook-spotlight-title">{spec.label}</h3>
          <p className="bot-cookbook-spotlight-tagline">{spec.tagline}</p>
        </div>
        <button
          type="button"
          onClick={handleLaunch}
          disabled={launching || launch.isPending}
          className="bot-cookbook-spotlight-cta"
          aria-label={`Launch ${spec.label}`}
        >
          {launching || launch.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              Launch <ArrowRight className="w-3 h-3" />
            </>
          )}
        </button>
      </div>
      <p className="bot-cookbook-spotlight-desc">{spec.description}</p>
      <div className="bot-cookbook-spotlight-recipes">
        {spec.recipes.map((r) => {
          const Meta = RECIPE_META[r];
          return (
            <span key={r} className="bot-cookbook-spotlight-recipe">
              <Meta.Icon className="w-3 h-3" strokeWidth={2.4} aria-hidden="true" />
              {Meta.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
