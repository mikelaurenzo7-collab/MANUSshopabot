import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Package, ShoppingCart, TrendingUp, Bot, X, ExternalLink,
  AlertTriangle, CheckCircle2, XCircle, RefreshCw, Loader2,
  ArrowUpRight, ArrowDownRight, BarChart3, Tag, Clock,
  ChevronRight, Boxes, DollarSign, Activity, Globe, Maximize2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from "recharts";

import { getBrand } from "@/lib/platformBrand";

// Recharts tooltip surface — warm-mocha tinted to harmonize with the
// page-canvas. The legacy cool-slate (`rgba(15,23,42,0.95)`) read as
// a frigid floating panel over the warm room. Values match the
// `--page-canvas-elevated` token at 0.95 alpha.
const TOOLTIP_STYLE = {
  backgroundColor: "rgba(44,32,26,0.95)",
  border: "1px solid rgba(201,169,138,0.18)",
  borderRadius: "8px",
  color: "#f5ebe0",
  fontSize: "12px",
};

type Tab = "overview" | "products" | "orders" | "revenue" | "activity" | "storefront";

interface StoreViewProps {
  storeId: number;
  onClose: () => void;
}

export default function StoreView({ storeId, onClose }: StoreViewProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [productSearch, setProductSearch] = useState("");
  const [productStatus, setProductStatus] = useState<"all" | "active" | "draft" | "archived" | "low_stock" | "out_of_stock">("all");
  const [orderStatus, setOrderStatus] = useState<"all" | "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded">("all");

  const { data: overview, isLoading: overviewLoading } = trpc.stores.overview.useQuery({ storeId });
  const { data: products, isLoading: productsLoading } = trpc.stores.products.useQuery(
    { storeId, search: productSearch || undefined, status: productStatus },
    { enabled: tab === "products" }
  );
  const { data: orders, isLoading: ordersLoading } = trpc.stores.orders.useQuery(
    { storeId, status: orderStatus },
    { enabled: tab === "orders" }
  );
  const { data: revenue, isLoading: revenueLoading } = trpc.stores.revenueSummary.useQuery(
    { storeId },
    { enabled: tab === "revenue" }
  );
  const { data: activity, isLoading: activityLoading } = trpc.stores.botActivity.useQuery(
    { storeId },
    { enabled: tab === "activity" }
  );

  const store = overview?.store;
  const platformBrand = store ? getBrand(store.platform) : null;
  const platformColor = platformBrand?.color || "#64748b";
  const platformIcon = platformBrand?.icon || "🏪";

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <Activity className="w-3.5 h-3.5" /> },
    { id: "products", label: "Products", icon: <Package className="w-3.5 h-3.5" /> },
    { id: "orders", label: "Orders", icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { id: "revenue", label: "Revenue", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: "activity", label: "Bot Activity", icon: <Bot className="w-3.5 h-3.5" /> },
    { id: "storefront", label: "Storefront", icon: <Globe className="w-3.5 h-3.5" /> },
  ];

  const statusColor = (status: string) => {
    if (["active", "delivered", "completed"].includes(status)) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
    if (["pending", "processing", "setup"].includes(status)) return "text-amber-400 bg-amber-400/10 border-amber-400/20";
    if (["cancelled", "refunded", "archived"].includes(status)) return "text-red-400 bg-red-400/10 border-red-400/20";
    if (["shipped", "paused"].includes(status)) return "text-sky-400 bg-sky-400/10 border-sky-400/20";
    return "text-slate-400 bg-slate-400/10 border-slate-400/20";
  };

  const agentColor = (type: string) => {
    if (type === "architect") return "text-violet-400 bg-violet-400/10";
    if (type === "merchant") return "text-amber-400 bg-amber-400/10";
    if (type === "social") return "text-sky-400 bg-sky-400/10";
    return "text-slate-400 bg-slate-400/10";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel — warm-mocha canvas matches the rest of the workspace
          surface so the slide-in drawer doesn't read as a cold patch
          docked against the warm room. */}
      <div className="relative w-full max-w-3xl bg-page-canvas border-l border-white/10 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-white/8"
          style={{ background: `linear-gradient(135deg, ${platformColor}18 0%, transparent 60%)` }}>
          <div className="text-3xl">{platformIcon}</div>
          <div className="flex-1 min-w-0">
            {overviewLoading ? (
              <div className="h-5 w-40 bg-white/10 rounded animate-pulse" />
            ) : (
              <>
                <h2 className="text-lg font-semibold text-white truncate">{store?.name || "Store"}</h2>
                <p className="text-xs text-slate-400 truncate">{store?.platformDomain || store?.platform}</p>
              </>
            )}
          </div>
          {store && (
            <Badge className={`text-xs border ${statusColor(store.status || "setup")}`}>
              {store.status || "setup"}
            </Badge>
          )}
          {store?.platformDomain && (
            <a
              href={`https://${store.platformDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={onClose}
            aria-label="Close store view"
            className="text-slate-400 hover:text-white transition-colors ml-2"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-white/8 bg-white/2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === t.id
                  ? "bg-sky-500/15 text-sky-400 border border-sky-500/25"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            overviewLoading ? (
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : overview ? (
              <div className="space-y-6">
                {/* KPI Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Today's Revenue", value: `$${overview.metrics.todayRevenue.toFixed(2)}`, icon: <DollarSign className="w-4 h-4" />, color: "text-emerald-400" },
                    { label: "Today's Orders", value: overview.metrics.todayOrders, icon: <ShoppingCart className="w-4 h-4" />, color: "text-sky-400" },
                    { label: "Total Products", value: overview.metrics.totalProducts, icon: <Package className="w-4 h-4" />, color: "text-violet-400" },
                    { label: "Low Stock", value: overview.metrics.lowStockProducts, icon: <AlertTriangle className="w-4 h-4" />, color: overview.metrics.lowStockProducts > 0 ? "text-amber-400" : "text-slate-400" },
                  ].map(kpi => (
                    <div key={kpi.label} className="bg-white/4 border border-white/8 rounded-xl p-4">
                      <div className={`mb-2 ${kpi.color}`}>{kpi.icon}</div>
                      <div className="text-xl font-bold text-white">{kpi.value}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{kpi.label}</div>
                    </div>
                  ))}
                </div>

                {/* Top Product */}
                {overview.topProduct && (
                  <div className="bg-white/4 border border-white/8 rounded-xl p-4">
                    <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Latest Product</div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center text-lg">
                        {(overview.topProduct as any).imageUrl ? (
                          <img src={(overview.topProduct as any).imageUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                        ) : "📦"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{(overview.topProduct as any).title}</div>
                        <div className="text-xs text-slate-400">${((overview.topProduct as any).price || 0).toFixed(2)} · Stock: {(overview.topProduct as any).stockLevel ?? "N/A"}</div>
                      </div>
                      <Badge className={`text-xs border ${statusColor((overview.topProduct as any).status || "active")}`}>
                        {(overview.topProduct as any).status || "active"}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Recent Bot Activity */}
                {overview.recentActivity.length > 0 && (
                  <div className="bg-white/4 border border-white/8 rounded-xl p-4">
                    <div className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">Recent Bot Activity</div>
                    <div className="space-y-2">
                      {overview.recentActivity.slice(0, 4).map((task: any) => (
                        <div key={task.id} className="flex items-start gap-3">
                          <div className={`text-xs px-1.5 py-0.5 rounded font-mono ${agentColor(task.agentType)}`}>
                            {task.agentType?.toUpperCase().slice(0, 3)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-200 truncate">{task.title}</div>
                            <div className="text-xs text-slate-500">{new Date(task.createdAt).toLocaleString()}</div>
                          </div>
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${task.status === "completed" ? "bg-emerald-400" : task.status === "failed" ? "bg-red-400" : "bg-amber-400"}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Last Order */}
                {overview.lastOrder && (
                  <div className="bg-white/4 border border-white/8 rounded-xl p-4">
                    <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Last Order</div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">#{(overview.lastOrder as any).platformOrderId || (overview.lastOrder as any).id}</div>
                        <div className="text-xs text-slate-400">{new Date((overview.lastOrder as any).createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-emerald-400">${(((overview.lastOrder as any).totalCents || 0) / 100).toFixed(2)}</div>
                        <Badge className={`text-xs border ${statusColor((overview.lastOrder as any).status || "pending")}`}>
                          {(overview.lastOrder as any).status || "pending"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}

                {overview.metrics.totalProducts === 0 && overview.metrics.totalOrders === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <Boxes className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No data yet. Connect your store and let the bots sync your catalog.</p>
                  </div>
                )}
              </div>
            ) : null
          )}

          {/* ── PRODUCTS TAB ── */}
          {tab === "products" && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <input
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Search products..."
                  className="flex-1 min-w-[160px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500/50"
                />
                <select
                  value={productStatus}
                  onChange={e => setProductStatus(e.target.value as any)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-sky-500/50"
                >
                  {["all", "active", "draft", "archived", "low_stock", "out_of_stock"].map(s => (
                    <option key={s} value={s} className="bg-slate-900">{s.replace("_", " ")}</option>
                  ))}
                </select>
              </div>

              {productsLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
                </div>
              ) : products && products.length > 0 ? (
                <div className="space-y-2">
                  {products.map((p: any) => {
                    const isLow = p.stockLevel !== null && p.lowStockThreshold !== null && p.stockLevel <= p.lowStockThreshold && p.stockLevel > 0;
                    const isOut = p.stockLevel !== null && p.stockLevel <= 0;
                    return (
                      <div key={p.id} className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl p-3 hover:bg-white/6 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center text-lg flex-shrink-0 overflow-hidden">
                          {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : "📦"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{p.title}</div>
                          <div className="text-xs text-slate-400">{p.sku ? `SKU: ${p.sku}` : p.category || "No category"}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-semibold text-white">${(p.price || 0).toFixed(2)}</div>
                          <div className={`text-xs ${isOut ? "text-red-400" : isLow ? "text-amber-400" : "text-emerald-400"}`}>
                            {isOut ? "Out of stock" : isLow ? `Low: ${p.stockLevel}` : p.stockLevel !== null ? `Stock: ${p.stockLevel}` : "—"}
                          </div>
                        </div>
                        <Badge className={`text-xs border flex-shrink-0 ${statusColor(p.status || "active")}`}>
                          {p.status || "active"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16 text-slate-500">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No products found. Store Bot will sync your catalog once connected.</p>
                </div>
              )}
            </div>
          )}

          {/* ── ORDERS TAB ── */}
          {tab === "orders" && (
            <div className="space-y-4">
              <select
                value={orderStatus}
                onChange={e => setOrderStatus(e.target.value as any)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-sky-500/50"
              >
                {["all", "pending", "processing", "shipped", "delivered", "cancelled", "refunded"].map(s => (
                  <option key={s} value={s} className="bg-slate-900">{s}</option>
                ))}
              </select>

              {ordersLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
                </div>
              ) : orders && orders.length > 0 ? (
                <div className="space-y-2">
                  {orders.map((o: any) => (
                    <div key={o.id} className="flex items-center gap-4 bg-white/4 border border-white/8 rounded-xl p-3 hover:bg-white/6 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">#{o.platformOrderId || o.id}</span>
                          <Badge className={`text-xs border ${statusColor(o.status || "pending")}`}>{o.status || "pending"}</Badge>
                          {o.fulfillmentStatus && o.fulfillmentStatus !== o.status && (
                            <Badge className={`text-xs border ${statusColor(o.fulfillmentStatus)}`}>{o.fulfillmentStatus}</Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{new Date(o.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-emerald-400">${((o.totalCents || 0) / 100).toFixed(2)}</div>
                        {o.currency && <div className="text-xs text-slate-500">{o.currency}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-slate-500">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No orders yet. Orders will appear here as they come in.</p>
                </div>
              )}
            </div>
          )}

          {/* ── REVENUE TAB ── */}
          {tab === "revenue" && (
            revenueLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />)}
              </div>
            ) : revenue ? (
              <div className="space-y-6">
                {/* Revenue KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: "Today", value: `$${revenue.today.toFixed(2)}`, sub: `${revenue.todayOrders} orders` },
                    { label: "This Week", value: `$${revenue.week.toFixed(2)}`, sub: `${revenue.weekOrders} orders` },
                    { label: "This Month", value: `$${revenue.month.toFixed(2)}`, sub: `${revenue.monthOrders} orders` },
                  ].map(k => (
                    <div key={k.label} className="bg-white/4 border border-white/8 rounded-xl p-4">
                      <div className="text-xs text-slate-400 mb-1">{k.label}</div>
                      <div className="text-lg font-bold text-white">{k.value}</div>
                      <div className="text-xs text-slate-500">{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* AOV + Refund Rate */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/4 border border-white/8 rounded-xl p-4">
                    <div className="text-xs text-slate-400 mb-1">Avg. Order Value</div>
                    <div className="text-xl font-bold text-sky-400">${revenue.aov.toFixed(2)}</div>
                  </div>
                  <div className="bg-white/4 border border-white/8 rounded-xl p-4">
                    <div className="text-xs text-slate-400 mb-1">Refund Rate</div>
                    <div className={`text-xl font-bold ${parseFloat(revenue.refundRate) > 5 ? "text-red-400" : "text-emerald-400"}`}>
                      {revenue.refundRate}%
                    </div>
                  </div>
                </div>

                {/* 30-Day Revenue Chart */}
                {revenue.dailyRevenue.length > 0 && (
                  <div className="bg-white/4 border border-white/8 rounded-xl p-4">
                    <div className="text-xs text-slate-400 mb-4 font-medium uppercase tracking-wider">30-Day Revenue</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={revenue.dailyRevenue}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`$${v}`, "Revenue"]} />
                        <Area type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={2} fill="url(#revGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Top Products */}
                {revenue.topProducts.length > 0 && (
                  <div className="bg-white/4 border border-white/8 rounded-xl p-4">
                    <div className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">Top Products by Revenue</div>
                    <div className="space-y-2">
                      {revenue.topProducts.map((p: any, i: number) => (
                        <div key={p.name} className="flex items-center gap-3">
                          <div className="text-xs text-slate-500 w-4 text-right">{i + 1}</div>
                          <div className="flex-1 min-w-0 text-sm text-slate-200 truncate">{p.name}</div>
                          <div className="text-sm font-medium text-emerald-400">${p.revenue.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Revenue data will appear once orders start coming in.</p>
              </div>
            )
          )}

          {/* ── STOREFRONT TAB ── */}
          {tab === "storefront" && (
            <div className="flex flex-col gap-4 h-full">
              {store?.platformDomain ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-sky-400" />
                      <span className="text-sm font-medium text-white/80">{store.platformDomain}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://${store.platformDomain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        Open in new tab
                      </a>
                    </div>
                  </div>
                  {/* Iframe preview */}
                  <div className="relative flex-1 rounded-xl overflow-hidden border border-white/10 bg-white/4" style={{ minHeight: '520px' }}>
                    <iframe
                      src={`https://${store.platformDomain}`}
                      className="w-full h-full absolute inset-0"
                      style={{ minHeight: '520px' }}
                      title={`${store.name} storefront`}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                      loading="lazy"
                    />
                    {/* Overlay hint */}
                    <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm text-white/55 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 pointer-events-none flex items-center gap-1.5">
                      Live preview · <span className="text-base leading-none">{platformIcon}</span> {platformBrand?.name ?? store.platform}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 text-center">
                    Some platforms restrict iframe embedding. If the preview is blank,
                    <a href={`https://${store.platformDomain}`} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline ml-1">open the store directly</a>.
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Globe className="w-8 h-8 text-slate-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white/60 mb-1">No storefront domain configured</p>
                    <p className="text-xs text-slate-500">Connect your store domain in the Integrations settings to enable the live preview.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BOT ACTIVITY TAB ── */}
          {tab === "activity" && (
            activityLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-2">
                {activity.map((task: any) => (
                  <div key={task.id} className="flex items-start gap-3 bg-white/4 border border-white/8 rounded-xl p-3 hover:bg-white/6 transition-colors">
                    <div className={`text-xs px-2 py-1 rounded font-mono flex-shrink-0 ${agentColor(task.agentType)}`}>
                      {task.agentType?.toUpperCase().slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{task.title}</div>
                      {task.description && <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{task.description}</div>}
                      <div className="text-xs text-slate-500 mt-1">{new Date(task.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="flex-shrink-0">
                      {task.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : task.status === "failed" ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500">
                <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No bot activity yet. Launch a workflow to get started.</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
