/**
 * CommandPalette.tsx — Global ⌘K Command Palette
 *
 * Fast navigation to pages, bot workflows, and product search.
 * Open with ⌘K (Cmd+K on Mac, Ctrl+K on Windows/Linux), or programmatically
 * via the `useCommandPalette()` hook.
 *
 * Features:
 *  • Recent pages (last 5, localStorage-backed)
 *  • `g *` keyboard shortcut hints on navigation items
 *  • Quick Ask: prefix search with `> ` to open Chat with a pre-filled message
 *  • Workflow group visible in default (no-search) view
 *  • Larger, scrollable list (420 px)
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { getBrand } from "@/lib/platformBrand";
import {
  Search,
  Home,
  Package,
  Megaphone,
  BarChart3,
  Settings,
  Zap,
  ShoppingCart,
  MessageSquare,
  Shield,
  Layers,
  Sparkles,
  Inbox,
  GitBranch,
  Globe,
  Bot,
  CheckCircle,
  RotateCcw,
  TrendingUp,
  Store,
  Clock,
  ArrowRight,
} from "lucide-react";

// ─── Recent-pages persistence ──────────────────────────────────────────────────

const RECENTS_KEY = "cp-recent-pages";
const MAX_RECENTS = 5;

function getRecentPaths(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecentPath(path: string) {
  const existing = getRecentPaths().filter((p) => p !== path);
  const next = [path, ...existing].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* storage full – ignore */
  }
}

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;   // e.g. "g h"
  icon: React.ElementType;
  accent?: string;     // Tailwind color name for the icon bg
  action: () => void;
  group: "recent" | "navigation" | "workflows" | "actions" | "search";
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | undefined>(undefined);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    return { open: false, setOpen: () => {}, toggle: () => {} };
  }
  return ctx;
}

/** Optional wrapper that exposes the palette via context to anywhere in the tree.
 *  CommandPalette already exposes the same context internally, so use this only
 *  if you need the context above where <CommandPalette /> is mounted.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function CommandPalette({ children }: { children?: ReactNode } = {}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const storesQuery = trpc.stores.list.useQuery();
  const firstStore = storesQuery.data?.[0];

  // Quick-Ask mode: prefix with "> " to send a message to the bot
  const isQuickAsk = search.startsWith("> ") || search.startsWith(">");
  const quickAskQuery = isQuickAsk ? search.replace(/^>\s*/, "").trim() : "";

  const productsQuery = trpc.stores.products.useQuery(
    firstStore ? { storeId: firstStore.id, limit: 50, search } : { storeId: 0, limit: 0 },
    { enabled: Boolean(firstStore) && search.length > 2 && !isQuickAsk },
  );
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  // Recent pages: read on open, update when location changes
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  useEffect(() => {
    if (open) setRecentPaths(getRecentPaths());
  }, [open]);
  useEffect(() => {
    if (location !== "/") pushRecentPath(location);
    else pushRecentPath("/");
  }, [location]);

  // Register ⌘K globally
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const ctxValue = useMemo<CommandPaletteContextValue>(
    () => ({ open, setOpen, toggle: () => setOpen((o) => !o) }),
    [open],
  );

  const go = useCallback((path: string) => {
    setLocation(path);
    setOpen(false);
    setSearch("");
  }, [setLocation]);

  // Navigation entries — shortcut hints match DashboardLayout `g *` keys
  const navigationItems: CommandItem[] = [
    { id: "command-center",   label: "Command Center",         description: "Personalized overview of your operation",              shortcut: "g h", icon: Home,          accent: "sky",     action: () => go("/"),                              group: "navigation" },
    { id: "inbox",            label: "Inbox",                  description: "Approvals, activity & alerts",                         shortcut: "g i", icon: Inbox,         accent: "amber",   action: () => go("/inbox"),                         group: "navigation" },
    { id: "store-bot",        label: "Store Bot",              description: "One workspace for launch, ops, social, memory & tools", shortcut: "g b", icon: Bot,           accent: "fuchsia", action: () => go("/chat"),                          group: "navigation" },
    { id: "workflows",        label: "Workflows",              description: "Active and historical bot workflows",                   shortcut: "g w", icon: GitBranch,     accent: "sky",     action: () => go("/workflows"),                     group: "navigation" },
    { id: "workflow-builder", label: "Workflow Builder",       description: "Design custom automation workflows",                               icon: Zap,           accent: "violet",  action: () => go("/workflow-builder"),               group: "navigation" },
    { id: "integrations",     label: "Integrations",           description: "Connect stores, social & tools",                       shortcut: "g f", icon: Globe,         accent: "emerald", action: () => go("/storefronts"),                   group: "navigation" },
    { id: "analytics",        label: "Analytics",              description: "Per-store analytics & market intel",                   shortcut: "g n", icon: BarChart3,     accent: "cyan",    action: () => go("/insights"),                      group: "navigation" },
    { id: "settings",         label: "Settings",               description: "Profile, bot config, platform health",                 shortcut: "g s", icon: Settings,      accent: "slate",   action: () => go("/settings"),                      group: "navigation" },
    // Deep links — searchable aliases
    { id: "approvals",        label: "Approvals",              description: "Review pending bot decisions",                                     icon: Shield,        accent: "orange",  action: () => go("/inbox#approvals"),               group: "navigation" },
    { id: "activity",         label: "Activity Log",           description: "Bot task history",                                                  icon: Sparkles,      accent: "violet",  action: () => go("/inbox#activity"),                group: "navigation" },
    { id: "connect-store",    label: "Connect a Store",        description: "Add Shopify, WooCommerce & more",                                   icon: ShoppingCart,  accent: "emerald", action: () => go("/storefronts#integrations"),      group: "navigation" },
    { id: "connect-social",   label: "Connect Social Account", description: "Twitter, Instagram, TikTok & more",                                 icon: Megaphone,     accent: "fuchsia", action: () => go("/storefronts#social"),            group: "navigation" },
    { id: "chat",             label: "Bot Chat",               description: "Chat with the Store Bot workspace",                                  icon: MessageSquare, accent: "sky",     action: () => go("/chat"),                          group: "navigation" },
  ];

  // Workflow quick-launchers — all route to chat with the action in mind
  const workflowItems: CommandItem[] = [
    { id: "niche-research",       label: "Launch Niche Research",  description: "Find profitable niches",   icon: Sparkles,      accent: "fuchsia", action: () => go("/chat"), group: "workflows" },
    { id: "product-sourcing",     label: "Source Products",        description: "Find winning products",    icon: Zap,           accent: "amber",   action: () => go("/chat"), group: "workflows" },
    { id: "pricing-optimization", label: "Optimize Pricing",       description: "Set smart pricing rules",  icon: Layers,        accent: "sky",     action: () => go("/chat"), group: "workflows" },
    { id: "ad-campaign",          label: "Launch Ad Campaign",     description: "Create ads with AI copy",  icon: Megaphone,     accent: "orange",  action: () => go("/chat"), group: "workflows" },
    { id: "email-flow",           label: "Create Email Flow",      description: "Abandoned cart & welcome", icon: MessageSquare, accent: "emerald", action: () => go("/chat"), group: "workflows" },
    { id: "inventory-audit",      label: "Run Inventory Audit",    description: "Cross-store stock check",  icon: Store,         accent: "cyan",    action: () => go("/chat"), group: "workflows" },
  ];

  const actionItems: CommandItem[] = [
    { id: "mark-all-read",   label: "Mark all notifications read", description: "Clear unread badges",      icon: CheckCircle, accent: "emerald", action: () => { markAllRead.mutate(); setOpen(false); setSearch(""); }, group: "actions" },
    { id: "refresh-metrics", label: "Refresh dashboard metrics",   description: "Pull latest store data",   icon: RotateCcw,   accent: "sky",     action: () => { utils.dashboard.metrics.invalidate(); utils.dashboard.agentStatus.invalidate(); setOpen(false); setSearch(""); }, group: "actions" },
    { id: "goto-chat",       label: "Chat with Store Bot",         description: "Open the store workspace", icon: MessageSquare, accent: "fuchsia", action: () => go("/chat"),     group: "actions" },
    { id: "goto-insights",   label: "View top store insights",     description: "Revenue & performance",    icon: TrendingUp,  accent: "cyan",    action: () => go("/insights"), group: "actions" },
  ];

  const searchItems: CommandItem[] = (productsQuery.data ?? [])
    .slice(0, 5)
    .map((product: any) => {
      const brand = getBrand(product.platform);
      return {
        id: `product-${product.id}`,
        label: product.title,
        description: `${brand.icon} ${brand.name} • $${((product.price ?? 0) / 100).toFixed(2)}`,
        icon: Package,
        accent: "amber",
        action: () => {
          if (firstStore) go(`/stores/${firstStore.id}`);
        },
        group: "search" as const,
      };
    });

  // Build recent-page items from the path→nav label map
  const PATH_META: Record<string, { label: string; icon: React.ElementType; accent: string }> = {
    "/":               { label: "Command Center",   icon: Home,          accent: "sky"     },
    "/inbox":          { label: "Inbox",            icon: Inbox,         accent: "amber"   },
    "/chat":           { label: "Store Bot",        icon: Bot,           accent: "fuchsia" },
    "/workflows":      { label: "Workflows",        icon: GitBranch,     accent: "sky"     },
    "/workflow-builder": { label: "Workflow Builder", icon: Zap,          accent: "violet"  },
    "/storefronts":    { label: "Integrations",     icon: Globe,         accent: "emerald" },
    "/insights":       { label: "Analytics",        icon: BarChart3,     accent: "cyan"    },
    "/settings":       { label: "Settings",         icon: Settings,      accent: "slate"   },
  };
  const recentItems: CommandItem[] = recentPaths
    .filter((p) => p !== location)
    .slice(0, MAX_RECENTS)
    .map((p) => {
      const meta = PATH_META[p] ?? { label: "Page", icon: Clock, accent: "sky" };
      return {
        id: `recent-${p}`,
        label: meta.label,
        description: "Recently visited",
        icon: meta.icon,
        accent: meta.accent,
        action: () => go(p),
        group: "recent" as const,
      };
    });

  const allItems = [...navigationItems, ...workflowItems, ...actionItems, ...searchItems];

  // When Quick-Ask mode is active, skip normal filtering
  const filtered = isQuickAsk
    ? []
    : search
    ? allItems.filter((item) =>
        `${item.label} ${item.description}`.toLowerCase().includes(search.toLowerCase()),
      )
    : [...navigationItems, ...workflowItems, ...actionItems];

  const grouped = {
    recent:     recentItems,
    navigation: filtered.filter((i) => i.group === "navigation"),
    workflows:  filtered.filter((i) => i.group === "workflows"),
    actions: filtered.filter((i) => i.group === "actions"),
    search: filtered.filter((i) => i.group === "search"),
  };

  return (
    <CommandPaletteContext.Provider value={ctxValue}>
      {children}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
        <DialogContent
          showCloseButton={false}
          className="overflow-hidden p-0 max-w-[560px] w-[calc(100vw-2rem)]"
        >
          <Command
            shouldFilter={false}
            className="bg-transparent [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-white/30"
            onKeyDown={(e) => {
              if (isQuickAsk && e.key === "Enter" && quickAskQuery) {
                e.preventDefault();
                sessionStorage.setItem("cp-prefill", quickAskQuery);
                go("/chat");
              }
            }}
          >
            {/* ── Search bar ───────────────────────────────────────── */}
            <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-3.5 py-0">
              {isQuickAsk ? (
                <ArrowRight className="h-4 w-4 shrink-0 text-sky-400" />
              ) : (
                <Search className="h-4 w-4 shrink-0 text-white/40" />
              )}
              <Command.Input
                placeholder={isQuickAsk ? "Ask the Store Bot…" : "Search pages, workflows, products…"}
                value={search}
                onValueChange={setSearch}
                className="flex h-12 w-full bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="shrink-0 text-[10px] text-white/30 hover:text-white/60 transition-colors font-mono"
                >
                  esc
                </button>
              )}
            </div>

            {/* ── Quick-Ask: send a message directly to the bot ──── */}
            {isQuickAsk && (
              <div className="px-3 py-2">
                <button
                  type="button"
                  disabled={!quickAskQuery}
                  onClick={() => {
                    if (!quickAskQuery) return;
                    sessionStorage.setItem("cp-prefill", quickAskQuery);
                    go("/chat");
                  }}
                  className="w-full flex items-center gap-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.07] px-3.5 py-2.5 text-left transition-all hover:border-sky-500/40 hover:bg-sky-500/[0.10] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="w-7 h-7 rounded-md bg-sky-500/15 border border-sky-500/25 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-sky-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400/80 mb-0.5">Ask Store Bot</p>
                    <p className="text-sm text-white/80 truncate">{quickAskQuery || "Type your question…"}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-sky-400/60 shrink-0" />
                </button>
                <p className="mt-1.5 px-1 text-[10px] text-white/25">Press ↵ to open chat with this message</p>
              </div>
            )}

            {/* ── Result list ─────────────────────────────────────── */}
            {!isQuickAsk && (
              <Command.List className="max-h-[420px] overflow-y-auto overflow-x-hidden custom-scrollbar">
                <Command.Empty className="py-10 text-center">
                  <p className="text-sm text-white/40">No results for <span className="text-white/60">"{search}"</span></p>
                  <p className="mt-1.5 text-[11px] text-white/25">Try <kbd className="font-mono">&gt;&nbsp;</kbd> to ask the bot directly</p>
                </Command.Empty>

                {/* Recents — only when no active search */}
                {!search && grouped.recent.length > 0 && (
                  <Command.Group heading="Recent">
                    {grouped.recent.map((item) => (
                      <PaletteItem key={item.id} item={item} />
                    ))}
                  </Command.Group>
                )}

                {grouped.navigation.length > 0 && (
                  <Command.Group heading={search ? "Pages" : "Navigation"}>
                    {grouped.navigation.map((item) => (
                      <PaletteItem key={item.id} item={item} />
                    ))}
                  </Command.Group>
                )}

                {grouped.workflows.length > 0 && (
                  <Command.Group heading="Quick Workflows">
                    {grouped.workflows.map((item) => (
                      <PaletteItem key={item.id} item={item} />
                    ))}
                  </Command.Group>
                )}

                {grouped.actions.length > 0 && (
                  <Command.Group heading="Actions">
                    {grouped.actions.map((item) => (
                      <PaletteItem key={item.id} item={item} />
                    ))}
                  </Command.Group>
                )}

                {grouped.search.length > 0 && (
                  <Command.Group heading="Products">
                    {grouped.search.map((item) => (
                      <PaletteItem key={item.id} item={item} />
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            )}

            {/* ── Footer hints ─────────────────────────────────────── */}
            <div className="border-t border-white/[0.06] px-3.5 py-2 flex items-center gap-3">
              <span className="text-[10px] text-white/25 flex items-center gap-1.5">
                <Kbd>↑↓</Kbd> navigate
              </span>
              <span className="text-[10px] text-white/25 flex items-center gap-1.5">
                <Kbd>↵</Kbd> open
              </span>
              <span className="text-[10px] text-white/25 flex items-center gap-1.5">
                <Kbd>esc</Kbd> close
              </span>
              <span className="ml-auto text-[10px] text-white/20 flex items-center gap-1">
                type <Kbd>&gt;</Kbd> to ask bot
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </CommandPaletteContext.Provider>
  );
}

// ─── Accent color map ─────────────────────────────────────────────────────────
const ACCENT_BG: Record<string, string> = {
  sky:     "bg-sky-500/15 border-sky-500/25 text-sky-300",
  fuchsia: "bg-fuchsia-500/15 border-fuchsia-500/25 text-fuchsia-300",
  amber:   "bg-amber-500/15 border-amber-500/25 text-amber-300",
  orange:  "bg-orange-500/15 border-orange-500/25 text-orange-300",
  emerald: "bg-emerald-500/15 border-emerald-500/25 text-emerald-300",
  cyan:    "bg-cyan-500/15 border-cyan-500/25 text-cyan-300",
  violet:  "bg-violet-500/15 border-violet-500/25 text-violet-300",
  slate:   "bg-white/[0.06] border-white/[0.10] text-white/50",
};

// ─── PaletteItem ──────────────────────────────────────────────────────────────
function PaletteItem({ item }: { item: CommandItem }) {
  const Icon = item.icon;
  const iconCls = ACCENT_BG[item.accent ?? "sky"] ?? ACCENT_BG.sky;
  return (
    <Command.Item
      key={item.id}
      value={`${item.id} ${item.label} ${item.description ?? ""}`}
      onSelect={item.action}
      className="group mx-1.5 mb-px flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-all data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-white"
    >
      <span className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 transition-all group-data-[selected=true]:scale-[0.95] ${iconCls}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium text-white/85 group-data-[selected=true]:text-white">{item.label}</span>
        {item.description && (
          <span className="truncate text-[11px] text-white/35 group-data-[selected=true]:text-white/50">{item.description}</span>
        )}
      </div>
      {item.shortcut && (
        <span className="shrink-0 hidden sm:flex items-center gap-0.5">
          {item.shortcut.split(" ").map((k, i) => (
            <Kbd key={i}>{k}</Kbd>
          ))}
        </span>
      )}
    </Command.Item>
  );
}

// ─── Kbd ──────────────────────────────────────────────────────────────────────
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="pointer-events-none inline-flex h-4.5 min-w-[1.1rem] select-none items-center justify-center rounded border border-white/[0.12] bg-white/[0.05] px-1 font-mono text-[9px] font-medium text-white/30">
      {children}
    </kbd>
  );
}
