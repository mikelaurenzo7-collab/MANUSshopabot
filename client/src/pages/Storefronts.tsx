/**
 * Storefronts.tsx — Unified "external systems you've connected" surface.
 *
 * Merges Integrations + Plugin Store + Supplier POs + Email Channel + Tools as tabs.
 * Legacy /integrations, /plugins, /supplier, /gmail-bot deep-links still resolve.
 */

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import IntegrationsPage from "./Integrations";
import PluginStorePage from "./PluginStore";
import SupplierPOsPage from "./SupplierPOs";
import GmailBotPage from "./GmailBot";
import { ToolsTab } from "@/components/integrations/ToolsTab";
import { CapabilitiesTab } from "@/components/integrations/CapabilitiesTab";

type StorefrontsTab = "integrations" | "capabilities" | "plugins" | "supplier" | "email" | "tools";
const TAB_VALUES: StorefrontsTab[] = ["integrations", "capabilities", "plugins", "supplier", "email", "tools"];

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
      <PageHeader
        icon={<Globe className="h-4 w-4" />}
        title="Storefronts & Channels"
        subtitle="Stores, plugins, suppliers, email, and tools — everything connected to your operation"
        accent="cyan"
        flushBottom
      />

      <Tabs value={tab} onValueChange={handleTabChange} className="px-5 pt-1.5">
        <TabsList>
          <TabsTrigger value="integrations">Connections</TabsTrigger>
          <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
          <TabsTrigger value="plugins">Plugins</TabsTrigger>
          <TabsTrigger value="supplier">Supplier POs</TabsTrigger>
          <TabsTrigger value="email">Email Channel</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="mt-3">
          <IntegrationsPage />
        </TabsContent>
        <TabsContent value="capabilities" className="mt-3">
          <CapabilitiesTab />
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

