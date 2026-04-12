import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plug, ShoppingBag, Share2, CheckCircle2, AlertCircle, XCircle,
  ExternalLink, Trash2, RefreshCw, Plus, Shield, Loader2, Wifi, WifiOff,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useSearch } from "wouter";

const PLATFORM_ICONS: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🌐", amazon: "📦", etsy: "🧡",
  ebay: "🔨", tiktok_shop: "🎵", walmart: "🏪",
  meta: "📘", instagram: "📸", tiktok: "🎵", twitter: "🐦",
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2; label: string }> = {
    active: { variant: "default", icon: CheckCircle2, label: "Connected" },
    expired: { variant: "secondary", icon: AlertCircle, label: "Expired" },
    revoked: { variant: "destructive", icon: XCircle, label: "Revoked" },
    error: { variant: "destructive", icon: AlertCircle, label: "Error" },
  };
  const c = config[status] || config.error;
  return (
    <Badge variant={c.variant} className="gap-1 text-xs">
      <c.icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [connectTab, setConnectTab] = useState<"ecommerce" | "social">("ecommerce");

  // Queries
  const { data: ecommercePlatforms } = trpc.connectors.ecommercePlatforms.useQuery();
  const { data: socialPlatforms } = trpc.connectors.socialPlatforms.useQuery();
  const { data: credentials, refetch: refetchCreds } = trpc.connectors.listCredentials.useQuery();
  const { data: socialAccounts, refetch: refetchSocial } = trpc.connectors.listSocialAccounts.useQuery();
  const { data: summary } = trpc.connectors.connectionSummary.useQuery();
  const { data: stores } = trpc.stores.list.useQuery();

  // Handle OAuth redirect query params (success/error)
  const searchString = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const connected = params.get("connected");
    const account = params.get("account");
    const name = params.get("name");
    const errorMsg = params.get("error");
    if (connected) {
      toast.success(`Successfully connected ${name || account || connected}!`);
      refetchCreds();
      refetchSocial();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (errorMsg) {
      toast.error(`Connection failed: ${errorMsg}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchString]);

  // Mutations
  const connectApiKey = trpc.connectors.connectWithApiKey.useMutation({
    onSuccess: () => { toast.success("Platform connected successfully"); refetchCreds(); },
    onError: (err) => toast.error(err.message),
  });
  const disconnectCred = trpc.connectors.disconnectCredential.useMutation({
    onSuccess: () => { toast.success("Disconnected"); refetchCreds(); },
    onError: (err) => toast.error(err.message),
  });
  const disconnectSocial = trpc.connectors.disconnectSocialAccount.useMutation({
    onSuccess: () => { toast.success("Account disconnected"); refetchSocial(); },
    onError: (err) => toast.error(err.message),
  });
  const checkHealth = trpc.connectors.checkCredentialHealth.useMutation({
    onSuccess: (data) => { toast.success(`Status: ${data.status}`); refetchCreds(); },
    onError: (err) => toast.error(err.message),
  });
  const generateOAuth = trpc.connectors.generateOAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else if (data.setupRequired) {
        toast.info(data.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });
  const generateSocialOAuth = trpc.connectors.generateSocialOAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else if (data.setupRequired) {
        toast.info(data.message || `Platform requires app credentials. Check Settings > Secrets.`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // Separate connected platforms
  const connectedPlatformIds = useMemo(() =>
    new Set((credentials || []).map((c: any) => c.platform)),
    [credentials]
  );
  const connectedSocialIds = useMemo(() =>
    new Set((socialAccounts || []).map((s: any) => s.platform)),
    [socialAccounts]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight gradient-text flex items-center gap-2">
            <Plug className="h-6 w-6 text-emerald-400" />
            Integrations Hub
          </h2>
          <p className="text-muted-foreground mt-1">
            Connect your e-commerce stores and social media accounts to power the Beast Bots bots.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <ShoppingBag className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary?.stores ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active Stores</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Shield className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary?.credentials ?? 0}</p>
                <p className="text-xs text-muted-foreground">Platform Credentials</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Share2 className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary?.socialAccounts ?? 0}</p>
                <p className="text-xs text-muted-foreground">Social Accounts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ecommerce" className="space-y-4">
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="ecommerce" className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            E-Commerce Platforms
          </TabsTrigger>
          <TabsTrigger value="social" className="gap-2">
            <Share2 className="h-4 w-4" />
            Social Media
          </TabsTrigger>
          <TabsTrigger value="connected" className="gap-2">
            <Wifi className="h-4 w-4" />
            Connected
          </TabsTrigger>
        </TabsList>

        {/* E-Commerce Platforms Tab */}
        <TabsContent value="ecommerce" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(ecommercePlatforms || []).map((platform: any) => {
              const isConnected = connectedPlatformIds.has(platform.id);
              return (
                <Card key={platform.id} className={`bg-card/50 border-border/50 transition-all hover:border-primary/30 ${isConnected ? "ring-1 ring-emerald-500/30" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{platform.icon}</span>
                        <div>
                          <CardTitle className="text-base">{platform.name}</CardTitle>
                          <CardDescription className="text-xs mt-0.5">
                            {platform.connectionType === "oauth" ? "OAuth 2.0" : "API Key"}
                          </CardDescription>
                        </div>
                      </div>
                      {isConnected && <StatusBadge status="active" />}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{platform.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {(platform.capabilities || []).map((cap: string) => (
                        <Badge key={cap} variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                          {cap.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                    <Separator className="bg-border/30" />
                    {isConnected ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1 text-emerald-400 border-emerald-500/30 bg-emerald-500/5">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </Badge>
                      </div>
                    ) : (
                      <ConnectPlatformButton
                        platform={platform}
                        stores={stores || []}
                        onConnectApiKey={(storeId, creds) => {
                          connectApiKey.mutate({ platform: platform.id, storeId, credentials: creds });
                        }}
                        onConnectOAuth={(storeId, shopDomain) => {
                          generateOAuth.mutate({
                            platform: platform.id,
                            storeId,
                            origin: window.location.origin,
                            shopDomain,
                          });
                        }}
                        isLoading={connectApiKey.isPending || generateOAuth.isPending}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Social Media Tab */}
        <TabsContent value="social" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(socialPlatforms || []).map((platform: any) => {
              const isConnected = connectedSocialIds.has(platform.id);
              return (
                <Card key={platform.id} className={`bg-card/50 border-border/50 transition-all hover:border-primary/30 ${isConnected ? "ring-1 ring-emerald-500/30" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{platform.icon}</span>
                        <div>
                          <CardTitle className="text-base">{platform.name}</CardTitle>
                          <CardDescription className="text-xs mt-0.5">OAuth 2.0</CardDescription>
                        </div>
                      </div>
                      {isConnected && <StatusBadge status="active" />}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{platform.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {(platform.capabilities || []).map((cap: string) => (
                        <Badge key={cap} variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                          {cap.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                    <Separator className="bg-border/30" />
                    {isConnected ? (
                      <Badge variant="outline" className="gap-1 text-emerald-400 border-emerald-500/30 bg-emerald-500/5">
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        variant="outline"
                        disabled={generateSocialOAuth.isPending}
                        onClick={() => {
                          generateSocialOAuth.mutate({
                            platform: platform.id as any,
                            origin: window.location.origin,
                          });
                        }}
                      >
                        {generateSocialOAuth.isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3 mr-1" />
                        )}
                        Connect {platform.name}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card className="bg-card/30 border-border/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Social Media OAuth Setup</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Each social media platform requires its own OAuth app credentials. To connect a platform,
                    create a developer app on that platform, then add the Client ID and Client Secret to your
                    Beast Bots Settings &gt; Secrets. Social Bot will then be able to post content
                    and manage campaigns on your behalf.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connected Tab */}
        <TabsContent value="connected" className="space-y-4">
          {/* E-Commerce Credentials */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" /> E-Commerce Credentials
            </h3>
            {(credentials || []).length === 0 ? (
              <Card className="bg-card/30 border-border/30">
                <CardContent className="pt-6 text-center">
                  <WifiOff className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No e-commerce platforms connected yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Go to the E-Commerce Platforms tab to connect your first store.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {(credentials || []).map((cred: any) => (
                  <Card key={cred.id} className="bg-card/50 border-border/50">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{PLATFORM_ICONS[cred.platform] || "🔗"}</span>
                          <div>
                            <p className="text-sm font-medium capitalize">{cred.platform.replace(/_/g, " ")}</p>
                            <p className="text-xs text-muted-foreground">
                              {cred.platformAccountName || `ID: ${cred.platformAccountId || cred.id}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={cred.status} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Check connection health"
                            onClick={() => checkHealth.mutate({ id: cred.id })}
                            disabled={checkHealth.isPending}
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${checkHealth.isPending ? "animate-spin" : ""}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label="Disconnect platform"
                            onClick={() => {
                              if (confirm("Disconnect this platform? The bots will lose access to this store.")) {
                                disconnectCred.mutate({ id: cred.id });
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Separator className="bg-border/30" />

          {/* Social Accounts */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Share2 className="h-4 w-4" /> Social Media Accounts
            </h3>
            {(socialAccounts || []).length === 0 ? (
              <Card className="bg-card/30 border-border/30">
                <CardContent className="pt-6 text-center">
                  <WifiOff className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No social media accounts connected yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Go to the Social Media tab to link your accounts for Social Bot.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {(socialAccounts || []).map((account: any) => (
                  <Card key={account.id} className="bg-card/50 border-border/50">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{PLATFORM_ICONS[account.platform] || "🔗"}</span>
                          <div>
                            <p className="text-sm font-medium">{account.accountName || account.platform}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {account.platform.replace(/_/g, " ")}
                              {account.followerCount ? ` · ${account.followerCount.toLocaleString()} followers` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={account.status} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label="Disconnect social account"
                            onClick={() => {
                              if (confirm("Disconnect this social account?")) {
                                disconnectSocial.mutate({ id: account.id });
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Connect button with dialog for API key platforms or OAuth redirect */
function ConnectPlatformButton({
  platform,
  stores,
  onConnectApiKey,
  onConnectOAuth,
  isLoading,
}: {
  platform: any;
  stores: any[];
  onConnectApiKey: (storeId: number, credentials: Record<string, string>) => void;
  onConnectOAuth: (storeId: number, shopDomain?: string) => void;
  isLoading: boolean;
}) {
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [shopDomain, setShopDomain] = useState("");
  const [apiFields, setApiFields] = useState<Record<string, string>>({});

  const activeStores = stores.filter((s: any) => s.platform === platform.id || s.status === "setup");

  if (platform.connectionType === "api_key") {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" className="w-full" variant="outline">
            <Plus className="h-3 w-3 mr-1" />
            Connect with API Key
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{platform.icon}</span>
              Connect {platform.name}
            </DialogTitle>
            <DialogDescription>Enter your API credentials to connect your {platform.name} store.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Select Store</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a store..." /></SelectTrigger>
                <SelectContent>
                  {activeStores.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {platform.id === "woocommerce" && (
              <>
                <div>
                  <Label>Store URL</Label>
                  <Input placeholder="https://mystore.com" className="mt-1.5"
                    value={apiFields.storeUrl || ""} onChange={(e) => setApiFields({ ...apiFields, storeUrl: e.target.value })} />
                </div>
                <div>
                  <Label>Consumer Key</Label>
                  <Input placeholder="ck_..." className="mt-1.5"
                    value={apiFields.consumerKey || ""} onChange={(e) => setApiFields({ ...apiFields, consumerKey: e.target.value })} />
                </div>
                <div>
                  <Label>Consumer Secret</Label>
                  <Input type="password" placeholder="cs_..." className="mt-1.5"
                    value={apiFields.consumerSecret || ""} onChange={(e) => setApiFields({ ...apiFields, consumerSecret: e.target.value })} />
                </div>
              </>
            )}
            {platform.id === "walmart" && (
              <>
                <div>
                  <Label>Client ID</Label>
                  <Input placeholder="Your Walmart Client ID" className="mt-1.5"
                    value={apiFields.clientId || ""} onChange={(e) => setApiFields({ ...apiFields, clientId: e.target.value })} />
                </div>
                <div>
                  <Label>Client Secret</Label>
                  <Input type="password" placeholder="Your Walmart Client Secret" className="mt-1.5"
                    value={apiFields.clientSecret || ""} onChange={(e) => setApiFields({ ...apiFields, clientSecret: e.target.value })} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              disabled={!selectedStore || isLoading}
              onClick={() => {
                if (selectedStore) {
                  onConnectApiKey(Number(selectedStore), apiFields);
                }
              }}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // OAuth platforms
  if (platform.id === "shopify") {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" className="w-full" variant="outline">
            <Plus className="h-3 w-3 mr-1" />
            Connect via OAuth
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{platform.icon}</span>
              Connect {platform.name}
            </DialogTitle>
            <DialogDescription>
              Enter your Shopify store domain to initiate the OAuth authorization flow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Select Store</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a store..." /></SelectTrigger>
                <SelectContent>
                  {activeStores.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Shopify Store Domain</Label>
              <Input placeholder="mystore.myshopify.com" className="mt-1.5"
                value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">e.g., mystore or mystore.myshopify.com</p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              disabled={!selectedStore || !shopDomain.trim() || isLoading}
              onClick={() => {
                if (selectedStore && shopDomain.trim()) {
                  onConnectOAuth(Number(selectedStore), shopDomain.trim());
                }
              }}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ExternalLink className="h-3 w-3 mr-1" />}
              Authorize on Shopify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Other OAuth platforms (Etsy, Amazon, eBay, TikTok Shop) — call generateOAuthUrl
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full" variant="outline">
          <Plus className="h-3 w-3 mr-1" />
          Connect via OAuth
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{platform.icon}</span>
            Connect {platform.name}
          </DialogTitle>
          <DialogDescription>
            Select a store to link with your {platform.name} account via OAuth.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Select Store</Label>
            <Select value={selectedStore} onValueChange={setSelectedStore}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a store..." /></SelectTrigger>
              <SelectContent>
                {activeStores.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            disabled={!selectedStore || isLoading}
            onClick={() => {
              if (selectedStore) {
                onConnectOAuth(Number(selectedStore));
              }
            }}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ExternalLink className="h-3 w-3 mr-1" />}
            Authorize on {platform.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
