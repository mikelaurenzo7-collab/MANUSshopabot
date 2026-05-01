/**
 * Insights.tsx — Unified analytics surface.
 *
 * Merges Analytics ("My Stores") + Intelligence ("Cross-Store / Market") as tabs.
 * Legacy /analytics and /intelligence deep-links still resolve.
 */

import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import AnalyticsPage from "./Analytics";
import IntelligencePage from "./Intelligence";
import CampaignFunnel from "./CampaignFunnel";

type InsightsTab = "stores" | "campaigns" | "intelligence";
const TAB_VALUES: InsightsTab[] = ["stores", "campaigns", "intelligence"];

function readTabFromHash(): InsightsTab {
  if (typeof window === "undefined") return "stores";
  const hash = window.location.hash.replace(/^#/, "") as InsightsTab;
  return TAB_VALUES.includes(hash) ? hash : "stores";
}

export default function InsightsPage() {
  const [tab, setTab] = useState<InsightsTab>(() => readTabFromHash());
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevTabRef = useRef<InsightsTab>(tab);

  useEffect(() => {
    const onHash = () => setTab(readTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Animate tab content on tab switch
  useEffect(() => {
    if (prevTabRef.current !== tab) {
      setIsTransitioning(true);
      prevTabRef.current = tab;
      const t = setTimeout(() => setIsTransitioning(false), 250);
      return () => clearTimeout(t);
    }
  }, [tab]);

  const handleTabChange = (value: string) => {
    const next = (TAB_VALUES.includes(value as InsightsTab) ? value : "stores") as InsightsTab;
    if (next === tab) return;
    setIsTransitioning(true);
    setTab(next);
    if (typeof window !== "undefined") {
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}#${next}`);
    }
    // Reset after animation
    setTimeout(() => setIsTransitioning(false), 300);
  };

  return (
    <div className="page-enter h-full overflow-y-auto">
      <PageHeader
        icon={<BarChart3 className="h-4 w-4" />}
        title="Analytics"
        subtitle="Per-store analytics and cross-store / market intelligence"
        accent="emerald"
        flushBottom
      />

      <div className="px-3 sm:px-5 mb-2" />

      <Tabs value={tab} onValueChange={handleTabChange} className="px-3 sm:px-5">
        <TabsList
          className="tab-bar-shell"
          role="tablist"
          aria-label="Insights sections"
        >
          <TabsTrigger
            value="stores"
            role="tab"
            aria-selected={tab === "stores"}
            className="tab-trigger-shell"
          >
            My Stores
          </TabsTrigger>
          <TabsTrigger
            value="campaigns"
            role="tab"
            aria-selected={tab === "campaigns"}
            className="tab-trigger-shell"
          >
            Campaigns
          </TabsTrigger>
          <TabsTrigger
            value="intelligence"
            role="tab"
            aria-selected={tab === "intelligence"}
            className="tab-trigger-shell"
          >
            Cross-Store &amp; Market
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="stores"
          role="tabpanel"
          aria-labelledby="stores-tab"
          className={`mt-3 transition-all duration-300 ${isTransitioning ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"}`}
        >
          <AnalyticsPage />
        </TabsContent>
        <TabsContent
          value="campaigns"
          role="tabpanel"
          aria-labelledby="campaigns-tab"
          className={`mt-3 transition-all duration-300 ${isTransitioning ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"}`}
        >
          <CampaignFunnel />
        </TabsContent>
        <TabsContent
          value="intelligence"
          role="tabpanel"
          aria-labelledby="intelligence-tab"
          className={`mt-3 transition-all duration-300 ${isTransitioning ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"}`}
        >
          <IntelligencePage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
