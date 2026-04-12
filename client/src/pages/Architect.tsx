import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Bot,
  Search,
  Loader2,
  TrendingUp,
  Target,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  Package,
  Plus,
  Store,
  Globe,
  Zap,
  ExternalLink,
  CheckCircle2,
  Trash2,
} from "lucide-react";

function NicheReportCard({ report }: { report: any }) {
  const data = report.report;
  if (!data) return null;

  const scoreColor =
    data.viabilityScore >= 70
      ? "text-emerald-400 border-emerald-400/30"
      : data.viabilityScore >= 40
        ? "text-amber-400 border-amber-400/30"
        : "text-destructive border-destructive/30";

  return (
    <Card className="bg-card border-border/50 hover:border-primary/20 transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">{report.keyword}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(report.createdAt).toLocaleDateString()}
            </p>
          </div>
          <Badge variant="outline" className={`${scoreColor} text-sm font-bold`}>
            {data.viabilityScore}/100
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{data.summary}</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-2 rounded-md bg-secondary/50 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Market</p>
            <p className="text-xs font-medium text-foreground mt-0.5">{data.marketSize}</p>
          </div>
          <div className="p-2 rounded-md bg-secondary/50 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Competition</p>
            <p className="text-xs font-medium text-foreground mt-0.5 capitalize">{data.competition}</p>
          </div>
          <div className="p-2 rounded-md bg-secondary/50 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Trend</p>
            <p className="text-xs font-medium text-foreground mt-0.5 capitalize">{data.trendDirection}</p>
          </div>
        </div>
        {data.topProducts && data.topProducts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top Products</p>
            <div className="space-y-1.5">
              {data.topProducts.slice(0, 3).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-foreground truncate mr-2">{p.name}</span>
                  <span className="text-muted-foreground shrink-0">{p.estimatedPrice} · {p.margin} margin</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.keyInsights && data.keyInsights.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Insights</p>
            <div className="space-y-1">
              {data.keyInsights.slice(0, 3).map((insight: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Target className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const platformIcons: Record<string, string> = {
  shopify: "🛍️",
  woocommerce: "🌐",
  amazon: "📦",
  etsy: "🧡",
  ebay: "🔨",
  tiktok_shop: "🎵",
  walmart: "🏪",
};

export default function ArchitectPage() {
  const [location] = useLocation();
  const [keyword, setKeyword] = useState("");
  const [catalogKeyword, setCatalogKeyword] = useState("");
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [productCount, setProductCount] = useState("5");
  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStorePlatform, setNewStorePlatform] = useState("shopify");
  const [newStoreNiche, setNewStoreNiche] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [isConnectingShopify, setIsConnectingShopify] = useState(false);
  const [activeTab, setActiveTab] = useState("research");

  const { data: reports, isLoading: reportsLoading } = trpc.architect.nicheReports.useQuery({});
  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const { data: platforms } = trpc.stores.supportedPlatforms.useQuery();
  const utils = trpc.useUtils();

  // Handle OAuth callback query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      toast.success("Shopify store connected successfully!");
      utils.stores.list.invalidate();
      setActiveTab("stores");
      // Clean URL
      window.history.replaceState({}, "", "/architect");
    } else if (params.get("error") === "connection_failed") {
      toast.error("Shopify connection failed. Please try again.");
      window.history.replaceState({}, "", "/architect");
    }
  }, []);

  const nicheResearch = trpc.architect.nicheResearch.useMutation({
    onSuccess: () => {
      toast.success("Niche research complete!");
      utils.architect.nicheReports.invalidate();
      utils.dashboard.invalidate();
      setKeyword("");
    },
    onError: (err) => toast.error(err.message),
  });

  const generateCatalog = trpc.architect.generateProductCatalog.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.products.length} products!`);
      utils.dashboard.invalidate();
      setCatalogKeyword("");
    },
    onError: (err) => toast.error(err.message),
  });

  const createStore = trpc.stores.create.useMutation({
    onSuccess: () => {
      toast.success("Store created!");
      utils.stores.list.invalidate();
      setAddStoreOpen(false);
      setNewStoreName("");
      setNewStoreNiche("");
      setActiveTab("stores");
    },
    onError: (err) => toast.error(err.message),
  });

  // For Shopify: create store first, then get OAuth URL
  const createStoreForOAuth = trpc.stores.create.useMutation({
    onSuccess: async (newStore) => {
      // Now get the OAuth URL using the new store's ID
      shopifyOAuthUrl.mutate({
        shopDomain: shopDomain.trim(),
        storeId: newStore.id,
        origin: window.location.origin,
      });
    },
    onError: (err) => {
      toast.error(err.message);
      setIsConnectingShopify(false);
    },
  });

  const shopifyOAuthUrl = trpc.stores.shopifyOAuthUrl.useMutation({
    onSuccess: (data) => {
      // Redirect to Shopify OAuth consent screen
      window.location.href = data.url;
    },
    onError: (err) => {
      toast.error(err.message);
      setIsConnectingShopify(false);
    },
  });

  const handleShopifyConnect = () => {
    if (!newStoreName.trim()) {
      toast.error("Please enter a store name");
      return;
    }
    if (!shopDomain.trim()) {
      toast.error("Please enter your Shopify domain");
      return;
    }
    setIsConnectingShopify(true);
    // Step 1: Create the store record, then OAuth URL is generated in onSuccess
    createStoreForOAuth.mutate({
      name: newStoreName.trim(),
      platform: "shopify",
      niche: newStoreNiche || undefined,
    });
  };

  const storeOptions = useMemo(() => stores ?? [], [stores]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-violet-500/15 flex items-center justify-center">
          <Bot className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">The Architect Agent</h1>
          <p className="text-sm text-muted-foreground">Niche research, product sourcing, and store setup</p>
        </div>
        <div className="ml-auto">
          <Badge variant="outline" className="text-[10px] border-violet-400/30 text-violet-400">
            <Zap className="h-3 w-3 mr-1" />
            AI-Powered
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="research">Niche Research</TabsTrigger>
          <TabsTrigger value="catalog">Product Catalog</TabsTrigger>
          <TabsTrigger value="stores">
            Stores
            {storeOptions.length > 0 && (
              <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-primary/20 text-primary border-0">
                {storeOptions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
        </TabsList>

        {/* Niche Research Tab */}
        <TabsContent value="research" className="space-y-4">
          <Card className="bg-card border-border/50">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Search className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">AI Niche Research</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Enter a keyword or niche idea. The Architect will analyze market size, competition, trends, and product opportunities using AI.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Minimalist Home Decor, Pet Tech Gadgets, Eco-friendly Kitchen..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="bg-input/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && keyword.trim() && !nicheResearch.isPending) {
                      nicheResearch.mutate({ keyword: keyword.trim() });
                    }
                  }}
                />
                <Button
                  onClick={() => nicheResearch.mutate({ keyword: keyword.trim() })}
                  disabled={!keyword.trim() || nicheResearch.isPending}
                  className="shrink-0"
                >
                  {nicheResearch.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Search className="h-4 w-4 mr-1" />
                  )}
                  Analyze
                </Button>
              </div>
              {nicheResearch.isPending && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>The Architect is researching your niche...</span>
                </div>
              )}
            </CardContent>
          </Card>

          {reportsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <Card key={i} className="bg-card border-border/50">
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <div className="grid grid-cols-3 gap-3">
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : reports && reports.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reports.map((r: any) => (
                <NicheReportCard key={r.id} report={r} />
              ))}
            </div>
          ) : (
            <Card className="bg-card border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Lightbulb className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No niche reports yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Enter a keyword above to get started</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Product Catalog Tab */}
        <TabsContent value="catalog" className="space-y-4">
          <Card className="bg-card border-border/50">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Generate Product Catalog</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                The Architect will generate a curated product catalog with titles, descriptions, pricing, and supplier suggestions — ready to publish.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Store</Label>
                  <Select value={selectedStore} onValueChange={setSelectedStore}>
                    <SelectTrigger className="bg-input/50">
                      <SelectValue placeholder="Select a store" />
                    </SelectTrigger>
                    <SelectContent>
                      {storeOptions.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          <span className="mr-1">{platformIcons[s.platform] || "🏪"}</span>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Niche Keyword</Label>
                  <Input
                    placeholder="e.g., Eco-friendly Kitchen"
                    value={catalogKeyword}
                    onChange={(e) => setCatalogKeyword(e.target.value)}
                    className="bg-input/50"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Products to Generate</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={productCount}
                      onChange={(e) => setProductCount(e.target.value)}
                      className="bg-input/50 w-20"
                    />
                    <Button
                      onClick={() =>
                        generateCatalog.mutate({
                          keyword: catalogKeyword.trim(),
                          storeId: Number(selectedStore),
                          count: Number(productCount),
                        })
                      }
                      disabled={!catalogKeyword.trim() || !selectedStore || generateCatalog.isPending}
                      className="flex-1"
                    >
                      {generateCatalog.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Zap className="h-4 w-4 mr-1" />
                      )}
                      Generate
                    </Button>
                  </div>
                </div>
              </div>
              {!storeOptions.length && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Connect a store first to generate products. Go to the Stores tab.</span>
                </div>
              )}
              {generateCatalog.isPending && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>The Architect is building your product catalog...</span>
                </div>
              )}
              {generateCatalog.data && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <p className="text-sm font-medium text-foreground">
                      Generated {generateCatalog.data.products.length} products
                    </p>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {generateCatalog.data.products.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{p.title}</p>
                          <p className="text-muted-foreground truncate mt-0.5">{p.description?.slice(0, 80)}...</p>
                        </div>
                        <div className="ml-3 text-right shrink-0">
                          <p className="font-semibold text-foreground">${p.price}</p>
                          <p className="text-muted-foreground">{p.supplier}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stores Tab */}
        <TabsContent value="stores" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Connected Stores</h3>
            <Button size="sm" variant="outline" className="h-8" onClick={() => setAddStoreOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Connect Store
            </Button>
          </div>

          {storesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <Card key={i} className="bg-card border-border/50">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : storeOptions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {storeOptions.map((store: any) => (
                <Card key={store.id} className="bg-card border-border/50 hover:border-primary/20 transition-all">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                        {platformIcons[store.platform] || "🏪"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground truncate">{store.name}</h3>
                        <p className="text-xs text-muted-foreground capitalize">{store.platform?.replace("_", " ")}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${
                          store.status === "active"
                            ? "border-emerald-400/30 text-emerald-400"
                            : store.status === "archived"
                              ? "border-destructive/30 text-destructive"
                              : "border-border text-muted-foreground"
                        }`}
                      >
                        {store.status}
                      </Badge>
                    </div>
                    {store.niche && (
                      <p className="text-xs text-muted-foreground mb-2">
                        <span className="text-muted-foreground/60">Niche: </span>{store.niche}
                      </p>
                    )}
                    {store.platformDomain && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {store.platformDomain}
                      </p>
                    )}
                    {store.platform === "shopify" && store.status !== "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 h-7 text-xs w-full"
                        onClick={() => {
                          setNewStoreName(store.name);
                          setNewStorePlatform("shopify");
                          setAddStoreOpen(true);
                        }}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Reconnect via OAuth
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-card border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Store className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No stores connected</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Click "Connect Store" to get started</p>
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => setAddStoreOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Connect Your First Store
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Platforms Tab */}
        <TabsContent value="platforms" className="space-y-4">
          <Card className="bg-card border-border/50">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Supported Platforms</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Beast Bots is platform-agnostic. Your agents can manage stores across all major e-commerce platforms simultaneously.
              </p>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {platforms?.map((p: any) => (
              <Card key={p.id} className="bg-card border-border/50 hover:border-primary/20 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{p.icon}</span>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{p.name}</h4>
                      {p.oauthSupported && (
                        <Badge variant="outline" className="text-[10px] border-emerald-400/30 text-emerald-400 mt-0.5">
                          <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                          OAuth
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{p.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {p.capabilities?.slice(0, 4).map((cap: string) => (
                      <Badge key={cap} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {cap}
                      </Badge>
                    ))}
                    {p.capabilities?.length > 4 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        +{p.capabilities.length - 4}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Connect Store Dialog */}
      <Dialog open={addStoreOpen} onOpenChange={(open) => {
        setAddStoreOpen(open);
        if (!open) {
          setNewStoreName("");
          setNewStorePlatform("shopify");
          setNewStoreNiche("");
          setShopDomain("");
          setIsConnectingShopify(false);
        }
      }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Connect a Store</DialogTitle>
            <DialogDescription>
              Add an e-commerce store for your agents to manage. Your agents will have full access to products, orders, and analytics.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs mb-1.5 block">Platform</Label>
              <Select value={newStorePlatform} onValueChange={setNewStorePlatform}>
                <SelectTrigger className="bg-input/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {platforms?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <span>{p.icon}</span>
                        <span>{p.name}</span>
                        {p.oauthSupported && (
                          <Badge variant="outline" className="text-[10px] border-emerald-400/30 text-emerald-400 ml-1">OAuth</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Store Name</Label>
              <Input
                placeholder="My Awesome Store"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                className="bg-input/50"
              />
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Niche (optional)</Label>
              <Input
                placeholder="e.g., Home Decor, Pet Supplies..."
                value={newStoreNiche}
                onChange={(e) => setNewStoreNiche(e.target.value)}
                className="bg-input/50"
              />
            </div>

            {newStorePlatform === "shopify" ? (
              <>
                <div>
                  <Label className="text-xs mb-1.5 block">Shopify Domain</Label>
                  <Input
                    placeholder="store-name or store-name.myshopify.com"
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    className="bg-input/50"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    You'll be redirected to Shopify to authorize Beast Bots. This is a one-time step.
                  </p>
                </div>
                <div className="rounded-lg bg-violet-500/10 border border-violet-400/20 p-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium text-violet-400 mb-0.5">Secure OAuth Connection</p>
                      <p>Beast Bots will request access to products, orders, inventory, themes, and analytics. You can revoke access from your Shopify admin at any time.</p>
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleShopifyConnect}
                  disabled={!newStoreName.trim() || !shopDomain.trim() || isConnectingShopify}
                >
                  {isConnectingShopify ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-1" />
                  )}
                  {isConnectingShopify ? "Connecting..." : "Connect via Shopify OAuth"}
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-lg bg-amber-500/10 border border-amber-400/20 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium text-amber-400 mb-0.5">Manual API Key Required</p>
                      <p>{platforms?.find((p: any) => p.id === newStorePlatform)?.name} requires manual API key configuration. You can add credentials after connecting.</p>
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    createStore.mutate({
                      name: newStoreName.trim(),
                      platform: newStorePlatform as any,
                      niche: newStoreNiche || undefined,
                    })
                  }
                  disabled={!newStoreName.trim() || createStore.isPending}
                >
                  {createStore.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Store className="h-4 w-4 mr-1" />
                  )}
                  Create Store
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
