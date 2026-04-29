import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { getBrand } from "@/lib/platformBrand";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  DollarSign,
  BarChart3,
  Zap,
  RefreshCw,
  PauseCircle,
  Target,
  Activity,
  Package,
  Inbox,
  ChevronUp,
  ChevronDown,
  Minus,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { CountUp } from "@/components/CountUp";

// ─── Scheduler task card ───────────────────────────────────────────────────────
function SchedulerTask({ name, freq, agent }: { name: string; freq: string; agent: string }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03]">
      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-foreground truncate">{name}</p>
        <p className="text-[10px] text-white/40">{freq}</p>
      </div>
    </div>
  );
}

// ─── Severity badge ────────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[severity] ?? map.low}`}>
      {severity.toUpperCase()}
    </span>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  trendValue,
  accent = "text-emerald-400",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  accent?: string;
}) {
  const TrendIcon = trend === "up" ? ChevronUp : trend === "down" ? ChevronDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground";

  // Numeric values (with optional $ prefix or % suffix) get CountUp;
  // strings like "Healthy" or "—" render unchanged.
  const numericMatch = value.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  const animatedValue = numericMatch ? (
    <>
      {numericMatch[1]}
      <CountUp
        value={parseFloat(numericMatch[2].replace(/,/g, ""))}
        decimals={numericMatch[2].includes(".") ? 2 : 0}
      />
      {numericMatch[3]}
    </>
  ) : (
    value
  );

  return (
    <Card className="bg-card/60 border-border/40 card-hover">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold ${accent}`}>{animatedValue}</p>
            {sub && <p className="text-xs text-white/40">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-secondary/40">
            <Icon className={`h-5 w-5 ${accent}`} />
          </div>
        </div>
        {trendValue && (
          <div className={`flex items-center gap-1 mt-2 text-xs ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            <span>{trendValue}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Intelligence page ───────────────────────────────────────────────────
export default function Intelligence() {
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("30d");
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } =
    trpc.orchestrator.unifiedMetrics.useQuery({ period }, { refetchInterval: 60_000 });

  const { data: anomalies, isLoading: anomaliesLoading, refetch: refetchAnomalies } =
    trpc.orchestrator.anomalies.useQuery(undefined, { refetchInterval: 30_000 });

  const { data: buyBox, isLoading: buyBoxLoading, refetch: refetchBuyBox } =
    trpc.orchestrator.buyBoxStatus.useQuery(undefined, { refetchInterval: 120_000 });

  const { data: dlq } = trpc.orchestrator.dlqStatus.useQuery(undefined, { refetchInterval: 30_000 });

  const triggerPricing = trpc.orchestrator.triggerDynamicPricing.useMutation({
    onSuccess: (data) => {
      toast.success(`Dynamic Pricing Run: ${data.autoApplied} auto-applied, ${data.queuedForApproval} queued for approval`);
      refetchMetrics();
    },
    onError: (err) => toast.error(err.message),
  });

  const triggerCreative = trpc.orchestrator.triggerCreativeVelocity.useMutation({
    onSuccess: (data) => {
      toast.success(`Creative Velocity: ${data.paused} paused, ${data.scaled} scaled`);
    },
    onError: (err) => toast.error(err.message),
  });

  const triggerAdPause = trpc.orchestrator.triggerAdPause.useMutation({
    onSuccess: (data) => {
      toast.success(`Ad Pause Scan: ${data.paused} campaigns paused for OOS products`);
    },
    onError: (err) => toast.error(err.message),
  });

  const criticalAnomalies = (anomalies ?? []).filter(a => a.severity === "critical" || a.severity === "high");
  const allAnomalies = anomalies ?? [];

  return (
    <div className="page-enter p-6 space-y-6 max-w-7xl mx-auto relative">
      {/* Ghost watermark */}
      <div className="ghost-watermark" aria-hidden="true">INTELLIGENCE</div>
      {/* Light leaks */}
      <div className="light-leak-blue" style={{top: '5%', left: '10%'}} aria-hidden="true" />
      <div className="light-leak-cyan" style={{top: '50%', right: '5%'}} aria-hidden="true" />
      {/* Period selector — header is owned by parent Insights shell */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div
            className="flex rounded-lg border border-white/[0.08] overflow-hidden"
            role="radiogroup"
            aria-label="Time period"
          >
            {(["24h", "7d", "30d"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                role="radio"
                aria-checked={period === p}
                aria-label={`Show data for ${p === "24h" ? "last 24 hours" : p === "7d" ? "last 7 days" : "last 30 days"}`}
                className={`px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  period === p
                    ? "bg-sky-600 text-white"
                    : "text-muted-foreground hover:text-white hover:bg-secondary/50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { refetchMetrics(); refetchAnomalies(); refetchBuyBox(); }}
            className="border-white/[0.08] text-foreground/80 hover:bg-secondary/50"
            aria-label="Refresh all data"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Critical anomaly banner */}
      {criticalAnomalies.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-300">
                {criticalAnomalies.length} Critical Anomal{criticalAnomalies.length === 1 ? "y" : "ies"} Detected
              </p>
              <p className="text-xs text-red-400/80 mt-0.5">{criticalAnomalies[0].message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Unified Metrics Grid */}
      {metricsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : metrics ? (
        <div className="stagger-list grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Total Revenue"
            value={`$${metrics.ecommerce.totalRevenue.toLocaleString()}`}
            sub={`${metrics.ecommerce.totalOrders} orders`}
            icon={DollarSign}
            accent="text-emerald-400"
            trend="up"
            trendValue={`Avg $${metrics.ecommerce.avgOrderValue.toFixed(2)}/order`}
          />
          <MetricCard
            label="Blended ROAS"
            value={`${metrics.advertising.blendedROAS}x`}
            sub={`$${metrics.advertising.totalSpend.toLocaleString()} spend`}
            icon={TrendingUp}
            accent="text-sky-400"
            trend={metrics.advertising.blendedROAS >= 3 ? "up" : "down"}
            trendValue={`${metrics.advertising.totalConversions} conversions`}
          />
          <MetricCard
            label="Blended CPA"
            value={`$${metrics.advertising.blendedCPA.toFixed(2)}`}
            sub={`Target: <$25`}
            icon={Target}
            accent={metrics.advertising.blendedCPA < 25 ? "text-emerald-400" : "text-red-400"}
            trend={metrics.advertising.blendedCPA < 25 ? "up" : "down"}
          />
          <MetricCard
            label="Inventory Health"
            value={`${metrics.inventory.inventoryHealthScore}%`}
            sub={`${metrics.inventory.outOfStockCount} OOS, ${metrics.inventory.lowStockCount} low`}
            icon={Package}
            accent={metrics.inventory.inventoryHealthScore >= 80 ? "text-emerald-400" : metrics.inventory.inventoryHealthScore >= 60 ? "text-yellow-400" : "text-red-400"}
          />
          <MetricCard
            label="Top E-Commerce"
            value={metrics.ecommerce.topPlatform || "None"}
            sub="by revenue"
            icon={ShoppingCart}
            accent="text-cyan-400"
          />
          <MetricCard
            label="Top Ad Platform"
            value={metrics.advertising.topPlatform || "None"}
            sub="by ROAS"
            icon={BarChart3}
            accent="text-pink-400"
          />
          <MetricCard
            label="OOS Rate"
            value={`${(metrics.ecommerce.outOfStockRate * 100).toFixed(1)}%`}
            sub={`${metrics.inventory.totalProducts} total products`}
            icon={AlertTriangle}
            accent={metrics.ecommerce.outOfStockRate < 0.10 ? "text-emerald-400" : "text-orange-400"}
          />
          <MetricCard
            label="Anomalies"
            value={String(allAnomalies.length)}
            sub={`${criticalAnomalies.length} critical/high`}
            icon={Activity}
            accent={allAnomalies.length === 0 ? "text-emerald-400" : criticalAnomalies.length > 0 ? "text-red-400" : "text-yellow-400"}
          />
        </div>
      ) : (
        <EmptyState
          icon={<BarChart3 className="w-5 h-5 text-white/40" />}
          title="No metrics yet"
          description="Connect a store to see anomaly detection, performance trends, and revenue intelligence."
          action={{ label: "Connect a store", href: "/storefronts" }}
        />
      )}

      <Tabs defaultValue="anomalies" className="space-y-4">
        <TabsList
          className="bg-secondary/40 border border-border/40"
          role="tablist"
          aria-label="Intelligence sections"
        >
          <TabsTrigger
            value="anomalies"
            role="tab"
            aria-selected={true}
            className="data-[state=active]:bg-sky-600"
          >
            Anomalies {allAnomalies.length > 0 && <Badge className="ml-1.5 bg-red-500/30 text-red-300 text-[10px]">{allAnomalies.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="platforms" role="tab" className="data-[state=active]:bg-sky-600">Platform Breakdown</TabsTrigger>
          <TabsTrigger value="buybox" role="tab" className="data-[state=active]:bg-sky-600">Buy Box Monitor</TabsTrigger>
          <TabsTrigger value="controls" role="tab" className="data-[state=active]:bg-sky-600">Automation Controls</TabsTrigger>
          <TabsTrigger value="dlq" role="tab" className="data-[state=active]:bg-sky-600">Dead-Letter Queue</TabsTrigger>
        </TabsList>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies" className="space-y-3">
          {anomaliesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : allAnomalies.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" style={{ background: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.25)" }}>
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">All clear</h3>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">
                No anomalies detected across your stores and ad accounts. The Builder, Merchant, and Social bots run continuous checks; we'll surface anything off-trend here.
              </p>
            </div>
          ) : (
            <div className="stagger-list space-y-3">
              {allAnomalies.map((anomaly, i) => (
                <Card key={i} className="bg-card/60 border-border/40">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                          anomaly.severity === "critical" ? "text-red-400" :
                          anomaly.severity === "high" ? "text-orange-400" :
                          anomaly.severity === "medium" ? "text-yellow-400" : "text-blue-400"
                        }`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <SeverityBadge severity={anomaly.severity} />
                            <span className="text-xs text-muted-foreground uppercase tracking-wide">
                              {anomaly.type.replace(/_/g, " ")}
                            </span>
                            <Badge variant="outline" className="text-[10px] border-border/40 text-muted-foreground">
                              {anomaly.platform}
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground mt-1">{anomaly.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="text-sky-400">Suggested:</span> {anomaly.suggestedAction}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-white/40">
                          {new Date(anomaly.detectedAt).toLocaleTimeString()}
                        </p>
                        <p className={`text-sm font-bold mt-1 ${
                          anomaly.changePercent > 0 ? "text-red-400" : "text-emerald-400"
                        }`}>
                          {anomaly.changePercent > 0 ? "+" : ""}{anomaly.changePercent}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Platform Breakdown Tab */}
        <TabsContent value="platforms" className="space-y-4">
          {metrics ? (
            <div className="grid md:grid-cols-2 gap-4">
              {/* E-Commerce breakdown */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-foreground/80 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-cyan-400" /> E-Commerce Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {metrics.ecommerce.platformBreakdown.length === 0 ? (
                    <p className="text-sm text-white/40">No store data available</p>
                  ) : (
                    metrics.ecommerce.platformBreakdown.map((p) => {
                      const pct = metrics.ecommerce.totalRevenue > 0
                        ? (p.revenue / metrics.ecommerce.totalRevenue) * 100 : 0;
                      const brand = getBrand(p.platform);
                      return (
                        <div key={p.platform} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-foreground/85 inline-flex items-center gap-1.5">
                              <span className="text-sm leading-none">{brand.icon}</span>
                              {brand.name}
                            </span>
                            <span className="text-emerald-400 font-medium">${p.revenue.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${pct}%`,
                                background: `linear-gradient(90deg, ${brand.color}, ${brand.accent})`,
                                boxShadow: `0 0 8px ${brand.color}80`,
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-white/40">{p.orders} orders · {pct.toFixed(1)}% of total</p>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {/* Ad platform breakdown */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-foreground/80 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-pink-400" /> Ad Platform ROAS
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {metrics.advertising.platformBreakdown.length === 0 ? (
                    <p className="text-sm text-white/40">No active ad campaigns</p>
                  ) : (
                    metrics.advertising.platformBreakdown.map((p) => {
                      const maxROAS = Math.max(...metrics.advertising.platformBreakdown.map(x => x.roas), 1);
                      const pct = (p.roas / maxROAS) * 100;
                      const brand = getBrand(p.platform);
                      return (
                        <div key={p.platform} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-foreground/85 inline-flex items-center gap-1.5">
                              <span className="text-sm leading-none">{brand.icon}</span>
                              {brand.name}
                            </span>
                            <span className={`font-medium ${p.roas >= 3 ? "text-emerald-400" : p.roas >= 2 ? "text-yellow-400" : "text-red-400"}`}>
                              {p.roas}x ROAS
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${pct}%`,
                                background: `linear-gradient(90deg, ${brand.color}, ${brand.accent})`,
                                boxShadow: `0 0 8px ${brand.color}80`,
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-white/40">${p.spend.toLocaleString()} spend · {p.conversions} conversions</p>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-12 text-white/40">Connect stores and ad accounts to see platform breakdown.</div>
          )}
        </TabsContent>

        {/* Buy Box Monitor Tab */}
        <TabsContent value="buybox" className="space-y-3">
          {buyBoxLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : !buyBox || buyBox.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/40">
              <ShoppingCart className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="font-medium text-foreground/80">No Buy Box Data</p>
              <p className="text-sm mt-1">Connect Amazon, eBay, or Walmart stores to monitor Buy Box status.</p>
            </div>
          ) : (
            <div className="stagger-list space-y-2">
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {(["lower_price", "hold", "raise_price"] as const).map(action => {
                  const count = buyBox.filter(b => b.action === action).length;
                  const colors = {
                    lower_price: "text-red-400",
                    hold: "text-emerald-400",
                    raise_price: "text-blue-400",
                  };
                  const labels = { lower_price: "Lower Price", hold: "Hold", raise_price: "Raise Price" };
                  return (
                    <Card key={action} className="bg-card/60 border-border/40 text-center py-3">
                      <p className={`text-2xl font-bold ${colors[action]}`}>
                        <CountUp value={count as number} />
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{labels[action]}</p>
                    </Card>
                  );
                })}
              </div>

              {buyBox.map((item, i) => (
                <Card key={i} className="bg-card/60 border-border/40">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant="outline" className="border-border/40 text-foreground/80 capitalize text-[10px] flex-shrink-0">
                          {item.platform}
                        </Badge>
                        <span className="text-sm text-foreground/80 truncate">Product #{item.productId}</span>
                        <Badge className={`text-[10px] flex-shrink-0 ${
                          item.buyBoxOwner === "us"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}>
                          {item.buyBoxOwner === "us" ? "We Own It" : "Lost Box"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-6 text-right flex-shrink-0">
                        <div>
                          <p className="text-[10px] text-white/40">Current</p>
                          <p className="text-sm font-medium text-foreground">${item.currentPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40">Buy Box</p>
                          <p className="text-sm font-medium text-foreground">${item.buyBoxPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40">Recommended</p>
                          <p className={`text-sm font-bold ${
                            item.action === "lower_price" ? "text-red-400" :
                            item.action === "raise_price" ? "text-blue-400" : "text-emerald-400"
                          }`}>${item.recommendedPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40">Margin</p>
                          <p className={`text-sm font-medium ${item.marginAtRecommended >= 20 ? "text-emerald-400" : item.marginAtRecommended >= 10 ? "text-yellow-400" : "text-red-400"}`}>
                            {item.marginAtRecommended}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Automation Controls Tab */}
        <TabsContent value="controls" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            {/* Dynamic Pricing */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  Dynamic Pricing Engine
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Apply pricing rules across all stores. Changes &gt;15% require approval.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => triggerPricing.mutate()}
                  disabled={triggerPricing.isPending}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  size="sm"
                >
                  {triggerPricing.isPending ? (
                    <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Running...</>
                  ) : (
                    <><Zap className="h-3.5 w-3.5 mr-2" /> Run Pricing Engine</>
                  )}
                </Button>
                <p className="text-[10px] text-white/40 mt-2 text-center">Auto-runs every 6 hours</p>
              </CardContent>
            </Card>

            {/* Creative Velocity */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-sky-400" />
                  Creative Velocity A/B
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Pause losers (CPA &gt;20% above target), scale winners (CTR &gt;4%).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => triggerCreative.mutate()}
                  disabled={triggerCreative.isPending}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                  size="sm"
                >
                  {triggerCreative.isPending ? (
                    <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Analyzing...</>
                  ) : (
                    <><BarChart3 className="h-3.5 w-3.5 mr-2" /> Optimize Creatives</>
                  )}
                </Button>
                <p className="text-[10px] text-white/40 mt-2 text-center">Auto-runs every 4 hours</p>
              </CardContent>
            </Card>

            {/* Inventory Ad Pause */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-foreground flex items-center gap-2">
                  <PauseCircle className="h-4 w-4 text-orange-400" />
                  Inventory Ad Guard
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Pause all active ads for out-of-stock products across all platforms.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => triggerAdPause.mutate()}
                  disabled={triggerAdPause.isPending}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                  size="sm"
                >
                  {triggerAdPause.isPending ? (
                    <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Scanning...</>
                  ) : (
                    <><PauseCircle className="h-3.5 w-3.5 mr-2" /> Scan & Pause OOS Ads</>
                  )}
                </Button>
                <p className="text-[10px] text-white/40 mt-2 text-center">Auto-runs every 30 minutes</p>
              </CardContent>
            </Card>
          </div>

          {/* Scheduler status */}
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-400" />
                Scheduled Automation Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { name: "Inventory Check", freq: "Every 2h", agent: "Merchant" },
                  { name: "Order Fulfillment", freq: "Every 15min", agent: "Merchant" },
                  { name: "Product Sync", freq: "Every 4h", agent: "Merchant" },
                  { name: "Dynamic Pricing", freq: "Every 6h", agent: "Merchant" },
                  { name: "Inventory Ad Guard", freq: "Every 30min", agent: "Merchant" },
                  { name: "Anomaly Detection", freq: "Every 1h", agent: "System" },
                  { name: "Creative Velocity", freq: "Every 4h", agent: "Social Bot" },
                  { name: "Ad Performance", freq: "Every 4h", agent: "Social Bot" },
                  { name: "Scheduled Posts", freq: "Every 5min", agent: "Social Bot" },
                  { name: "Email Recovery", freq: "Every 1h", agent: "Social Bot" },
                  { name: "Store Health", freq: "Every 6h", agent: "Architect" },
                  { name: "Token Refresh", freq: "Every 1h", agent: "Architect" },
                  { name: "Competitor Scan", freq: "Wed & Sat 4AM", agent: "Architect" },
                  { name: "DLQ Processor", freq: "Every 10min", agent: "System" },
                ].map((task) => (
                  <SchedulerTask key={task.name} name={task.name} freq={task.freq} agent={task.agent} />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dead-Letter Queue Tab */}
        <TabsContent value="dlq" className="space-y-3">
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-foreground flex items-center gap-2">
                <Inbox className="h-4 w-4 text-yellow-400" />
                Dead-Letter Queue
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Failed webhook deliveries are automatically retried with exponential backoff (max 5 attempts).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!dlq ? (
                <div className="h-16 animate-pulse bg-white/[0.03] rounded-lg" />
              ) : dlq.total === 0 ? (
                <div className="flex items-center gap-3 py-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Queue Empty</p>
                    <p className="text-xs text-muted-foreground">All webhook events processed successfully.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-yellow-400">
                        <CountUp value={dlq.total} />
                      </p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <Separator orientation="vertical" className="h-12 bg-border/40" />
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-400">
                        <CountUp value={dlq.pending} />
                      </p>
                      <p className="text-xs text-muted-foreground">Pending Retry</p>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {dlq.entries.map((entry) => (
                      <div key={entry.id} className="p-2 rounded-lg bg-white/[0.03] text-xs">
                        <div className="flex justify-between">
                          <span className="text-foreground/80 font-medium">{entry.event}</span>
                          <Badge variant="outline" className="text-[10px] border-border/40 text-muted-foreground">
                            {entry.platform}
                          </Badge>
                        </div>
                        <p className="text-white/40 mt-0.5">Attempt {entry.attempts}/5 · {entry.lastError}</p>
                        <p className="text-muted-foreground/40 mt-0.5">Next retry: {new Date(entry.nextRetryAt).toLocaleTimeString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
