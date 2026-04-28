/**
 * Storefronts.tsx — Unified "external systems you've connected" surface.
 *
 * Merges Integrations + Plugin Store + Supplier POs + Email Channel + Tools as tabs.
 * Legacy /integrations, /plugins, /supplier, /gmail-bot deep-links still resolve.
 */

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe } from "lucide-react";
import IntegrationsPage from "./Integrations";
import PluginStorePage from "./PluginStore";
import SupplierPOsPage from "./SupplierPOs";
import GmailBotPage from "./GmailBot";
import { ToolsTab } from "@/components/integrations/ToolsTab";

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

