import React, { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useSearch } from "wouter";
import {
  Plug, ShoppingBag, Share2, CheckCircle2, AlertCircle, XCircle,
  ExternalLink, Trash2, RefreshCw, Plus, Shield, Loader2, Wifi, WifiOff,
  ChevronRight, TrendingUp, Package, ShoppingCart, Activity, Zap,
  DollarSign, BarChart3, Globe, Store, KeyRound, Eye, EyeOff, Wrench, Hourglass,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getBrand, isPlatformNew, type PlatformBrand } from "@/lib/platformBrand";
import { JustLanded } from "@/components/JustLanded";

const StoreView = lazy(() => import("@/components/StoreView"));
const ToolsTab = lazy(() => import("@/components/integrations/ToolsTab").then(m => ({ default: m.ToolsTab })));

/**
 * Convert a #rrggbb hex to a "r, g, b" CSS triple — the platform tile
 * primitives in index.css read --tile-color/--tile-accent as raw RGB
 * triples so they can compose them into rgba() with arbitrary alpha.
 */
function hexToRgbTriple(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/** CSS variable bag a `.platform-tile` element wires up. */
function tileVars(brand: PlatformBrand): React.CSSProperties {
  return {
    ["--tile-color" as any]: hexToRgbTriple(brand.color),
    ["--tile-accent" as any]: hexToRgbTriple(brand.accent),
  };
}

/* ─── API-key field definitions per platform ─── */
const API_KEY_FIELDS: Record<string, { label: string; key: string; placeholder: string; secret?: boolean; helpLink?: string; helpText?: string }[]> = {
  woocommerce: [
    { label: "Store URL", key: "storeUrl", placeholder: "https://your-store.com" },
    { label: "Consumer Key", key: "consumerKey", placeholder: "ck_xxxxxxxxxxxx", secret: true },
    { label: "Consumer Secret", key: "consumerSecret", placeholder: "cs_xxxxxxxxxxxx", secret: true },
  ],
  walmart: [
    { label: "Client ID", key: "clientId", placeholder: "Your Walmart Client ID" },
    { label: "Client Secret", key: "clientSecret", placeholder: "Your Walmart Client Secret", secret: true },
  ],
  // Sprint 27 — three new API-key flows.
  faire: [
    { label: "API Token", key: "apiKey", placeholder: "Faire brand portal · Integrations → API", secret: true },
  ],
  bonanza: [
    { label: "Developer ID", key: "devId", placeholder: "Your Bonanza dev_id" },
    { label: "Certificate ID", key: "certId", placeholder: "Your Bonanza cert_id", secret: true },
    { label: "User Token", key: "userToken", placeholder: "Bonanza user_token", secret: true },
  ],
  reverb: [
    {
      label: "Personal Access Token",
      key: "accessToken",
      placeholder: "Paste your Reverb Personal Access Token here",
      secret: true,
      helpLink: "https://reverb.com/my/api_settings",
      helpText: "Get it at reverb.com/my/api_settings → \"Create a Personal Access Token\"",
    },
  ],
};

export default function IntegrationsPage() {
  const [mainTab, setMainTab] = useState<"stores" | "social" | "tools" | "connect">("stores");
  const [connectTab, setConnectTab] = useState<"ecommerce" | "social" | "tools">("ecommerce");
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

  /* ─── Shopify domain dialog state ─── */
  const [shopifyDialogOpen, setShopifyDialogOpen] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyPending, setShopifyPending] = useState(false);

  /* ─── API-key dialog state (WooCommerce, Walmart) ─── */
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKeyPlatform, setApiKeyPlatform] = useState<string | null>(null);
  const [apiKeyValues, setApiKeyValues] = useState<Record<string, string>>({});
  const [apiKeyShowSecrets, setApiKeyShowSecrets] = useState<Record<string, boolean>>({});

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
      const platformId = (params.get("account") || "").toLowerCase();
      const brand = getBrand(platformId);
      const customName = params.get("name");
      toast.success(`${brand.icon} ${customName || brand.name} connected`, {
        description: brand.tagline,
      });
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
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
      else toast.error(data.message || "Failed to generate OAuth URL");
    },
    onError: (err) => toast.error(err.message),
  });
  const generateSocialOAuth = trpc.connectors.generateSocialOAuthUrl.useMutation({
    onSuccess: (data) => { if (data.url) window.location.href = data.url; else toast.error((data as any).message || "Failed"); },
    onError: (err) => toast.error(err.message),
  });

  /* ─── Shopify: create store + start OAuth ─── */
  const createStore = trpc.stores.create.useMutation();
  const shopifyOAuthUrl = trpc.stores.shopifyOAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        setShopifyDialogOpen(false);
        setShopifyDomain("");
        setShopifyPending(false);
        window.location.href = data.url;
      }
    },
    onError: (err) => { toast.error(err.message); setShopifyPending(false); },
  });

  const handleShopifyConnect = async () => {
    if (!shopifyDomain.trim()) { toast.error("Please enter your Shopify store domain"); return; }
    setShopifyPending(true);
    try {
      let domain = shopifyDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
      // Find or create a store for this domain
      const existingStore = (stores || []).find((s: any) => s.platform === "shopify" && (s.platformDomain === domain || s.name.toLowerCase() === domain.split(".")[0]));
      let storeId: number;
      if (existingStore) {
        storeId = existingStore.id;
      } else {
        const newStore = await createStore.mutateAsync({
          name: domain.split(".")[0],
          platform: "shopify",
          platformDomain: domain,
        });
        storeId = newStore.id;
        refetchStores();
      }
      shopifyOAuthUrl.mutate({ shopDomain: domain, storeId, origin: window.location.origin });
    } catch (err: any) {
      toast.error(err.message || "Failed to connect Shopify");
      setShopifyPending(false);
    }
  };

  /* ─── API-key connect (WooCommerce, Walmart, Faire, Bonanza) ─── */
  const connectApiKey = trpc.connectors.connectWithApiKey.useMutation({
    onSuccess: () => {
      const brand = apiKeyPlatform ? getBrand(apiKeyPlatform) : null;
      toast.success(brand ? `${brand.icon} ${brand.name} connected` : "Connected", {
        description: brand?.tagline,
      });
      setApiKeyDialogOpen(false);
      setApiKeyPlatform(null);
      setApiKeyValues({});
      refetchCreds();
      refetchStores();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleApiKeyConnect = async () => {
    if (!apiKeyPlatform) return;
    const fields = API_KEY_FIELDS[apiKeyPlatform];
    if (!fields) return;
    for (const f of fields) {
      if (!apiKeyValues[f.key]?.trim()) {
        toast.error(`Please enter ${f.label}`);
        return;
      }
    }
    // Find or create a store for this platform
    const existingStore = (stores || []).find((s: any) => s.platform === apiKeyPlatform);
    let storeId: number;
    if (existingStore) {
      storeId = existingStore.id;
    } else {
      const storeName =
        apiKeyPlatform === "woocommerce"
          ? (apiKeyValues.storeUrl || "")
              .replace(/^https?:\/\//, "")
              .replace(/\/$/, "")
              .split("/")[0] || "WooCommerce Store"
          : `${getBrand(apiKeyPlatform).name} Store`;
      const newStore = await createStore.mutateAsync({
        name: storeName,
        platform: apiKeyPlatform as any,
        platformDomain: apiKeyValues.storeUrl || undefined,
      });
      storeId = newStore.id;
      refetchStores();
    }
    connectApiKey.mutate({ platform: apiKeyPlatform, storeId, credentials: apiKeyValues });
  };

  const openApiKeyDialog = (platformId: string) => {
    setApiKeyPlatform(platformId);
    setApiKeyValues({});
    setApiKeyShowSecrets({});
    setApiKeyDialogOpen(true);
  };

  const connectedPlatformIds = useMemo(() => new Set((credentials || []).map((c: any) => c.platform)), [credentials]);
  const connectedSocialIds = useMemo(() => new Set((socialAccounts || []).map((s: any) => s.platform)), [socialAccounts]);

  const statusIcon = (status: string) => {
    if (status === "active" || status === "healthy") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    if (status === "error" || status === "unhealthy") return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
  };

  /* ─── Handle connect button click ─── */
  const handleEcommerceConnect = (platform: any) => {
    if (platform.id === "shopify") {
      setShopifyDomain("");
      setShopifyDialogOpen(true);
    } else if (platform.connectionType === "api_key" && API_KEY_FIELDS[platform.id]) {
      openApiKeyDialog(platform.id);
    } else {
      // OAuth flow for other platforms (Etsy, Amazon, eBay, TikTok Shop)
      generateOAuth.mutate({ platform: platform.id, origin: window.location.origin });
    }
  };

  const tabs = [
    { id: "connect" as const, label: "Connect New", icon: <Plus className="w-3.5 h-3.5" /> },
    { id: "stores" as const, label: "My Stores", icon: <Store className="w-3.5 h-3.5" />, count: stores?.length || 0 },
    { id: "social" as const, label: "Social Accounts", icon: <Share2 className="w-3.5 h-3.5" />, count: socialAccounts?.length || 0 },
    { id: "tools" as const, label: "Tools", icon: <Wrench className="w-3.5 h-3.5" />, count: connectedTools?.length || 0 },
  ];

  return (
    <div className="flex flex-col h-full bg-transparent text-slate-200 min-h-0">
      {/* Compact summary bar */}
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between flex-wrap gap-3 bg-white/[0.02]">
        <div>
          <p className="text-xs font-semibold text-white mb-1">Integrations & Connections</p>
          <p className="text-[11px] text-slate-400">
            {(stores?.length || 0)} stores · {(credentials?.length || 0)} platforms · {(socialAccounts?.length || 0)} social accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <div className="flex items-center gap-3 text-xs text-slate-400 bg-white/4 border border-white/8 rounded-lg px-3 py-2">
              <span className="flex items-center gap-1"><Store className="w-3 h-3 text-sky-400" /> {summary.credentials} active</span>
              {(summary as any).warning > 0 && <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-400" /> {summary.stores} warning</span>}
              {(summary as any).error > 0 && <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" /> {summary.socialAccounts} error</span>}
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
              <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-b from-sky-500/[0.06] via-cyan-500/[0.03] to-transparent py-14 px-6 text-center empty-state">
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-sky-500/15 blur-[60px] pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 mb-4">
                    <Store className="w-6 h-6 text-sky-300" />
                  </div>
                  <h3 className="text-lg font-heading font-bold tracking-tight text-white mb-1.5">
                    No stores connected yet
                  </h3>
                  <p className="text-sm text-slate-400 max-w-md mx-auto mb-5">
                    Plug into one of <span className="text-white font-semibold">14</span> commerce surfaces and the bots
                    inherit your catalog from minute one — no migration, no re-entry.
                  </p>

                  {/* Brand orbit — dense preview row of every supported platform */}
                  <div className="flex flex-wrap justify-center gap-1.5 max-w-xl mx-auto mb-6">
                    {ecommercePlatforms?.slice(0, 14).map((p: any) => {
                      const b = getBrand(p.id);
                      return (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] text-slate-300/85 hover:bg-white/[0.07] transition-colors"
                          style={{ boxShadow: `0 0 0 1px ${b.color}25 inset` }}
                          title={b.tagline}
                        >
                          <span className="text-sm leading-none">{b.icon}</span>
                          {b.name}
                        </span>
                      );
                    })}
                  </div>

                  <Button onClick={() => setMainTab("connect")} className="bg-sky-500 hover:bg-sky-400 text-white shadow-[0_8px_24px_-8px_rgba(14,165,233,0.55)]">
                    <Plus className="w-4 h-4 mr-2" /> Connect a Store
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stores.map((store: any) => {
                  const brand = getBrand(store.platform);
                  const cred = (credentials || []).find((c: any) => c.platform === store.platform);
                  const isConnected = !!cred;

                  return (
                    <button
                      key={store.id}
                      onClick={() => setSelectedStoreId(store.id)}
                      className="platform-tile group text-left p-5"
                      style={tileVars(brand)}
                    >
                      <span className="platform-tile-ribbon" />
                      <span className="platform-tile-seam" />
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="platform-tile-icon-halo text-3xl leading-none">{brand.icon}</div>
                          <div>
                            <div className="text-sm font-semibold text-white tracking-tight transition-colors">{store.name}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[160px]">{store.platformDomain || brand.name}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isConnected ? (
                            <span className="platform-connected-dot inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full">
                              <Wifi className="w-2.5 h-2.5" /> Live
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                              <WifiOff className="w-2.5 h-2.5" /> Setup
                            </span>
                          )}
                        </div>
                      </div>
                      <StoreCardMetrics storeId={store.id} />
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/6">
                        <div className="text-xs text-slate-500 truncate max-w-[60%]">{store.niche || brand.tagline}</div>
                        <div className="flex items-center gap-1 text-xs text-sky-300 group-hover:gap-2 transition-all">
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
                <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5 text-amber-300/80" /> Platform Credentials
                </h3>
                <div className="space-y-2">
                  {credentials.map((cred: any) => {
                    const credBrand = getBrand(cred.platform);
                    return (
                    <div
                      key={cred.id}
                      className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl p-3 hover:bg-white/6 transition-standard hover:border-white/12 card-hover"
                      style={{ borderLeft: `3px solid ${credBrand.color}` }}
                    >
                      <div className="platform-tile-icon-halo text-xl" style={tileVars(credBrand)}>{credBrand.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">{credBrand.name}</div>
                        <div className="text-[11px] text-slate-400">Added {new Date(cred.createdAt).toLocaleDateString()}</div>
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
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SOCIAL ACCOUNTS TAB ── */}
        {mainTab === "social" && (
          <div className="space-y-3">
            {!socialAccounts || socialAccounts.length === 0 ? (
              <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-b from-fuchsia-500/[0.06] via-orange-500/[0.03] to-transparent py-14 px-6 text-center empty-state">
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-fuchsia-500/15 blur-[60px] pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 mb-4">
                    <Share2 className="w-6 h-6 text-fuchsia-300" />
                  </div>
                  <h3 className="text-lg font-heading font-bold tracking-tight text-white mb-1.5">
                    No social accounts connected
                  </h3>
                  <p className="text-sm text-slate-400 max-w-md mx-auto mb-5">
                    Six platforms plus Gmail. The Social Bot picks the channel by content type and tunes copy to each
                    surface's audience automatically.
                  </p>

                  <div className="flex flex-wrap justify-center gap-1.5 max-w-md mx-auto mb-6">
                    {socialPlatforms?.map((p: any) => {
                      const b = getBrand(p.id);
                      return (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] text-slate-300/85"
                          style={{ boxShadow: `0 0 0 1px ${b.color}25 inset` }}
                          title={b.tagline}
                        >
                          <span className="text-sm leading-none">{b.icon}</span>
                          {b.name}
                        </span>
                      );
                    })}
                  </div>

                  <Button onClick={() => { setMainTab("connect"); setConnectTab("social"); }} className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white shadow-[0_8px_24px_-8px_rgba(217,70,239,0.55)]">
                    <Plus className="w-4 h-4 mr-2" /> Connect Social Account
                  </Button>
                </div>
              </div>
            ) : (
              socialAccounts.map((acc: any) => {
                const accBrand = getBrand(acc.platform);
                return (
                  <div
                    key={acc.id}
                    className="flex items-center gap-4 bg-white/4 border border-white/8 rounded-xl p-4 hover:bg-white/6 transition-standard hover:border-white/12 card-hover"
                    style={{ borderLeft: `3px solid ${accBrand.color}` }}
                  >
                    <div className="platform-tile-icon-halo text-2xl" style={tileVars(accBrand)}>{accBrand.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{acc.accountName || accBrand.name}</span>
                        <Badge className="text-[10px] border border-white/10 text-slate-300">{accBrand.name}</Badge>
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
            {/* STORES SECTION — PROMINENT AT TOP */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Store className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-heading font-bold text-white">Connect a Store</h3>
                <span className="text-xs text-slate-500 ml-auto">{stores?.length || 0} connected</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ecommercePlatforms?.filter((p: any) => ["shopify", "woocommerce", "bigcommerce", "square"].includes(p.id)).map((platform: any) => {
                  const isConnected = connectedPlatformIds.has(platform.id);
                  const brand = getBrand(platform.id);
                  return (
                    <div
                      key={platform.id}
                      className="platform-tile p-4 flex flex-col gap-2"
                      style={tileVars(brand)}
                    >
                      <span className="platform-tile-ribbon" />
                      <span className="platform-tile-seam" />
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="platform-tile-icon-halo text-2xl leading-none">{brand.icon}</div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white tracking-tight">{brand.name}</div>
                            <div className="text-[10px] text-slate-400/90 truncate">{brand.tagline}</div>
                          </div>
                        </div>
                        {isConnected && (
                          <span className="platform-connected-dot inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Live
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className={`w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition-all duration-200 ${
                          isConnected
                            ? "bg-white/6 text-slate-200 hover:bg-white/10 border border-white/10"
                            : "platform-tile-cta text-white"
                        }`}
                        onClick={() => handleEcommerceConnect(platform)}
                        disabled={generateOAuth.isPending}
                      >
                        {generateOAuth.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isConnected ? (
                          <RefreshCw className="w-3 h-3" />
                        ) : (
                          <Plug className="w-3 h-3" />
                        )}
                        {isConnected ? "Reconnect" : "Connect"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Just Landed spotlight — auto-hides past the 60-day grace
                window. Surfaces every freshly-shipped integration so
                operators see the new options before scrolling the grid. */}
            <JustLanded />

            {/* Hero band — sets the tone, surfaces platform counts up front */}
            <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-sky-500/8 via-cyan-500/4 to-orange-500/6 p-5">
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-sky-500/15 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
              <div className="relative flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-heading font-bold tracking-tight text-white">
                    Connect More Platforms ✦
                  </h2>
                  <p className="text-[12px] text-slate-300/85 max-w-xl leading-snug">
                    {(ecommercePlatforms?.length || 0)} commerce surfaces · {(socialPlatforms?.length || 0)} social channels · cross-cutting tools.
                    Every adapter ships with a real capability matrix the bots branch on — no dead tiles.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-300">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/6 border border-white/10">
                    <ShoppingBag className="w-3 h-3 text-sky-400" /> {(ecommercePlatforms?.length || 0)} e-commerce
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/6 border border-white/10">
                    <Share2 className="w-3 h-3 text-fuchsia-400" /> {(socialPlatforms?.length || 0)} social
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/6 border border-white/10">
                    <Wrench className="w-3 h-3 text-amber-300" /> 9 tools
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {(["ecommerce", "social", "tools"] as const).map(t => {
                const count = t === "ecommerce" ? (ecommercePlatforms?.length || 0)
                  : t === "social" ? (socialPlatforms?.length || 0)
                  : 9;
                return (
                  <button
                    key={t}
                    onClick={() => setConnectTab(t)}
                    className={`relative inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      connectTab === t
                        ? "bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-[0_4px_16px_-4px_rgba(14,165,233,0.45)]"
                        : "text-slate-400 hover:text-slate-200 bg-white/4 border border-white/8"
                    }`}
                  >
                    {t === "ecommerce" ? "🛍️ E-Commerce" : t === "social" ? "📱 Social Media" : "🛠️ Tools"}
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      connectTab === t ? "bg-sky-400/20 text-sky-200" : "bg-white/8 text-slate-400"
                    }`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {connectTab === "tools" ? (
              <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-sky-400 animate-spin" /></div>}>
                <ToolsTab />
              </Suspense>
            ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(connectTab === "ecommerce" ? ecommercePlatforms : socialPlatforms)?.map((platform: any) => {
                const isConnected = connectTab === "ecommerce"
                  ? connectedPlatformIds.has(platform.id)
                  : connectedSocialIds.has(platform.id);
                const brand = getBrand(platform.id);
                const isAvailable = platform.available !== false;
                const strength = platform.capabilityMatrix?.strengths?.[0];
                const limitation = platform.capabilityMatrix?.limitations?.[0];

                const isNew = isPlatformNew(brand);
                return (
                  <div
                    key={platform.id}
                    className={`platform-tile p-5 flex flex-col gap-3 ${
                      isAvailable ? "" : "opacity-60 grayscale-[0.2]"
                    }`}
                    style={tileVars(brand)}
                  >
                    <span className="platform-tile-ribbon" />
                    <span className="platform-tile-seam" />
                    {isNew && <span className="platform-tile-new-ribbon" aria-label="New integration">NEW</span>}

                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="platform-tile-icon-halo text-3xl leading-none">
                          {brand.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white tracking-tight truncate">
                            {platform.name || brand.name}
                          </div>
                          <div className="text-[11px] text-slate-400/90 truncate">
                            {brand.tagline}
                          </div>
                        </div>
                      </div>
                      {isConnected && (
                        <span className="platform-connected-dot inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Live
                        </span>
                      )}
                    </div>

                    {platform.capabilities && platform.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {platform.capabilities.slice(0, 4).map((cap: string) => (
                          <span
                            key={cap}
                            className="platform-cap-chip text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    )}

                    {strength && (
                      <p className="platform-tile-strength text-[10.5px] leading-snug px-2.5 py-1.5 rounded-md line-clamp-2">
                        <Sparkles className="inline w-2.5 h-2.5 mr-1 -mt-0.5 text-white/70" />
                        {strength}
                      </p>
                    )}

                    {/* Connection type badge */}
                    {platform.connectionType === "api_key" && (
                      <div className="flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-amber-300/90" />
                        <span className="text-[10px] text-amber-300/90 font-medium">API Key</span>
                      </div>
                    )}

                    {limitation && (
                      <p className="text-[10px] text-slate-500/90 leading-snug line-clamp-1">
                        ⓘ {limitation}
                      </p>
                    )}

                    <div className="mt-auto pt-1">
                      {!isAvailable ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                disabled
                                className="w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-400 border border-dashed border-white/10 bg-white/[0.02] rounded-md py-2 cursor-not-allowed transition-colors"
                                aria-label={`${platform.name} coming soon`}
                              >
                                <Hourglass className="w-3 h-3" /> Coming soon
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[240px]">
                              {platform.name} integration is rolling out. Track progress on the status page or subscribe to launch updates.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <button
                          type="button"
                          className={`w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition-all duration-200 ${
                            isConnected
                              ? "bg-white/6 text-slate-200 hover:bg-white/10 border border-white/10"
                              : "platform-tile-cta text-white"
                          }`}
                          onClick={() => {
                            if (connectTab === "ecommerce") {
                              handleEcommerceConnect(platform);
                            } else {
                              generateSocialOAuth.mutate({ platform: platform.id, origin: window.location.origin });
                            }
                          }}
                          disabled={generateOAuth.isPending || generateSocialOAuth.isPending}
                        >
                          {generateOAuth.isPending || generateSocialOAuth.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isConnected ? (
                            <RefreshCw className="w-3 h-3" />
                          ) : (
                            <Plug className="w-3 h-3" />
                          )}
                          {isConnected ? "Reconnect" : "Connect"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

          </div>
        )}
      </div>

      {/* ── Shopify Domain Dialog ── */}
      <Dialog open={shopifyDialogOpen} onOpenChange={setShopifyDialogOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">🛍️</span> Connect Shopify Store
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter your Shopify store domain to start the OAuth connection. You'll be redirected to Shopify to authorize access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="shopify-domain" className="text-slate-300">Store Domain</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="shopify-domain"
                  placeholder="your-store or your-store.myshopify.com"
                  value={shopifyDomain}
                  onChange={(e) => setShopifyDomain(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleShopifyConnect()}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                />
              </div>
              <p className="text-xs text-slate-500">
                Example: <code className="text-sky-400/80">my-store</code> or <code className="text-sky-400/80">my-store.myshopify.com</code>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShopifyDialogOpen(false)} className="border-white/10 text-slate-300 hover:bg-white/5">
              Cancel
            </Button>
            <Button
              onClick={handleShopifyConnect}
              disabled={shopifyPending || !shopifyDomain.trim()}
              className="bg-[#96BF48] hover:bg-[#7ea33d] text-white"
            >
              {shopifyPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Connect to Shopify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── API Key Dialog (WooCommerce, Walmart, Faire, Bonanza) ── */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{apiKeyPlatform ? getBrand(apiKeyPlatform).icon : "🔌"}</span>
              Connect {apiKeyPlatform ? getBrand(apiKeyPlatform).name : ""}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {apiKeyPlatform === "woocommerce"
                ? "Enter your WooCommerce REST API credentials. Generate them in WooCommerce → Settings → Advanced → REST API."
                : apiKeyPlatform === "walmart"
                ? "Enter your Walmart Marketplace API credentials from the Walmart Developer Portal."
                : apiKeyPlatform === "faire"
                ? "Enter your Faire API token from the Faire brand portal → Integrations → API."
                : apiKeyPlatform === "bonanza"
                ? "Enter your Bonanza Bonapitit dev_id, cert_id, and user_token from the Bonanza Developer Portal."
                : apiKeyPlatform === "reverb"
                ? "Reverb no longer supports OAuth. Generate a Personal Access Token from your Reverb account settings to connect your store."
                : "Enter your API credentials to connect."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {apiKeyPlatform && API_KEY_FIELDS[apiKeyPlatform]?.map((field) => (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`api-${field.key}`} className="text-slate-300">{field.label}</Label>
                  {field.helpLink && (
                    <a
                      href={field.helpLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky-400 hover:text-sky-300 underline underline-offset-2"
                    >
                      Where to find it ↗
                    </a>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id={`api-${field.key}`}
                    type={field.secret && !apiKeyShowSecrets[field.key] ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={apiKeyValues[field.key] || ""}
                    onChange={(e) => setApiKeyValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 pr-10"
                  />
                  {field.secret && (
                    <button
                      type="button"
                      onClick={() => setApiKeyShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {apiKeyShowSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {field.helpText && (
                  <p className="text-[11px] text-slate-500">{field.helpText}</p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)} className="border-white/10 text-slate-300 hover:bg-white/5">
              Cancel
            </Button>
            <Button
              onClick={handleApiKeyConnect}
              disabled={connectApiKey.isPending || createStore.isPending}
              className="text-white"
              style={{ backgroundColor: apiKeyPlatform ? getBrand(apiKeyPlatform).color : "#0ea5e9" }}
            >
              {(connectApiKey.isPending || createStore.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
              Save & Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
