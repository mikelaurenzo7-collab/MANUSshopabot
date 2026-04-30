/**
 * Workspace.tsx — Per-store workspace hub.
 *
 * Each store gets its own Workspace: a single page that consolidates
 * everything that store needs into hash-routed tabs.
 *
 *   #chat          Store Bot conversation (workspace-scoped, persisted)
 *   #workflows     Workflow runs filtered to this workspace's store
 *   #memory        Long-lived memory entries (facts, patterns, decisions)
 *   #instructions  Custom system prompt / personality / autonomy
 *   #connectors    Per-workspace integrations (email / social / ads / calendar)
 *   #suppliers     Supplier-focused workflows (sourcing, fulfillment, restock)
 *
 * Switching the workspace switcher in the sidebar swaps every tab's
 * data — chat history, memory, instructions, connectors are all
 * workspace-scoped so two stores can have entirely different ad
 * accounts, calendars, and bot personalities side by side.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Brain,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  GitBranch,
  Lightbulb,
  Loader2,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Package,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Plus,
  Save,
  Search,
  ScrollText,
  ShoppingBag,
  Sparkles,
  Store,
  Target,
  Trash2,
  Truck,
  Wrench,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─────────────────────────────────────────────────────────────────────────────
// Types & config
// ─────────────────────────────────────────────────────────────────────────────

type WorkspaceTab =
  | "chat"
  | "workflows"
  | "memory"
  | "instructions"
  | "connectors"
  | "suppliers";

const TAB_VALUES: WorkspaceTab[] = [
  "chat",
  "workflows",
  "memory",
  "instructions",
  "connectors",
  "suppliers",
];

function readTabFromHash(): WorkspaceTab {
  if (typeof window === "undefined") return "chat";
  const hash = window.location.hash.replace(/^#/, "") as WorkspaceTab;
  return TAB_VALUES.includes(hash) ? hash : "chat";
}

const MEMORY_TYPES = ["fact", "pattern", "decision", "outcome", "context", "preference"] as const;
type MemoryType = (typeof MEMORY_TYPES)[number];

const MEMORY_TONE: Record<MemoryType, { label: string; bg: string; text: string }> = {
  fact: { label: "Fact", bg: "bg-sky-500/10", text: "text-sky-300" },
  pattern: { label: "Pattern", bg: "bg-violet-500/10", text: "text-violet-300" },
  decision: { label: "Decision", bg: "bg-emerald-500/10", text: "text-emerald-300" },
  outcome: { label: "Outcome", bg: "bg-amber-500/10", text: "text-amber-300" },
  context: { label: "Context", bg: "bg-cyan-500/10", text: "text-cyan-300" },
  preference: { label: "Preference", bg: "bg-fuchsia-500/10", text: "text-fuchsia-300" },
};

const SUPPLIER_WORKFLOW_TYPES = new Set([
  "product_sourcing",
  "supply_chain_intelligence",
  "fulfillment_automation",
  "velocity_restock_predictor",
]);

const WORKFLOW_TONE: Record<string, { dot: string; icon: typeof Clock; label: string }> = {
  running: { dot: "bg-amber-400 animate-pulse", icon: Loader2, label: "Running" },
  pending: { dot: "bg-amber-400 animate-pulse", icon: Clock, label: "Pending" },
  awaiting_approval: { dot: "bg-violet-400 animate-pulse", icon: Clock, label: "Needs approval" },
  completed: { dot: "bg-emerald-400", icon: CheckCircle2, label: "Completed" },
  failed: { dot: "bg-red-400", icon: XCircle, label: "Failed" },
  cancelled: { dot: "bg-white/25", icon: XCircle, label: "Cancelled" },
};

// Connectors are organized into product-coherent categories so the user
// can wire up the right account for each store side without scrolling
// through one giant list. The keys here MUST match the server-side
// `integrationType` zod enum in server/routers/workspaces.ts.
type ConnectorMeta = { id: string; label: string; icon: typeof Plug; hint?: string };

const CONNECTOR_CATEGORIES: Array<{
  id: string;
  title: string;
  icon: typeof Plug;
  accent: string;
  blurb: string;
  connectors: ConnectorMeta[];
}> = [
  {
    id: "email",
    title: "Email",
    icon: Mail,
    accent: "text-sky-300",
    blurb: "Inbox automation, campaign sends, support replies.",
    connectors: [
      { id: "gmail", label: "Gmail", icon: Mail },
      { id: "outlook", label: "Outlook", icon: Mail },
    ],
  },
  {
    id: "social",
    title: "Social media",
    icon: Megaphone,
    accent: "text-fuchsia-300",
    blurb: "Posting, replies, and audience growth per channel.",
    connectors: [
      { id: "instagram", label: "Instagram", icon: Megaphone },
      { id: "facebook", label: "Facebook", icon: Megaphone },
      { id: "tiktok", label: "TikTok", icon: Megaphone },
      { id: "twitter", label: "Twitter / X", icon: Megaphone },
      { id: "youtube", label: "YouTube", icon: Megaphone },
      { id: "pinterest", label: "Pinterest", icon: Megaphone },
      { id: "linkedin", label: "LinkedIn", icon: Megaphone },
      { id: "snapchat", label: "Snapchat", icon: Megaphone },
    ],
  },
  {
    id: "ads",
    title: "Ads",
    icon: Target,
    accent: "text-amber-300",
    blurb: "Paid acquisition accounts. Different store, different ad accounts.",
    connectors: [
      { id: "meta_ads", label: "Meta Ads", icon: Target },
      { id: "google_ads", label: "Google Ads", icon: Target },
      { id: "tiktok_ads", label: "TikTok Ads", icon: Target },
    ],
  },
  {
    id: "calendar",
    title: "Calendar",
    icon: CalendarIcon,
    accent: "text-violet-300",
    blurb: "Schedule launches, posts, and follow-ups.",
    connectors: [
      { id: "google_calendar", label: "Google Calendar", icon: CalendarIcon },
      { id: "outlook_calendar", label: "Outlook Calendar", icon: CalendarIcon },
    ],
  },
  {
    id: "messaging",
    title: "Messaging",
    icon: MessageCircle,
    accent: "text-cyan-300",
    blurb: "Notifications, alerts, and team chat.",
    connectors: [
      { id: "slack", label: "Slack", icon: MessageCircle },
      { id: "discord", label: "Discord", icon: MessageCircle },
      { id: "telegram", label: "Telegram", icon: MessageCircle },
      { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    ],
  },
  {
    id: "commerce",
    title: "Commerce",
    icon: ShoppingBag,
    accent: "text-emerald-300",
    blurb: "Storefront platform and payment rails for this workspace.",
    connectors: [
      { id: "shopify", label: "Shopify", icon: ShoppingBag },
      { id: "stripe", label: "Stripe", icon: ShoppingBag },
    ],
  },
  {
    id: "lifecycle",
    title: "Lifecycle & automation",
    icon: Zap,
    accent: "text-rose-300",
    blurb: "Email lifecycle, automations, and workflow bridges.",
    connectors: [
      { id: "klaviyo", label: "Klaviyo", icon: Zap },
      { id: "mailchimp", label: "Mailchimp", icon: Zap },
      { id: "zapier", label: "Zapier", icon: Zap },
    ],
  },
];

// Reverse lookup from connector id → category for badges
const CONNECTOR_CATEGORY_BY_ID = new Map<string, string>();
for (const cat of CONNECTOR_CATEGORIES) {
  for (const c of cat.connectors) CONNECTOR_CATEGORY_BY_ID.set(c.id, cat.title);
}

function previewJson(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [, setLocation] = useLocation();
  const { activeWorkspaceId, activeWorkspace, activeStoreId } = useWorkspace();

  const [tab, setTab] = useState<WorkspaceTab>(() => readTabFromHash());

  useEffect(() => {
    const onHash = () => setTab(readTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleTabChange = (value: string) => {
    const next = (TAB_VALUES.includes(value as WorkspaceTab) ? value : "chat") as WorkspaceTab;
    setTab(next);
    if (typeof window !== "undefined") {
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}#${next}`);
    }
  };

  // Live counts for tab pills + header badges
  const memoryQuery = trpc.workspaces.getMemory.useQuery(
    { workspaceId: activeWorkspaceId!, limit: 200 },
    { enabled: !!activeWorkspaceId, staleTime: 30_000 },
  );
  const integrationsQuery = trpc.workspaces.listIntegrations.useQuery(
    { workspaceId: activeWorkspaceId! },
    { enabled: !!activeWorkspaceId, staleTime: 30_000 },
  );
  const workflowsQuery = trpc.workspaces.listWorkflows.useQuery(
    { workspaceId: activeWorkspaceId!, limit: 50 },
    { enabled: !!activeWorkspaceId, staleTime: 15_000, refetchInterval: 15_000 },
  );

  const supplierWorkflows = useMemo(
    () => (workflowsQuery.data ?? []).filter((w: any) => SUPPLIER_WORKFLOW_TYPES.has(w.workflowType)),
    [workflowsQuery.data],
  );

  // No workspace yet → empty state with a CTA back to storefronts
  if (!activeWorkspaceId || !activeWorkspace) {
    return (
      <div className="page-enter flex h-full min-h-0 flex-col">
        <PageHeader
          icon={<Sparkles className="h-4 w-4" />}
          title="Workspace"
          subtitle="Connect or create a store to open its workspace."
          accent="sky"
        />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
            <Store className="mx-auto h-8 w-8 text-white/40" />
            <h2 className="mt-3 text-lg font-heading font-bold text-foreground">
              No workspace yet
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Each store you connect or launch gets its own workspace with chat,
              memory, instructions, custom workflows, connectors, and suppliers —
              fully isolated from your other stores.
            </p>
            <Button
              className="mt-4"
              onClick={() => setLocation("/storefronts#integrations")}
            >
              <Plug className="mr-1.5 h-3.5 w-3.5" />
              Connect or create a store
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const wsTitle = activeWorkspace.name || "Workspace";
  const memoryCount = memoryQuery.data?.length ?? 0;
  const integrationCount = integrationsQuery.data?.length ?? 0;
  const workflowCount = workflowsQuery.data?.length ?? 0;

  return (
    <div className="page-enter flex h-full min-h-0 flex-col bg-[#050505]/70">
      <PageHeader
        icon={<Sparkles className="h-4 w-4" />}
        title={wsTitle}
        subtitle="One workspace per store: chat, workflows, memory, instructions, connectors, suppliers — all scoped here."
        accent="sky"
        flushBottom
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border border-white/[0.08] bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/70">
              <Brain className="mr-1 h-3 w-3 text-sky-300" />
              {memoryCount} memory
            </Badge>
            <Badge className="border border-white/[0.08] bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/70">
              <Plug className="mr-1 h-3 w-3 text-sky-300" />
              {integrationCount} connectors
            </Badge>
            <Badge className="border border-white/[0.08] bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/70">
              <GitBranch className="mr-1 h-3 w-3 text-sky-300" />
              {workflowCount} workflows
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-white/10 bg-white/[0.04] text-xs"
              onClick={() => setLocation("/storefronts#integrations")}
            >
              <Plug className="mr-1 h-3 w-3" />
              Connect store
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={handleTabChange} className="flex flex-1 min-h-0 flex-col">
        <div className="shrink-0 border-b border-white/[0.06] px-4 md:px-6">
          <TabsList className="h-auto bg-transparent p-0">
            <WorkspaceTabTrigger value="chat" icon={Sparkles} label="Chat" />
            <WorkspaceTabTrigger value="workflows" icon={GitBranch} label="Workflows" count={workflowCount} />
            <WorkspaceTabTrigger value="memory" icon={Brain} label="Memory" count={memoryCount} />
            <WorkspaceTabTrigger value="instructions" icon={ScrollText} label="Instructions" />
            <WorkspaceTabTrigger value="connectors" icon={Plug} label="Connectors" count={integrationCount} />
            <WorkspaceTabTrigger value="suppliers" icon={Truck} label="Suppliers" count={supplierWorkflows.length} />
          </TabsList>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <TabsContent value="chat" className="m-0 h-full">
            <ChatTab
              workspaceId={activeWorkspaceId}
              storeId={activeStoreId ?? null}
              workspaceName={wsTitle}
              workflows={workflowsQuery.data ?? []}
              workflowsLoading={workflowsQuery.isLoading}
              onWorkflowsRefetch={() => void workflowsQuery.refetch()}
            />
          </TabsContent>
          <TabsContent value="workflows" className="m-0 h-full overflow-y-auto">
            <WorkflowsTab
              workspaceName={wsTitle}
              workflows={workflowsQuery.data ?? []}
              isLoading={workflowsQuery.isLoading}
              onLaunch={() => setLocation("/workflow-builder")}
              onOpen={() => setLocation("/workflows")}
            />
          </TabsContent>
          <TabsContent value="memory" className="m-0 h-full overflow-y-auto">
            <MemoryTab workspaceId={activeWorkspaceId} />
          </TabsContent>
          <TabsContent value="instructions" className="m-0 h-full overflow-y-auto">
            <InstructionsTab workspaceId={activeWorkspaceId} />
          </TabsContent>
          <TabsContent value="connectors" className="m-0 h-full overflow-y-auto">
            <ConnectorsTab workspaceId={activeWorkspaceId} />
          </TabsContent>
          <TabsContent value="suppliers" className="m-0 h-full overflow-y-auto">
            <SuppliersTab
              workspaceName={wsTitle}
              workflows={supplierWorkflows}
              isLoading={workflowsQuery.isLoading}
              onLaunch={() => setLocation("/workflow-builder")}
              onOpenSupplier={() => setLocation("/storefronts#supplier")}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab trigger
// ─────────────────────────────────────────────────────────────────────────────

function WorkspaceTabTrigger({
  value,
  icon: Icon,
  label,
  count,
}: {
  value: WorkspaceTab;
  icon: typeof Bot;
  label: string;
  count?: number;
}) {
  return (
    <TabsTrigger
      value={value}
      className="group relative h-10 gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 text-xs font-medium text-white/55 transition-colors data-[state=active]:border-sky-400 data-[state=active]:bg-transparent data-[state=active]:text-white hover:text-white/80"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="ml-1 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-semibold text-white/60 group-data-[state=active]:bg-sky-500/20 group-data-[state=active]:text-sky-200">
          {count}
        </span>
      )}
    </TabsTrigger>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat tab — Claude-Code-style multi-session chat
//
// Each store is a "repository". Inside a workspace the user can keep many
// independent conversation sessions side-by-side: kick off a "+ New chat"
// for a one-off question, pin the long-running ops thread, archive
// finished work — exactly the way Claude Code lists past sessions per
// repo. Switching sessions swaps just the message pane; the workflow
// rail keeps the workspace-wide context.
// ─────────────────────────────────────────────────────────────────────────────

type ChatSession = {
  id: number;
  workspaceId: number;
  title: string;
  summary: string | null;
  pinned: boolean;
  archived: boolean;
  archivedAt: string | Date | null;
  messageCount: number;
  lastMessageAt: string | Date | null;
  lastMessagePreview: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const SESSION_QUERY_PARAM = "session";

function readSessionFromUrl(): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(SESSION_QUERY_PARAM);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function writeSessionToUrl(sessionId: number | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (sessionId) url.searchParams.set(SESSION_QUERY_PARAM, String(sessionId));
  else url.searchParams.delete(SESSION_QUERY_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function formatRelativeTimestamp(value: string | Date | null | undefined): string {
  if (!value) return "";
  const ts = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(ts.getTime())) return "";
  const diffMs = Date.now() - ts.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return ts.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Bucket a session into the sidebar group it belongs to. Archived and
 * pinned sessions short-circuit to their own buckets; otherwise we slot
 * by the most recent message timestamp into Today / Yesterday / Earlier
 * (matching Claude Code's session list grouping).
 */
function bucketSession(session: ChatSession): "pinned" | "today" | "yesterday" | "earlier" | "archived" {
  if (session.archived) return "archived";
  if (session.pinned) return "pinned";
  const ref = session.lastMessageAt ?? session.updatedAt ?? session.createdAt;
  const ts = typeof ref === "string" ? new Date(ref) : ref;
  if (!ts || Number.isNaN(ts.getTime())) return "earlier";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const time = ts.getTime();
  if (time >= startOfToday) return "today";
  if (time >= startOfYesterday) return "yesterday";
  return "earlier";
}

function ChatTab({
  workspaceId,
  storeId,
  workspaceName,
  workflows,
  workflowsLoading,
  onWorkflowsRefetch,
}: {
  workspaceId: number;
  storeId: number | null;
  workspaceName: string;
  workflows: any[];
  workflowsLoading: boolean;
  onWorkflowsRefetch: () => void;
}) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Sidebar state
  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Active session state — persisted in the URL so each chat is shareable
  // and survives a page reload (just like a Claude Code session URL).
  const [activeSessionId, setActiveSessionId] = useState<number | null>(() =>
    readSessionFromUrl(),
  );

  // Per-session in-memory message buffer. Keyed by session id so switching
  // back and forth doesn't drop the latest assistant reply before the
  // server query refetches.
  const [messagesBySession, setMessagesBySession] = useState<Record<number, Message[]>>({});

  const sessionsQuery = trpc.workspaces.listChatSessions.useQuery(
    { workspaceId, includeArchived: showArchived, limit: 200 },
    { enabled: !!workspaceId, staleTime: 15_000 },
  );

  // Ensure a session is always selected: prefer the one in the URL, fall
  // back to the most-recent active session, otherwise leave null (the user
  // explicitly clicks "+ New chat" or sends a message to create one).
  useEffect(() => {
    if (!sessionsQuery.data) return;
    if (activeSessionId) {
      const exists = sessionsQuery.data.some((s: ChatSession) => s.id === activeSessionId);
      if (exists) return;
    }
    const firstActive = sessionsQuery.data.find((s: ChatSession) => !s.archived);
    if (firstActive) {
      setActiveSessionId(firstActive.id);
      writeSessionToUrl(firstActive.id);
    } else if (activeSessionId) {
      setActiveSessionId(null);
      writeSessionToUrl(null);
    }
  }, [sessionsQuery.data, activeSessionId]);

  const messagesQuery = trpc.workspaces.getChatMessages.useQuery(
    { workspaceId, sessionId: activeSessionId ?? undefined, limit: 500 },
    { enabled: !!workspaceId && !!activeSessionId, staleTime: 30_000 },
  );

  // When the server returns the persisted history for a session, hydrate
  // the local buffer (only if we don't already have a more-up-to-date
  // optimistic copy).
  useEffect(() => {
    if (!activeSessionId) return;
    const data = messagesQuery.data;
    if (!data) return;
    const loaded: Message[] = data
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));
    setMessagesBySession((prev) => {
      const existing = prev[activeSessionId];
      // If the local buffer is longer (e.g. an optimistic user message
      // hasn't been persisted yet), keep it.
      if (existing && existing.length > loaded.length) return prev;
      return { ...prev, [activeSessionId]: loaded };
    });
  }, [activeSessionId, messagesQuery.data]);

  const createSessionMutation = trpc.workspaces.createChatSession.useMutation({
    onSuccess: (session) => {
      void utils.workspaces.listChatSessions.invalidate({ workspaceId });
      setActiveSessionId(session.id);
      writeSessionToUrl(session.id);
      setMessagesBySession((prev) => ({ ...prev, [session.id]: [] }));
    },
    onError: (err) => toast.error(err.message || "Could not start a new chat"),
  });

  const renameSessionMutation = trpc.workspaces.renameChatSession.useMutation({
    onSuccess: () => {
      void utils.workspaces.listChatSessions.invalidate({ workspaceId });
    },
    onError: (err) => toast.error(err.message || "Could not rename chat"),
  });

  const pinSessionMutation = trpc.workspaces.pinChatSession.useMutation({
    onSuccess: () => {
      void utils.workspaces.listChatSessions.invalidate({ workspaceId });
    },
    onError: (err) => toast.error(err.message || "Could not pin chat"),
  });

  const archiveSessionMutation = trpc.workspaces.archiveChatSession.useMutation({
    onSuccess: () => {
      void utils.workspaces.listChatSessions.invalidate({ workspaceId });
    },
    onError: (err) => toast.error(err.message || "Could not archive chat"),
  });

  const deleteSessionMutation = trpc.workspaces.deleteChatSession.useMutation({
    onSuccess: (_data, vars) => {
      void utils.workspaces.listChatSessions.invalidate({ workspaceId });
      setMessagesBySession((prev) => {
        const next = { ...prev };
        delete next[vars.sessionId];
        return next;
      });
      if (activeSessionId === vars.sessionId) {
        setActiveSessionId(null);
        writeSessionToUrl(null);
      }
    },
    onError: (err) => toast.error(err.message || "Could not delete chat"),
  });

  const chatMutation = trpc.chat.message.useMutation({
    onSuccess: (data, variables) => {
      const sid = (variables as any).sessionId as number | undefined;
      if (sid) {
        setMessagesBySession((prev) => ({
          ...prev,
          [sid]: [...(prev[sid] ?? []), { role: "assistant", content: data.reply }],
        }));
        // Refetch the session list to surface the auto-generated title and
        // refreshed counters/timestamps.
        void utils.workspaces.listChatSessions.invalidate({ workspaceId });
      }
      if (data.toolsUsed?.length) onWorkflowsRefetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to get bot response");
    },
  });

  async function handleSend(content: string) {
    let sid = activeSessionId;
    // First send with no active session → create one on demand and route
    // the message through it. Mirrors Claude Code starting a new session
    // when you type into the empty composer.
    if (!sid) {
      try {
        const session = await createSessionMutation.mutateAsync({ workspaceId });
        sid = session.id;
      } catch {
        return;
      }
    }
    const newMsg: Message = { role: "user", content };
    const prevMessages = messagesBySession[sid] ?? [];
    const updated = [...prevMessages, newMsg];
    setMessagesBySession((prev) => ({ ...prev, [sid!]: updated }));
    chatMutation.mutate({
      agentType: "store",
      messages: updated.filter(
        (m): m is { role: "user" | "assistant"; content: string } =>
          m.role === "user" || m.role === "assistant",
      ),
      storeId: storeId ?? undefined,
      workspaceId,
      sessionId: sid,
    });
  }

  function handleSelectSession(id: number) {
    setActiveSessionId(id);
    writeSessionToUrl(id);
  }

  function handleNewChat() {
    createSessionMutation.mutate({ workspaceId });
  }

  const sessions: ChatSession[] = (sessionsQuery.data ?? []) as ChatSession[];
  const filteredSessions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter((s) => {
      const haystack = `${s.title} ${s.summary ?? ""} ${s.lastMessagePreview ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [sessions, searchTerm]);

  const groupedSessions = useMemo(() => {
    const buckets: Record<"pinned" | "today" | "yesterday" | "earlier" | "archived", ChatSession[]> = {
      pinned: [],
      today: [],
      yesterday: [],
      earlier: [],
      archived: [],
    };
    for (const s of filteredSessions) buckets[bucketSession(s)].push(s);
    return buckets;
  }, [filteredSessions]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );
  const activeMessages = activeSessionId ? messagesBySession[activeSessionId] ?? [] : [];

  const placeholder = activeSession
    ? `Reply to "${activeSession.title}"…`
    : `Ask the ${workspaceName} Store Bot to build, operate, market, or inspect results…`;

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      {/* ── Session sidebar ─────────────────────────────────────────────── */}
      <SessionSidebar
        sessions={filteredSessions}
        grouped={groupedSessions}
        activeSessionId={activeSessionId}
        searchTerm={searchTerm}
        onSearch={setSearchTerm}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived((v) => !v)}
        onNewChat={handleNewChat}
        creating={createSessionMutation.isPending}
        onSelect={handleSelectSession}
        onRename={(id, title) => renameSessionMutation.mutate({ sessionId: id, title })}
        onTogglePin={(id, pinned) => pinSessionMutation.mutate({ sessionId: id, pinned })}
        onToggleArchive={(id, archived) =>
          archiveSessionMutation.mutate({ sessionId: id, archived })
        }
        onDelete={(id) => deleteSessionMutation.mutate({ sessionId: id })}
        loading={sessionsQuery.isLoading}
        workspaceName={workspaceName}
      />

      {/* ── Active session pane ─────────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-col border-t border-white/[0.06] lg:border-l lg:border-t-0">
        <SessionHeader
          session={activeSession}
          onRename={(title) => {
            if (activeSession) {
              renameSessionMutation.mutate({ sessionId: activeSession.id, title });
            }
          }}
          onTogglePin={() => {
            if (activeSession) {
              pinSessionMutation.mutate({
                sessionId: activeSession.id,
                pinned: !activeSession.pinned,
              });
            }
          }}
          onToggleArchive={() => {
            if (activeSession) {
              archiveSessionMutation.mutate({
                sessionId: activeSession.id,
                archived: !activeSession.archived,
              });
            }
          }}
          onDelete={() => {
            if (activeSession && confirm(`Delete "${activeSession.title}"? This cannot be undone.`)) {
              deleteSessionMutation.mutate({ sessionId: activeSession.id });
            }
          }}
          onNewChat={handleNewChat}
        />
        <div className="min-h-0 flex-1 p-4 md:p-5">
          <AIChatBox
            messages={activeMessages}
            onSendMessage={handleSend}
            isLoading={chatMutation.isPending || createSessionMutation.isPending}
            placeholder={placeholder}
            suggestedPrompts={
              activeMessages.length === 0
                ? [
                    `Show me what's happening in ${workspaceName} and what to fix first`,
                    "Run a full store optimization sweep",
                    "Create a social content plan for my best products",
                    "Check workflows and summarize the latest results",
                  ]
                : undefined
            }
            className="h-full border-white/10 bg-white/[0.02]"
            height="100%"
            emptyStateMessage={
              activeSession
                ? `${activeSession.title} — start where you left off, or ask something new.`
                : `${workspaceName} workspace is ready. Type below to start a new chat.`
            }
            botType="store"
          />
        </div>
      </div>

      {/* ── Workflow rail (workspace-wide context, not session-scoped) ──── */}
      <aside className="custom-scrollbar hidden min-h-0 overflow-y-auto border-t border-white/[0.06] bg-white/[0.015] p-4 md:p-5 xl:block xl:border-l xl:border-t-0">
        <Panel title="Workflow results" icon={GitBranch} actionLabel="All workflows" onAction={() => setLocation("/workflows")}>
          {workflowsLoading ? (
            <LoadingRow />
          ) : workflows.length === 0 ? (
            <EmptyLine text="Workflow outputs will appear here as soon as the Store Bot runs something." />
          ) : (
            <div className="space-y-2">
              {workflows.slice(0, 6).map((wf: any) => <WorkflowCard key={wf.id} workflow={wf} />)}
            </div>
          )}
        </Panel>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session sidebar
// ─────────────────────────────────────────────────────────────────────────────

function SessionSidebar({
  sessions,
  grouped,
  activeSessionId,
  searchTerm,
  onSearch,
  showArchived,
  onToggleArchived,
  onNewChat,
  creating,
  onSelect,
  onRename,
  onTogglePin,
  onToggleArchive,
  onDelete,
  loading,
  workspaceName,
}: {
  sessions: ChatSession[];
  grouped: Record<"pinned" | "today" | "yesterday" | "earlier" | "archived", ChatSession[]>;
  activeSessionId: number | null;
  searchTerm: string;
  onSearch: (term: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  onNewChat: () => void;
  creating: boolean;
  onSelect: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onTogglePin: (id: number, pinned: boolean) => void;
  onToggleArchive: (id: number, archived: boolean) => void;
  onDelete: (id: number) => void;
  loading: boolean;
  workspaceName: string;
}) {
  const groupOrder: Array<{
    key: keyof typeof grouped;
    label: string;
  }> = [
    { key: "pinned", label: "Pinned" },
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "earlier", label: "Earlier" },
    { key: "archived", label: "Archived" },
  ];

  return (
    <div className="custom-scrollbar flex min-h-0 flex-col overflow-hidden bg-[#070707]/80">
      <div className="shrink-0 space-y-2 border-b border-white/[0.06] p-3">
        <Button
          size="sm"
          className="h-8 w-full justify-start bg-sky-500/15 text-xs font-semibold text-sky-100 hover:bg-sky-500/25"
          onClick={onNewChat}
          disabled={creating}
        >
          {creating ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          New chat
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search chats…"
            className="h-8 border-white/10 bg-white/[0.04] pl-7 pr-7 text-xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/40 hover:bg-white/[0.06] hover:text-white/70"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-white/30" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <MessageSquare className="mx-auto h-5 w-5 text-white/30" />
            <p className="mt-2 text-[11px] text-white/55">
              {searchTerm
                ? "No chats match your search."
                : `No chats in ${workspaceName} yet.`}
            </p>
            {!searchTerm && (
              <p className="mt-1 text-[10px] text-white/35">
                Click <span className="text-white/60">+ New chat</span> to start one.
              </p>
            )}
          </div>
        ) : (
          groupOrder.map(({ key, label }) => {
            const items = grouped[key];
            if (!items || items.length === 0) return null;
            return (
              <div key={key} className="mb-3">
                <div className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
                  {label}
                  <span className="ml-1.5 text-white/25">{items.length}</span>
                </div>
                <div className="space-y-0.5">
                  {items.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      active={s.id === activeSessionId}
                      onSelect={() => onSelect(s.id)}
                      onRename={(title) => onRename(s.id, title)}
                      onTogglePin={() => onTogglePin(s.id, !s.pinned)}
                      onToggleArchive={() => onToggleArchive(s.id, !s.archived)}
                      onDelete={() => onDelete(s.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] p-2">
        <button
          type="button"
          onClick={onToggleArchived}
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[10px] uppercase tracking-[0.15em] text-white/40 hover:bg-white/[0.04] hover:text-white/65"
        >
          <span>{showArchived ? "Hide archived" : "Show archived"}</span>
          <span className="text-white/30">{showArchived ? "−" : "+"}</span>
        </button>
      </div>
    </div>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onRename,
  onTogglePin,
  onToggleArchive,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);

  useEffect(() => {
    setDraftTitle(session.title);
  }, [session.title]);

  function commitRename() {
    const next = draftTitle.trim();
    setEditing(false);
    if (!next || next === session.title) {
      setDraftTitle(session.title);
      return;
    }
    onRename(next);
  }

  return (
    <div
      className={`group relative rounded-md px-2 py-1.5 text-xs transition-colors ${
        active
          ? "bg-sky-500/15 text-white"
          : "text-white/70 hover:bg-white/[0.04] hover:text-white/90"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => setEditing(true)}
        className="flex w-full items-start gap-1.5 text-left"
      >
        <div className="mt-0.5 shrink-0">
          {session.pinned ? (
            <Pin className="h-3 w-3 text-amber-300" />
          ) : (
            <MessageSquare className={`h-3 w-3 ${active ? "text-sky-200" : "text-white/35"}`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDraftTitle(session.title);
                  setEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-6 border-white/15 bg-black/40 px-1.5 text-xs"
              maxLength={255}
            />
          ) : (
            <p className="truncate text-[11px] font-semibold leading-tight">{session.title}</p>
          )}
          {session.lastMessagePreview && !editing && (
            <p
              className={`mt-0.5 line-clamp-1 text-[10px] leading-snug ${
                active ? "text-white/65" : "text-white/40"
              }`}
            >
              {session.lastMessagePreview}
            </p>
          )}
          <div className="mt-0.5 flex items-center gap-2 text-[9px] text-white/35">
            <span>{formatRelativeTimestamp(session.lastMessageAt ?? session.updatedAt)}</span>
            {session.messageCount > 0 && (
              <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-white/45">
                {session.messageCount} msg
              </span>
            )}
            {session.archived && (
              <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-white/45">
                archived
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded p-1 text-white/40 hover:bg-white/[0.08] hover:text-white/80"
              aria-label="Chat actions"
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePin}>
              {session.pinned ? (
                <>
                  <PinOff className="mr-2 h-3.5 w-3.5" />
                  Unpin
                </>
              ) : (
                <>
                  <Pin className="mr-2 h-3.5 w-3.5" />
                  Pin
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleArchive}>
              {session.archived ? (
                <>
                  <Check className="mr-2 h-3.5 w-3.5" />
                  Unarchive
                </>
              ) : (
                <>
                  <ScrollText className="mr-2 h-3.5 w-3.5" />
                  Archive
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-rose-300 focus:bg-rose-500/15 focus:text-rose-200"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete forever
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function SessionHeader({
  session,
  onRename,
  onTogglePin,
  onToggleArchive,
  onDelete,
  onNewChat,
}: {
  session: ChatSession | null;
  onRename: (title: string) => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
  onNewChat: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session?.title ?? "");

  useEffect(() => {
    setDraft(session?.title ?? "");
    setEditing(false);
  }, [session?.id, session?.title]);

  if (!session) {
    return (
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-white/55">
          <Sparkles className="h-3.5 w-3.5 text-sky-300" />
          <span>Type below to start your first chat in this workspace.</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-white/10 bg-white/[0.04] text-[11px]"
          onClick={onNewChat}
        >
          <Plus className="mr-1 h-3 w-3" />
          New chat
        </Button>
      </div>
    );
  }

  function commit() {
    if (!session) return;
    const next = draft.trim();
    setEditing(false);
    if (!next || next === session.title) {
      setDraft(session.title);
      return;
    }
    onRename(next);
  }

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {session.pinned ? (
          <Pin className="h-3.5 w-3.5 shrink-0 text-amber-300" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-sky-300" />
        )}
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(session.title);
                setEditing(false);
              }
            }}
            className="h-7 max-w-md border-white/15 bg-black/40 text-xs"
            maxLength={255}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group flex min-w-0 items-center gap-1.5 truncate text-left text-xs font-semibold text-white/85 hover:text-white"
            title="Click to rename"
          >
            <span className="truncate">{session.title}</span>
            <Edit3 className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
          </button>
        )}
        {session.archived && (
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/45">
            archived
          </span>
        )}
        <span className="hidden text-[10px] text-white/35 md:inline">
          · {session.messageCount} message{session.messageCount === 1 ? "" : "s"}
          {session.lastMessageAt ? ` · ${formatRelativeTimestamp(session.lastMessageAt)}` : ""}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] text-white/65 hover:text-white"
          onClick={onTogglePin}
          title={session.pinned ? "Unpin" : "Pin"}
        >
          {session.pinned ? (
            <PinOff className="h-3.5 w-3.5" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-white/65 hover:text-white"
              aria-label="Chat actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleArchive}>
              {session.archived ? (
                <>
                  <Check className="mr-2 h-3.5 w-3.5" />
                  Unarchive
                </>
              ) : (
                <>
                  <ScrollText className="mr-2 h-3.5 w-3.5" />
                  Archive
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-rose-300 focus:bg-rose-500/15 focus:text-rose-200"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete forever
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-white/10 bg-white/[0.04] text-[11px]"
          onClick={onNewChat}
        >
          <Plus className="mr-1 h-3 w-3" />
          New chat
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflows tab
// ─────────────────────────────────────────────────────────────────────────────

function WorkflowsTab({
  workspaceName,
  workflows,
  isLoading,
  onLaunch,
  onOpen,
}: {
  workspaceName: string;
  workflows: any[];
  isLoading: boolean;
  onLaunch: () => void;
  onOpen: () => void;
}) {
  const grouped = useMemo(() => {
    const buckets: Record<string, any[]> = {
      running: [],
      pending: [],
      awaiting_approval: [],
      completed: [],
      failed: [],
      cancelled: [],
    };
    for (const w of workflows) {
      const k = (w.status as string) in buckets ? (w.status as string) : "completed";
      buckets[k].push(w);
    }
    return buckets;
  }, [workflows]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">
            Workflows for {workspaceName}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every run the Store Bot kicks off here lives in this workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 border-white/10 bg-white/[0.04] text-xs" onClick={onOpen}>
            <ExternalLink className="mr-1 h-3 w-3" />
            Open workflows hub
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={onLaunch}>
            <Plus className="mr-1 h-3 w-3" />
            Build workflow
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingRow />
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No workflows yet"
          body="Ask the Store Bot to launch one from the Chat tab, or build one in the workflow builder."
          action={{ label: "Build workflow", onClick: onLaunch }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {(["running", "pending", "awaiting_approval", "completed", "failed", "cancelled"] as const).map((status) => {
            if (grouped[status].length === 0) return null;
            const tone = WORKFLOW_TONE[status];
            return (
              <section
                key={status}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                    {tone.label}
                  </span>
                  <span className="ml-auto text-[10px] text-white/35">{grouped[status].length}</span>
                </div>
                <div className="space-y-2">
                  {grouped[status].map((w: any) => <WorkflowCard key={w.id} workflow={w} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory tab
// ─────────────────────────────────────────────────────────────────────────────

function MemoryTab({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const memoryQuery = trpc.workspaces.getMemory.useQuery(
    { workspaceId, limit: 200 },
    { enabled: !!workspaceId, staleTime: 30_000 },
  );
  const createMemory = trpc.workspaces.createMemory.useMutation({
    onSuccess: () => {
      toast.success("Memory saved");
      void utils.workspaces.getMemory.invalidate({ workspaceId });
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMemory = trpc.workspaces.deleteMemory.useMutation({
    onSuccess: () => {
      toast.success("Memory deleted");
      void utils.workspaces.getMemory.invalidate({ workspaceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const [filter, setFilter] = useState<"all" | MemoryType>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [draftType, setDraftType] = useState<MemoryType>("fact");
  const [draftKey, setDraftKey] = useState("");
  const [draftValue, setDraftValue] = useState("");

  const memories = memoryQuery.data ?? [];
  const filtered = filter === "all" ? memories : memories.filter((m: any) => m.memoryType === filter);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: memories.length };
    for (const t of MEMORY_TYPES) c[t] = 0;
    for (const m of memories) {
      const k = m.memoryType as string;
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [memories]);

  function handleSubmit() {
    if (!draftKey.trim() || !draftValue.trim()) {
      toast.error("Memory needs a key and a value");
      return;
    }
    createMemory.mutate(
      {
        workspaceId,
        memoryType: draftType,
        key: draftKey.trim(),
        value: draftValue.trim(),
      },
      {
        onSuccess: () => {
          setDraftKey("");
          setDraftValue("");
          setShowAdd(false);
        },
      },
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">Workspace memory</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Long-lived facts, decisions, and preferences the Store Bot remembers across sessions.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="mr-1 h-3 w-3" />
          {showAdd ? "Cancel" : "Add memory"}
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr]">
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-white/40">Type</Label>
              <Select value={draftType} onValueChange={(v) => setDraftType(v as MemoryType)}>
                <SelectTrigger className="mt-1 h-9 border-white/10 bg-white/[0.04] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{MEMORY_TONE[t].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-white/40">Key</Label>
              <Input
                className="mt-1 h-9 border-white/10 bg-white/[0.04] text-xs"
                placeholder="e.g. preferred_shipping_method"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                maxLength={255}
              />
            </div>
          </div>
          <div className="mt-3">
            <Label className="text-[10px] uppercase tracking-widest text-white/40">Value</Label>
            <Textarea
              className="mt-1 min-h-[80px] border-white/10 bg-white/[0.04] text-xs"
              placeholder="What should the bot remember?"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              maxLength={10000}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" className="h-8 text-xs" onClick={handleSubmit} disabled={createMemory.isPending}>
              {createMemory.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Save memory
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All <span className="ml-1 text-white/45">{counts.all}</span>
        </FilterChip>
        {MEMORY_TYPES.map((t) => (
          <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)}>
            {MEMORY_TONE[t].label}
            {counts[t] > 0 && <span className="ml-1 text-white/45">{counts[t]}</span>}
          </FilterChip>
        ))}
      </div>

      {memoryQuery.isLoading ? (
        <LoadingRow />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="No memories yet"
          body="Save facts, patterns, decisions, outcomes, contexts, and preferences here. The Store Bot uses them as long-term knowledge."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((m: any) => {
            const tone = MEMORY_TONE[m.memoryType as MemoryType] ?? MEMORY_TONE.fact;
            return (
              <div key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${tone.bg} ${tone.text}`}>
                        {tone.label}
                      </span>
                      <p className="truncate text-[11px] font-semibold text-white/85">{m.key}</p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/70">{m.value}</p>
                    {typeof m.confidence === "number" && (
                      <p className="mt-2 text-[9px] uppercase tracking-widest text-white/30">
                        Confidence {m.confidence}%
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-1 text-white/35 transition-colors hover:bg-white/[0.05] hover:text-rose-300"
                    onClick={() => {
                      if (confirm("Delete this memory?")) deleteMemory.mutate({ id: m.id });
                    }}
                    aria-label="Delete memory"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Instructions tab
// ─────────────────────────────────────────────────────────────────────────────

function InstructionsTab({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.workspaces.getSettings.useQuery(
    { workspaceId },
    { enabled: !!workspaceId, staleTime: 30_000 },
  );
  const updateSettings = trpc.workspaces.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Instructions saved");
      void utils.workspaces.getSettings.invalidate({ workspaceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const [customInstructions, setCustomInstructions] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [personality, setPersonality] = useState("");
  const [autonomyLevel, setAutonomyLevel] = useState<"fully_autonomous" | "supervised" | "manual">("supervised");

  // Re-seed local state every time the underlying settings load or
  // change (e.g. after switching workspaces). Without this, the form
  // would still show the previous workspace's values.
  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setCustomInstructions(s.customInstructions ?? "");
    setSystemPrompt(s.systemPrompt ?? "");
    setPersonality(s.personality ?? "");
    setAutonomyLevel((s.autonomyLevel as any) ?? "supervised");
  }, [settingsQuery.data, workspaceId]);

  function handleSave() {
    updateSettings.mutate({
      workspaceId,
      customInstructions,
      systemPrompt,
      personality,
      autonomyLevel,
    });
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">Instructions & personality</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Steer the Store Bot for this workspace specifically. Different stores can have different voices, autonomy, and rules.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={updateSettings.isPending || settingsQuery.isLoading}>
          {updateSettings.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
          Save changes
        </Button>
      </div>

      {settingsQuery.isLoading ? (
        <LoadingRow />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Section
              title="Custom instructions"
              icon={Lightbulb}
              hint="Plain-language guidance the bot reads before every response. Tone, brand voice, do-nots, priorities."
            >
              <Textarea
                className="min-h-[160px] border-white/10 bg-white/[0.04] text-xs leading-relaxed"
                placeholder="e.g. Speak in a confident, premium tone. Never discount above 15%. Always upsell warranty add-ons."
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                maxLength={10000}
              />
            </Section>

            <Section
              title="System prompt override"
              icon={ScrollText}
              hint="Advanced: replaces the default system prompt entirely. Leave blank to use the default."
            >
              <Textarea
                className="min-h-[140px] border-white/10 bg-white/[0.04] text-xs leading-relaxed font-mono"
                placeholder="Leave blank to use the default Store Bot system prompt."
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                maxLength={20000}
              />
            </Section>
          </div>

          <div className="space-y-4">
            <Section title="Personality" icon={Sparkles} hint="One-word vibe. Steers tone & word choice.">
              <Input
                className="h-9 border-white/10 bg-white/[0.04] text-xs"
                placeholder="confident, playful, technical, luxury…"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                maxLength={100}
              />
            </Section>

            <Section title="Autonomy" icon={Zap} hint="How much the bot can act on its own.">
              <Select value={autonomyLevel} onValueChange={(v) => setAutonomyLevel(v as any)}>
                <SelectTrigger className="h-9 border-white/10 bg-white/[0.04] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fully_autonomous">Fully autonomous</SelectItem>
                  <SelectItem value="supervised">Supervised (recommended)</SelectItem>
                  <SelectItem value="manual">Manual approval</SelectItem>
                </SelectContent>
              </Select>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connectors tab
// ─────────────────────────────────────────────────────────────────────────────

function ConnectorsTab({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const integrationsQuery = trpc.workspaces.listIntegrations.useQuery(
    { workspaceId },
    { enabled: !!workspaceId, staleTime: 30_000 },
  );

  const connect = trpc.workspaces.connectIntegration.useMutation({
    onSuccess: () => {
      toast.success("Connector added — finish authorizing it from your account settings.");
      void utils.workspaces.listIntegrations.invalidate({ workspaceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const disconnect = trpc.workspaces.disconnectIntegration.useMutation({
    onSuccess: () => {
      toast.success("Disconnected");
      void utils.workspaces.listIntegrations.invalidate({ workspaceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const update = trpc.workspaces.updateIntegration.useMutation({
    onSuccess: () => {
      void utils.workspaces.listIntegrations.invalidate({ workspaceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const integrations = integrationsQuery.data ?? [];
  const byType = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const i of integrations) {
      const arr = map.get(i.integrationType) ?? [];
      arr.push(i);
      map.set(i.integrationType, arr);
    }
    return map;
  }, [integrations]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-base font-heading font-bold text-foreground">Connectors & tools</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Per-workspace accounts. Different stores can wire up different ad accounts, calendars, and inboxes.
        </p>
      </div>

      {integrationsQuery.isLoading ? (
        <LoadingRow />
      ) : (
        <div className="space-y-5">
          {CONNECTOR_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <section key={cat.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${cat.accent}`} />
                  <h3 className="text-sm font-heading font-bold text-foreground">{cat.title}</h3>
                  <span className="text-[10px] text-white/35">{cat.blurb}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {cat.connectors.map((c) => {
                    const existing = byType.get(c.id) ?? [];
                    const isConnected = existing.length > 0;
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                          isConnected
                            ? "border-emerald-500/25 bg-emerald-500/[0.04]"
                            : "border-white/[0.06] bg-white/[0.02] hover:border-white/15"
                        }`}
                      >
                        <c.icon className={`h-4 w-4 shrink-0 ${isConnected ? "text-emerald-300" : "text-white/45"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-white/85">{c.label}</p>
                          {isConnected ? (
                            <p className="mt-0.5 truncate text-[10px] text-emerald-200/80">
                              {existing[0].accountName || existing[0].accountId || "Connected"}
                              {existing.length > 1 && ` · +${existing.length - 1} more`}
                            </p>
                          ) : (
                            <p className="mt-0.5 truncate text-[10px] text-white/35">Not connected</p>
                          )}
                        </div>
                        {isConnected ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[10px] text-white/55 hover:text-white"
                              onClick={() =>
                                update.mutate({
                                  id: existing[0].id,
                                  enabled: !existing[0].enabled,
                                })
                              }
                            >
                              {existing[0].enabled ? "Pause" : "Resume"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[10px] text-rose-300/80 hover:text-rose-200"
                              onClick={() => {
                                if (confirm(`Disconnect ${c.label} from this workspace?`)) {
                                  disconnect.mutate({ id: existing[0].id });
                                }
                              }}
                            >
                              Disconnect
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 border-white/10 bg-white/[0.04] px-2 text-[10px]"
                            onClick={() =>
                              connect.mutate({
                                workspaceId,
                                integrationType: c.id as any,
                                accountName: c.label,
                              })
                            }
                            disabled={connect.isPending}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Connect
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {integrations.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h3 className="text-sm font-heading font-bold text-foreground">Connected to this workspace</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            All accounts wired up here are isolated to {`"`}this{`"`} workspace only.
          </p>
          <ul className="mt-3 space-y-1.5">
            {integrations.map((i: any) => (
              <li key={i.id} className="flex items-center gap-2 text-[11px] text-white/70">
                <span className={`h-1.5 w-1.5 rounded-full ${i.enabled ? "bg-emerald-400" : "bg-white/25"}`} />
                <span className="font-semibold text-white/85">{i.integrationType}</span>
                <span className="text-white/40">·</span>
                <span className="truncate">{i.accountName || i.accountId || "no account label"}</span>
                <span className="ml-auto text-[10px] text-white/35">
                  {CONNECTOR_CATEGORY_BY_ID.get(i.integrationType) ?? "Other"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppliers tab
// ─────────────────────────────────────────────────────────────────────────────

function SuppliersTab({
  workspaceName,
  workflows,
  isLoading,
  onLaunch,
  onOpenSupplier,
}: {
  workspaceName: string;
  workflows: any[];
  isLoading: boolean;
  onLaunch: () => void;
  onOpenSupplier: () => void;
}) {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">Suppliers for {workspaceName}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sourcing, fulfillment, and restock runs scoped to this workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 border-white/10 bg-white/[0.04] text-xs" onClick={onOpenSupplier}>
            <Truck className="mr-1 h-3 w-3" />
            Supplier POs
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={onLaunch}>
            <Plus className="mr-1 h-3 w-3" />
            New supplier workflow
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SupplierTile icon={Package} label="Product sourcing" hint="Find products + suppliers that fit this store." />
        <SupplierTile icon={Truck} label="Fulfillment automation" hint="Auto-route orders to the right supplier." />
        <SupplierTile icon={Brain} label="Supply chain intel" hint="Lead times, stockouts, vendor risk." />
        <SupplierTile icon={Zap} label="Velocity restock" hint="Predict restock SKUs before they go OOS." />
      </div>

      {isLoading ? (
        <LoadingRow />
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No supplier workflows yet"
          body="Ask the Store Bot to source products, audit fulfillment, or predict restocks — runs will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {workflows.map((wf: any) => <WorkflowCard key={wf.id} workflow={wf} />)}
        </div>
      )}
    </div>
  );
}

function SupplierTile({ icon: Icon, label, hint }: { icon: typeof Bot; label: string; hint: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
      <Icon className="h-4 w-4 text-sky-300" />
      <p className="mt-2 text-[12px] font-semibold text-white/85">{label}</p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-white/40">{hint}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

function Panel({
  title,
  icon: Icon,
  children,
  actionLabel,
  onAction,
}: {
  title: string;
  icon: typeof Bot;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{title}</span>
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="flex items-center gap-1 text-[10px] text-white/30 transition-colors hover:text-sky-300"
          >
            {actionLabel} <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Section({
  title,
  icon: Icon,
  hint,
  children,
}: {
  title: string;
  icon: typeof Bot;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-sky-400" />
        <span className="text-xs font-semibold text-white/85">{title}</span>
      </div>
      {hint && <p className="mb-2 text-[10px] leading-relaxed text-white/40">{hint}</p>}
      {children}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
        active
          ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
          : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:border-white/15 hover:text-white/85"
      }`}
    >
      {children}
    </button>
  );
}

function WorkflowCard({ workflow }: { workflow: any }) {
  const tone = WORKFLOW_TONE[workflow.status] ?? WORKFLOW_TONE.cancelled;
  const Icon = tone.icon;
  const output = previewJson(workflow.output);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-white/85">{workflow.title}</p>
          <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-widest text-white/30">
            <Icon className={`h-3 w-3 ${workflow.status === "running" ? "animate-spin" : ""}`} />
            {tone.label}
            <span>·</span>
            <span>{workflow.workflowType?.replace(/_/g, " ")}</span>
          </div>
          {workflow.status === "completed" && output && (
            <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap rounded-lg border border-emerald-500/10 bg-emerald-500/[0.035] p-2 text-[10px] leading-relaxed text-emerald-100/65">
              {output.length > 360 ? `${output.slice(0, 360)}…` : output}
            </pre>
          )}
          {workflow.error && (
            <p className="mt-2 rounded-lg border border-red-500/15 bg-red-500/[0.04] p-2 text-[10px] text-red-200/70">
              {workflow.error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Bot;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8 text-center">
      <Icon className="mx-auto h-7 w-7 text-white/40" />
      <h3 className="mt-3 text-sm font-heading font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      {action && (
        <Button size="sm" className="mt-3 text-xs" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-white/35">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading…
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-3 text-[10px] leading-relaxed text-white/35">
      {text}
    </p>
  );
}
