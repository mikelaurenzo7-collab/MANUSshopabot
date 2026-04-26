/**
 * Insights.tsx — Unified analytics surface.
 *
 * Merges Analytics ("My Stores") + Intelligence ("Cross-Store / Market") as tabs.
 * Legacy /analytics and /intelligence deep-links still resolve.
 */

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3 } from "lucide-react";
import AnalyticsPage from "./Analytics";
import IntelligencePage from "./Intelligence";

type InsightsTab = "stores" | "intelligence";
const TAB_VALUES: InsightsTab[] = ["stores", "intelligence"];

function readTabFromHash(): InsightsTab {
  if (typeof window === "undefined") return "stores";
  const hash = window.location.hash.replace(/^#/, "") as InsightsTab;
  return TAB_VALUES.includes(hash) ? hash : "stores";
}

export default function InsightsPage() {
  const [tab, setTab] = useState<InsightsTab>(() => readTabFromHash());

  useEffect(() => {
    const onHash = () => setTab(readTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleTabChange = (value: string) => {
    const next = (TAB_VALUES.includes(value as InsightsTab) ? value : "stores") as InsightsTab;
    setTab(next);
    if (typeof window !== "undefined") {
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}#${next}`);
    }
  };

  return (
    <div className="page-enter h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-2 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.12)]">
          <BarChart3 className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold tracking-tight text-foreground">Insights</h1>
          <p className="text-sm text-muted-foreground">Per-store analytics and cross-store / market intelligence</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="px-6 pt-2">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="stores">My Stores</TabsTrigger>
          <TabsTrigger value="intelligence">Cross-Store &amp; Market</TabsTrigger>
        </TabsList>

        <TabsContent value="stores" className="mt-4">
          <AnalyticsPage />
        </TabsContent>
        <TabsContent value="intelligence" className="mt-4">
          <IntelligencePage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
