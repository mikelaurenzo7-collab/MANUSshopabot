import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  Info,
  CheckCircle2,
  XCircle,
  Activity,
} from "lucide-react";

type AutonomyLevel = "fully_autonomous" | "supervised" | "manual";

const agents = [
  {
    key: "architect" as const,
    name: "Builder Bot",
    description: "Niche research, product sourcing, and store setup",
    icon: Bot,
    color: "text-violet-400",
    bgColor: "bg-violet-500/15",
  },
  {
    key: "merchant" as const,
    name: "Merchant Bot",
    description: "Inventory monitoring, pricing, and fulfillment",
    icon: Package,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/15",
  },
  {
    key: "social" as const,
    name: "Social Bot",
    description: "Ad copy, social media, SEO, and email campaigns",
    icon: Megaphone,
    color: "text-amber-400",
    bgColor: "bg-amber-500/15",
  },
];

const autonomyOptions: {
  value: AutonomyLevel;
  label: string;
  description: string;
  icon: typeof Zap;
  color: string;
}[] = [
  {
    value: "fully_autonomous",
    label: "Fully Autonomous",
    description: "Bot executes all actions without approval. Zero-touch operation.",
    icon: Zap,
    color: "text-emerald-400",
  },
  {
    value: "supervised",
    label: "Supervised",
    description: "Bot executes low-impact actions automatically; pauses for high-impact decisions.",
    icon: Eye,
    color: "text-amber-400",
  },
  {
    value: "manual",
    label: "Manual",
    description: "Bot suggests actions but waits for human approval before executing anything.",
    icon: Hand,
    color: "text-red-400",
  },
];

function CredentialDiagnostics() {
  const { data, isLoading } = trpc.diagnostics.credentialStatus.useQuery();

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">Platform Credential Status</CardTitle>
        </div>
        <CardDescription>
          Live check of all API keys and secrets configured in your environment
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : data ? (
          <>
            <div className="flex gap-4 mb-4 p-3 rounded-lg bg-secondary/30">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{data.summary.configured}</div>
                <div className="text-xs text-muted-foreground">Configured</div>
              </div>
              <Separator orientation="vertical" className="h-auto" />
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{data.summary.missing}</div>
                <div className="text-xs text-muted-foreground">Missing</div>
              </div>
              <Separator orientation="vertical" className="h-auto" />
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{data.summary.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {data.results.map((r) => (
                <div key={r.key} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center gap-2">
                    {r.configured
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                      : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                    <span className="text-xs font-mono text-muted-foreground">{r.key}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{r.platform}</Badge>
                    {r.configured && r.preview && (
                      <span className="text-xs font-mono text-muted-foreground/60">{r.preview}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ConfigPage() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

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

  const { data: configs, isLoading } = trpc.botConfig.list.useQuery();
  const utils = trpc.useUtils();

  // Per-bot autonomy and enable state
  const [architectEnabled, setArchitectEnabled] = useState(true);
  const [merchantEnabled, setMerchantEnabled] = useState(true);
  const [socialEnabled, setSocialEnabled] = useState(true);
  const [architectAutonomy, setArchitectAutonomy] = useState<AutonomyLevel>("fully_autonomous");
  const [merchantAutonomy, setMerchantAutonomy] = useState<AutonomyLevel>("fully_autonomous");
  const [socialAutonomy, setSocialAutonomy] = useState<AutonomyLevel>("fully_autonomous");

  // Merchant-specific settings
  const [autoFulfill, setAutoFulfill] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState("5");

      // Social Bot-specific settings
  const [maxDailySpend, setMaxDailySpend] = useState("100");

  // Global safety settings (applied to all bots)
  const [approvalRequired, setApprovalRequired] = useState(false);

  // Hydrate from DB on load
  useEffect(() => {
    if (configs && configs.length > 0) {
      const archConf = configs.find((c: any) => c.agentType === "architect");
      const merchConf = configs.find((c: any) => c.agentType === "merchant");
      const socialConf = configs.find((c: any) => c.agentType === "social");

      setArchitectEnabled(archConf?.enabled ?? true);
      setMerchantEnabled(merchConf?.enabled ?? true);
      setSocialEnabled(socialConf?.enabled ?? true);

      setArchitectAutonomy((archConf?.autonomyLevel as AutonomyLevel) ?? "fully_autonomous");
      setMerchantAutonomy((merchConf?.autonomyLevel as AutonomyLevel) ?? "fully_autonomous");
      setSocialAutonomy((socialConf?.autonomyLevel as AutonomyLevel) ?? "fully_autonomous");

      setAutoFulfill(merchConf?.autoApprove ?? true);

      // Load persisted lowStockThreshold (any bot's value, merchant is canonical)
      if (merchConf?.lowStockThreshold != null) {
        setLowStockThreshold(String(merchConf.lowStockThreshold));
      }

      // Load persisted approvalRequired (any bot's value, architect is canonical)
      if (archConf?.approvalRequired != null) {
        setApprovalRequired(archConf.approvalRequired);
      }

      if (socialConf?.maxBudgetCents) {
        setMaxDailySpend(String(socialConf.maxBudgetCents / 100));
      }
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
      // Save Architect config (carries global approvalRequired)
      await upsertConfig.mutateAsync({
        agentType: "architect",
        enabled: architectEnabled,
        autonomyLevel: architectAutonomy,
        approvalRequired,
      });

      // Save Merchant config (carries lowStockThreshold + autoFulfill)
      await upsertConfig.mutateAsync({
        agentType: "merchant",
        enabled: merchantEnabled,
        autoApprove: autoFulfill,
        autonomyLevel: merchantAutonomy,
        lowStockThreshold: Number(lowStockThreshold),
        approvalRequired,
      });

      // Save Social Bot config (carries maxBudgetCents)
      await upsertConfig.mutateAsync({
        agentType: "social",
        enabled: socialEnabled,
        maxBudgetCents: Number(maxDailySpend) * 100,
        autonomyLevel: socialAutonomy,
        approvalRequired,
      });

      toast.success("All bot configurations saved!");
    } catch {
      // handled by onError
    }
  };

  const getAutonomyState = (key: string) => {
    if (key === "architect") return { value: architectAutonomy, set: setArchitectAutonomy };
    if (key === "merchant") return { value: merchantAutonomy, set: setMerchantAutonomy };
    return { value: socialAutonomy, set: setSocialAutonomy };
  };

  const getEnabledState = (key: string) => {
    if (key === "architect") return { value: architectEnabled, set: setArchitectEnabled };
    if (key === "merchant") return { value: merchantEnabled, set: setMerchantEnabled };
    return { value: socialEnabled, set: setSocialEnabled };
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
            <p className="text-sm text-muted-foreground">Automation rules, autonomy levels, and bot controls</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={upsertConfig.isPending}>
          {upsertConfig.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Save All
        </Button>
      </div>

      {/* Info banner: settings are global */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          These settings apply globally to all connected stores. Bots default to{" "}
          <span className="font-semibold text-emerald-400">Fully Autonomous</span> mode for Zero-Touch commerce.
          Adjust autonomy levels to add human oversight where needed.
        </p>
      </div>

      {isLoading ? (
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
          {/* Per-Bot Controls */}
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
                                <OptIcon
                                  className={`h-4 w-4 ${isSelected ? opt.color : "text-muted-foreground"}`}
                                />
                                <span
                                  className={`text-sm font-medium ${
                                    isSelected ? "text-foreground" : "text-muted-foreground"
                                  }`}
                                >
                                  {opt.label}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{opt.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Merchant-specific settings */}
                    {agent.key === "merchant" && (
                      <div className="mt-4 space-y-3">
                        <Separator />
                        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                          <div>
                            <p className="text-sm font-medium text-foreground">Auto-Fulfillment</p>
                            <p className="text-xs text-muted-foreground">
                              Automatically process orders without human intervention
                            </p>
                          </div>
                          <Switch checked={autoFulfill} onCheckedChange={setAutoFulfill} />
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <Label className="text-sm font-medium text-foreground mb-2 block">
                            Low Stock Alert Threshold
                          </Label>
                          <p className="text-xs text-muted-foreground mb-2">
                            Alert when product stock falls below this number of units
                          </p>
                          <Input
                            type="number"
                            min="1"
                            max="10000"
                            value={lowStockThreshold}
                            onChange={(e) => setLowStockThreshold(e.target.value)}
                            className="bg-input/50 w-32"
                          />
                        </div>
                      </div>
                    )}

                    {/* Social Bot-specific settings */}
                    {agent.key === "social" && (
                      <div className="mt-4 space-y-3">
                        <Separator />
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <Label className="text-sm font-medium text-foreground mb-2 block">
                            Max Daily Ad Spend
                          </Label>
                          <p className="text-xs text-muted-foreground mb-2">
                            Maximum daily budget across all ad platforms
                          </p>
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

          {/* Credential Diagnostics — admin only */}
          {user?.role === "admin" && <CredentialDiagnostics />}

          {/* Global Safety & Approvals */}
          <Card className="bg-card border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">Global Safety Controls</CardTitle>
              </div>
              <CardDescription>
                Override settings that apply to all bots regardless of autonomy level
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div>
                  <p className="text-sm font-medium text-foreground">Require Approval for Critical Decisions</p>
                  <p className="text-xs text-muted-foreground">
                    Even fully autonomous bots will pause before executing critical actions (e.g., spending over
                    $500, deleting products). Saved to all bots.
                  </p>
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
