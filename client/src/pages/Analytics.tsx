import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const CHART_COLORS = ["#a78bfa", "#22d3ee", "#fbbf24", "#f87171", "#34d399", "#818cf8"];

type AnalyticsSnapshot = {
  date: string;
  revenue: number;
  orders: number;
  visitors: number;
  conversionRate: number;
  avgOrderValue: number;
  topProducts?: unknown;
  trafficSources?: unknown;
};

type TrafficSourceDatum = {
  name: string;
  value: number;
  color: string;
};

type TopProductDatum = {
  name: string;
  revenue: number;
  orders: number;
};

function EmptyAnalyticsState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="h-full min-h-52 flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-6 text-center">
      <Package className="h-8 w-8 text-white/30 mb-3" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>
    </div>
  );
}

function normalizeTrafficSources(value: unknown): TrafficSourceDatum[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const entry = item as Record<string, unknown>;
        const rawName = entry.name;
        const rawValue = entry.value;
        if (typeof rawName !== "string" || typeof rawValue !== "number") return null;
        return {
          name: rawName,
          value: rawValue,
          color: CHART_COLORS[index % CHART_COLORS.length],
        };
      })
      .filter((item): item is TrafficSourceDatum => item !== null);
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, rawValue]) => typeof rawValue === "number")
      .map(([name, rawValue], index) => ({
        name,
        value: rawValue as number,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }));
  }

  return [];
}

function normalizeTopProducts(value: unknown): TopProductDatum[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const rawName = entry.name ?? entry.title;
      const rawRevenue = entry.revenue;
      const rawOrders = entry.orders;
      if (typeof rawName !== "string" || typeof rawRevenue !== "number") return null;
      return {
        name: rawName,
        revenue: rawRevenue,
        orders: typeof rawOrders === "number" ? rawOrders : 0,
      };
    })
    .filter((item): item is TopProductDatum => item !== null);
}

export default function AnalyticsPage() {
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("30");
  const selectedStoreId = selectedStore !== "all" ? Number(selectedStore) : undefined;
  const days = dateRange === "all" ? 365 : Number(dateRange);

  const utils = trpc.useUtils();
  const { data: stores, error: storesError } = trpc.stores.list.useQuery();
  const { data: analytics, isLoading, error: analyticsError } = trpc.analytics.overview.useQuery({
    storeId: selectedStoreId,
  });
  const { data: snapshots } = trpc.analytics.snapshots.useQuery(
    { storeId: selectedStoreId ?? 0, days },
    { enabled: selectedStoreId !== undefined }
  );

  const storeOptions = useMemo(() => stores ?? [], [stores]);
  const snapshotSeries = useMemo(() => (snapshots ?? []) as AnalyticsSnapshot[], [snapshots]);
  const latestSnapshot = snapshotSeries.length > 0 ? snapshotSeries[snapshotSeries.length - 1] : undefined;

  const revenueData = useMemo(() => {
    return snapshotSeries.map((snapshot) => ({
      date: new Date(snapshot.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue: snapshot.revenue / 100,
      orders: snapshot.orders,
    }));
  }, [snapshotSeries]);

  const trafficSources = useMemo(
    () => normalizeTrafficSources(latestSnapshot?.trafficSources),
    [latestSnapshot]
  );

  const topProducts = useMemo(
    () => normalizeTopProducts(latestSnapshot?.topProducts),
    [latestSnapshot]
  );

  const hasSnapshotData = revenueData.length > 0;
  const showStoreSelectionHint = selectedStoreId === undefined;

  return (
    <div className="relative">
      {/* Ghost watermark */}
      <div className="ghost-watermark" aria-hidden="true">ANALYTICS</div>
      {/* Light leaks */}
      <div className="light-leak-blue" style={{top: '5%', left: '10%'}} aria-hidden="true" />
      <div className="light-leak-purple" style={{top: '50%', right: '5%'}} aria-hidden="true" />
    <div className="space-y-6">
      {/* Error States */}
      {(storesError || analyticsError) && (
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">Analytics Error</p>
              <p className="text-xs text-red-400/70 mt-1">
                {storesError?.message || analyticsError?.message || "Failed to load analytics data."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => {
                utils.stores.list.invalidate();
                utils.analytics.overview.invalidate();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Analytics Dashboard</h1>
            <p className="text-sm text-muted-foreground">Sales, traffic, and performance insights</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-28 bg-input/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Days</SelectItem>
              <SelectItem value="30">30 Days</SelectItem>
              <SelectItem value="90">90 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedStore} onValueChange={setSelectedStore} disabled={!stores}>
            <SelectTrigger className="w-48 bg-input/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {storeOptions.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bento-card">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-7 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bento-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Revenue</span>
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">
                ${((analytics?.totalRevenue || 0) / 100).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Live aggregate from recorded orders</p>
            </CardContent>
          </Card>
          <Card className="bento-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Orders</span>
                <ShoppingCart className="h-4 w-4 text-cyan-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{analytics?.totalOrders || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Count of recorded orders in the selected scope</p>
            </CardContent>
          </Card>
          <Card className="bento-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Avg Order</span>
                <TrendingUp className="h-4 w-4 text-sky-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">
                ${analytics?.totalOrders ? ((analytics.totalRevenue / analytics.totalOrders) / 100).toFixed(2) : "0.00"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Derived from current revenue and order totals</p>
            </CardContent>
          </Card>
          <Card className="bento-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Conversion</span>
                <Users className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">
                {analytics?.totalOrders ? ((analytics.totalOrders / Math.max(analytics.activeProducts, 1)) * 10).toFixed(1) : "0.0"}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">Heuristic based on recorded orders and active products</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Trend */}
        <Card className="bg-card border-white/[0.08] lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Revenue Trend (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 flex flex-col gap-2">
                <Skeleton className="h-full w-full rounded-lg" />
              </div>
            ) : showStoreSelectionHint ? (
              <EmptyAnalyticsState
                title="Select a Store for Trend Data"
                description="Revenue trends are only shown when a specific store has recorded analytics snapshots."
              />
            ) : !hasSnapshotData ? (
              <EmptyAnalyticsState
                title="No Revenue Snapshots Yet"
                description="This store does not have 30-day analytics snapshots yet, so trend charts stay empty instead of using simulated values."
              />
            ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: "#9ca3af" }}
                    itemStyle={{ color: "#a78bfa" }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#a78bfa" fill="url(#revenueGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            )}
          </CardContent>
        </Card>

        {/* Traffic Sources */}
        <Card className="bento-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Traffic Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-48 w-full rounded-lg" />
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4 w-full" />)}
              </div>
            ) : showStoreSelectionHint ? (
              <EmptyAnalyticsState
                title="Store Snapshot Required"
                description="Traffic-source breakdown comes from the latest analytics snapshot for a selected store."
              />
            ) : trafficSources.length === 0 ? (
              <EmptyAnalyticsState
                title="No Traffic Source Data"
                description="The latest analytics snapshot for this store does not contain a traffic-source breakdown yet."
              />
            ) : (
            <>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={trafficSources}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {trafficSources.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 mt-2">
              {trafficSources.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-white/5" style={{ backgroundColor: s.color }} />
                    <span className="text-muted-foreground">{s.name}</span>
                  </div>
                  <span className="text-foreground font-medium">{s.value}%</span>
                </div>
              ))}
            </div>
            </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card className="bento-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">Top Products by Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-52">
              <Skeleton className="h-full w-full rounded-lg" />
            </div>
          ) : showStoreSelectionHint ? (
            <EmptyAnalyticsState
              title="Select a Store for Product Ranking"
              description="Top-product rankings come from a store's latest analytics snapshot rather than placeholder data."
            />
          ) : topProducts.length === 0 ? (
            <EmptyAnalyticsState
              title="No Top Product Data"
              description="This store has no product-level revenue data in its latest analytics snapshot yet."
            />
          ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} width={150} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(value: number) => [`$${value}`, "Revenue"]}
                />
                <Bar dataKey="revenue" fill="#a78bfa" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
