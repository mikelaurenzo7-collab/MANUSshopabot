/**
 * Storefronts.tsx — Unified "external systems you've connected" surface.
 *
 * Merges Integrations + Plugin Store + Supplier POs + Tools as tabs.
 * Legacy /integrations, /plugins, /supplier deep-links still resolve.
 * Email Channel moved to Communicator bot (/communicator).
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Plug, Layers, Puzzle, Truck, Mail, Wrench } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import IntegrationsPage from "./Integrations";
import PluginStorePage from "./PluginStore";
import SupplierPOsPage from "./SupplierPOs";

import { ToolsTab } from "@/components/integrations/ToolsTab";
import { CapabilitiesTab } from "@/components/integrations/CapabilitiesTab";

type StorefrontsTab = "integrations" | "capabilities" | "plugins" | "supplier" | "tools";
const TAB_VALUES: StorefrontsTab[] = ["integrations", "capabilities", "plugins", "supplier", "tools"];

function readTabFromHash(): StorefrontsTab {
  if (typeof window === "undefined") return "integrations";
  const hash = window.location.hash.replace(/^#/, "") as StorefrontsTab;
  return TAB_VALUES.includes(hash) ? hash : "integrations";
}

export default function StorefrontsPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<StorefrontsTab>(() => readTabFromHash());
  const [returnTo, setReturnTo] = useState<string | null>(null);

  // Extract returnTo from query params
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const rt = params.get("returnTo");
      if (rt) setReturnTo(rt);
    }
  }, []);

  // Live counts surface in tab pills so the user sees their footprint
  // before clicking. tRPC handles caching — these queries are also fired
  // by the inner pages, so the React Query cache gives us the data for
  // free without an extra round-trip.
  const { data: stores } = trpc.stores.list.useQuery();
  const { data: credentials } = trpc.connectors.listCredentials.useQuery();
  const { data: socialAccounts } = trpc.connectors.listSocialAccounts.useQuery();
  const { data: connectedTools } = trpc.tools.listConnected.useQuery();

  const connectionCount = (stores?.length ?? 0) + (credentials?.length ?? 0) + (socialAccounts?.length ?? 0);

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

  const tabConfig: Array<{
    id: StorefrontsTab;
    label: string;
    icon: typeof Globe;
    count?: number;
  }> = [
    { id: "integrations", label: "Connections", icon: Plug, count: connectionCount },
    { id: "capabilities", label: "Capabilities", icon: Layers },
    { id: "plugins", label: "Plugins", icon: Puzzle },
    { id: "supplier", label: "Supplier POs", icon: Truck },

    { id: "tools", label: "Tools", icon: Wrench, count: connectedTools?.length ?? 0 },
  ];

  return (
    <div className="page-enter h-full overflow-y-auto">
      <PageHeader
        icon={<Globe className="h-4 w-4" />}
        title="Storefronts & Channels"
        subtitle="Stores, plugins, suppliers, and tools — everything connected to your operation"
        accent="cyan"
        flushBottom
      />

      <Tabs value={tab} onValueChange={handleTabChange} className="px-3 sm:px-5 pt-1.5">
        <TabsList className="tab-bar-shell h-auto flex-wrap gap-1">
          {tabConfig.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="tab-trigger-shell group inline-flex items-center gap-1.5 px-3 py-1.5"
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "" : "text-white/60 group-hover:text-white/70"}`} />
                {t.label}
                {typeof t.count === "number" && t.count > 0 && (
                  <span className={`ml-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-cyan-400/20 text-cyan-200" : "bg-white/[0.06] text-white/55"
                  }`}>
                    {t.count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
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

        <TabsContent value="tools" className="mt-3">
          <ToolsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

