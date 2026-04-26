import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, Activity,
  ShoppingBag, Share2, Zap, Clock, AlertTriangle, Wifi, WifiOff,
  Radio, SkipForward, AlertOctagon, ShieldAlert, Network, ChevronDown, ChevronRight
} from "lucide-react";
import InfraTopology from "@/components/InfraTopology";

const PLATFORM_ICONS: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🌐", amazon: "📦", etsy: "🧡",
  ebay: "🔨", tiktok_shop: "🎵", walmart: "🏪",
  meta: "📘", instagram: "📸", tiktok: "🎶", twitter: "🐦",
};

const PLATFORM_COLORS: Record<string, string> = {
  shopify: "border-green-500/30 bg-green-500/5",
  woocommerce: "border-blue-500/30 bg-blue-500/5",
  amazon: "border-orange-500/30 bg-orange-500/5",
  etsy: "border-red-500/30 bg-red-500/5",
  ebay: "border-blue-500/30 bg-blue-500/5",
  tiktok_shop: "border-pink-500/30 bg-pink-500/5",
  walmart: "border-sky-500/30 bg-sky-500/5",
  meta: "border-blue-600/30 bg-blue-600/5",
  instagram: "border-cyan-500/30 bg-cyan-500/5",
  tiktok: "border-pink-500/30 bg-pink-500/5",
  twitter: "border-sky-400/30 bg-sky-400/5",
  pinterest: "border-red-500/30 bg-red-500/5",
  google_ads: "border-yellow-500/30 bg-yellow-500/5",
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
            <span className="text-xs text-white/30">{result.latencyMs}ms</span>
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

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  received:  { color: "text-sky-400 bg-sky-400/10 border-sky-400/20",     icon: <Radio className="w-3 h-3" />,        label: "Received"  },
  processed: { color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", icon: <CheckCircle2 className="w-3 h-3" />, label: "Processed" },
  failed:    { color: "text-red-400 bg-red-400/10 border-red-400/20",       icon: <AlertOctagon className="w-3 h-3" />, label: "Failed"    },
  skipped:   { color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",    icon: <SkipForward className="w-3 h-3" />,  label: "Skipped"   },
};

function WebhookEventLog() {
  const { data: events, isLoading, refetch } = trpc.health.webhookEvents.useQuery(
    { limit: 50 },
    { refetchInterval: 15000 }
  );

  return (
    <Card className="border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-4 h-4 text-sky-400" />
              Live Webhook Event Log
            </CardTitle>
            <CardDescription className="text-xs mt-1">Last 50 incoming webhook events · auto-refreshes every 15s</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !events || events.length === 0 ? (
          <div className="text-center py-10">
            <Radio className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No webhook events yet</p>
            <p className="text-xs text-white/25 mt-1">Events will appear here as your stores send webhooks to SHOPaBOT.</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {(events as any[]).map((evt: any) => {
              const cfg = STATUS_CONFIG[evt.status] ?? STATUS_CONFIG.received;
              return (
                <div key={evt.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <span className="text-base shrink-0">{PLATFORM_ICONS[evt.platform] ?? "🔌"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-white/80 truncate">{evt.eventType}</span>
                      <span className="text-white/20 text-xs hidden sm:inline">·</span>
                      <span className="text-xs text-white/30 capitalize hidden sm:inline">{evt.platform.replace(/_/g, " ")}</span>
                    </div>
                    <div className="text-xs text-white/25 mt-0.5">{new Date(evt.createdAt).toLocaleString()}{evt.processingMs ? ` · ${evt.processingMs}ms` : ""}</div>
                    {evt.errorMessage && <div className="text-xs text-red-400 mt-0.5 truncate">{evt.errorMessage}</div>}
                  </div>
                  <Badge variant="outline" className={`text-[10px] border shrink-0 flex items-center gap-1 ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Admin-only triage view: lists the most recent failed BullMQ jobs across
 * the webhook + external API queues. Hidden for non-admin users so we
 * don't surface 403s. Auto-refreshes every 30s so admins can watch a
 * misbehaving integration recover (or not).
 */
function QueueFailuresLog() {
  const { data, isLoading, isError, refetch, isFetching } = trpc.queueHealth.recentFailures.useQuery(
    { limit: 20 },
    { refetchInterval: 30_000, retry: false },
  );

  const failures =
    data && "success" in data && data.success ? data.data : null;

  const total =
    (failures?.webhooks.length ?? 0) + (failures?.externalApis.length ?? 0);

  return (
    <Card className="border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Queue Failures
              {total > 0 && (
                <span className="ml-1 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-1.5 py-0.5">
                  {total}
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Most recent failed jobs across webhook + external-API queues · admin only · auto-refreshes every 30s
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            disabled={isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : isError || (data && !("success" in data ? data.success : true)) ? (
          <div className="text-center py-8">
            <AlertOctagon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Could not reach the queue layer
            </p>
            <p className="text-xs text-white/25 mt-1">
              {data && "error" in data ? data.error : "Redis may be unreachable"}
            </p>
          </div>
        ) : total === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No failed jobs</p>
            <p className="text-xs text-white/25 mt-1">
              Every queue is processing cleanly.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(["webhooks", "externalApis"] as const).map((queue) => {
              const jobs = failures?.[queue] ?? [];
              if (jobs.length === 0) return null;
              return (
                <div key={queue} className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                    {queue === "webhooks" ? "Webhook queue" : "External API queue"} · {jobs.length}
                  </div>
                  {jobs.map((j) => (
                    <div
                      key={`${queue}:${j.id}`}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-amber-500/10 bg-amber-500/[0.02] hover:bg-amber-500/[0.05] transition-colors"
                    >
                      <AlertOctagon className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono font-semibold text-white/85 truncate">
                          {j.name}
                        </div>
                        {j.failedReason && (
                          <div className="text-xs text-red-400/90 mt-0.5 line-clamp-2 break-words">
                            {j.failedReason}
                          </div>
                        )}
                        <div className="text-[11px] text-white/30 mt-0.5">
                          attempt {j.attemptsMade}
                          {j.failedAt
                            ? ` · ${new Date(j.failedAt).toLocaleString()}`
                            : ""}
                          {" · "}
                          <span className="font-mono">{j.id}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlatformHealth() {
  const { user } = useAuth();
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [topologyOpen, setTopologyOpen] = useState(false);
  const { data: summary } = trpc.health.summary.useQuery();
  const { data: backgroundSystems } = trpc.health.backgroundSystems.useQuery(undefined, { refetchInterval: 30000 });

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
    <div className="relative">
      {/* Ghost watermark */}
      <div className="ghost-watermark" aria-hidden="true">HEALTH</div>
      {/* Light leaks */}
      <div className="light-leak-blue" style={{top: '5%', left: '10%'}} aria-hidden="true" />
      <div className="light-leak-purple" style={{top: '50%', right: '5%'}} aria-hidden="true" />
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between page-header">
        <div>
          <p className="micro-label mb-1">System Status</p>
          <h1 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-sky-400" />
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

      {/* Infra Topology — operator-only system map (moved from Command Center) */}
      <Card className="border-sky-500/20 bg-sky-500/[0.03]">
        <CardHeader className="pb-3">
          <button
            type="button"
            onClick={() => setTopologyOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Network className="w-4 h-4" />
                Infrastructure Topology
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Live system map — TiDB, workflow engine, BullMQ, image pipeline, tRPC server
              </CardDescription>
            </div>
            {topologyOpen ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </CardHeader>
        {topologyOpen && (
          <CardContent>
            <InfraTopology />
          </CardContent>
        )}
      </Card>

      {backgroundSystems && (
        <Card className="border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Background Systems
            </CardTitle>
            <CardDescription className="text-xs">Durable automation layers running behind Manus and the command center</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Job Queue</p>
              <p className="text-lg font-bold text-sky-400 mt-1">{backgroundSystems.jobQueue.pending} pending</p>
              <p className="text-xs text-muted-foreground mt-1">
                {backgroundSystems.jobQueue.running} running · {backgroundSystems.jobQueue.failed} failed · {backgroundSystems.jobQueue.completed24h} completed / 24h
              </p>
            </div>
            <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Bot Coordination</p>
              <p className="text-lg font-bold text-cyan-400 mt-1">{backgroundSystems.botCoordination.pending} pending</p>
              <p className="text-xs text-muted-foreground mt-1">
                {backgroundSystems.botCoordination.failed} failed · {backgroundSystems.botCoordination.processed24h} processed / 24h
              </p>
            </div>
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">OAuth State</p>
              <p className="text-lg font-bold text-emerald-400 mt-1">{backgroundSystems.oauthState.active} active</p>
              <p className="text-xs text-muted-foreground mt-1">
                {backgroundSystems.oauthState.expired} expired tokens awaiting cleanup
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Platforms State */}
      {!healthData && totalConnected === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Zap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No platforms connected</p>
            <p className="text-xs text-white/30 mt-2 max-w-sm mx-auto">
              Connect your stores and social accounts in the Integrations page, then run a health check to verify connectivity.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pre-check state */}
      {!healthData && totalConnected > 0 && (
        <Card className="border-primary/20 bg-sky-500/[0.06]">
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

          {/* Webhook Event Log */}
          <WebhookEventLog />

          {/* Admin-only: failed-job triage view */}
          {user?.role === "admin" && <QueueFailuresLog />}
        </div>
      )}
    </div>
    </div>
  );
}
