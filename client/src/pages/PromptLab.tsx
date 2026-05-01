import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain,
  Zap,
  Trophy,
  BarChart3,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

// Internal agent type → user-facing mode name
const AGENT_MODE_LABEL: Record<string, string> = {
  architect: "Launch mode",
  merchant:  "Operator mode",
  social:    "Growth mode",
};

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
    <div className="page-enter h-full overflow-y-auto">
      <PageHeader
        icon={<Brain className="h-4 w-4" />}
        title="Prompt Lab"
        subtitle="Bots A/B test their own system prompts; the best variant gets promoted network-wide"
        accent="fuchsia"
      />

      <div className="space-y-6 px-5 pb-6">

      {/* Agent Selector */}
      <div className="flex gap-2">
        {agents.map(a => (
          <Button
            key={a}
            variant={selectedAgent === a ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedAgent(a)}
          >
            {AGENT_MODE_LABEL[a] ?? a}
          </Button>
        ))}
      </div>

      {/* Variants List */}
      {variants.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : !variants.data?.length ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">No Prompt Variants Yet</p>
            <p className="text-sm text-muted-foreground">
              As your bots run, they'll create variant prompts and start A/B testing automatically. 
              Conversion data from orders and ad clicks will determine the winner.
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Minimum 10 invocations per variant before the RL evaluator can promote a winner.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {variants.data.map((v: any) => (
            <Card key={v.id} className={v.isActive ? "border-emerald-500/40 bg-emerald-500/5" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{v.variantName}</span>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Auto-Promote Action */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            RL Auto-Evaluator
          </CardTitle>
          <CardDescription>
            Automatically evaluate all variants and promote the best performer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              // Auto-promote for each task type found
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
            Run RL Evaluation — {AGENT_MODE_LABEL[selectedAgent] ?? selectedAgent}
          </Button>
          {autoPromote.data && (
            <p className="text-sm text-muted-foreground mt-2">
              {autoPromote.data.promoted
                ? `✅ Promoted variant "${autoPromote.data.variantName}" as the new winner.`
                : `⏳ ${autoPromote.data.reason}`}
            </p>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
