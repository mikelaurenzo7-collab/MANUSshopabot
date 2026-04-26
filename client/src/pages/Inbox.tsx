/**
 * Inbox.tsx — Unified "things demanding attention" surface.
 *
 * Merges Activity + Approvals (and future alerts) behind a single
 * triage destination. Existing /activity and /approvals deep-links
 * still resolve; this shell composes the same page bodies as tabs.
 */

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Inbox as InboxIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ActivityPage from "./Activity";
import ApprovalsPage from "./Approvals";

type InboxTab = "activity" | "approvals";

const TAB_VALUES: InboxTab[] = ["activity", "approvals"];

function readTabFromHash(): InboxTab {
  if (typeof window === "undefined") return "activity";
  const hash = window.location.hash.replace(/^#/, "") as InboxTab;
  return TAB_VALUES.includes(hash) ? hash : "activity";
}

export default function InboxPage() {
  const [tab, setTab] = useState<InboxTab>(() => readTabFromHash());

  const { data: pending } = trpc.approvals.pending.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const pendingCount = pending?.length ?? 0;

  // Keep the URL hash in sync so tabs are deep-linkable.
  useEffect(() => {
    const onHash = () => setTab(readTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleTabChange = (value: string) => {
    const next = (TAB_VALUES.includes(value as InboxTab) ? value : "activity") as InboxTab;
    setTab(next);
    if (typeof window !== "undefined") {
      // Replace hash without adding history entry.
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}#${next}`);
    }
  };

  // The legacy `/approvals` and `/activity` routes are still wired in
  // App.tsx, so existing deep links continue to resolve to their original
  // pages. This shell is the sidebar entry-point.

  return (
    <div className="page-enter h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-2 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(14,165,233,0.12)]">
          <InboxIcon className="h-5 w-5 text-sky-400" />
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold tracking-tight text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground">Everything that needs your attention — bot activity, approvals, and alerts</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="px-6 pt-2">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="approvals" className="relative">
            Approvals
            {pendingCount > 0 && (
              <Badge className="ml-1.5 h-5 min-w-5 px-1 text-[10px] bg-amber-500 text-white border-0">
                {pendingCount > 99 ? "99+" : pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4">
          <ActivityPage />
        </TabsContent>
        <TabsContent value="approvals" className="mt-4">
          <ApprovalsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
