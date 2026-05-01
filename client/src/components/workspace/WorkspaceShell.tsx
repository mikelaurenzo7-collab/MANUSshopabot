/**
 * WorkspaceShell — chrome around every per-store workspace page.
 *
 * The product model is "each connected store is its own workspace with
 * lots of room to work". Operators don't think in cross-store sidebar
 * pages — they think in *this store*: chat with its bot, run its
 * workflows, see its memory, manage its connectors. The shell here
 * makes that mental model the visual one.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │ [< Back to all stores]  ▌STORE NAME · platform pill · live ●  │  <- breadcrumb band
 *   │ ───────────────────────────────────────────────────────────── │  <- platform-tinted hairline
 *   │ Chat · Workflows · Builder · Connectors · Memory · …          │  <- workspace sub-nav
 *   ├────────────────────────────────────────────────────────────────┤
 *   │                                                                │
 *   │                       page content                             │
 *   │                                                                │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Every visual choice keys off the active store's `platform` so each
 * workspace has subtle brand identity (Shopify green ribbon, Amazon
 * orange, etc.) — a glance tells the operator which store they're in
 * even if they have ten tabs open.
 *
 * The shell self-syncs `WorkspaceContext.activeStoreId` to the store
 * id in the URL so existing context-scoped pages and queries continue
 * to work without modification.
 */
import { createContext, ReactNode, useContext, useEffect, useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { getBrand } from "@/lib/platformBrand";
import { useWorkspacePersona, resolvePersonaName } from "@/hooks/useWorkspacePersona";
import { QuickAskFab } from "./QuickAskFab";

/**
 * Context broadcast by WorkspaceShell so nested pages know they're rendered
 * inside the workspace chrome and can suppress their own redundant
 * PageHeader / store switcher / breadcrumb. The default `false` means
 * pages render their full chrome when used at the top level (e.g.
 * /workflows), and skip it when wrapped (e.g. /store/:id/workflows).
 *
 * Pages opt in by calling `useIsInsideWorkspaceShell()` and rendering
 * conditionally — see `pages/Chat.tsx` and `pages/Workflows.tsx`.
 */
const WorkspaceShellContext = createContext<{ inside: boolean; storeId: number | null }>({
  inside: false,
  storeId: null,
});

/** True when the calling component is nested inside a `<WorkspaceShell>`. */
export function useIsInsideWorkspaceShell(): boolean {
  return useContext(WorkspaceShellContext).inside;
}

/** Return the active workspace storeId from shell context, or `null`. */
export function useWorkspaceShellStoreId(): number | null {
  return useContext(WorkspaceShellContext).storeId;
}
import {
  ArrowLeft,
  ChevronDown,
  MessageSquare,
  GitBranch,
  Wrench,
  Plug,
  Brain,
  ScrollText,
  BarChart3,
  Activity as ActivityIcon,
  ChevronRight,
  Store as StoreIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface WorkspaceTabSpec {
  id: WorkspaceTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Optional badge count surfaced as a pill. */
  badge?: number;
  /** Live status dot color when this tab has activity worth surfacing. */
  dot?: "ok" | "running" | "error";
}

export type WorkspaceTabId =
  | "overview"
  | "chat"
  | "workflows"
  | "builder"
  | "connectors"
  | "memory"
  | "instructions"
  | "insights"
  | "activity";

/** Canonical tab order for the workspace sub-nav. */
const TAB_REGISTRY: Record<WorkspaceTabId, { label: string; icon: WorkspaceTabSpec["icon"]; subroute: string }> = {
  overview:     { label: "Overview",     icon: ActivityIcon,   subroute: "" },
  chat:         { label: "Chat",         icon: MessageSquare,  subroute: "chat" },
  workflows:    { label: "Workflows",    icon: GitBranch,      subroute: "workflows" },
  builder:      { label: "Builder",      icon: Wrench,         subroute: "builder" },
  connectors:   { label: "Connectors",   icon: Plug,           subroute: "connectors" },
  memory:       { label: "Memory",       icon: Brain,          subroute: "memory" },
  instructions: { label: "Instructions", icon: ScrollText,     subroute: "instructions" },
  insights:     { label: "Insights",     icon: BarChart3,      subroute: "insights" },
  activity:     { label: "Activity",     icon: ActivityIcon,   subroute: "activity" },
};

const DEFAULT_TAB_ORDER: WorkspaceTabId[] = [
  "overview", "chat", "workflows", "builder", "connectors", "memory", "instructions", "insights", "activity",
];

interface WorkspaceShellProps {
  /** Currently-active workspace tab. Drives the visual selection in the sub-nav. */
  activeTab: WorkspaceTabId;
  /** Optional badge counts per tab (workflows running, pending approvals, etc.). */
  tabBadges?: Partial<Record<WorkspaceTabId, number>>;
  /** Optional dot indicators per tab. */
  tabDots?: Partial<Record<WorkspaceTabId, "ok" | "running" | "error">>;
  /** Additional tabs to render beyond the default order (rare). */
  extraTabs?: WorkspaceTabId[];
  /** Optional right-aligned slot in the breadcrumb band (e.g. action buttons). */
  rightSlot?: ReactNode;
  children: ReactNode;
}

export function WorkspaceShell({
  activeTab,
  tabBadges = {},
  tabDots = {},
  extraTabs = [],
  rightSlot,
  children,
}: WorkspaceShellProps) {
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ storeId: string }>("/store/:storeId/:rest*");
  const storeId = params?.storeId ? Number(params.storeId) : null;
  const { activeStoreId, setActiveStoreId } = useWorkspace();

  // Sync the URL store id back into context so existing context-scoped
  // queries (which key off `activeStoreId`) still work without each
  // page needing to be rewritten.
  useEffect(() => {
    if (storeId && storeId !== activeStoreId) setActiveStoreId(storeId);
  }, [storeId, activeStoreId, setActiveStoreId]);

  const { data: stores } = trpc.stores.list.useQuery();
  const store = useMemo(
    () => (stores ?? []).find((s: any) => s.id === storeId) ?? null,
    [stores, storeId],
  );
  const otherStores = useMemo(
    () => (stores ?? []).filter((s: any) => s.id !== storeId),
    [stores, storeId],
  );

  // Resolve platform brand for this store so we can tint the chrome
  // with the store's identity (Shopify green ribbon, Amazon orange, etc.).
  const brand = useMemo(() => getBrand(store?.platform ?? "shopify"), [store?.platform]);

  // Per-store bot persona — the operator can give each workspace's bot
  // a unique name + avatar emoji ("Brewbot", "🍺"). When unset, the
  // mark stays as the platform glyph and the canonical "Store Bot" name
  // is used everywhere the persona surfaces.
  const { persona } = useWorkspacePersona(storeId);
  const hasPersona = Boolean(persona.emoji.trim() || persona.name.trim());

  // ── Live sub-nav badges ─────────────────────────────────────────────
  // The shell fetches its own per-store badge counts so every workspace
  // surface gets live indicators for free without each page having to
  // wire them. Caller-supplied `tabBadges` / `tabDots` always take
  // precedence — pages can override (e.g. WorkspaceOverview already
  // computes these itself and passes them in).
  const liveWorkflows = trpc.workflows.list.useQuery(
    { storeId: storeId!, limit: 12 },
    { enabled: !!storeId, refetchInterval: 15_000 },
  );
  const liveBadgesAndDots = useMemo(() => {
    const wfRows = (liveWorkflows.data as any[]) ?? [];
    const running = wfRows.filter((w) => w.status === "running" || w.status === "pending").length;
    const failed = wfRows.filter((w) => w.status === "failed").length;
    const awaitingApproval = wfRows.filter((w) => w.status === "awaiting_approval").length;
    return {
      badges: { workflows: running, activity: awaitingApproval } as Partial<Record<WorkspaceTabId, number>>,
      dots: {
        workflows: failed > 0 ? "error" : running > 0 ? "running" : undefined,
      } as Partial<Record<WorkspaceTabId, "ok" | "running" | "error" | undefined>>,
    };
  }, [liveWorkflows.data]);

  // Shared tab list — ordered so the most-used surfaces sit first.
  const tabs: WorkspaceTabSpec[] = useMemo(() => {
    const order = [...DEFAULT_TAB_ORDER, ...extraTabs.filter((t) => !DEFAULT_TAB_ORDER.includes(t))];
    return order.map((id) => ({
      id,
      label: TAB_REGISTRY[id].label,
      icon: TAB_REGISTRY[id].icon,
      // Caller-supplied badge wins; otherwise fall back to the shell's
      // live signal so every workspace tab is informative on first paint.
      badge: tabBadges[id] ?? liveBadgesAndDots.badges[id],
      dot: tabDots[id] ?? (liveBadgesAndDots.dots[id] as "ok" | "running" | "error" | undefined),
    }));
  }, [extraTabs, tabBadges, tabDots, liveBadgesAndDots]);

  const tabHref = (id: WorkspaceTabId): string => {
    if (!storeId) return "/";
    const sub = TAB_REGISTRY[id].subroute;
    return sub ? `/store/${storeId}/${sub}` : `/store/${storeId}`;
  };

  const isActive = store?.status === "active";
  // `updatedAt` stands in for "last sync" — the stores schema doesn't
  // currently surface a dedicated lastSyncedAt timestamp, but every
  // adapter touches `updatedAt` after a successful sync so the value
  // is the right grain for the operator to read.
  const lastSyncTs = store?.updatedAt ? new Date(store.updatedAt) : null;

  if (!store && stores) {
    // Store id in URL doesn't resolve — operator probably bookmarked a
    // disconnected store. Surface a friendly explainer with a route back.
    return (
      <div className="page-enter flex h-full min-h-0 flex-col items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-4">
          <div className="text-6xl">🛒</div>
          <h2 className="text-2xl font-bold text-white/90">Store not found</h2>
          <p className="text-sm text-white/55 leading-relaxed">
            This workspace isn't connected to your account. It may have been disconnected or
            belong to a different organization.
          </p>
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/15 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Command Center
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter flex h-full min-h-0 flex-col">
      {/* ── Workspace identity band ─────────────────────────────────── */}
      <div
        className="shrink-0 relative overflow-hidden border-b border-white/[0.06]"
        style={
          {
            // Each workspace gets a hairline platform ribbon so a glance
            // tells the operator which store they're in.
            "--brand": brand.color,
            "--brand-accent": brand.accent,
          } as React.CSSProperties
        }
      >
        {/* Platform-tinted ribbon */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${brand.color}, ${brand.accent}, transparent)`,
            opacity: 0.65,
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 60% 40% at 12% -10%, ${brand.color}1a, transparent 70%), radial-gradient(ellipse 40% 30% at 90% -10%, ${brand.accent}10, transparent 70%)`,
          }}
          aria-hidden="true"
        />

        {/* Breadcrumb + identity row */}
        <div className="relative px-3 sm:px-4 md:px-6 pt-3 sm:pt-3.5 pb-2 flex items-start gap-3">
          <Link
            href="/"
            aria-label="Back to Command Center"
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-mono text-white/65 hover:text-white/95 transition-colors mt-1.5 tap-compact"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">All stores</span>
          </Link>

          <div className="min-w-0 flex-1 flex items-center gap-2.5 sm:gap-3">
            {/* Store mark — platform glyph in a brand-tinted plate.
                When workflows are running for this store the plate
                gets a soft animated ring keyed off the platform color
                so the operator sees the workspace is *alive* without
                having to scan for indicators. The class flips back to
                static when nothing's in flight. */}
            {(() => {
              const running = (liveBadgesAndDots.dots.workflows ?? null) === "running";
              return (
                <div className="relative shrink-0">
                  <div
                    className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center text-base sm:text-lg shadow-[0_4px_16px_rgba(0,0,0,0.3)] ${
                      running ? "workspace-mark-pulsing" : ""
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${brand.color}22, ${brand.accent}10)`,
                      border: `1px solid ${brand.color}40`,
                      boxShadow: `0 0 18px ${brand.color}1a, inset 0 1px 0 rgba(255,255,255,0.06)`,
                    }}
                    aria-hidden="true"
                    data-running={running ? "true" : "false"}
                  >
                    <span>{brand.icon}</span>
                  </div>
                  {/* Persona micro-avatar — small emoji badge tucked at
                      the bottom-right of the platform mark. Only renders
                      when the operator has named this workspace's bot. */}
                  {hasPersona && persona.emoji && (
                    <span
                      className="absolute -bottom-1 -right-1 h-4 w-4 sm:h-[18px] sm:w-[18px] rounded-full flex items-center justify-center text-[10px] sm:text-[11px] bg-[#0a0a0f] ring-1 ring-white/10"
                      aria-label={`Bot persona: ${resolvePersonaName(persona)}`}
                      title={resolvePersonaName(persona)}
                    >
                      {persona.emoji}
                    </span>
                  )}
                </div>
              );
            })()}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Switch-store dropdown attached to the workspace name */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="group inline-flex items-center gap-1.5 max-w-full min-w-0 hover:bg-white/[0.04] rounded-md px-1 -mx-1 transition-colors"
                      aria-label={`Switch workspace (current: ${store?.name ?? "loading"})`}
                    >
                      <h1 className="text-[15px] sm:text-[17px] font-heading font-bold tracking-tight text-white truncate">
                        {store?.name ?? "Workspace"}
                      </h1>
                      <ChevronDown className="w-3.5 h-3.5 text-white/65 shrink-0 group-hover:text-sky-300 transition-colors" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64 bg-[#0a0a0f] border-white/10">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-white/55">
                      Switch workspace
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {otherStores.length === 0 && (
                      <div className="px-2 py-3 text-[11px] text-white/70">
                        No other connected stores yet.
                      </div>
                    )}
                    {otherStores.map((s: any) => {
                      const b = getBrand(s.platform);
                      return (
                        <DropdownMenuItem
                          key={s.id}
                          onSelect={() => setLocation(`/store/${s.id}`)}
                          className="cursor-pointer"
                        >
                          <span className="text-base mr-2">{b.icon}</span>
                          <span className="truncate flex-1">{s.name}</span>
                          <span className="ml-2 text-[10px] text-white/65">{b.name}</span>
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setLocation("/storefronts#integrations")}
                      className="cursor-pointer text-sky-300"
                    >
                      <Plug className="w-3.5 h-3.5 mr-2" /> Connect another store
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Platform pill */}
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest"
                  style={{
                    borderColor: `${brand.color}40`,
                    background: `${brand.color}12`,
                    color: brand.color,
                  }}
                >
                  {brand.name}
                </span>

                {/* Live status pill */}
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    isActive
                      ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300"
                      : "border-white/10 bg-white/[0.03] text-white/50"
                  }`}
                >
                  <span
                    className={`w-1 h-1 rounded-full ${
                      isActive ? "bg-emerald-400 animate-pulse" : "bg-white/30"
                    }`}
                    aria-hidden="true"
                  />
                  {isActive ? "Live" : store?.status ?? "—"}
                </span>
              </div>
              {lastSyncTs && (
                <p className="text-[10px] font-mono text-white/55 mt-0.5 truncate">
                  Last sync · {lastSyncTs.toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {rightSlot && <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">{rightSlot}</div>}
        </div>

        {/* ── Workspace sub-nav ───────────────────────────────────────
            Proper ARIA tab strip: each Link is `role="tab"` with
            aria-selected and aria-controls pointing to the workspace
            body container. Arrow keys roam between tabs (Left/Right
            cycle, Home/End jump to first/last) — the standard WAI-ARIA
            pattern. Tab key still moves to the next tabbable element
            outside the tablist (the panel), so keyboard users can move
            forward through the page after browsing the strip. */}
        <div className="relative px-2 sm:px-3 md:px-5 pb-1 overflow-x-auto no-scrollbar">
          <nav
            role="tablist"
            aria-label="Workspace sections"
            className="flex items-center gap-0.5 sm:gap-1 min-w-max"
            onKeyDown={(e) => {
              const key = e.key;
              if (
                key !== "ArrowRight" &&
                key !== "ArrowLeft" &&
                key !== "Home" &&
                key !== "End"
              ) {
                return;
              }
              const root = e.currentTarget as HTMLElement;
              const items = Array.from(
                root.querySelectorAll<HTMLAnchorElement>('[role="tab"]'),
              );
              if (items.length === 0) return;
              const current = items.indexOf(document.activeElement as HTMLAnchorElement);
              let next = current;
              if (key === "ArrowRight") next = current < 0 ? 0 : (current + 1) % items.length;
              else if (key === "ArrowLeft") next = current <= 0 ? items.length - 1 : current - 1;
              else if (key === "Home") next = 0;
              else if (key === "End") next = items.length - 1;
              if (next !== current && items[next]) {
                e.preventDefault();
                items[next].focus();
              }
            }}
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <Link
                  key={t.id}
                  href={tabHref(t.id)}
                  role="tab"
                  id={`workspace-tab-${t.id}`}
                  aria-selected={active}
                  aria-controls="workspace-panel"
                  // Roving tabindex: only the active tab is in the tab
                  // sequence; arrow keys move focus among the rest. This
                  // is the WAI-ARIA tabs pattern (manual activation).
                  tabIndex={active ? 0 : -1}
                  className={`workspace-tab-pill ${active ? "is-active" : ""}`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[12px] font-medium whitespace-nowrap">{t.label}</span>
                  {typeof t.badge === "number" && t.badge > 0 && (
                    <span
                      className={`ml-0.5 inline-flex items-center justify-center rounded-full px-1.5 text-[9px] font-bold leading-tight h-4 min-w-[16px] ${
                        active
                          ? "bg-sky-400/20 text-sky-100"
                          : "bg-white/[0.08] text-white/65"
                      }`}
                      aria-label={`${t.badge} ${t.label.toLowerCase()}`}
                    >
                      {t.badge > 99 ? "99+" : t.badge}
                    </span>
                  )}
                  {t.dot && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        t.dot === "running"
                          ? "bg-amber-400 animate-pulse"
                          : t.dot === "error"
                            ? "bg-red-400 animate-pulse"
                            : "bg-emerald-400"
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ── Workspace body ───────────────────────────────────────────
          `id="workspace-panel"` matches the `aria-controls` set on every
          tab in the strip above so screen-reader users get the proper
          tablist/tabpanel relationship instead of a bag of orphan tabs. */}
      <div
        id="workspace-panel"
        role="tabpanel"
        aria-labelledby={`workspace-tab-${activeTab}`}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar scroll-touch"
      >
        <WorkspaceShellContext.Provider value={{ inside: true, storeId: storeId ?? null }}>
          {children}
        </WorkspaceShellContext.Provider>
      </div>

      {/* Persistent quick-ask FAB — present on every workspace surface
          except the Chat tab itself (where the input IS the surface).
          The pill expands into a small prompt popover and routes into
          the workspace's chat with the prompt prefilled. */}
      {activeTab !== "chat" && <QuickAskFab storeId={storeId ?? null} />}
    </div>
  );
}

/** Convenience hook for resolving the URL `:storeId` param + the store. */
export function useWorkspaceStore() {
  const [, params] = useRoute<{ storeId: string }>("/store/:storeId/:rest*");
  const storeId = params?.storeId ? Number(params.storeId) : null;
  const { data: stores } = trpc.stores.list.useQuery();
  const store = useMemo(
    () => (stores ?? []).find((s: any) => s.id === storeId) ?? null,
    [stores, storeId],
  );
  const brand = useMemo(() => getBrand(store?.platform ?? "shopify"), [store?.platform]);
  return { storeId, store, brand };
}

/** Compact Tab pill primitive — exposed so other surfaces can re-use the workspace tab look. */
export function WorkspaceCrumbLink({ to, label, icon: Icon }: { to: string; label: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <Link
      href={to}
      className="inline-flex items-center gap-1.5 text-[11px] text-white/55 hover:text-sky-300 transition-colors"
    >
      {Icon && <Icon className="w-3 h-3" />}
      <span>{label}</span>
      <ChevronRight className="w-3 h-3 opacity-50" />
    </Link>
  );
}

/** Re-export icon helper so the empty-state has a default. */
export { StoreIcon };
