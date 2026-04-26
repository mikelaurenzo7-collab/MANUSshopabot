import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain,
  Zap,
  Trophy,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";

const agentColors: Record<string, string> = {
  architect: "sky",
  merchant: "cyan",
  social: "amber",
};

const agentPillActive: Record<string, string> = {
  architect: "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.18)]",
  merchant: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.18)]",
  social: "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.18)]",
};

const agentPillInactive =
  "bg-white/[0.04] text-white/50 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/70";

export default function PromptLab() {
  const [selectedAgent, setSelectedAgent] = useState<string>("social");
  const variants = trpc.promptRL.listVariants.useQuery({ agentType: selectedAgent });
  const autoPromote = trpc.promptRL.autoPromote.useMutation({
    onSuccess: () => variants.refetch(),
  });
  const promoteMutation = trpc.promptRL.promoteVariant.useMutation({
    onSuccess: () => variants.refetch(),
  });

  const agents = ["architect", "merchant", "social"] as const;

  return (
    <div className="relative overflow-hidden page-enter space-y-6 p-6">
      <div className="ghost-watermark" aria-hidden="true">PROMPT LAB</div>
      <div className="light-leak-blue" style={{ top: "5%", left: "10%" }} aria-hidden="true" />
      <div className="light-leak-purple" style={{ top: "50%", right: "5%" }} aria-hidden="true" />

      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(14,165,233,0.12)] shrink-0">
            <Brain className="w-5 h-5 text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="micro-label mb-1">RL System</p>
            <h1 className="font-heading font-bold tracking-tight text-2xl text-white">
              Prompt Lab
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your bots A/B test their own system prompts. The best-performing variant gets promoted network-wide.
            </p>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-sky-400/30 to-transparent mt-4" />
      </div>

      {/* Agent Selector */}
      <div className="flex gap-2 flex-wrap">
        {agents.map(a => (
          <button
            key={a}
            onClick={() => setSelectedAgent(a)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all capitalize ${
              selectedAgent === a ? agentPillActive[a] : agentPillInactive
            }`}
          >
            {a} Bot
          </button>
        ))}
      </div>

      {/* Variants List */}
      {variants.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : !variants.data?.length ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Sparkles className="w-6 h-6 text-sky-400" />
          </div>
          <p className="font-medium text-white/80 mb-1">No Prompt Variants Yet</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            As your bots run, they'll create variant prompts and start A/B testing automatically.
            Conversion data from orders and ad clicks will determine the winner.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Minimum 10 invocations per variant before the RL evaluator can promote a winner.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {variants.data.map((v: any) => (
            <div
              key={v.id}
              className={`glass-card relative overflow-hidden ${
                v.isActive ? "border-emerald-500/40" : ""
              }`}
            >
              {v.isActive ? (
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
              ) : (
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
              )}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-sm text-white">{v.variantName}</span>
                      <Badge variant="outline" className="text-xs">{v.taskType}</Badge>
                      {v.isActive && (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs">
                          <Trophy className="w-3 h-3 mr-1" /> Active Winner
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono line-clamp-2">
                      {v.promptTemplate?.slice(0, 200)}...
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {!v.isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => promoteMutation.mutate({ variantId: v.id })}
                        disabled={promoteMutation.isPending}
                      >
                        <ArrowUpRight className="w-3 h-3 mr-1" /> Promote
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RL Auto-Evaluator */}
      <div className="glass-card relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
        <div className="p-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-yellow-400" />
            </div>
            <h3 className="text-base font-semibold text-white">RL Auto-Evaluator</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4 ml-11">
            Automatically evaluate all variants and promote the best performer.
          </p>
          <Button
            className="btn-glow"
            onClick={() => {
              if (variants.data?.length) {
                const taskTypes = Array.from(new Set(variants.data.map((v: any) => v.taskType)));
                for (const taskType of taskTypes) {
                  autoPromote.mutate({ agentType: selectedAgent, taskType: taskType as string });
                }
              }
            }}
            disabled={autoPromote.isPending || !variants.data?.length}
          >
            <Brain className="w-4 h-4 mr-2" />
            Run RL Evaluation for {selectedAgent} Bot
          </Button>
          {autoPromote.data && (
            <p className="text-sm text-muted-foreground mt-3">
              {autoPromote.data.promoted
                ? `✅ Promoted variant "${autoPromote.data.variantName}" as the new winner.`
                : `⏳ ${autoPromote.data.reason}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
