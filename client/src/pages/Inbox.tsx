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
import { PageHeader } from "@/components/PageHeader";
import { QueryErrorBanner } from "@/components/QueryErrorBanner";
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

  const pendingQuery = trpc.approvals.pending.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const pendingCount = pendingQuery.data?.length ?? 0;

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
      <PageHeader
        icon={<InboxIcon className="h-4 w-4" />}
        title="Inbox"
        subtitle="Everything that needs your attention"
        accent="sky"
        flushBottom
        right={
          pendingCount > 0 ? (
            <Badge className="h-6 min-w-6 px-1.5 text-[10px] bg-amber-500 text-white border-0">
              {pendingCount > 99 ? "99+" : pendingCount} pending
            </Badge>
          ) : undefined
        }
      />

      <div className="px-3 sm:px-5 mb-2">
        <QueryErrorBanner queries={[pendingQuery]} label="Approvals unavailable" />
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="px-3 sm:px-5">
        <TabsList className="tab-bar-shell">
          <TabsTrigger value="activity" className="tab-trigger-shell">Activity</TabsTrigger>
          <TabsTrigger value="approvals" className="relative tab-trigger-shell">
            Approvals
            {pendingCount > 0 && (
              <Badge className="ml-1.5 h-5 min-w-5 px-1 text-[10px] bg-amber-500 text-white border-0">
                {pendingCount > 99 ? "99+" : pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-3">
          <ActivityPage />
        </TabsContent>
        <TabsContent value="approvals" className="mt-3">
          <ApprovalsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
