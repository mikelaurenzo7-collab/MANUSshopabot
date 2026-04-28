/**
 * Storefronts.tsx — Unified "external systems you've connected" surface.
 *
 * Merges Integrations + Plugin Store + Supplier POs + Email Channel + Tools as tabs.
 * Legacy /integrations, /plugins, /supplier, /gmail-bot deep-links still resolve.
 */

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Zap, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import IntegrationsPage from "./Integrations";
import PluginStorePage from "./PluginStore";
import SupplierPOsPage from "./SupplierPOs";
import GmailBotPage from "./GmailBot";
import { trpc } from "@/lib/trpc";

type StorefrontsTab = "integrations" | "plugins" | "supplier" | "email" | "tools";
const TAB_VALUES: StorefrontsTab[] = ["integrations", "plugins", "supplier", "email", "tools"];

function readTabFromHash(): StorefrontsTab {
  if (typeof window === "undefined") return "integrations";
  const hash = window.location.hash.replace(/^#/, "") as StorefrontsTab;
  return TAB_VALUES.includes(hash) ? hash : "integrations";
}

export default function StorefrontsPage() {
  const [tab, setTab] = useState<StorefrontsTab>(() => readTabFromHash());

  useEffect(() => {
    const onHash = () => setTab(readTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleTabChange = (value: string) => {
    const next = (TAB_VALUES.includes(value as StorefrontsTab) ? value : "integrations") as StorefrontsTab;
    setTab(next);
    if (typeof window !== "undefined") {
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}#${next}`);
    }
  };

  return (
    <div className="page-enter h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-1.5 flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.1)]">
          <Globe className="h-4 w-4 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-lg font-heading font-bold tracking-tight text-foreground leading-tight">Storefronts &amp; Channels</h1>
          <p className="text-xs text-muted-foreground">Stores, plugins, suppliers, email, and tools — everything connected to your operation</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="px-5 pt-1.5">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="integrations">Connections</TabsTrigger>
          <TabsTrigger value="plugins">Plugins</TabsTrigger>
          <TabsTrigger value="supplier">Supplier POs</TabsTrigger>
          <TabsTrigger value="email">Email Channel</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="mt-3">
          <IntegrationsPage />
        </TabsContent>
        <TabsContent value="plugins" className="mt-3">
          <PluginStorePage />
        </TabsContent>
        <TabsContent value="supplier" className="mt-3">
          <SupplierPOsPage />
        </TabsContent>
        <TabsContent value="email" className="mt-3">
          <GmailBotPage />
        </TabsContent>
        <TabsContent value="tools" className="mt-3">
          <ToolsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToolsTab() {
  const { data: tools, isLoading } = trpc.tools.listConnected.useQuery();
  const disconnectMutation = trpc.tools.disconnect.useMutation();

  const TOOL_CONFIGS = [
    {
      id: "google_sheets",
      name: "Google Sheets",
      icon: "📊",
      color: "#0F9D58",
      description: "Read/write spreadsheets — sync catalogs, log events, share P&L tabs.",
      capabilities: ["Catalog sync", "Order logging", "Supplier lists", "Scheduled exports"],
    },
    {
      id: "google_analytics",
      name: "Google Analytics 4",
      icon: "📈",
      color: "#F9AB00",
      description: "Pull session, conversion, and revenue metrics from GA4 properties.",
      capabilities: ["Channel attribution", "Top pages", "Revenue by source", "Conversion paths"],
    },
    {
      id: "klaviyo",
      name: "Klaviyo",
      icon: "💌",
      color: "#5C50C6",
      description: "Sync segments, trigger flows, and send broadcasts driven by insights.",
      capabilities: ["Segment sync", "Abandoned-cart flows", "Profile upserts", "Broadcasts"],
    },
    {
      id: "shipstation",
      name: "ShipStation",
      icon: "📦",
      color: "#0072CE",
      description: "Live multi-carrier rates, label generation, and tracking.",
      capabilities: ["Rate shopping", "Label printing", "Tracking sync", "Cost calculations"],
    },
    {
      id: "postscript",
      name: "Postscript",
      icon: "📱",
      color: "#FF5C35",
      description: "SMS broadcasts, abandoned-cart texts, and back-in-stock alerts.",
      capabilities: ["SMS broadcasts", "Cart texts", "Restock alerts", "Keyword campaigns"],
    },
    {
      id: "printful",
      name: "Printful",
      icon: "👕",
      color: "#0E1116",
      description: "Print-on-demand catalog sync and automated order routing.",
      capabilities: ["POD sync", "Auto-fulfill", "Production ETAs", "Cost reconciliation"],
    },
    {
      id: "judgeme",
      name: "Judge.me",
      icon: "⭐",
      color: "#FF642F",
      description: "Pull reviews, triage low-star feedback, and surface UGC.",
      capabilities: ["Review insights", "Auto-replies", "UGC content", "Quality detection"],
    },
    {
      id: "gorgias",
      name: "Gorgias",
      icon: "🎧",
      color: "#1B66FF",
      description: "Unified inbox for all customer conversations and tickets.",
      capabilities: ["Chat sync", "Ticket routing", "Auto-responses", "Conversation history"],
    },
  ];

  const connectedTools = tools || [];
  const connectedIdsByPlatform = new Map(connectedTools.map((t) => [t.platform, t.id]));

  const handleDisconnect = async (toolId: string) => {
    const toolName = TOOL_CONFIGS.find((t) => t.id === toolId)?.name;
    const credentialId = connectedIdsByPlatform.get(toolId);
    if (credentialId && confirm(`Disconnect ${toolName}?`)) {
      await disconnectMutation.mutateAsync({ id: credentialId });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TOOL_CONFIGS.map((tool) => {
          const isConnected = connectedIdsByPlatform.has(tool.id);
          return (
            <Card
              key={tool.id}
              className="p-4 border border-white/[0.08] bg-gradient-to-br from-white/[0.02] to-white/[0.01] hover:from-white/[0.04] hover:to-white/[0.02] transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="text-2xl shrink-0">{tool.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm text-foreground">{tool.name}</h3>
                      {isConnected && (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 border-emerald-500/20 text-emerald-300 text-[10px] shrink-0"
                        >
                          Connected
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{tool.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {tool.capabilities.map((cap) => (
                        <Badge key={cap} variant="secondary" className="text-[10px] bg-white/[0.05] border-white/[0.1]">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.05]">
                {isConnected ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      disabled={disconnectMutation.isPending}
                      onClick={() => handleDisconnect(tool.id)}
                    >
                      {disconnectMutation.isPending ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Disconnecting…
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3 h-3 mr-1" />
                          Disconnect
                        </>
                      )}
                    </Button>
                ) : (
                  <Button size="sm" className="flex-1 h-7 text-xs bg-blue-600 hover:bg-blue-700">
                    <Zap className="w-3 h-3 mr-1" />
                    Connect
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
