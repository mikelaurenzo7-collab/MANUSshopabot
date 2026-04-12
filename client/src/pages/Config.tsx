import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Settings,
  Bot,
  Package,
  Megaphone,
  Loader2,
  Save,
  Shield,
  Zap,
  Eye,
  Hand,
} from "lucide-react";

type AutonomyLevel = "fully_autonomous" | "supervised" | "manual";

const agents = [
  {
    key: "architect" as const,
    name: "The Architect Agent",
    description: "Niche research, product sourcing, and store setup",
    icon: Bot,
    color: "text-violet-400",
    bgColor: "bg-violet-500/15",
  },
  {
    key: "merchant" as const,
    name: "The Merchant Agent",
    description: "Inventory monitoring, pricing, and fulfillment",
    icon: Package,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/15",
  },
  {
    key: "hypeman" as const,
    name: "The Hype-Man Agent",
    description: "Ad copy, social media, SEO, and email campaigns",
    icon: Megaphone,
    color: "text-amber-400",
    bgColor: "bg-amber-500/15",
  },
];

const autonomyOptions: { value: AutonomyLevel; label: string; description: string; icon: typeof Zap; color: string }[] = [
  {
    value: "fully_autonomous",
    label: "Fully Autonomous",
    description: "Agent executes all actions without approval. Zero-touch operation.",
    icon: Zap,
    color: "text-emerald-400",
  },
  {
    value: "supervised",
    label: "Supervised",
    description: "Agent executes low-impact actions automatically; pauses for high-impact decisions.",
    icon: Eye,
    color: "text-amber-400",
  },
  {
    value: "manual",
    label: "Manual",
    description: "Agent suggests actions but waits for human approval before executing anything.",
    icon: Hand,
    color: "text-red-400",
  },
];

export default function ConfigPage() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedStore, setSelectedStore] = useState<string>("");

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      setLocation("/");
    }
  }, [loading, user, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  const { data: stores } = trpc.stores.list.useQuery();
  const { data: configs, isLoading } = trpc.botConfig.list.useQuery();
  const utils = trpc.useUtils();

  // Per-agent state
  const [architectEnabled, setArchitectEnabled] = useState(true);
  const [merchantEnabled, setMerchantEnabled] = useState(true);
  const [hypemanEnabled, setHypemanEnabled] = useState(true);
  const [architectAutonomy, setArchitectAutonomy] = useState<AutonomyLevel>("supervised");
  const [merchantAutonomy, setMerchantAutonomy] = useState<AutonomyLevel>("supervised");
  const [hypemanAutonomy, setHypemanAutonomy] = useState<AutonomyLevel>("supervised");
  const [autoFulfill, setAutoFulfill] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [maxDailySpend, setMaxDailySpend] = useState("100");
  const [approvalRequired, setApprovalRequired] = useState(true);

  useEffect(() => {
    if (configs && configs.length > 0) {
      const archConf = configs.find((c: any) => c.agentType === "architect");
      const merchConf = configs.find((c: any) => c.agentType === "merchant");
      const hypeConf = configs.find((c: any) => c.agentType === "hypeman");
      setArchitectEnabled(archConf?.enabled ?? true);
      setMerchantEnabled(merchConf?.enabled ?? true);
      setHypemanEnabled(hypeConf?.enabled ?? true);
      setArchitectAutonomy((archConf?.autonomyLevel as AutonomyLevel) ?? "supervised");
      setMerchantAutonomy((merchConf?.autonomyLevel as AutonomyLevel) ?? "supervised");
      setHypemanAutonomy((hypeConf?.autonomyLevel as AutonomyLevel) ?? "supervised");
      setAutoFulfill(merchConf?.autoApprove ?? true);
      if (hypeConf?.maxBudgetCents) setMaxDailySpend(String(hypeConf.maxBudgetCents / 100));
    }
  }, [configs]);

  const upsertConfig = trpc.botConfig.upsert.useMutation({
    onSuccess: () => {
      utils.botConfig.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSave = async () => {
    try {
      await upsertConfig.mutateAsync({
        agentType: "architect",
        enabled: architectEnabled,
        autonomyLevel: architectAutonomy,
      });
      await upsertConfig.mutateAsync({
        agentType: "merchant",
        enabled: merchantEnabled,
        autoApprove: autoFulfill,
        autonomyLevel: merchantAutonomy,
      });
      await upsertConfig.mutateAsync({
        agentType: "hypeman",
        enabled: hypemanEnabled,
        maxBudgetCents: Number(maxDailySpend) * 100,
        autonomyLevel: hypemanAutonomy,
      });
      toast.success("All configurations saved!");
    } catch (e) {
      // handled by onError
    }
  };

  const getAutonomyState = (key: string) => {
    if (key === "architect") return { value: architectAutonomy, set: setArchitectAutonomy };
    if (key === "merchant") return { value: merchantAutonomy, set: setMerchantAutonomy };
    return { value: hypemanAutonomy, set: setHypemanAutonomy };
  };

  const getEnabledState = (key: string) => {
    if (key === "architect") return { value: architectEnabled, set: setArchitectEnabled };
    if (key === "merchant") return { value: merchantEnabled, set: setMerchantEnabled };
    return { value: hypemanEnabled, set: setHypemanEnabled };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Bot Configuration</h1>
            <p className="text-sm text-muted-foreground">Automation rules, autonomy levels, and agent controls</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-48 bg-input/50">
              <SelectValue placeholder="Select store" />
            </SelectTrigger>
            <SelectContent>
              {(stores ?? []).map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSave} disabled={upsertConfig.isPending}>
            {upsertConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save All
          </Button>
        </div>
      </div>

      {!selectedStore ? (
        <Card className="bg-card border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Settings className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Select a store to configure</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-card border-border/50">
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Agent Controls + Autonomy Levels */}
          {agents.map((agent) => {
            const Icon = agent.icon;
            const enabled = getEnabledState(agent.key);
            const autonomy = getAutonomyState(agent.key);

            return (
              <Card key={agent.key} className="bg-card border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg ${agent.bgColor} flex items-center justify-center`}>
                        <Icon className={`h-5 w-5 ${agent.color}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">{agent.name}</CardTitle>
                        <CardDescription>{agent.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={enabled.value ? "default" : "secondary"} className="text-xs">
                        {enabled.value ? "Active" : "Disabled"}
                      </Badge>
                      <Switch checked={enabled.value} onCheckedChange={enabled.set} />
                    </div>
                  </div>
                </CardHeader>
                {enabled.value && (
                  <CardContent className="pt-0">
                    <Separator className="mb-4" />
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-primary" />
                        Autonomy Level
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        {autonomyOptions.map((opt) => {
                          const OptIcon = opt.icon;
                          const isSelected = autonomy.value === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => autonomy.set(opt.value)}
                              className={`p-3 rounded-lg border text-left transition-all ${
                                isSelected
                                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                                  : "border-border/50 bg-secondary/30 hover:bg-secondary/50"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <OptIcon className={`h-4 w-4 ${isSelected ? opt.color : "text-muted-foreground"}`} />
                                <span className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                                  {opt.label}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{opt.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Agent-specific settings */}
                    {agent.key === "merchant" && (
                      <div className="mt-4 space-y-3">
                        <Separator />
                        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                          <div>
                            <p className="text-sm font-medium text-foreground">Auto-Fulfillment</p>
                            <p className="text-xs text-muted-foreground">Automatically process orders without human intervention</p>
                          </div>
                          <Switch checked={autoFulfill} onCheckedChange={setAutoFulfill} />
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <Label className="text-sm font-medium text-foreground mb-2 block">Low Stock Alert Threshold</Label>
                          <p className="text-xs text-muted-foreground mb-2">Alert when product stock falls below this number</p>
                          <Input
                            type="number"
                            min="1"
                            value={lowStockThreshold}
                            onChange={(e) => setLowStockThreshold(e.target.value)}
                            className="bg-input/50 w-32"
                          />
                        </div>
                      </div>
                    )}

                    {agent.key === "hypeman" && (
                      <div className="mt-4 space-y-3">
                        <Separator />
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <Label className="text-sm font-medium text-foreground mb-2 block">Max Daily Ad Spend</Label>
                          <p className="text-xs text-muted-foreground mb-2">Maximum daily budget across all ad platforms</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">$</span>
                            <Input
                              type="number"
                              min="0"
                              value={maxDailySpend}
                              onChange={(e) => setMaxDailySpend(e.target.value)}
                              className="bg-input/50 w-32"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Global Safety & Approvals */}
          <Card className="bg-card border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">Global Safety Controls</CardTitle>
              </div>
              <CardDescription>Override settings that apply to all agents regardless of autonomy level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div>
                  <p className="text-sm font-medium text-foreground">Require Approval for Critical Decisions</p>
                  <p className="text-xs text-muted-foreground">Even fully autonomous agents will pause before executing critical actions (e.g., spending over $500, deleting products)</p>
                </div>
                <Switch checked={approvalRequired} onCheckedChange={setApprovalRequired} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
