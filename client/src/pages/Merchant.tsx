import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Package,
  Loader2,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Truck,
  Zap,
  BarChart3,
  RefreshCw,
  Link,
  Users,
  ArrowUpDown,
  RotateCcw,
  X,
  Activity,
} from "lucide-react";

export default function MerchantPage() {
  const [selectedStore, setSelectedStore] = useState<string>("");
  const storeId = selectedStore ? Number(selectedStore) : undefined;

  const { data: stores } = trpc.stores.list.useQuery();
  const { data: products, isLoading: productsLoading } = trpc.merchant.products.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const { data: orders, isLoading: ordersLoading } = trpc.merchant.orders.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const { data: lowStock } = trpc.merchant.lowStockAlerts.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const { data: pricingRules } = trpc.merchant.pricingRules.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );

  const utils = trpc.useUtils();

  const autoFulfill = trpc.merchant.autoFulfill.useMutation({
    onSuccess: () => {
      toast.success("Order fulfilled successfully!");
      utils.merchant.orders.invalidate();
      utils.dashboard.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const suggestPricing = trpc.merchant.suggestPricing.useMutation({
    onSuccess: () => {
      toast.success("Pricing suggestions generated!");
      utils.merchant.pricingRules.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const createPricingRule = trpc.merchant.createPricingRule.useMutation({
    onSuccess: () => {
      toast.success("Pricing rule created!");
      utils.merchant.pricingRules.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const storeOptions = useMemo(() => stores ?? [], [stores]);

  // AI Tools state
  const [forecastResult, setForecastResult] = useState<any>(null);
  const [marginResult, setMarginResult] = useState<any>(null);
  const [returnResult, setReturnResult] = useState<any>(null);
  const [forecastPeriod, setForecastPeriod] = useState<"7_days" | "30_days" | "90_days">("30_days");

  // AI Tools mutations
  const demandForecast = trpc.merchant.demandForecasting.useMutation({
    onSuccess: (data) => {
      setForecastResult(data);
      toast.success("Demand forecast complete!");
    },
    onError: (err) => toast.error(`Forecast failed: ${err.message}`),
  });

  const marginAnalyzer = trpc.merchant.marginAnalyzer.useMutation({
    onSuccess: (data) => {
      setMarginResult(data);
      toast.success("Margin analysis complete!");
    },
    onError: (err) => toast.error(`Margin analysis failed: ${err.message}`),
  });

  const returnAnalysis = trpc.merchant.returnAnalysis.useMutation({
    onSuccess: (data) => {
      setReturnResult(data);
      toast.success("Return analysis complete!");
    },
    onError: (err) => toast.error(`Return analysis failed: ${err.message}`),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-cyan-500/15 flex items-center justify-center">
            <Package className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Merchant Bot</h1>
            <p className="text-sm text-muted-foreground">Inventory, pricing, and fulfillment automation</p>
          </div>
        </div>
        <Select value={selectedStore} onValueChange={setSelectedStore}>
          <SelectTrigger className="w-48 bg-input/50">
            <SelectValue placeholder="Select store" />
          </SelectTrigger>
          <SelectContent>
            {storeOptions.map((s: any) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedStore ? (
        <Card className="bg-card border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Select a store to manage</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Connect a store via Builder Bot or Integrations first</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="inventory" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="fulfillment">Fulfillment</TabsTrigger>
            <TabsTrigger value="tools">AI Tools</TabsTrigger>
          </TabsList>

          {/* Inventory Tab */}
          <TabsContent value="inventory" className="space-y-4">
            {lowStock && lowStock.length > 0 && (
              <Card className="bg-amber-500/5 border-amber-400/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-amber-400">Low Stock Alerts</h3>
                  </div>
                  <div className="space-y-2">
                    {lowStock.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{p.title}</span>
                        <Badge variant="outline" className="border-amber-400/30 text-amber-400">
                          {p.stockLevel} left
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {productsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="bg-card border-border/50">
                    <CardContent className="p-4">
                      <Skeleton className="h-5 w-48 mb-2" />
                      <Skeleton className="h-4 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : products && products.length > 0 ? (
              <div className="space-y-2">
                {products.map((p: any) => (
                  <Card key={p.id} className="bg-card border-border/50 hover:border-primary/20 transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-foreground truncate">{p.title}</h4>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>SKU: {p.sku || "N/A"}</span>
                            <span>${(p.price / 100).toFixed(2)}</span>
                            <span>Stock: {p.stockLevel}</span>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            p.status === "active"
                              ? "border-emerald-400/30 text-emerald-400"
                              : p.status === "draft"
                                ? "border-border text-muted-foreground"
                                : "border-amber-400/30 text-amber-400"
                          }`}
                        >
                          {p.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-card border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No products yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Use Builder Bot to generate a product catalog automatically</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            {ordersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="bg-card border-border/50">
                    <CardContent className="p-4"><Skeleton className="h-5 w-48" /></CardContent>
                  </Card>
                ))}
              </div>
            ) : orders && orders.length > 0 ? (
              <div className="space-y-2">
                {orders.map((o: any) => (
                  <Card key={o.id} className="bg-card border-border/50 hover:border-primary/20 transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">Order #{o.platformOrderId || o.id}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {o.customerEmail || "Unknown customer"} · ${(o.totalAmount / 100).toFixed(2)}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            o.fulfillmentStatus === "fulfilled"
                              ? "border-emerald-400/30 text-emerald-400"
                              : o.fulfillmentStatus === "processing"
                                ? "border-amber-400/30 text-amber-400"
                                : "border-border text-muted-foreground"
                          }`}
                        >
                          {o.fulfillmentStatus}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-card border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No orders yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Pricing Tab */}
          <TabsContent value="pricing" className="space-y-4">
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">AI Pricing Strategy</h3>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (products && products.length > 0) {
                        suggestPricing.mutate({ storeId: storeId!, productId: (products[0] as any).id });
                      } else {
                        toast.error("Add products first to get pricing suggestions");
                      }
                    }}
                    disabled={suggestPricing.isPending || !products?.length}
                  >
                    {suggestPricing.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Zap className="h-3.5 w-3.5 mr-1" />
                    )}
                    Get AI Suggestions
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Merchant Bot analyzes your products and competition to suggest optimal pricing.
                </p>
              </CardContent>
            </Card>

            {pricingRules && pricingRules.length > 0 ? (
              <div className="space-y-2">
                {pricingRules.map((r: any) => (
                  <Card key={r.id} className="bg-card border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">{r.name}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                            {r.ruleType} · Min margin: {r.minMarginPercent}%
                          </p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${r.isActive ? "border-emerald-400/30 text-emerald-400" : "border-border text-muted-foreground"}`}>
                          {r.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-card border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No pricing rules yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Fulfillment Tab */}
          <TabsContent value="fulfillment" className="space-y-4">
            {(() => {
              const statusPipeline = {
                pending: orders?.filter((o: any) => o.status === "pending").length || 0,
                processing: orders?.filter((o: any) => o.status === "processing").length || 0,
                shipped: orders?.filter((o: any) => o.status === "shipped").length || 0,
                delivered: orders?.filter((o: any) => o.status === "delivered").length || 0,
              };
              const fulfillPipeline = {
                unfulfilled: orders?.filter((o: any) => o.fulfillmentStatus === "unfulfilled").length || 0,
                partial: orders?.filter((o: any) => o.fulfillmentStatus === "partial").length || 0,
                fulfilled: orders?.filter((o: any) => o.fulfillmentStatus === "fulfilled").length || 0,
              };
              const total = orders?.length || 0;
              return (
                <>
                  {/* Pipeline Funnel */}
                  <Card className="bg-card border-border/50">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Activity className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Order Pipeline</h3>
                        <Badge variant="outline" className="text-[10px] ml-auto">{total} orders</Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        {[
                          { label: "Pending", count: statusPipeline.pending, color: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
                          { label: "Processing", count: statusPipeline.processing, color: "bg-blue-500/10 border-blue-500/20 text-blue-400" },
                          { label: "Shipped", count: statusPipeline.shipped, color: "bg-violet-500/10 border-violet-500/20 text-violet-400" },
                          { label: "Delivered", count: statusPipeline.delivered, color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
                        ].map((stage, i) => (
                          <div key={stage.label} className="relative">
                            <div className={`p-3 rounded-xl border text-center ${stage.color}`}>
                              <p className="text-2xl font-bold">{stage.count}</p>
                              <p className="text-[10px] uppercase tracking-wider mt-1 font-semibold">{stage.label}</p>
                            </div>
                            {i < 3 && (
                              <div className="absolute top-1/2 -right-2 transform -translate-y-1/2 text-muted-foreground/30 text-lg z-10">\u2192</div>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* Progress bar */}
                      <div className="h-2 rounded-full bg-secondary/30 overflow-hidden flex">
                        {total > 0 && (
                          <>
                            <div className="bg-amber-400 h-full transition-all" style={{ width: `${(statusPipeline.pending / total) * 100}%` }} />
                            <div className="bg-blue-400 h-full transition-all" style={{ width: `${(statusPipeline.processing / total) * 100}%` }} />
                            <div className="bg-violet-400 h-full transition-all" style={{ width: `${(statusPipeline.shipped / total) * 100}%` }} />
                            <div className="bg-emerald-400 h-full transition-all" style={{ width: `${(statusPipeline.delivered / total) * 100}%` }} />
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  {/* Fulfillment Status Breakdown */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-red-500/8 border border-red-500/15">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Unfulfilled</p>
                      <p className="text-2xl font-bold text-red-400">{fulfillPipeline.unfulfilled}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/15">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Partial</p>
                      <p className="text-2xl font-bold text-amber-400">{fulfillPipeline.partial}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Fulfilled</p>
                      <p className="text-2xl font-bold text-emerald-400">{fulfillPipeline.fulfilled}</p>
                    </div>
                  </div>
                </>
              );
            })()}
            {/* Auto-Fulfillment Action */}
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Zero-Touch Fulfillment</h3>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      const pendingOrder = orders?.find((o: any) => o.fulfillmentStatus === "unfulfilled");
                      if (pendingOrder) {
                        autoFulfill.mutate({ orderId: (pendingOrder as any).id, storeId: (pendingOrder as any).storeId });
                      } else {
                        toast.info("No unfulfilled orders to process");
                      }
                    }}
                    disabled={autoFulfill.isPending}
                  >
                    {autoFulfill.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Process All Orders
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Merchant Bot will automatically process all pending orders and initiate fulfillment.
                  Zero-touch from \u201cPlaced\u201d to \u201cProcessed\u201d with 0% human clicks.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Tools Tab */}
          <TabsContent value="tools" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Demand Forecasting */}
              <Card className="bg-card border-border/50 hover:border-emerald-500/30 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
                      <TrendingUp className="h-4.5 w-4.5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Demand Forecasting</h3>
                      <p className="text-[11px] text-muted-foreground">Predict future demand</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">AI-powered demand prediction with stockout risk alerts, seasonal insights, and reorder recommendations.</p>
                  <div className="space-y-2">
                    <Select value={forecastPeriod} onValueChange={(v) => setForecastPeriod(v as any)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7_days">7 Days</SelectItem>
                        <SelectItem value="30_days">30 Days</SelectItem>
                        <SelectItem value="90_days">90 Days</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="w-full text-xs" disabled={demandForecast.isPending} onClick={() => demandForecast.mutate({ storeId: storeId!, forecastPeriod })}>
                      {demandForecast.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <TrendingUp className="h-3 w-3 mr-1" />}
                      {demandForecast.isPending ? "Forecasting..." : "Run Forecast"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Margin Analyzer */}
              <Card className="bg-card border-border/50 hover:border-emerald-500/30 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                      <DollarSign className="h-4.5 w-4.5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Margin Analyzer</h3>
                      <p className="text-[11px] text-muted-foreground">Profitability deep-dive</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">Analyze margins by product and category. Find profit leaks, top performers, and optimization opportunities.</p>
                  <Button size="sm" className="w-full text-xs" disabled={marginAnalyzer.isPending} onClick={() => marginAnalyzer.mutate({ storeId: storeId! })}>
                    {marginAnalyzer.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <DollarSign className="h-3 w-3 mr-1" />}
                    {marginAnalyzer.isPending ? "Analyzing..." : "Analyze Margins"}
                  </Button>
                </CardContent>
              </Card>

              {/* Return Analysis */}
              <Card className="bg-card border-border/50 hover:border-emerald-500/30 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
                      <RotateCcw className="h-4.5 w-4.5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Return Analysis</h3>
                      <p className="text-[11px] text-muted-foreground">Reduce return rates</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">Analyze return patterns, identify problematic products, and get strategies to reduce return rates and costs.</p>
                  <Button size="sm" className="w-full text-xs" disabled={returnAnalysis.isPending} onClick={() => returnAnalysis.mutate({ storeId: storeId! })}>
                    {returnAnalysis.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                    {returnAnalysis.isPending ? "Analyzing..." : "Analyze Returns"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* AI Tools Results */}
            {forecastResult && (
              <Card className="bg-card border-border/50 border-blue-500/30">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Demand Forecast Results</h3>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Dismiss" onClick={() => setForecastResult(null)}><X className="h-3 w-3" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{forecastResult.summary || forecastResult.overallInsight || JSON.stringify(forecastResult).slice(0, 300)}</p>
                  {forecastResult.products && (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {forecastResult.products.slice(0, 10).map((p: any, i: number) => (
                        <div key={i} className="p-2 rounded-md bg-secondary/30 flex items-center justify-between">
                          <span className="text-xs font-medium">{p.productName || p.title || `Product ${i + 1}`}</span>
                          <div className="flex gap-2 text-[10px] text-muted-foreground">
                            {p.predictedDemand && <span>Demand: <span className="text-foreground">{p.predictedDemand}</span></span>}
                            {p.stockoutRisk && <Badge variant="outline" className={`text-[9px] ${p.stockoutRisk === 'high' ? 'text-red-400 border-red-400/30' : p.stockoutRisk === 'medium' ? 'text-amber-400 border-amber-400/30' : 'text-emerald-400 border-emerald-400/30'}`}>{p.stockoutRisk} risk</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {marginResult && (
              <Card className="bg-card border-border/50 border-emerald-500/30">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Margin Analysis Results</h3>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Dismiss" onClick={() => setMarginResult(null)}><X className="h-3 w-3" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{marginResult.summary || marginResult.overallInsight || JSON.stringify(marginResult).slice(0, 300)}</p>
                  {marginResult.products && (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {marginResult.products.slice(0, 10).map((p: any, i: number) => (
                        <div key={i} className="p-2 rounded-md bg-secondary/30">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">{p.productName || p.title || `Product ${i + 1}`}</span>
                            <span className="text-xs text-emerald-400 font-medium">{p.margin || p.profitMargin || ''}</span>
                          </div>
                          {p.recommendation && <p className="text-[10px] text-muted-foreground mt-1">{p.recommendation}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {returnResult && (
              <Card className="bg-card border-border/50 border-amber-500/30">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Return Analysis Results</h3>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Dismiss" onClick={() => setReturnResult(null)}><X className="h-3 w-3" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{returnResult.summary || returnResult.overallInsight || JSON.stringify(returnResult).slice(0, 300)}</p>
                  {returnResult.products && (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {returnResult.products.slice(0, 10).map((p: any, i: number) => (
                        <div key={i} className="p-2 rounded-md bg-secondary/30">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">{p.productName || p.title || `Product ${i + 1}`}</span>
                            {p.returnRate && <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30">{p.returnRate} return rate</Badge>}
                          </div>
                          {p.topReason && <p className="text-[10px] text-muted-foreground mt-1">Top reason: {p.topReason}</p>}
                          {p.recommendation && <p className="text-[10px] text-muted-foreground">{p.recommendation}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* New Workflow Capabilities */}
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">New Merchant Capabilities</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-2 rounded-md bg-secondary/30">
                    <Link className="h-4 w-4 text-emerald-400" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Supply Chain Intelligence</p>
                      <p className="text-[11px] text-muted-foreground">Supplier scorecards, lead time optimization, and risk assessment</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] border-emerald-400/30 text-emerald-400">Workflow</Badge>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-secondary/30">
                    <TrendingUp className="h-4 w-4 text-blue-400" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Profit & Loss Analysis</p>
                      <p className="text-[11px] text-muted-foreground">CFO-level P&L report with cash flow projections</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] border-blue-400/30 text-blue-400">Workflow</Badge>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-secondary/30">
                    <Users className="h-4 w-4 text-violet-400" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Customer Segmentation</p>
                      <p className="text-[11px] text-muted-foreground">RFM analysis, behavioral segments, and churn prediction</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] border-violet-400/30 text-violet-400">Workflow</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
