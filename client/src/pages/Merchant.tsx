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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-cyan-500/15 flex items-center justify-center">
            <Package className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">The Merchant Agent</h1>
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
            <p className="text-xs text-muted-foreground/60 mt-1">Connect a store in The Architect first</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="inventory" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="fulfillment">Fulfillment</TabsTrigger>
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
                  <p className="text-xs text-muted-foreground/60 mt-1">Use The Architect to generate a product catalog</p>
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
                  The Merchant analyzes your products and competition to suggest optimal pricing.
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
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Auto-Fulfillment</h3>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      const pendingOrder = orders?.find((o: any) => o.fulfillmentStatus === "unfulfilled");
                      if (pendingOrder) {
                        autoFulfill.mutate({ orderId: (pendingOrder as any).id });
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
                    Process Orders
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The Merchant will automatically process all pending orders and initiate fulfillment.
                  Zero-touch from "Placed" to "Processed" with 0% human clicks.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
