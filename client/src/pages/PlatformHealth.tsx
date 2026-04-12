import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, Activity,
  ShoppingBag, Share2, Zap, Clock, AlertTriangle, Wifi, WifiOff,
} from "lucide-react";

const PLATFORM_ICONS: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🌐", amazon: "📦", etsy: "🧡",
  ebay: "🔨", tiktok_shop: "🎵", walmart: "🏪",
  meta: "📘", instagram: "📸", tiktok: "🎶", twitter: "🐦",
  pinterest: "📌", google_ads: "🎯", linkedin: "💼",
};

const PLATFORM_COLORS: Record<string, string> = {
  shopify: "border-green-500/30 bg-green-500/5",
  woocommerce: "border-purple-500/30 bg-purple-500/5",
  amazon: "border-orange-500/30 bg-orange-500/5",
  etsy: "border-red-500/30 bg-red-500/5",
  ebay: "border-blue-500/30 bg-blue-500/5",
  tiktok_shop: "border-pink-500/30 bg-pink-500/5",
  walmart: "border-sky-500/30 bg-sky-500/5",
  meta: "border-blue-600/30 bg-blue-600/5",
  instagram: "border-fuchsia-500/30 bg-fuchsia-500/5",
  tiktok: "border-pink-500/30 bg-pink-500/5",
  twitter: "border-sky-400/30 bg-sky-400/5",
  pinterest: "border-red-500/30 bg-red-500/5",
  google_ads: "border-yellow-500/30 bg-yellow-500/5",
  linkedin: "border-blue-700/30 bg-blue-700/5",
};

type HealthResult = {
  id: number;
  platform: string;
  type: "ecommerce" | "social";
  storeName?: string;
  accountName?: string;
  healthy: boolean;
  message: string;
  latencyMs: number;
  checkedAt: number;
};

type HealthData = {
  ecommerce: HealthResult[];
  social: HealthResult[];
  summary: { total: number; healthy: number; unhealthy: number; overallHealthy: boolean };
};

function HealthCard({ result }: { result: HealthResult }) {
  const label = result.storeName ?? result.accountName ?? result.platform;
  const colorClass = PLATFORM_COLORS[result.platform] ?? "border-zinc-700 bg-zinc-900/30";
  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${colorClass}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-2xl shrink-0">{PLATFORM_ICONS[result.platform] ?? "🔌"}</span>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{label}</p>
          <p className="text-xs text-muted-foreground capitalize">{result.platform.replace(/_/g, " ")}</p>
          {!result.healthy && (
            <p className="text-xs text-red-400 mt-0.5 truncate">{result.message}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        {result.healthy ? (
          <>
            <span className="text-xs text-muted-foreground/60">{result.latencyMs}ms</span>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Healthy
            </Badge>
          </>
        ) : (
          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">
            <XCircle className="w-3 h-3 mr-1" /> Down
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function PlatformHealth() {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const { data: summary } = trpc.health.summary.useQuery();

  const checkMutation = trpc.health.checkAll.useMutation({
    onSuccess: (data) => {
      setHealthData(data as HealthData);
      setLastChecked(new Date());
      const { healthy, total } = data.summary;
      if (total === 0) {
        toast.info("No platforms connected", { description: "Connect stores and social accounts in Integrations." });
      } else if (data.summary.overallHealthy) {
        toast.success(`All ${total} platforms healthy`, { description: "Every connection is responding normally." });
      } else {
        toast.warning(`${total - healthy} platform${total - healthy > 1 ? "s" : ""} need attention`, {
          description: "Check the details below for error messages.",
        });
      }
    },
    onError: (err) => toast.error("Health check failed", { description: err.message }),
  });

  const totalConnected = (summary?.credentials ?? 0) + (summary?.socialAccounts ?? 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Platform Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live connectivity check for all {totalConnected} connected platforms
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Checked {lastChecked.toLocaleTimeString()}
            </span>
          )}
          <Button
            onClick={() => checkMutation.mutate()}
            disabled={checkMutation.isPending}
            className="gap-2"
          >
            {checkMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {checkMutation.isPending ? "Checking..." : "Run Health Check"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {healthData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className={`border ${healthData.summary.overallHealthy ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <CardContent className="py-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${healthData.summary.overallHealthy ? "bg-emerald-500/20" : "bg-amber-500/20"}`}>
                {healthData.summary.overallHealthy ? <Wifi className="w-6 h-6 text-emerald-400" /> : <WifiOff className="w-6 h-6 text-amber-400" />}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Overall Status</p>
                <p className={`text-lg font-bold ${healthData.summary.overallHealthy ? "text-emerald-400" : "text-amber-400"}`}>
                  {healthData.summary.total === 0 ? "No Platforms" : healthData.summary.overallHealthy ? "All Systems Go" : "Issues Detected"}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Healthy</p>
                <p className="text-2xl font-bold text-emerald-400">{healthData.summary.healthy}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Unhealthy</p>
                <p className="text-2xl font-bold text-red-400">{healthData.summary.unhealthy}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No Platforms State */}
      {!healthData && totalConnected === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Zap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No platforms connected</p>
            <p className="text-xs text-muted-foreground/60 mt-2 max-w-sm mx-auto">
              Connect your stores and social accounts in the Integrations page, then run a health check to verify connectivity.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pre-check state */}
      {!healthData && totalConnected > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-12 text-center">
            <Activity className="w-12 h-12 text-primary/50 mx-auto mb-4" />
            <p className="text-foreground font-medium">Ready to check {totalConnected} connected platform{totalConnected > 1 ? "s" : ""}</p>
            <p className="text-xs text-muted-foreground mt-2 mb-6">
              Click "Run Health Check" to verify all API connections are live and responding.
            </p>
            <Button onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending} className="gap-2">
              {checkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {checkMutation.isPending ? "Running checks..." : "Run Health Check"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {healthData && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* E-Commerce Platforms */}
          {healthData.ecommerce.length > 0 && (
            <Card className="border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4" />
                  E-Commerce Platforms ({healthData.ecommerce.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {healthData.ecommerce.map((r) => (
                  <HealthCard key={`ecom-${r.id}`} result={r} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Social Platforms */}
          {healthData.social.length > 0 && (
            <Card className="border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Share2 className="w-4 h-4" />
                  Social & Ads Platforms ({healthData.social.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {healthData.social.map((r) => (
                  <HealthCard key={`social-${r.id}`} result={r} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Webhook Status */}
          <Card className="border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Webhook Listeners
              </CardTitle>
              <CardDescription className="text-xs">Real-time event listeners for automated bot triggers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: "Shopify Order Webhook", event: "orders/create + orders/paid + orders/fulfilled", status: "active" },
                { name: "Shopify Product Webhook", event: "products/update", status: "active" },
                { name: "Shopify Inventory Webhook", event: "inventory_levels/update", status: "active" },
              ].map((wh) => (
                <div key={wh.name} className="flex items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                  <div>
                    <p className="font-medium text-sm">{wh.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{wh.event}</p>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
