import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  ShoppingCart,
  Package,
  AlertTriangle,
  Bot,
  Megaphone,
  Zap,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Plug,
  Store,
  Share2,
  ArrowRight,
  ShoppingBag,
  BarChart3,
  Globe,
  Timer,
  Activity,
} from "lucide-react";
import { useLocation } from "wouter";

const PLATFORM_ICONS: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🌐", amazon: "📦", etsy: "🧡",
  ebay: "🔨", tiktok_shop: "🎵", walmart: "🏪",
};

const PLATFORM_COLORS: Record<string, string> = {
  shopify: "bg-green-500/10 text-green-400 border-green-500/20",
  woocommerce: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  amazon: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  etsy: "bg-red-500/10 text-red-400 border-red-500/20",
  ebay: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  tiktok_shop: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  walmart: "bg-sky-500/10 text-sky-400 border-sky-500/20",
};

function MetricCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  loading,
  accentColor,
}: {
  title: string;
  value: string;
  icon: any;
  subtitle?: string;
  trend?: string;
  loading?: boolean;
  accentColor?: string;
}) {
  return (
    <div className="bento-card group hover:border-sky-500/30 hover:shadow-[0_0_30px_rgba(14,165,233,0.08)] transition-all duration-500">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1 min-w-0">
            <p className="micro-label">{title}</p>
            {loading ? (
              <Skeleton className="h-9 w-28 bg-white/5" />
            ) : (
              <p className="text-3xl font-black tracking-tighter text-foreground font-heading metric-number">{value}</p>
            )}
            {subtitle && <p className="text-xs text-white/40 mt-1">{subtitle}</p>}
          </div>
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.08] group-hover:scale-105 transition-transform duration-500 ${accentColor || "bg-sky-500/10"}`}>
            <Icon className={`h-5 w-5 ${accentColor ? "" : "text-sky-400"}`} />
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center gap-1.5 pt-3 border-t border-white/[0.06]">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-semibold">{trend}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BotStatusCard({
  name,
  type,
  icon: Icon,
  color,
  stats,
  loading,
}: {
  name: string;
  type: string;
  icon: any;
  color: string;
  stats?: { total: number; running: number; completed: number; failed: number };
  loading?: boolean;
}) {
  const isActive = stats && stats.running > 0;
  const botAccentColor = type === 'architect' ? 'border-sky-500/25 hover:border-sky-500/40 hover:shadow-[0_0_20px_rgba(14,165,233,0.08)]' : type === 'merchant' ? 'border-cyan-500/25 hover:border-cyan-500/40 hover:shadow-[0_0_20px_rgba(6,182,212,0.08)]' : 'border-amber-500/25 hover:border-amber-500/40 hover:shadow-[0_0_20px_rgba(245,158,11,0.08)]';
  const botStatusColor = type === 'architect' ? 'bg-sky-400' : type === 'merchant' ? 'bg-cyan-400' : 'bg-amber-400';
  const botNameColor = type === 'architect' ? 'text-sky-300' : type === 'merchant' ? 'text-cyan-300' : 'text-amber-300';
  return (
    <div className={`bento-card ${botAccentColor} ${isActive ? `bot-card-active ${type}` : ''} transition-all duration-500`}>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center border border-border/20 shadow-lg ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-bold truncate font-heading ${botNameColor}`}>{name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`h-2 w-2 rounded-full ${isActive ? `${botStatusColor} bot-status-pulse` : 'bg-muted-foreground/30'}`} />
              <span className="text-xs text-muted-foreground">{isActive ? "Running" : "Standby"}</span>
            </div>
          </div>
          {isActive && (
            <div className="shrink-0">
              <Activity className="h-4 w-4 text-emerald-400 animate-pulse" />
            </div>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full bg-white/5" />
            <Skeleton className="h-4 w-3/4 bg-white/5" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-3 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15 hover:border-emerald-500/30 transition-all duration-500">
              <p className="text-xl font-black text-emerald-400 metric-number">{stats.completed}</p>
              <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Done</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/15 hover:border-amber-500/30 transition-all duration-500">
              <p className="text-xl font-black text-amber-400 metric-number">{stats.running}</p>
              <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Active</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-500/[0.06] border border-red-500/15 hover:border-red-500/30 transition-all duration-500">
              <p className="text-xl font-black text-red-400 metric-number">{stats.failed}</p>
              <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Failed</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-white/30 italic">No tasks recorded yet</p>
        )}
      </div>
    </div>
  );
}

function RecentActivityItem({
  task,
}: {
  task: {
    id: number;
    agentType: string;
    taskType: string;
    title: string;
    status: string;
    createdAt: Date;
  };
}) {
  const agentColors: Record<string, string> = {
    architect: "text-sky-400",
    merchant: "text-cyan-400",
    social: "text-amber-400",
  };
  const agentNames: Record<string, string> = {
    architect: "Builder Bot",
    merchant: "Merchant Bot",
    social: "Social Bot",
  };
  const statusIcons: Record<string, any> = {
    completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
    running: <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />,
    failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
    pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] rounded-lg px-2 -mx-2 transition-all duration-500 group">
      <div className="shrink-0">{statusIcons[task.status] || statusIcons.pending}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate font-medium">{task.title}</p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          <span className={`font-medium ${agentColors[task.agentType]}`}>{agentNames[task.agentType]}</span>
          {" \u00B7 "}
          {new Date(task.createdAt).toLocaleString()}
        </p>
      </div>
      <Badge
        variant="outline"
        className={`text-[10px] shrink-0 ${
          task.status === "completed"
            ? "border-emerald-400/30 text-emerald-400"
            : task.status === "running"
              ? "border-amber-400/30 text-amber-400"
              : task.status === "failed"
                ? "border-destructive/30 text-destructive"
                : "border-border text-muted-foreground"
        }`}
      >
        {task.status}
      </Badge>
    </div>
  );
}

function CrossStoreIntelligence() {
  const { data: intel, isLoading } = trpc.dashboard.crossStoreIntelligence.useQuery();

  if (isLoading) {
    return (
      <Card className="bg-card border-border/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!intel || intel.storeCount === 0) return null;

  const platforms = Object.entries(intel.platformBreakdown);
  const scheduledActive = intel.schedulerTasks.filter((t: any) => t.enabled && t.isScheduled).length;
  const scheduledTotal = intel.schedulerTasks.length;

  return (
    <div className="bento-card overflow-hidden hover:border-cyan-500/25 hover:shadow-[0_0_25px_rgba(6,182,212,0.06)] transition-all duration-500">
      <div className="p-5 pb-3">
        <p className="micro-label mb-1">Intelligence</p>
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Globe className="h-4 w-4 text-cyan-400" />
          Cross-Store Intelligence
        </h3>
      </div>
      <div className="px-5 pb-5">
        {/* Top-line aggregates */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/15 hover:bg-emerald-500/12 transition-colors">
            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-widest font-semibold">Cross-Store Revenue</p>
            <p className="text-xl font-extrabold text-emerald-400 mt-1.5 font-heading metric-number">
              ${(intel.totalRevenue / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-blue-500/8 border border-blue-500/15 hover:bg-blue-500/12 transition-colors">
            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-widest font-semibold">Total Orders</p>
            <p className="text-xl font-extrabold text-blue-400 mt-1.5 font-heading metric-number">{intel.totalOrders.toLocaleString()}</p>
          </div>
          <div className="p-4 rounded-xl bg-sky-500/8 border border-sky-500/15 hover:bg-sky-500/12 transition-colors">
            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-widest font-semibold">Total Products</p>
            <p className="text-xl font-extrabold text-sky-400 mt-1.5 font-heading metric-number">{intel.totalProducts.toLocaleString()}</p>
          </div>
          <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/15 hover:bg-amber-500/12 transition-colors">
            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-widest font-semibold">Low Stock Alerts</p>
            <p className="text-xl font-extrabold text-amber-400 mt-1.5 font-heading metric-number">{intel.totalLowStock}</p>
          </div>
        </div>

        {/* Platform breakdown + top store + scheduler */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Platform breakdown */}
          <div className="p-4 rounded-xl bg-secondary/20 border border-border/25 hover:border-border/40 transition-colors">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-primary" /> Platform Breakdown
            </h4>
            <div className="space-y-2">
              {platforms.map(([platform, data]: [string, any]) => (
                <div key={platform} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{PLATFORM_ICONS[platform] || "🏪"}</span>
                    <span className="text-xs text-foreground capitalize">{platform.replace(/_/g, " ")}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-medium text-foreground">
                      ${(data.revenue / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      {data.stores} store{data.stores > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              ))}
              {platforms.length === 0 && (
                <p className="text-xs text-muted-foreground">No platform data yet</p>
              )}
            </div>
          </div>

          {/* Top performing store */}
          <div className="p-4 rounded-xl bg-secondary/20 border border-border/25 hover:border-border/40 transition-colors">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Top Performer
            </h4>
            {intel.topStore ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{PLATFORM_ICONS[intel.topStore.platform] || "🏪"}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{intel.topStore.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{intel.topStore.platform.replace(/_/g, " ")}</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-emerald-400">
                  ${(intel.topStore.revenue / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground">Highest revenue across all stores</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Connect stores to see performance</p>
            )}
          </div>

          {/* Scheduler status */}
          <div className="p-4 rounded-xl bg-secondary/20 border border-border/25 hover:border-border/40 transition-colors">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-cyan-400" /> Bot Scheduler
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Active Tasks</span>
                <span className="text-sm font-medium text-foreground">{scheduledActive}/{scheduledTotal}</span>
              </div>
              <Separator className="bg-border/30" />
              <div className="space-y-1.5 max-h-24 overflow-y-auto">
                {intel.schedulerTasks.filter((t: any) => t.enabled).slice(0, 5).map((task: any) => (
                  <div key={task.id} className="flex items-center gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full ${task.isScheduled ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                    <span className="text-[10px] text-muted-foreground truncate">{task.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Per-store metrics table */}
        {intel.storeMetrics.length > 1 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-2 text-muted-foreground font-medium">Store</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Revenue</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Orders</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Products</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Low Stock</th>
                </tr>
              </thead>
              <tbody>
                {intel.storeMetrics.map((s: any) => (
                  <tr key={s.storeId} className="border-b border-border/10 hover:bg-secondary/20">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span>{PLATFORM_ICONS[s.platform] || "🏪"}</span>
                        <span className="text-foreground">{s.storeName}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 text-foreground font-medium">
                      ${(s.revenue / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right py-2 text-foreground">{s.orders}</td>
                    <td className="text-right py-2 text-foreground">{s.products}</td>
                    <td className="text-right py-2">
                      <span className={s.lowStockCount > 0 ? "text-amber-400 font-medium" : "text-muted-foreground"}>
                        {s.lowStockCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = trpc.dashboard.metrics.useQuery({}, { refetchInterval: 30000 });
  const { data: agentStatus, isLoading: agentLoading, error: agentError } = trpc.dashboard.agentStatus.useQuery(undefined, { refetchInterval: 15000 });
  const { data: recentActivity, isLoading: activityLoading, error: activityError } = trpc.dashboard.recentActivity.useQuery({ limit: 10 }, { refetchInterval: 20000 });
  const { data: pendingApprovals, error: approvalsError } = trpc.approvals.pending.useQuery(undefined, { refetchInterval: 15000 });
  const { data: stores, isLoading: storesLoading, error: storesError } = trpc.stores.list.useQuery();
  const { data: connSummary, error: connError } = trpc.connectors.connectionSummary.useQuery();
  const { data: recentOrders, isLoading: ordersLoading } = trpc.dashboard.recentOrders.useQuery({ limit: 8 }, { refetchInterval: 15000 });

  const agentConfigs = [
    { name: "Builder Bot", type: "architect", icon: Bot, color: "bg-sky-500/15 text-sky-400" },
    { name: "Merchant Bot", type: "merchant", icon: Package, color: "bg-cyan-500/15 text-cyan-400" },
    { name: "Social Bot", type: "social", icon: Megaphone, color: "bg-amber-500/15 text-amber-400" },
  ];

  return (
    <div className="space-y-8 page-enter relative">
      {/* Ghost watermark */}
      <div className="ghost-watermark" aria-hidden="true">COMMAND</div>
      {/* Light leaks */}
      <div className="light-leak-blue" style={{top: '5%', left: '10%'}} aria-hidden="true" />
      <div className="light-leak-purple" style={{top: '40%', right: '5%'}} aria-hidden="true" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="micro-label mb-2">Command Center</p>
          <h1 className="text-3xl font-black tracking-tighter text-white">
            Welcome back{user?.name ? `, ${user.name}` : ""}<span className="text-sky-400">.</span>
          </h1>
          <p className="text-sm text-white/40 mt-1.5">
            Your autonomous bots are building, selling, and marketing 24/7 — zero manual work required.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingApprovals && pendingApprovals.length > 0 && (
            <Badge
              className="bg-amber-500/15 text-amber-400 border-amber-400/30 hover:bg-amber-500/20 cursor-pointer"
              onClick={() => setLocation("/activity")}
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              {pendingApprovals.length} pending approval{pendingApprovals.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      {/* Error States */}
      {(metricsError || agentError || activityError || approvalsError || storesError || connError) && (
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">Dashboard Error</p>
              <p className="text-xs text-red-400/70 mt-1">Some dashboard data failed to load. Retrying...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-list" role="region" aria-label="Key metrics">
        <MetricCard
          title="Total Revenue"
          value={metricsError ? "—" : `$${((metrics?.totalRevenue ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          loading={metricsLoading}
          accentColor={metricsError ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}
        />
        <MetricCard
          title="Total Orders"
          value={metricsError ? "—" : (metrics?.totalOrders ?? 0).toLocaleString()}
          icon={ShoppingCart}
          loading={metricsLoading}
          accentColor={metricsError ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400"}
        />
        <MetricCard
          title="Active Products"
          value={metricsError ? "—" : (metrics?.activeProducts ?? 0).toLocaleString()}
          icon={Package}
          loading={metricsLoading}
          accentColor={metricsError ? "bg-red-500/10 text-red-400" : "bg-sky-500/10 text-sky-400"}
        />
        <MetricCard
          title="Connected Platforms"
          value={String((connSummary?.credentials ?? 0) + (connSummary?.socialAccounts ?? 0))}
          icon={Plug}
          loading={metricsLoading}
          subtitle={`${connSummary?.stores ?? 0} stores · ${connSummary?.socialAccounts ?? 0} social`}
          accentColor="bg-cyan-500/10 text-cyan-400"
        />
      </div>

      {/* Connected Stores Section */}
      <div className="bento-card hover:border-sky-500/20 transition-all duration-500">
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="micro-label mb-1">Infrastructure</p>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Store className="h-4 w-4 text-sky-400" />
                Connected Stores
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-white/40 hover:text-white gap-1 transition-all duration-500"
              onClick={() => setLocation("/integrations")}
            >
              Manage <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="px-5 pb-5">
          {storesLoading ? (
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-48 rounded-lg bg-white/5" />
              ))}
            </div>
          ) : stores && stores.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {stores.map((store: any) => (
                <div
                  key={store.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-500 hover:border-sky-500/30 hover:shadow-[0_0_15px_rgba(14,165,233,0.06)] ${
                    PLATFORM_COLORS[store.platform] || "bg-white/[0.03] border-white/[0.08]"
                  }`}
                >
                  <span className="text-xl">{PLATFORM_ICONS[store.platform] || "🏪"}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{store.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize border-current/20">
                        {store.platform?.replace(/_/g, " ") || "Unknown"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {store.status === "active" ? "● Live" : store.status === "setup" ? "◌ Setup" : "○ " + store.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {/* Add Store CTA */}
              <button
                onClick={() => setLocation("/integrations")}
                className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-white/[0.08] hover:border-sky-500/30 hover:bg-sky-500/[0.04] transition-all duration-500 text-white/30 hover:text-white"
              >
                <Plug className="h-4 w-4" />
                <span className="text-sm">Connect Store</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No stores connected yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1 mb-4">
              Connect your first store and let your bots take over — from inventory to ads, fully automated.             </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/integrations")}
                className="gap-1"
              >
                <Plug className="h-3.5 w-3.5" />
                Go to Integrations
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Live Sales Feed + Cross-Store Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live Sales Feed */}
        <div className="bento-card hover:border-emerald-500/25 hover:shadow-[0_0_25px_rgba(52,211,153,0.06)] transition-all duration-500">
          <div className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="micro-label mb-1">Real-Time</p>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-emerald-400" />
                Live Sales Feed
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-white/40 hover:text-white gap-1 transition-all duration-500"
                onClick={() => setLocation("/merchant")}
              >
                View All <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="px-5 pb-5">
            {ordersLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg bg-white/5" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3.5 w-3/4 bg-white/5" />
                      <Skeleton className="h-3 w-1/2 bg-white/5" />
                    </div>
                    <Skeleton className="h-5 w-16 bg-white/5" />
                  </div>
                ))}
              </div>
            ) : recentOrders && recentOrders.length > 0 ? (
              <div className="space-y-1">
                {recentOrders.map((order: any) => (
                  <div
                    key={order.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.03] transition-all duration-500 group"
                  >
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <ShoppingCart className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {order.customerName || "Guest"}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 ${
                            order.status === "fulfilled" || order.status === "delivered"
                              ? "text-emerald-400 border-emerald-500/30"
                              : order.status === "processing" || order.status === "shipped"
                              ? "text-blue-400 border-blue-500/30"
                              : order.status === "cancelled" || order.status === "refunded"
                              ? "text-red-400 border-red-500/30"
                              : "text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {order.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {order.itemCount || 1} item{(order.itemCount || 1) > 1 ? "s" : ""}
                        {" \u00b7 "}
                        {new Date(order.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-400 tabular-nums shrink-0">
                      ${((order.totalAmount || 0) / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ShoppingBag className="h-10 w-10 text-white/10 mb-3" />
                <p className="text-sm text-white/50">No orders yet</p>
                <p className="text-xs text-white/30 mt-1">
                  Sales from all connected stores will appear here in real-time
                </p>
              </div>
            )}
          </div>
        </div>
        {/* Cross-Store Intelligence */}
        <CrossStoreIntelligence />
      </div>

      {/* Agent Status + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Agent Status */}
        <div className="lg:col-span-1 space-y-3">
          <p className="micro-label">Bot Status</p>
          {agentConfigs.map((agent) => {
            const stats = agentStatus?.find((s: any) => s.agentType === agent.type);
            return (
              <BotStatusCard
                key={agent.type}
                name={agent.name}
                type={agent.type}
                icon={agent.icon}
                color={agent.color}
                stats={stats ? { total: Number(stats.total), running: Number(stats.running), completed: Number(stats.completed), failed: Number(stats.failed) } : undefined}
                loading={agentLoading}
              />
            );
          })}
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2">
          <div className="bento-card h-full hover:border-sky-500/20 transition-all duration-500">
            <div className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="micro-label mb-1">Live Feed</p>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="h-4 w-4 text-sky-400" />
                    Recent Bot Activity
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-white/40 hover:text-white gap-1 transition-all duration-500"
                  onClick={() => setLocation("/activity")}
                >
                  View All <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="px-5 pb-5">
              {activityLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded-full bg-white/5" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-3/4 bg-white/5" />
                        <Skeleton className="h-3 w-1/2 bg-white/5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentActivity && recentActivity.length > 0 ? (
                <div>
                  {recentActivity.map((task: any) => (
                    <RecentActivityItem key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Zap className="h-10 w-10 text-white/10 mb-3" />
                  <p className="text-sm text-white/50">No bot activity yet</p>
                  <p className="text-xs text-white/30 mt-1">
                    Start by connecting a store or running niche research
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
