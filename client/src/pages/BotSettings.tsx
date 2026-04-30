/**
 * Bot Settings Page
 * Per-bot configuration: instructions, memory, schedules, safety rules
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Settings,
  Brain,
  Clock,
  Shield,
  Zap,
  Bot,
  Package,
  Megaphone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { BotMemoryView } from "@/components/BotMemoryView";

type AgentType = "architect" | "merchant" | "social";

const BOT_CONFIG: Record<AgentType, { name: string; icon: React.ElementType; color: string; accent: string }> = {
  architect: { name: "Launch mode", icon: Bot, color: "text-cyan-400", accent: "bg-cyan-500/10 border-cyan-500/20" },
  merchant: { name: "Operator mode", icon: Package, color: "text-violet-400", accent: "bg-violet-500/10 border-violet-500/20" },
  social: { name: "Growth mode", icon: Megaphone, color: "text-pink-400", accent: "bg-pink-500/10 border-pink-500/20" },
};

export default function BotSettings() {
  const [selectedBot, setSelectedBot] = useState<AgentType>("architect");
  const [selectedTab, setSelectedTab] = useState("instructions");

  const profileQuery = trpc.botProfile.getProfile.useQuery(
    { agentType: selectedBot },
    { enabled: !!selectedBot }
  );

  const schedulesQuery = trpc.botProfile.getSchedules.useQuery(
    { agentType: selectedBot },
    { enabled: !!selectedBot && selectedTab === "schedules" }
  );

  const safetyRulesQuery = trpc.botProfile.getSafetyRules.useQuery(
    { agentType: selectedBot },
    { enabled: !!selectedBot && selectedTab === "safety" }
  );

  const updateProfileMutation = trpc.botProfile.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Bot profile updated");
      profileQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update profile");
    },
  });

  const bot = BOT_CONFIG[selectedBot];
  const BotIcon = bot.icon;

  return (
    <div className="page-enter">
      <PageHeader
        icon={<Settings className="h-4 w-4" />}
        title="Bot Settings"
        subtitle="Tune autonomy, instructions, schedules, and safety guardrails per bot"
        accent="violet"
      />
      <div className="p-3 space-y-3 max-w-4xl">
      {/* Bot Selector */}
      <div className="flex gap-2 flex-wrap">
        {(Object.entries(BOT_CONFIG) as [AgentType, typeof BOT_CONFIG[AgentType]][]).map(([id, cfg]) => {
          const Icon = cfg.icon;
          const isSelected = selectedBot === id;
          return (
            <button
              key={id}
              onClick={() => setSelectedBot(id)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 flex-1 sm:flex-initial min-w-0 justify-center ${
                isSelected
                  ? `${cfg.accent} ${cfg.color} shadow-sm`
                  : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{cfg.name}</span>
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="bg-white/[0.03] border border-white/[0.06] p-1 h-auto gap-1 w-full sm:w-auto grid grid-cols-2 sm:flex">
          {[
            { value: "instructions", label: "Instructions", icon: Zap },
            { value: "memory", label: "Memory", icon: Brain },
            { value: "schedules", label: "Schedules", icon: Clock },
            { value: "safety", label: "Safety Rules", icon: Shield },
          ].map((tab) => {
            const TabIcon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center justify-center gap-1.5 text-xs font-medium data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/40 rounded-lg px-2 sm:px-3 py-1.5"
              >
                <TabIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="inline sm:hidden truncate">{tab.label.split(' ')[0]}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Instructions Tab */}
        <TabsContent value="instructions" className="mt-4 space-y-4">
          <div className={`rounded-xl border p-5 ${bot.accent}`}>
            <div className="flex items-center gap-2 mb-4">
              <BotIcon className={`w-5 h-5 ${bot.color}`} />
              <h3 className="font-semibold text-white">Bot Instructions</h3>
              <span className="text-xs text-white/30 ml-auto">Customize how {bot.name} behaves</span>
            </div>

            {profileQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full bg-white/5" />)}
              </div>
            ) : profileQuery.data ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Bot Name</label>
                  <Input
                    defaultValue={profileQuery.data.name}
                    placeholder="e.g., My Store Bot"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Description</label>
                  <Textarea
                    defaultValue={profileQuery.data.description || ""}
                    placeholder="What does this bot do?"
                    rows={3}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/20 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Personality</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/20">
                    <option value="professional">Professional</option>
                    <option value="casual">Casual</option>
                    <option value="technical">Technical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Custom Instructions</label>
                  <Textarea
                    defaultValue={profileQuery.data.customInstructions || ""}
                    placeholder="Add specific guidelines for this bot..."
                    rows={6}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/20 resize-none font-mono text-xs"
                  />
                </div>
                <Button
                  onClick={() => updateProfileMutation.mutate({ agentType: selectedBot })}
                  disabled={updateProfileMutation.isPending}
                  className={`w-full font-semibold ${
                    selectedBot === "architect" ? "bg-cyan-500 hover:bg-cyan-600 text-black" :
                    selectedBot === "merchant" ? "bg-violet-500 hover:bg-violet-600 text-white" :
                    "bg-pink-500 hover:bg-pink-600 text-white"
                  }`}
                >
                  {updateProfileMutation.isPending ? (
                    <><span className="animate-pulse">Saving...</span></>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" />Save Instructions</>
                  )}
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={<Settings className="w-5 h-5 text-white/40" />}
                title="No profile data yet"
                description="This bot hasn't been configured. Add instructions on the left to give it personality, guardrails, and a tone of voice."
              />
            )}
          </div>
        </TabsContent>

        {/* Memory Tab */}
        <TabsContent value="memory" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-fuchsia-400" />
            <h3 className="font-semibold text-foreground text-sm">Learned patterns & context</h3>
            <span className="text-[10px] text-white/35 ml-auto">
              Bots write here during runs via the memory tool
            </span>
          </div>
          {selectedTab === "memory" && <BotMemoryView agentType={selectedBot} />}
        </TabsContent>

        {/* Schedules Tab */}
        <TabsContent value="schedules" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-white/40" />
            <h3 className="font-semibold text-white/70 text-sm">Recurring Tasks & Automation Triggers</h3>
          </div>
          {schedulesQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/5" />)}
            </div>
          ) : !schedulesQuery.data || schedulesQuery.data.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Clock className="h-5 w-5 text-white/45" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">No schedules configured</h3>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">
                Schedules let this bot fire on a cadence — daily inventory checks, weekly competitor scans, hourly low-stock sweeps. Add one above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedulesQuery.data.map((schedule: any, idx: number) => (
                <div key={idx} className="bento-card p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-white text-sm">{schedule.name}</p>
                      <p className="text-xs text-white/40 mt-0.5">{schedule.description}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-[10px] border-white/10 text-white/40">{schedule.triggerType}</Badge>
                        {schedule.enabled ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                            <CheckCircle2 className="w-2.5 h-2.5 mr-1" />Active
                          </Badge>
                        ) : (
                          <Badge className="bg-white/5 text-white/30 border-white/10 text-[10px]">
                            <XCircle className="w-2.5 h-2.5 mr-1" />Disabled
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Safety Rules Tab */}
        <TabsContent value="safety" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-white/40" />
            <h3 className="font-semibold text-white/70 text-sm">Approval Requirements & Spending Limits</h3>
          </div>
          {safetyRulesQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/5" />)}
            </div>
          ) : !safetyRulesQuery.data || safetyRulesQuery.data.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" style={{ background: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.25)" }}>
                <Shield className="h-5 w-5 text-amber-400" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">No safety rules configured</h3>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">
                Rules cap autonomous bot actions — spending limits, price floors, action restrictions. Worth setting before you flip the bot to fully-autonomous.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {safetyRulesQuery.data.map((rule: any, idx: number) => (
                <div key={idx} className="bento-card p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-white text-sm">{rule.name}</p>
                      <p className="text-xs text-white/40 mt-0.5">{rule.description}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-[10px] border-white/10 text-white/40">{rule.ruleType}</Badge>
                        <Badge
                          className={`text-[10px] ${
                            rule.action === "block"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : rule.action === "approve_required"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-sky-500/10 text-sky-400 border-sky-500/20"
                          }`}
                        >
                          {rule.action === "block" && <XCircle className="w-2.5 h-2.5 mr-1" />}
                          {rule.action === "approve_required" && <AlertTriangle className="w-2.5 h-2.5 mr-1" />}
                          {rule.action}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
