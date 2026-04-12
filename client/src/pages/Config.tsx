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
import { toast } from "sonner";
import {
  Settings,
  Bot,
  Package,
  Megaphone,
  Loader2,
  Save,
  Shield,
} from "lucide-react";

const agents = [
  {
    key: "architect",
    name: "The Architect Agent",
    description: "Niche research, product sourcing, and store setup",
    icon: Bot,
    color: "text-violet-400",
    bgColor: "bg-violet-500/15",
  },
  {
    key: "merchant",
    name: "The Merchant Agent",
    description: "Inventory monitoring, pricing, and fulfillment",
    icon: Package,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/15",
  },
  {
    key: "hypeman",
    name: "The Hype-Man Agent",
    description: "Ad copy, social media, SEO, and email campaigns",
    icon: Megaphone,
    color: "text-amber-400",
    bgColor: "bg-amber-500/15",
  },
];

export default function ConfigPage() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedStore, setSelectedStore] = useState<string>("");
  const storeId = selectedStore ? Number(selectedStore) : undefined;

  // Redirect non-admins away from this page
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
    return null; // Will redirect via useEffect
  }

  const { data: stores } = trpc.stores.list.useQuery();
  const { data: configs, isLoading } = trpc.botConfig.list.useQuery();
  const utils = trpc.useUtils();

  const [architectEnabled, setArchitectEnabled] = useState(true);
  const [merchantEnabled, setMerchantEnabled] = useState(true);
  const [hypemanEnabled, setHypemanEnabled] = useState(true);
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
      setAutoFulfill(merchConf?.autoApprove ?? true);
      if (hypeConf?.maxBudgetCents) setMaxDailySpend(String(hypeConf.maxBudgetCents / 100));
    }
  }, [configs]);

  const upsertConfig = trpc.botConfig.upsert.useMutation({
    onSuccess: () => {
      toast.success("Configuration saved!");
      utils.botConfig.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSave = async () => {
    try {
      await upsertConfig.mutateAsync({ agentType: "architect", enabled: architectEnabled });
      await upsertConfig.mutateAsync({ agentType: "merchant", enabled: merchantEnabled, autoApprove: autoFulfill });
      await upsertConfig.mutateAsync({ agentType: "hypeman", enabled: hypemanEnabled, maxBudgetCents: Number(maxDailySpend) * 100 });
    } catch (e) {
      // handled by onError
    }
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
            <p className="text-sm text-muted-foreground">Automation rules, thresholds, and agent controls</p>
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
            Save
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
          {/* Agent Toggles */}
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Agent Controls</CardTitle>
              <CardDescription>Toggle individual agents on or off</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {agents.map((agent) => {
                const Icon = agent.icon;
                const enabled =
                  agent.key === "architect" ? architectEnabled :
                  agent.key === "merchant" ? merchantEnabled :
                  hypemanEnabled;
                const setEnabled =
                  agent.key === "architect" ? setArchitectEnabled :
                  agent.key === "merchant" ? setMerchantEnabled :
                  setHypemanEnabled;

                return (
                  <div key={agent.key} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-lg ${agent.bgColor} flex items-center justify-center`}>
                        <Icon className={`h-4.5 w-4.5 ${agent.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.description}</p>
                      </div>
                    </div>
                    <Switch checked={enabled} onCheckedChange={setEnabled} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Merchant Settings */}
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Merchant Settings</CardTitle>
              <CardDescription>Fulfillment and inventory automation rules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Marketing Settings */}
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Marketing Settings</CardTitle>
              <CardDescription>Ad spend limits and campaign controls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Safety & Approvals */}
          <Card className="bg-card border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">Safety & Approvals</CardTitle>
              </div>
              <CardDescription>Control when agents need human approval</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div>
                  <p className="text-sm font-medium text-foreground">Require Approval for High-Impact Decisions</p>
                  <p className="text-xs text-muted-foreground">Agents will pause and request approval before executing critical actions</p>
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
