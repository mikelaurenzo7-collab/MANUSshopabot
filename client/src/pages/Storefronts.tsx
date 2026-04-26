/**
 * Storefronts.tsx — Unified "external systems you've connected" surface.
 *
 * Merges Integrations + Plugin Store + Supplier POs as tabs.
 * Legacy /integrations, /plugins, /supplier deep-links still resolve.
 */

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe } from "lucide-react";
import IntegrationsPage from "./Integrations";
import PluginStorePage from "./PluginStore";
import SupplierPOsPage from "./SupplierPOs";

type StorefrontsTab = "integrations" | "plugins" | "supplier";
const TAB_VALUES: StorefrontsTab[] = ["integrations", "plugins", "supplier"];

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
      <div className="px-6 pt-6 pb-2 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.12)]">
          <Globe className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold tracking-tight text-foreground">Storefronts &amp; Channels</h1>
          <p className="text-sm text-muted-foreground">Stores, social accounts, plugins, and suppliers — everything connected to your operation</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="px-6 pt-2">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="integrations">Connections</TabsTrigger>
          <TabsTrigger value="plugins">Plugins</TabsTrigger>
          <TabsTrigger value="supplier">Supplier POs</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsPage />
        </TabsContent>
        <TabsContent value="plugins" className="mt-4">
          <PluginStorePage />
        </TabsContent>
        <TabsContent value="supplier" className="mt-4">
          <SupplierPOsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
