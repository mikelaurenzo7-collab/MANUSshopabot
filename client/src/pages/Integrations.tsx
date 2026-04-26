import React, { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useSearch } from "wouter";
import {
  Plug, ShoppingBag, Share2, CheckCircle2, AlertCircle, XCircle,
  ExternalLink, Trash2, RefreshCw, Plus, Shield, Loader2, Wifi, WifiOff,
  ChevronRight, TrendingUp, Package, ShoppingCart, Activity, Zap,
  DollarSign, BarChart3, Globe, Store, KeyRound, Eye, EyeOff, Wrench
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const StoreView = lazy(() => import("@/components/StoreView"));
const ToolsTab = lazy(() => import("@/components/integrations/ToolsTab").then(m => ({ default: m.ToolsTab })));

const PLATFORM_COLORS: Record<string, string> = {
  shopify: "#96BF48", woocommerce: "#96588A", amazon: "#FF9900",
  etsy: "#F1641E", ebay: "#E53238", tiktok_shop: "#000000", walmart: "#0071CE",
  meta: "#1877F2", instagram: "#E1306C", tiktok: "#010101", twitter: "#1DA1F2",
  pinterest: "#E60023", youtube: "#FF0000", gmail: "#EA4335",
};
const PLATFORM_ICONS: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🌐", amazon: "📦", etsy: "🧡",
  ebay: "🔨", tiktok_shop: "🎵", walmart: "🏪",
  meta: "📘", instagram: "📸", tiktok: "🎵", twitter: "🐦",
  pinterest: "📌", youtube: "▶️", gmail: "📧",
};

export default function IntegrationsPage() {
  const [mainTab, setMainTab] = useState<"stores" | "social" | "tools" | "connect">("stores");
  const [connectTab, setConnectTab] = useState<"ecommerce" | "social" | "tools">("ecommerce");
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

  const { data: stores, refetch: refetchStores } = trpc.stores.list.useQuery();
  const { data: ecommercePlatforms } = trpc.connectors.ecommercePlatforms.useQuery();
  const { data: socialPlatforms } = trpc.connectors.socialPlatforms.useQuery();
  const { data: credentials, refetch: refetchCreds } = trpc.connectors.listCredentials.useQuery();
  const { data: socialAccounts, refetch: refetchSocial } = trpc.connectors.listSocialAccounts.useQuery();
  const { data: connectedTools } = trpc.tools.listConnected.useQuery();
  const { data: summary } = trpc.connectors.connectionSummary.useQuery();

  // Handle OAuth redirects
  const searchString = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("connected") && params.get("account")) {
      toast.success(`${(params.get("name") || params.get("account"))?.toUpperCase()} connected successfully`);
      history.replaceState(null, "", window.location.pathname);
      refetchCreds();
      refetchSocial();
    }
  }, [searchString]);

  const disconnectCred = trpc.connectors.disconnectCredential.useMutation({
    onSuccess: () => { toast.success("Platform disconnected"); refetchCreds(); setSelectedEntity(null); },
    onError: (err) => toast.error(err.message),
  });
  const disconnectSocial = trpc.connectors.disconnectSocialAccount.useMutation({
    onSuccess: () => { toast.success("Account disconnected"); refetchSocial(); setSelectedEntity(null); },
    onError: (err) => toast.error(err.message),
  });
  const checkHealth = trpc.connectors.checkCredentialHealth.useMutation({
    onSuccess: (data) => { toast.success(`Status: ${data.status}`); refetchCreds(); },
    onError: (err) => toast.error(err.message),
  });
  const generateOAuth = trpc.connectors.generateOAuthUrl.useMutation({
    onSuccess: (data) => { if (data.url) window.location.href = data.url; else toast.error(data.message || "Failed"); },
    onError: (err) => toast.error(err.message),
  });
  const generateSocialOAuth = trpc.connectors.generateSocialOAuthUrl.useMutation({
    onSuccess: (data) => { if (data.url) window.location.href = data.url; else toast.error((data as any).message || "Failed"); },
    onError: (err) => toast.error(err.message),
  });

  const connectedPlatformIds = useMemo(() => new Set((credentials || []).map((c: any) => c.platform)), [credentials]);
  const connectedSocialIds = useMemo(() => new Set((socialAccounts || []).map((s: any) => s.platform)), [socialAccounts]);

  const statusIcon = (status: string) => {
    if (status === "active" || status === "healthy") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    if (status === "error" || status === "unhealthy") return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
  };

  const tabs = [
    { id: "stores" as const, label: "My Stores", icon: <Store className="w-3.5 h-3.5" />, count: stores?.length || 0 },
    { id: "social" as const, label: "Social Accounts", icon: <Share2 className="w-3.5 h-3.5" />, count: socialAccounts?.length || 0 },
    { id: "tools" as const, label: "Tools", icon: <Wrench className="w-3.5 h-3.5" />, count: connectedTools?.length || 0 },
    { id: "connect" as const, label: "Connect New", icon: <Plus className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#050505] text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Integration Hub</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {(stores?.length || 0)} stores · {(credentials?.length || 0)} platforms · {(socialAccounts?.length || 0)} social accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <div className="flex items-center gap-3 text-xs text-slate-400 bg-white/4 border border-white/8 rounded-lg px-3 py-2">
              <span className="flex items-center gap-1"><Store className="w-3 h-3 text-sky-400" /> {summary.credentials} platforms</span>
              {(summary as any).warning > 0 && <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-400" /> {summary.stores} stores</span>}
              {(summary as any).error > 0 && <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" /> {summary.socialAccounts} social</span>}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-white/8 bg-white/2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setMainTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              mainTab === t.id
                ? "bg-sky-500/15 text-sky-400 border border-sky-500/25"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            {t.icon}
            {t.label}
            {"count" in t && (t.count ?? 0) > 0 && (
              <span className="ml-0.5 bg-white/10 text-slate-300 rounded-full px-1.5 py-0.5 text-[10px]">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── STORES TAB ── */}
        {mainTab === "stores" && (
          <div className="space-y-4">
            {!stores || stores.length === 0 ? (
              <div className="text-center py-20">
                <Store className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <h3 className="text-base font-medium text-slate-300 mb-1">No stores connected yet</h3>
                <p className="text-sm text-slate-500 mb-4">Connect your first store to start selling with AI-powered bots.</p>
                <Button onClick={() => setMainTab("connect")} className="bg-sky-500 hover:bg-sky-400 text-white">
                  <Plus className="w-4 h-4 mr-2" /> Connect a Store
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stores.map((store: any) => {
                  const color = PLATFORM_COLORS[store.platform] || "#64748b";
                  const icon = PLATFORM_ICONS[store.platform] || "🏪";
                  const cred = (credentials || []).find((c: any) => c.platform === store.platform);
                  const isConnected = !!cred;

                  return (
                    <button
                      key={store.id}
                      onClick={() => setSelectedStoreId(store.id)}
                      className="group text-left bg-white/4 border border-white/8 rounded-2xl p-5 hover:bg-white/7 hover:border-white/15 transition-all duration-200 relative overflow-hidden"
                    >
                      {/* Platform color accent */}
                      <div
                        className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl"
                        style={{ background: `linear-gradient(90deg, ${color}80, ${color}20)` }}
                      />

                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{icon}</div>
                          <div>
                            <div className="text-sm font-semibold text-white group-hover:text-sky-300 transition-colors">{store.name}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[140px]">{store.platformDomain || store.platform}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isConnected ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">
                              <Wifi className="w-2.5 h-2.5" /> Live
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">
                              <WifiOff className="w-2.5 h-2.5" /> Setup
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mini KPIs — placeholder, will be populated from overview query */}
                      <StoreCardMetrics storeId={store.id} />

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/6">
                        <div className="text-xs text-slate-500">{store.niche || store.platform}</div>
                        <div className="flex items-center gap-1 text-xs text-sky-400 group-hover:gap-2 transition-all">
                          View store <ChevronRight className="w-3 h-3" />
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Add Store CTA */}
                <button
                  onClick={() => setMainTab("connect")}
                  className="flex flex-col items-center justify-center gap-2 bg-white/2 border border-dashed border-white/10 rounded-2xl p-5 hover:bg-white/5 hover:border-white/20 transition-all text-slate-500 hover:text-slate-300 min-h-[180px]"
                >
                  <Plus className="w-8 h-8" />
                  <span className="text-sm font-medium">Add Store</span>
                </button>
              </div>
            )}

            {/* Platform Credentials (API keys) */}
            {credentials && credentials.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-medium text-slate-300 mb-3">Platform Credentials</h3>
                <div className="space-y-2">
                  {credentials.map((cred: any) => (
                    <div key={cred.id} className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl p-3">
                      <div className="text-lg">{PLATFORM_ICONS[cred.platform] || "🔌"}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{cred.platform?.toUpperCase()}</div>
                        <div className="text-xs text-slate-400">Added {new Date(cred.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        {statusIcon(cred.status || "active")}
                        <span className="text-xs text-slate-400">{cred.status || "active"}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                          onClick={() => checkHealth.mutate({ id: cred.id })}
                          disabled={checkHealth.isPending}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${checkHealth.isPending ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                          onClick={() => disconnectCred.mutate({ id: cred.id })}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SOCIAL ACCOUNTS TAB ── */}
        {mainTab === "social" && (
          <div className="space-y-3">
            {!socialAccounts || socialAccounts.length === 0 ? (
              <div className="text-center py-20">
                <Share2 className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <h3 className="text-base font-medium text-slate-300 mb-1">No social accounts connected</h3>
                <p className="text-sm text-slate-500 mb-4">Connect your social platforms to automate posts, ads, and email campaigns.</p>
                <Button onClick={() => { setMainTab("connect"); setConnectTab("social"); }} className="bg-sky-500 hover:bg-sky-400 text-white">
                  <Plus className="w-4 h-4 mr-2" /> Connect Social Account
                </Button>
              </div>
            ) : (
              socialAccounts.map((acc: any) => {
                const color = PLATFORM_COLORS[acc.platform] || "#64748b";
                const icon = PLATFORM_ICONS[acc.platform] || "📱";
                return (
                  <div
                    key={acc.id}
                    className="flex items-center gap-4 bg-white/4 border border-white/8 rounded-xl p-4 hover:bg-white/6 transition-colors"
                    style={{ borderLeft: `3px solid ${color}40` }}
                  >
                    <div className="text-2xl">{icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{acc.accountName || acc.platform}</span>
                        <Badge className="text-[10px] border border-white/10 text-slate-400">{acc.platform}</Badge>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {acc.followersCount ? `${acc.followersCount.toLocaleString()} followers` : ""}
                        {acc.accountId ? ` · @${acc.accountId}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Connected
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                        onClick={() => disconnectSocial.mutate({ id: acc.id })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── TOOLS TAB ── */}
        {mainTab === "tools" && (
          <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-sky-400 animate-spin" /></div>}>
            <ToolsTab />
          </Suspense>
        )}

        {/* ── CONNECT NEW TAB ── */}
        {mainTab === "connect" && (
          <div className="space-y-6">
            <div className="flex gap-2">
              {(["ecommerce", "social", "tools"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setConnectTab(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    connectTab === t
                      ? "bg-sky-500/15 text-sky-400 border border-sky-500/25"
                      : "text-slate-400 hover:text-slate-200 bg-white/4 border border-white/8"
                  }`}
                >
                  {t === "ecommerce" ? "🛍️ E-Commerce" : t === "social" ? "📱 Social Media" : "🛠️ Tools"}
                </button>
              ))}
            </div>

            {connectTab === "tools" ? (
              <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-sky-400 animate-spin" /></div>}>
                <ToolsTab />
              </Suspense>
            ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(connectTab === "ecommerce" ? ecommercePlatforms : socialPlatforms)?.map((platform: any) => {
                const isConnected = connectTab === "ecommerce"
                  ? connectedPlatformIds.has(platform.id)
                  : connectedSocialIds.has(platform.id);
                const color = PLATFORM_COLORS[platform.id] || "#64748b";

                return (
                  <div
                    key={platform.id}
                    className="bg-white/4 border border-white/8 rounded-xl p-4 hover:bg-white/6 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{PLATFORM_ICONS[platform.id] || "🔌"}</span>
                        <div>
                          <div className="text-sm font-semibold text-white">{platform.name}</div>
                          <div className="text-xs text-slate-500">{platform.description?.slice(0, 40)}...</div>
                        </div>
                      </div>
                      {isConnected && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                    </div>

                    {platform.capabilities && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {platform.capabilities.slice(0, 3).map((cap: string) => (
                          <span key={cap} className="text-[10px] bg-white/6 text-slate-400 px-1.5 py-0.5 rounded">{cap}</span>
                        ))}
                      </div>
                    )}

                    <Button
                      size="sm"
                      className={`w-full text-xs ${
                        isConnected
                          ? "bg-white/6 text-slate-300 hover:bg-white/10 border border-white/10"
                          : "text-white hover:opacity-90"
                      }`}
                      style={!isConnected ? { backgroundColor: color } : {}}
                      onClick={() => {
                        if (connectTab === "ecommerce") {
                          generateOAuth.mutate({ platform: platform.id, origin: window.location.origin });
                        } else {
                          generateSocialOAuth.mutate({ platform: platform.id, origin: window.location.origin });
                        }
                      }}
                      disabled={generateOAuth.isPending || generateSocialOAuth.isPending}
                    >
                      {generateOAuth.isPending || generateSocialOAuth.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : null}
                      {isConnected ? "Reconnect" : "Connect"}
                    </Button>
                  </div>
                );
              })}
            </div>
            )}

          </div>
        )}
      </div>

      {/* StoreView Slide-Over */}
      {selectedStoreId !== null && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-sky-400 animate-spin" /></div>}>
          <StoreView storeId={selectedStoreId} onClose={() => setSelectedStoreId(null)} />
        </Suspense>
      )}
    </div>
  );
}

/** Mini metrics card shown on each store card — fetches overview lazily */
function StoreCardMetrics({ storeId }: { storeId: number }) {
  const { data: overview, isLoading } = trpc.stores.overview.useQuery({ storeId });

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!overview) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-white/4 rounded-lg p-2 text-center">
        <div className="text-sm font-semibold text-emerald-400">${overview.metrics.todayRevenue.toFixed(0)}</div>
        <div className="text-[10px] text-slate-500">Today</div>
      </div>
      <div className="bg-white/4 rounded-lg p-2 text-center">
        <div className="text-sm font-semibold text-sky-400">{overview.metrics.totalOrders}</div>
        <div className="text-[10px] text-slate-500">Orders</div>
      </div>
      <div className="bg-white/4 rounded-lg p-2 text-center">
        <div className={`text-sm font-semibold ${overview.metrics.lowStockProducts > 0 ? "text-amber-400" : "text-slate-400"}`}>
          {overview.metrics.totalProducts}
        </div>
        <div className="text-[10px] text-slate-500">Products</div>
      </div>
    </div>
  );
}
