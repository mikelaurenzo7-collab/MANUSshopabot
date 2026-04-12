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
} from "lucide-react";
import { useLocation } from "wouter";

const PLATFORM_ICONS: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🌐", amazon: "📦", etsy: "🧡",
  ebay: "🔨", tiktok_shop: "🎵", walmart: "🏪",
};

const PLATFORM_COLORS: Record<string, string> = {
  shopify: "bg-green-500/10 text-green-400 border-green-500/20",
  woocommerce: "bg-purple-500/10 text-purple-400 border-purple-500/20",
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
    <Card className="bg-card border-border/50 hover:border-primary/20 transition-all duration-300">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
            )}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${accentColor || "bg-primary/10"}`}>
            <Icon className={`h-5 w-5 ${accentColor ? "" : "text-primary"}`} />
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentStatusCard({
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
  return (
    <Card className="bg-card border-border/50 hover:border-primary/20 transition-all duration-300">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-400 agent-pulse" : "bg-muted-foreground/40"}`} />
              <span className="text-xs text-muted-foreground">{isActive ? "Active" : "Idle"}</span>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded-md bg-secondary/50">
              <p className="text-lg font-bold text-foreground">{stats.completed}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Done</p>
            </div>
            <div className="text-center p-2 rounded-md bg-secondary/50">
              <p className="text-lg font-bold text-amber-400">{stats.running}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Active</p>
            </div>
            <div className="text-center p-2 rounded-md bg-secondary/50">
              <p className="text-lg font-bold text-destructive">{stats.failed}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Failed</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No tasks recorded yet</p>
        )}
      </CardContent>
    </Card>
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
    architect: "text-violet-400",
    merchant: "text-cyan-400",
    hypeman: "text-amber-400",
  };
  const agentNames: Record<string, string> = {
    architect: "Architect",
    merchant: "Merchant",
    hypeman: "Hype-Man",
  };
  const statusIcons: Record<string, any> = {
    completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
    running: <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />,
    failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
    pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/30 last:border-0">
      <div className="shrink-0">{statusIcons[task.status] || statusIcons.pending}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{task.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          <span className={agentColors[task.agentType]}>{agentNames[task.agentType]}</span>
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

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: metrics, isLoading: metricsLoading } = trpc.dashboard.metrics.useQuery({});
  const { data: agentStatus, isLoading: agentLoading } = trpc.dashboard.agentStatus.useQuery();
  const { data: recentActivity, isLoading: activityLoading } = trpc.dashboard.recentActivity.useQuery({ limit: 10 });
  const { data: pendingApprovals } = trpc.approvals.pending.useQuery();
  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const { data: connSummary } = trpc.connectors.connectionSummary.useQuery();

  const agentConfigs = [
    { name: "The Architect Agent", type: "architect", icon: Bot, color: "bg-violet-500/15 text-violet-400" },
    { name: "The Merchant Agent", type: "merchant", icon: Package, color: "bg-cyan-500/15 text-cyan-400" },
    { name: "The Hype-Man Agent", type: "hypeman", icon: Megaphone, color: "bg-amber-500/15 text-amber-400" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your autonomous commerce agents are working around the clock.
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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={`$${((metrics?.totalRevenue ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          loading={metricsLoading}
          accentColor="bg-emerald-500/10 text-emerald-400"
        />
        <MetricCard
          title="Total Orders"
          value={(metrics?.totalOrders ?? 0).toLocaleString()}
          icon={ShoppingCart}
          loading={metricsLoading}
          accentColor="bg-blue-500/10 text-blue-400"
        />
        <MetricCard
          title="Active Products"
          value={(metrics?.activeProducts ?? 0).toLocaleString()}
          icon={Package}
          loading={metricsLoading}
          accentColor="bg-violet-500/10 text-violet-400"
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
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Store className="h-4 w-4" />
              Connected Stores
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={() => setLocation("/integrations")}
            >
              Manage <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {storesLoading ? (
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-48 rounded-lg" />
              ))}
            </div>
          ) : stores && stores.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {stores.map((store: any) => (
                <div
                  key={store.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all hover:border-primary/30 ${
                    PLATFORM_COLORS[store.platform] || "bg-secondary/30 border-border/50"
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
                className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground"
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
                Connect your first e-commerce store to unleash the Beast Bots agents
              </p>
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
        </CardContent>
      </Card>

      {/* Agent Status + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Agent Status */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Agent Status</h2>
          {agentConfigs.map((agent) => {
            const stats = agentStatus?.find((s: any) => s.agentType === agent.type);
            return (
              <AgentStatusCard
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
          <Card className="bg-card border-border/50 h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Recent Agent Activity
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground gap-1"
                  onClick={() => setLocation("/activity")}
                >
                  View All <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
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
                  <Zap className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No agent activity yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Start by connecting a store or running niche research
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
