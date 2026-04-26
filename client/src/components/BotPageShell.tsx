/**
 * BotPageShell — wraps a bot page in a Workspace / Chat tab pair.
 *
 * Per the navigation consolidation, "Bot Chat" is a *modality*, not a peer
 * destination. You chat *with a specific bot*, so each bot's page now has
 * its own scoped chat tab. The chat tab embeds the existing Chat page with
 * a `?bot=<agent>` prefill.
 */

import { useEffect, useState, ReactNode, lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const Chat = lazy(() => import("@/pages/Chat"));

type AgentType = "architect" | "merchant" | "social";

interface Props {
  agentType: AgentType;
  workspaceLabel?: string;
  children: ReactNode;
}

const TAB_VALUES = ["workspace", "chat"] as const;
type Tab = (typeof TAB_VALUES)[number];

function readTabFromHash(): Tab {
  if (typeof window === "undefined") return "workspace";
  const hash = window.location.hash.replace(/^#/, "") as Tab;
  return TAB_VALUES.includes(hash) ? hash : "workspace";
}

export default function BotPageShell({ agentType, workspaceLabel = "Workspace", children }: Props) {
  const [tab, setTab] = useState<Tab>(() => readTabFromHash());

  useEffect(() => {
    const onHash = () => setTab(readTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleTabChange = (value: string) => {
    const next = (TAB_VALUES.includes(value as Tab) ? value : "workspace") as Tab;
    setTab(next);
    if (typeof window !== "undefined") {
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}#${next}`);
    }
  };

  // When opening the Chat tab via hash, the underlying Chat page reads
  // `?bot=` from window.location.search. We patch the search string for
  // the Chat suspense boundary so the agent prefills correctly without
  // affecting the URL the user sees in the address bar.
  const chatSearch = `?bot=${agentType}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-6 pt-4 shrink-0">
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="workspace">{workspaceLabel}</TabsTrigger>
            <TabsTrigger value="chat" className="gap-1.5">
              <MessageSquare className="w-3 h-3" />
              Chat
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "workspace" ? (
          <div className="h-full overflow-y-auto">{children}</div>
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-white/30" />
              </div>
            }
          >
            <ChatWithPrefill search={chatSearch} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

/** Mounts the Chat page with a temporarily-rewritten location.search so its
 *  initial-agent reader picks up the prefill. The original search is restored
 *  on unmount so other pages aren't affected. */
function ChatWithPrefill({ search }: { search: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const original = window.location.search;
    if (original !== search) {
      const { pathname, hash } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}${hash}`);
    }
    setReady(true);
    return () => {
      if (typeof window === "undefined") return;
      const { pathname, hash } = window.location;
      window.history.replaceState(null, "", `${pathname}${original}${hash}`);
    };
  }, [search]);

  if (!ready) {
    return <Skeleton className="w-full h-full" />;
  }
  return <Chat />;
}
