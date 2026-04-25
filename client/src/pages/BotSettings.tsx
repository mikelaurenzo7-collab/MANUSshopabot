/**
 * Bot Settings Page
 * Per-bot configuration: instructions, memory, schedules, safety rules
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Settings, Brain, Clock, Shield, Zap } from "lucide-react";
import { toast } from "sonner";

type AgentType = "architect" | "merchant" | "social";

export default function BotSettings() {
  const [selectedBot, setSelectedBot] = useState<AgentType>("architect");
  const [selectedTab, setSelectedTab] = useState("instructions");

  const bots: { id: AgentType; name: string; icon: any }[] = [
    { id: "architect", name: "Builder Bot", icon: Zap },
    { id: "merchant", name: "Merchant Bot", icon: Zap },
    { id: "social", name: "Social Bot", icon: Zap },
  ];

  // Queries
  const profileQuery = trpc.botProfile.getProfile.useQuery(
    { agentType: selectedBot },
    { enabled: !!selectedBot }
  );

  const memoryQuery = trpc.botProfile.getMemory.useQuery(
    { agentType: selectedBot },
    { enabled: selectedBot && selectedTab === "memory" }
  );

  const schedulesQuery = trpc.botProfile.getSchedules.useQuery(
    { agentType: selectedBot },
    { enabled: selectedBot && selectedTab === "schedules" }
  );

  const safetyRulesQuery = trpc.botProfile.getSafetyRules.useQuery(
    { agentType: selectedBot },
    { enabled: selectedBot && selectedTab === "safety" }
  );

  // Mutations
  const updateProfileMutation = trpc.botProfile.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Bot profile updated");
      profileQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update profile");
    },
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="w-8 h-8 text-blue-500" />
            Bot Settings
          </h1>
          <p className="text-gray-400 mt-1">Configure individual bot behavior, memory, and safety rules</p>
        </div>
      </div>

      {/* Bot Selector */}
      <div className="flex gap-2 flex-wrap">
        {bots.map((bot) => (
          <button
            key={bot.id}
            onClick={() => setSelectedBot(bot.id)}
            className={`px-4 py-2 rounded-lg transition ${
              selectedBot === bot.id
                ? "bg-blue-600 text-white"
                : "bg-gray-900 text-gray-300 hover:bg-gray-800"
            }`}
          >
            {bot.name}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="instructions">Instructions</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="safety">Safety Rules</TabsTrigger>
        </TabsList>

        {/* Instructions Tab */}
        <TabsContent value="instructions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Bot Instructions
              </CardTitle>
              <CardDescription>Customize how this bot behaves and makes decisions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profileQuery.isLoading && <div className="text-center py-8 text-gray-400">Loading profile...</div>}
              {profileQuery.data && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Bot Name</label>
                    <Input
                      defaultValue={profileQuery.data.name}
                      placeholder="e.g., My Builder Bot"
                      className="bg-gray-900 border-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Description</label>
                    <Textarea
                      defaultValue={profileQuery.data.description || ""}
                      placeholder="What does this bot do?"
                      rows={3}
                      className="bg-gray-900 border-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Personality</label>
                    <select className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white">
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="technical">Technical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Custom Instructions</label>
                    <Textarea
                      defaultValue={profileQuery.data.customInstructions || ""}
                      placeholder="Add specific guidelines for this bot..."
                      rows={6}
                      className="bg-gray-900 border-gray-700"
                    />
                  </div>
                  <Button
                    onClick={() => updateProfileMutation.mutate({ agentType: selectedBot })}
                    disabled={updateProfileMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {updateProfileMutation.isPending ? "Saving..." : "Save Instructions"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Memory Tab */}
        <TabsContent value="memory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Bot Memory
              </CardTitle>
              <CardDescription>Learned patterns, decisions, and context</CardDescription>
            </CardHeader>
            <CardContent>
              {memoryQuery.isLoading && <div className="text-center py-8 text-gray-400">Loading memory...</div>}
              {memoryQuery.data && memoryQuery.data.length === 0 && (
                <div className="text-center py-8 text-gray-400">No memories yet. Bot will learn as it operates.</div>
              )}
              <div className="space-y-3">
                {memoryQuery.data?.map((mem: any, idx: number) => (
                  <div key={idx} className="border border-gray-700 rounded p-4 bg-gray-900/50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-white">{mem.key}</p>
                        <Badge variant="outline" className="mt-1">
                          {mem.memoryType}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Confidence: {mem.confidence}%</p>
                        <p className="text-xs text-gray-500 mt-1">Accessed {mem.accessCount} times</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300 mt-2 line-clamp-2">{mem.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedules Tab */}
        <TabsContent value="schedules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Bot Schedules
              </CardTitle>
              <CardDescription>Recurring tasks and automation triggers</CardDescription>
            </CardHeader>
            <CardContent>
              {schedulesQuery.isLoading && <div className="text-center py-8 text-gray-400">Loading schedules...</div>}
              {schedulesQuery.data && schedulesQuery.data.length === 0 && (
                <div className="text-center py-8 text-gray-400">No schedules configured yet</div>
              )}
              <div className="space-y-3">
                {schedulesQuery.data?.map((schedule: any, idx: number) => (
                  <div key={idx} className="border border-gray-700 rounded p-4 bg-gray-900/50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-white">{schedule.name}</p>
                        <p className="text-sm text-gray-400 mt-1">{schedule.description}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">{schedule.triggerType}</Badge>
                          {schedule.enabled ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                          ) : (
                            <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Disabled</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Safety Rules Tab */}
        <TabsContent value="safety" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Safety Rules
              </CardTitle>
              <CardDescription>Approval requirements and spending limits</CardDescription>
            </CardHeader>
            <CardContent>
              {safetyRulesQuery.isLoading && <div className="text-center py-8 text-gray-400">Loading safety rules...</div>}
              {safetyRulesQuery.data && safetyRulesQuery.data.length === 0 && (
                <div className="text-center py-8 text-gray-400">No safety rules configured</div>
              )}
              <div className="space-y-3">
                {safetyRulesQuery.data?.map((rule: any, idx: number) => (
                  <div key={idx} className="border border-gray-700 rounded p-4 bg-gray-900/50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-white">{rule.name}</p>
                        <p className="text-sm text-gray-400 mt-1">{rule.description}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">{rule.ruleType}</Badge>
                          <Badge
                            className={
                              rule.action === "block"
                                ? "bg-red-500/20 text-red-400 border-red-500/30"
                                : rule.action === "approve_required"
                                  ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                                  : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                            }
                          >
                            {rule.action}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
