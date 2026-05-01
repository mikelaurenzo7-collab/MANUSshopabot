/**
 * DashboardLayout — primary chrome around the authenticated app.
 *
 * The sidebar is intentionally compact (7 destinations, no group headers)
 * with everything else folded into tabbed shell pages: Inbox handles
 * Activity + Approvals; Storefronts & Channels handles Connections +
 * Plugins + Supplier POs + Email; Insights handles per-store + cross-store
 * + campaign analytics; Settings handles Profile + Members + Bot Settings
 * + Platform Health (admin). Live status comes from `dashboard.agentStatus`,
 * `approvals.pending`, `connectors.connectionSummary`, and `stores.list`.
 */
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useIsMobile, useIsNarrow } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  Inbox as InboxIcon,
  Bot,
  GitBranch,
  Globe,
  BarChart3,
  Settings as SettingsIcon,
  ChevronDown,
  LogOut,
  Menu,
  Zap,
  Search,
  Store,
  Brain,
  ScrollText,
  Activity as ActivityIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BrandName, BRAND_NAME } from "@/components/BrandName";
import { useCommandPalette } from "@/components/CommandPalette";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { getBrand } from "@/lib/platformBrand";

interface NavItem {
  title: string;
  path?: string;
  icon?: any;
  badge?: number;
  /** Live colored dot rendered to the right of the label (e.g. bot status). */
  dot?: "ok" | "running" | "error" | null;
  /** Bot brand dot (purely visual). */
  brand?: "sky" | "cyan" | "amber" | "emerald";
  /** Sub-item: indented under parent, smaller style */
  sub?: boolean;
  /** Section header (e.g. "BOTS", "OPERATIONS") */
  section?: boolean;
}

function statusDotClass(status: NavItem["dot"]): string | null {
  switch (status) {
    case "running":
      return "bg-amber-400 animate-pulse";
    case "ok":
      return "bg-emerald-400";
    case "error":
      return "bg-red-400 animate-pulse";
    default:
      return null;
  }
}

function brandDotClass(brand: NavItem["brand"]): string | null {
  switch (brand) {
    case "sky":
      return "bg-sky-400";
    case "cyan":
      return "bg-cyan-400";
    case "amber":
      return "bg-amber-400";
    case "emerald":
      return "bg-emerald-400";
    default:
      return null;
  }
}

/**
 * WorkspaceSidebarNav — compact stack of the per-workspace surfaces
 * (Overview · Chat · Workflows · Builder · Connectors · Memory ·
 * Instructions · Insights). Mounts only when the operator is inside a
 * `/store/:id/*` route, so global pages keep the cleaner top-level nav.
 *
 * Defined inline in DashboardLayout so it can re-use the layout's
 * link styling (no separate CSS surface to keep in sync).
 */
function WorkspaceSidebarNav({ storeId, location }: { storeId: number; location: string }) {
  const items: Array<{ id: string; label: string; sub: string; icon: any }> = [
    { id: "overview",     label: "Overview",     sub: "",             icon: LayoutDashboard },
    { id: "chat",         label: "Chat",         sub: "chat",         icon: Bot },
    { id: "workflows",    label: "Workflows",    sub: "workflows",    icon: GitBranch },
    { id: "builder",      label: "Builder",      sub: "builder",      icon: Zap },
    { id: "connectors",   label: "Connectors",   sub: "connectors",   icon: Globe },
    { id: "memory",       label: "Memory",       sub: "memory",       icon: Brain },
    { id: "instructions", label: "Instructions", sub: "instructions", icon: ScrollText },
    { id: "insights",     label: "Insights",     sub: "insights",     icon: BarChart3 },
    { id: "activity",     label: "Activity",     sub: "activity",     icon: ActivityIcon },
  ];
  const baseHref = `/store/${storeId}`;
  return (
    <div
      className="mt-1 ml-1 pl-2 border-l border-white/[0.06] space-y-px relative"
      role="navigation"
      aria-label="Workspace sections"
    >
      {/* Vertical accent rail keyed off the active workspace */}
      <span
        className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-sky-400/40 via-cyan-400/30 to-transparent"
        aria-hidden="true"
      />
      {items.map((item) => {
        const href = item.sub ? `${baseHref}/${item.sub}` : baseHref;
        const isActive =
          item.sub === ""
            ? location === baseHref
            : location === href || location.startsWith(`${href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={href}
            className={`flex items-center h-6 pl-2 pr-2 rounded-md transition-colors text-[11.5px] ${
              isActive
                ? "bg-sky-500/[0.10] text-sky-200 font-semibold"
                : "text-white/55 hover:text-white/85 hover:bg-white/[0.03]"
            }`}
          >
            <Icon
              className={`w-3 h-3 mr-1.5 shrink-0 ${
                isActive ? "text-sky-300" : "opacity-55"
              }`}
              aria-hidden="true"
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isNarrow = useIsNarrow();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Manual override: clicking the rail toggle in narrow mode pins the sidebar
  // expanded for that session. null = auto (follow viewport).
  const [railOverride, setRailOverride] = useState<boolean | null>(null);
  const railMode = railOverride === null ? isNarrow : railOverride;
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const { activeStoreId, setActiveStoreId } = useWorkspace();

  // ── Keyboard nav: press `g` then a letter to jump. Linear/GitHub style. ──
  // Only active outside text inputs; the leader key (`g`) is consumed only
  // when followed within 1.2s by a recognised target letter — otherwise the
  // browser's normal `g` behavior is preserved. Press `?` to discover all
  // shortcuts.
  const leaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaderActiveRef = useRef(false);
  // Mobile bottom-nav: track previous tab index for directional slide animation
  const prevNavIdxRef = useRef<number>(-1);
  const mobileMainRef = useRef<HTMLElement>(null);
  // Timeout ID for clearing data-nav-dir; stored so rapid taps cancel the prior timer
  const navDirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    /**
     * Build the leader-key target map. When the operator is inside a
     * per-store workspace (`/store/:id/*`), the chat / workflows /
     * builder / connectors / memory / instructions / insights /
     * activity letters route into THIS workspace instead of the
     * global page. Everything else (home, inbox, settings) stays
     * cross-store. The Command Center letter `c` also doubles as
     * "back to All stores" when nested — operators get out without
     * reaching for the back button.
     */
    const buildTargets = (): Record<string, string> => {
      const m = location.match(/^\/store\/(\d+)(?:\/|$)/);
      if (m) {
        const base = `/store/${m[1]}`;
        return {
          h: "/", c: "/", // back to Command Center (escape the workspace)
          i: "/inbox",
          // Workspace-scoped — leader keys route into this store.
          b: `${base}/chat`,    // `b` historically = bots, now = this store's chat
          m: `${base}/chat`,
          o: `${base}/overview`,
          w: `${base}/workflows`,
          y: `${base}/builder`,  // 'y' free letter for builder
          f: `${base}/connectors`,
          r: `${base}/memory`,   // 'r' for "Remember"
          x: `${base}/instructions`,
          n: `${base}/insights`,
          a: `${base}/activity`,
          s: "/settings",
        };
      }
      return {
        h: "/", c: "/", // home / command center
        i: "/inbox",
        // Legacy bot shortcuts now converge on the unified Store Bot workspace.
        b: "/chat",
        m: "/chat",
        o: "/chat",    // `s` is taken by Settings
        w: "/workflows",
        f: "/storefronts", // storefronts
        n: "/insights",   // iNsights
        s: "/settings",
      };
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // `?` — open shortcut help overlay (Shift+/ on US layouts)
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }
      // Esc closes the help overlay
      if (e.key === "Escape" && helpOpen) {
        setHelpOpen(false);
        return;
      }

      if (leaderActiveRef.current) {
        // Recompute targets per-keystroke — the active workspace can
        // change between leader presses if the operator just navigated.
        const targets = buildTargets();
        const dest = targets[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          setLocation(dest);
        }
        leaderActiveRef.current = false;
        if (leaderTimerRef.current) clearTimeout(leaderTimerRef.current);
        return;
      }
      if (e.key === "g" && !e.shiftKey) {
        leaderActiveRef.current = true;
        if (leaderTimerRef.current) clearTimeout(leaderTimerRef.current);
        leaderTimerRef.current = setTimeout(() => { leaderActiveRef.current = false; }, 1200);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (leaderTimerRef.current) clearTimeout(leaderTimerRef.current);
      if (navDirTimerRef.current) clearTimeout(navDirTimerRef.current);
    };
  }, [user, setLocation, helpOpen]);

  const { data: pendingApprovals } = trpc.approvals.pending.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const pendingCount = pendingApprovals?.length ?? 0;

  const { data: agentStatus } = trpc.dashboard.agentStatus.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 15_000,
  });

  const { data: stores } = trpc.stores.list.useQuery(undefined, {
    enabled: !!user,
  });

  const totalRunning = ((agentStatus as any[]) ?? []).reduce(
    (a: number, s: any) => a + (s?.running ?? 0),
    0,
  );
  const hasAgentErrors = ((agentStatus as any[]) ?? []).some((s: any) => (s?.failed ?? 0) > 0);
  const storeBotStatus: NavItem["dot"] = hasAgentErrors ? "error" : totalRunning > 0 ? "running" : "ok";

  // Active workspace store (for the switcher pill)
  const activeStore = stores?.find((s: any) => s.id === activeStoreId) ?? stores?.[0];

  // Flat nav — one Store Bot destination instead of separate builder,
  // merchant, social, and communicator bots.
  // (Workspace/Bots/Operate/Account) added vertical noise without aiding
  // discovery. A single thin separator before the bot triad keeps the
  // visual rhythm without consuming a row per label.
  const navItems: NavItem[] = [
    { title: "Command Center", path: "/", icon: LayoutDashboard },
    { title: "Inbox", path: "/inbox", icon: InboxIcon, badge: pendingCount },
    { title: "Store Bot", path: "/chat", icon: Bot, brand: "sky", dot: storeBotStatus },
    // ── OPERATIONS section ──
    { title: "OPERATIONS", section: true },

    { title: "Workflow Builder", path: "/workflow-builder", icon: Zap },
    { title: "Integrations", path: "/storefronts", icon: Globe },
    { title: "Analytics", path: "/insights", icon: BarChart3 },
    // ── ACCOUNT section ──
    { title: "ACCOUNT", section: true },
    { title: "Settings", path: "/settings", icon: SettingsIcon },
  ];

  const handleLogout = () => {
    window.location.href = getLoginUrl() + "?action=logout";
  };

  // Determine which top-level path is "active" so legacy deep links also
  // highlight the consolidated entry point (e.g. /activity → Inbox).
  const activePathFor = (path: string): boolean => {
    if (!path) return false; // Section headers have no path
    if (path === "/") return location === "/";
    if (path === "/chat") {
      return (
        location.startsWith("/chat") ||
        location.startsWith("/workflows") ||
        location.startsWith("/activity") ||
        location.startsWith("/approvals")
      );
    }
    if (path === "/storefronts") {
      return (
        location.startsWith("/storefronts") ||
        location.startsWith("/integrations") ||
        location.startsWith("/plugins") ||
        location.startsWith("/supplier")
      );
    }
    if (path === "/insights") {
      return (
        location.startsWith("/insights") ||
        location.startsWith("/analytics") ||
        location.startsWith("/intelligence")
      );
    }
    if (path === "/settings") {
      return (
        location.startsWith("/settings") ||
        location.startsWith("/profile") ||
        location.startsWith("/bot-settings") ||
        location.startsWith("/health")
      );
    }
    if (path === "/chat") {
      return location.startsWith("/chat");
    }
    return location === path || location.startsWith(path + "/");
  };

  const renderNavItem = (item: NavItem, rail: boolean = false) => {
    // Section headers
    if (item.section) {
      if (rail) return null; // Hide section headers on rail
      return (
        <div key={item.title} className="px-2.5 py-2 mt-1 mb-0.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/30 font-bold">
            {item.title}
          </span>
        </div>
      );
    }
    const isActive = activePathFor(item.path ?? "");
    // For bots we collapse brand-dot + status-dot into a single dot. When
    // the bot is healthy we paint with brand color; when it changes state
    // (running/error) we let status take over so the user notices.
    const dotCls = statusDotClass(item.dot) ?? brandDotClass(item.brand);
    if (rail) {
      return (
        <Link
          key={item.title}
          href={item.path ?? "#"}
          onClick={() => isMobile && setMobileMenuOpen(false)}
          title={item.title + (item.badge && item.badge > 0 ? ` (${item.badge})` : "")}
          aria-label={item.title}
          className={`relative w-11 h-11 mx-auto flex items-center justify-center rounded-md transition-all duration-200 group ${
            isActive
              ? "bg-sky-500/[0.14] text-sky-200 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.22)]"
              : "text-white/60 hover:text-white/85 hover:bg-white/[0.04]"
          }`}
        >
          {isActive && <span className="nav-active-bar" aria-hidden="true" />}
          <item.icon
            aria-hidden="true"
            className={`w-5 h-5 transition-all duration-200 ${
              isActive ? "text-sky-400" : "opacity-50 group-hover:opacity-85"
            }`}
          />
          {dotCls && (
            <span
              className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${dotCls}`}
              role="status"
              aria-label={item.dot ? `${item.title} status: ${item.dot}` : undefined}
            />
          )}
          {item.badge && item.badge > 0 ? (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center"
              aria-label={`${item.badge} pending`}
            >
              {item.badge > 9 ? "9+" : item.badge}
            </span>
          ) : null}
        </Link>
      );
    }
    // Sub-item style (e.g. Build under Workflows)
    if (item.sub) {
      return (
        <Link
          key={item.title}
          href={item.path ?? "#"}
          onClick={() => isMobile && setMobileMenuOpen(false)}
          className={`flex items-center h-6 pl-7 pr-2.5 rounded-md transition-all duration-200 group relative ${
            isActive
              ? "bg-gradient-to-r from-violet-500/[0.18] via-violet-500/[0.07] to-transparent text-violet-200 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.22)]"
              : "text-white/30 hover:text-white/75 hover:bg-white/[0.025]"
          }`}
        >
          {isActive && <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-violet-400" aria-hidden="true" />}
          <item.icon
            aria-hidden="true"
            className={`w-3 h-3 mr-2 transition-all duration-200 ${
              isActive ? "text-violet-400" : "opacity-35 group-hover:opacity-65"
            }`}
          />
          <span className={`text-[12px] truncate flex-1 ${
            isActive ? "font-semibold text-violet-200" : "font-medium"
          }`}>
            {item.title}
          </span>
          {!isActive && (
            <span className="text-[9px] font-mono text-white/20 group-hover:text-violet-400/60 transition-colors tracking-widest uppercase">new</span>
          )}
        </Link>
      );
    }
    return (
      <Link
        key={item.title}
        href={item.path ?? "#"}
        onClick={() => isMobile && setMobileMenuOpen(false)}
        className={`flex items-center min-h-[48px] pl-3 pr-2.5 rounded-md transition-standard group relative ${
          isActive
            ? "bg-gradient-to-r from-sky-500/[0.14] via-sky-500/[0.06] to-transparent text-sky-200 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.18)]"
            : "text-white/60 hover:text-white/85 hover:bg-white/[0.045] hover:shadow-premium-sm"
        }`}
      >
        {isActive && <span className="nav-active-bar" aria-hidden="true" />}
        <item.icon
          aria-hidden="true"
          className={`w-4 h-4 mr-2 transition-standard ${
            isActive ? "text-sky-400" : "opacity-40 group-hover:opacity-70"
          }`}
        />
        <span className={`text-sm truncate flex-1 ${isActive ? "font-semibold" : "font-medium"}`}>
          {item.title}
        </span>
        {dotCls && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${dotCls} shrink-0`}
            role="status"
            aria-label={item.dot ? `${item.title} status: ${item.dot}` : undefined}
          />
        )}
        {item.badge && item.badge > 0 ? (
          <span
            className="ml-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center shrink-0"
            aria-label={`${item.badge} pending`}
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const NavContent = () => (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2.5 px-2.5">
      {/* Organization switcher (always visible) */}
      <div className="mb-1.5 px-0.5">
        <OrgSwitcher />
      </div>
      {/* Workspace (store) switcher — selecting a store now navigates
          into that store's workspace (`/store/:id`) so the sidebar
          stays in sync with whichever world the operator is working in.
          Below the switcher, when a store is active, we render the
          per-workspace sub-nav inline so chat / workflows / connectors
          / memory / instructions are one click away from anywhere. */}
      {stores && stores.length > 0 && (
        <div className="mb-2 px-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-white/[0.06] bg-gradient-to-r from-white/[0.025] to-white/[0.01] hover:from-white/[0.05] hover:to-white/[0.02] hover:border-sky-400/25 transition-all group"
                data-testid="workspace-switcher"
                aria-label={activeStore ? `Active workspace: ${activeStore.name}` : "Select a workspace"}
              >
                <span
                  className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-[11px]"
                  style={
                    activeStore
                      ? {
                          background: `${getBrand(activeStore.platform).color}1f`,
                          border: `1px solid ${getBrand(activeStore.platform).color}40`,
                        }
                      : undefined
                  }
                  aria-hidden="true"
                >
                  {activeStore ? getBrand(activeStore.platform).icon : <Store className="w-2.5 h-2.5 text-sky-300" />}
                </span>
                <span className="min-w-0 flex-1 text-[12px] font-semibold text-white/85 truncate text-left">
                  {activeStore?.name ?? "All stores"}
                </span>
                <ChevronDown className="w-3 h-3 text-white/35 shrink-0 group-hover:text-sky-300 transition-colors" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60 bg-[#0a0a0f] border-white/10">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-white/60">
                Workspace
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => {
                  setActiveStoreId(null);
                  setLocation("/");
                }}
                className={!activeStoreId ? "bg-sky-500/10 text-sky-300" : ""}
              >
                <Globe className="w-3.5 h-3.5 mr-2 opacity-70" /> All stores · Command Center
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {stores.map((s: any) => {
                const brand = getBrand(s.platform);
                return (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={() => {
                      setActiveStoreId(s.id);
                      setLocation(`/store/${s.id}`);
                    }}
                    className={s.id === activeStoreId ? "bg-sky-500/10 text-sky-300" : ""}
                  >
                    <span className="text-sm leading-none mr-2">{brand.icon}</span>
                    <span className="truncate">{s.name}</span>
                    <span className="ml-auto text-[10px] text-white/55">{brand.name}</span>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setLocation("/storefronts#integrations")}
                className="text-sky-300"
              >
                <Globe className="w-3.5 h-3.5 mr-2" /> Connect another store
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Per-workspace sub-nav — only renders when a store is active
              AND we're inside a workspace route. Mirrors the header
              sub-nav but in a sidebar-friendly stack so the operator
              can hop between workspace surfaces without leaving the
              sidebar context. */}
          {activeStoreId && location.startsWith(`/store/${activeStoreId}`) && (
            <WorkspaceSidebarNav storeId={activeStoreId} location={location} />
          )}
        </div>
      )}

      {/* Command palette trigger */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="w-full mb-3 flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.045] hover:border-sky-400/25 transition-all text-left group"
        data-testid="command-palette-trigger"
      >
        <Search className="w-3 h-3 text-white/60 shrink-0 group-hover:text-sky-300 transition-colors" />
        <span className="text-[11px] text-white/60 truncate flex-1 group-hover:text-white/70 transition-colors">Search & run…</span>
        <kbd className="kbd-lux">⌘K</kbd>
      </button>

      <div className="space-y-px">
        {navItems.map((item) => (
          <div key={item.title}>
            {renderNavItem(item, false)}
          </div>
        ))}
      </div>
    </nav>
  );

  // Icon-rail variant — used at narrow viewports. Drops every label and
  // both switchers (org + workspace) for max canvas; the command palette
  // shrinks to a centered ⌘K glyph.
  const RailNavContent = () => (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 flex flex-col items-center gap-px">
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        title="Search & run (⌘K)"
        aria-label="Open command palette"
        className="w-9 h-9 mb-2 rounded-md border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.045] hover:border-sky-400/25 transition-all flex items-center justify-center text-white/60 hover:text-sky-300"
      >
        <Search className="w-4 h-4" />
      </button>
      {navItems.map((item) => (
        <div key={item.title} className="w-full flex flex-col items-center">
          {renderNavItem(item, true)}
        </div>
      ))}
    </nav>
  );

  const SidebarFooter = ({ rail = false }: { rail?: boolean }) => {
    if (rail) {
      return (
        <div className="border-t border-white/[0.05] p-2 flex flex-col items-center gap-1">
          <Link
            href="/settings"
            onClick={() => isMobile && setMobileMenuOpen(false)}
            title={user?.name ?? "Account"}
            aria-label="Account settings"
          >
            <div className="brand-mark shrink-0" style={{ width: "1.8rem", height: "1.8rem" }}>
              <span className="text-[10px] font-bold text-white">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title="Keyboard shortcuts (?)"
            aria-label="Show keyboard shortcuts"
            className="w-7 h-7 rounded-md text-white/30 hover:text-sky-300 hover:bg-white/[0.06] transition-all flex items-center justify-center text-[11px] font-bold font-mono"
          >
            ?
          </button>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="w-7 h-7 rounded-md text-white/30 hover:text-red-400 hover:bg-red-500/8 transition-all flex items-center justify-center"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }
    return (
      <div className="border-t border-white/[0.05] p-2 relative">
        <div className="absolute top-0 left-2 right-2 hairline opacity-40" />
        <Link href="/settings" onClick={() => isMobile && setMobileMenuOpen(false)}>
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1.5 rounded-md bg-white/[0.025] border border-white/[0.05] hover:bg-white/[0.05] hover:border-sky-500/25 transition-all cursor-pointer group">
            <div className="brand-mark shrink-0" style={{ width: "1.6rem", height: "1.6rem" }}>
              <span className="text-[10px] font-bold text-white">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[12px] font-semibold text-white/85 truncate leading-tight">{user?.name}</span>
              <span className="text-[10px] text-white/35 truncate font-mono leading-tight">{user?.email}</span>
            </div>
            <div className="live-pip" aria-label="online" />
          </div>
        </Link>
        <div className="flex items-center gap-1">
          <Button
            onClick={handleLogout}
            variant="ghost"
            size="sm"
            className="flex-1 justify-start text-[11px] font-medium h-7 text-white/30 hover:text-red-400 hover:bg-red-500/8 transition-all"
          >
            <LogOut className="w-3 h-3 mr-1.5" />
            Sign Out
          </Button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title="Keyboard shortcuts (?)"
            aria-label="Show keyboard shortcuts"
            className="shrink-0 w-7 h-7 rounded-md text-white/30 hover:text-sky-300 hover:bg-white/[0.06] transition-all flex items-center justify-center text-[11px] font-bold font-mono"
          >
            ?
          </button>
        </div>
      </div>
    );
  };

  if (isMobile) {
    // Find the current page title for the mobile header
    const currentNavItem = navItems.find((item) => item.path && activePathFor(item.path));
    const currentPageTitle = currentNavItem?.title ?? BRAND_NAME;

    // Bottom nav primary destinations (5 tabs)
    const bottomNavItems = [
      { title: "Home", path: "/", icon: LayoutDashboard },
      { title: "Inbox", path: "/inbox", icon: InboxIcon, badge: pendingCount },
      { title: "Bot", path: "/chat", icon: Bot, dot: storeBotStatus },
      { title: "Flows", path: "/workflows", icon: GitBranch, badge: totalRunning },
      { title: "Settings", path: "/settings", icon: SettingsIcon },
    ] as const;

    // Stable dot→CSS-class map (defined once, not inside the render loop)
    const DOT_CLS: Record<NonNullable<typeof storeBotStatus>, string> = {
      ok: "ok",
      running: "running",
      error: "error",
    };

    const handleBottomNavTap = (path: string) => {
      const newIdx = bottomNavItems.findIndex((t) => t.path === path);
      const prevIdx = prevNavIdxRef.current;

      if (prevIdx !== -1 && newIdx !== prevIdx) {
        const dir = newIdx > prevIdx ? "forward" : "back";
        if (mobileMainRef.current) {
          mobileMainRef.current.setAttribute("data-nav-dir", dir);
          // Cancel any prior pending clear (rapid taps) then schedule a fresh one
          if (navDirTimerRef.current !== null) clearTimeout(navDirTimerRef.current);
          navDirTimerRef.current = setTimeout(() => {
            mobileMainRef.current?.removeAttribute("data-nav-dir");
            navDirTimerRef.current = null;
          }, 320);
        }
      }
      prevNavIdxRef.current = newIdx;

      // Subtle haptic pulse on supported devices (iOS 16+, Android Chrome)
      navigator.vibrate?.(8);

      setMobileMenuOpen(false);
    };

    return (
      <div className="flex h-screen w-screen flex-col bg-[#050505] text-white overflow-hidden app-chrome">
        {/* Mobile Header */}
        <div className="relative flex items-center justify-between h-12 px-3.5 mobile-topbar sticky top-0 z-40 safe-area-top safe-area-x shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="brand-mark shrink-0">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0 flex flex-col">
              <span className="text-[13px] font-bold text-white/90 truncate leading-tight">{currentPageTitle}</span>
              {activeStore && (
                <span className="text-[9px] font-mono text-sky-400/70 truncate leading-tight uppercase tracking-wider">
                  {activeStore.name}
                </span>
              )}
            </div>
          </div>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05] hover:border-sky-500/25"
                aria-label="Open navigation menu"
              >
                <Menu className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-[#040406]/95 border-r border-white/[0.06] backdrop-blur-2xl">
              <div className="flex h-full flex-col">
                <div className="h-12 flex items-center px-4 border-b border-white/[0.05] gap-2">
                  <div className="brand-mark">
                    <Zap className="w-3 h-3 text-white" />
                  </div>
                  <BrandName size="sm" />
                </div>
                <NavContent />
                <SidebarFooter />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Mobile Content — padded bottom for fixed bottom nav.
            Warm-mocha canvas matches the desktop two-tone — cool top-bar
            and bottom-nav chrome over an espresso content surface. */}
        <main ref={mobileMainRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-page-canvas">
          {children}
          {/* Spacer so content clears the fixed bottom nav */}
          <div className="mobile-nav-spacer" aria-hidden="true" />
        </main>

        {/* ── Bottom Navigation Bar ─────────────────────────────────────────── */}
        <nav className="mobile-bottom-nav safe-area-x" aria-label="Primary navigation">
          {bottomNavItems.map((item) => {
            const isActive = activePathFor(item.path);
            const dotStatus = "dot" in item ? item.dot : null;
            const resolvedDotCls = dotStatus ? DOT_CLS[dotStatus] : null;
            const hasBadge = "badge" in item && item.badge && item.badge > 0;
            return (
              <Link
                key={item.title}
                href={item.path}
                onClick={() => handleBottomNavTap(item.path)}
                className={`mobile-nav-item${isActive ? " active" : ""}`}
                aria-label={item.title}
                aria-current={isActive ? "page" : undefined}
              >
                {hasBadge ? (
                  <span className="mobile-nav-badge" aria-label={`${(item as any).badge} pending`}>
                    {(item as any).badge > 9 ? "9+" : (item as any).badge}
                  </span>
                ) : resolvedDotCls ? (
                  <span className={`mobile-nav-dot ${resolvedDotCls}`} role="status" aria-label={`Bot ${resolvedDotCls}`} />
                ) : null}
                <item.icon aria-hidden="true" />
                <span className="mobile-nav-label">{item.title}</span>
              </Link>
            );
          })}
        </nav>

        <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#050505] text-white app-chrome">
      {/* Desktop Sidebar — rail at narrow viewports unless user pinned expanded */}
      <aside
        className={`shrink-0 flex flex-col border-r border-white/[0.05] bg-[#040406]/90 backdrop-blur-2xl relative z-20 sidebar-luxe transition-[width] duration-200 ${
          railMode ? "w-14" : "w-56"
        }`}
      >
        {/* Neon top accent — 2px animated scan-line at the very top of sidebar */}
        <span className="sidebar-top-accent" aria-hidden="true" />
        {/* Header */}
        <div className={`h-12 flex items-center border-b border-white/[0.05] relative ${railMode ? "justify-center px-2" : "px-4 gap-2"}`} aria-label={BRAND_NAME}>
          <div className="brand-mark shrink-0">
            <Zap className="w-3 h-3 text-white" />
          </div>
          {!railMode && <BrandName size="sm" className="flex-1" />}
          <div className="absolute bottom-0 left-3 right-3 hairline opacity-50" />
        </div>

        {/* Nav Content */}
        {railMode ? <RailNavContent /> : <NavContent />}

        {/* Rail toggle — only visible when the auto-rail kicked in or user pinned. */}
        {(isNarrow || railOverride === false) && (
          <button
            type="button"
            onClick={() => setRailOverride(railMode ? false : true)}
            title={railMode ? "Expand sidebar" : "Collapse to rail"}
            aria-label={railMode ? "Expand sidebar" : "Collapse to rail"}
            className="mx-2 mb-1 h-6 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.04] flex items-center justify-center transition-colors"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${railMode ? "-rotate-90" : "rotate-90"}`} />
          </button>
        )}

        {/* Footer */}
        <SidebarFooter rail={railMode} />
      </aside>

      {/* Main Content — warm-mocha canvas (the "room" where stores live).
          Cool steel chrome on the sidebar / topbar, warm espresso here.
          The ambient overlay layers crema + brand-accent radial gradients. */}
      <main className="flex-1 flex flex-col relative h-full min-w-0 bg-page-canvas overflow-hidden">
        {/* Ambient decorative layer — must stay behind content with z-index: -1 */}
        <div className="pointer-events-none absolute inset-0 z-[-1] main-ambient-animate" aria-hidden="true" />
        {/* Scrollable content wrapper */}
        <div className="relative z-[1] flex-1 flex flex-col min-h-0 overflow-y-auto">
          {children}
        </div>
      </main>

      {/* Keyboard shortcut help overlay (toggled by `?`) */}
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

// ─── Keyboard help overlay ────────────────────────────────────────────────────
function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  // Detect "we're inside a workspace" the same way the leader-key
  // handler does — read the URL directly so the help overlay always
  // reflects the operator's actual context (not a stale React state).
  const inWorkspace = typeof window !== "undefined" && /^\/store\/\d+(?:\/|$)/.test(window.location.pathname);
  const navigationRows = inWorkspace
    ? [
        { keys: "g c", desc: "Back to Command Center" },
        { keys: "g h", desc: "Back to Command Center" },
        { keys: "g i", desc: "Inbox (cross-store)" },
        { keys: "g o", desc: "Workspace overview" },
        { keys: "g b", desc: "Workspace · Chat" },
        { keys: "g m", desc: "Workspace · Chat" },
        { keys: "g w", desc: "Workspace · Workflows" },
        { keys: "g y", desc: "Workspace · Builder" },
        { keys: "g f", desc: "Workspace · Connectors" },
        { keys: "g r", desc: "Workspace · Memory" },
        { keys: "g x", desc: "Workspace · Instructions" },
        { keys: "g n", desc: "Workspace · Insights" },
        { keys: "g a", desc: "Workspace · Activity" },
        { keys: "g s", desc: "Settings" },
      ]
    : [
        { keys: "g h", desc: "Command Center" },
        { keys: "g i", desc: "Inbox" },
        { keys: "g b", desc: "Store Bot" },
        { keys: "g m", desc: "Store Bot (operate)" },
        { keys: "g o", desc: "Store Bot (growth)" },
        { keys: "g w", desc: "Workflows" },
        { keys: "g f", desc: "Integrations" },
        { keys: "g n", desc: "Analytics" },
        { keys: "g s", desc: "Settings" },
      ];
  const groups: { label: string; rows: Array<{ keys: string; desc: string }> }[] = [
    {
      label: inWorkspace ? "Workspace navigation" : "Navigation",
      rows: navigationRows,
    },
    {
      label: "Global",
      rows: [
        { keys: "⌘ K", desc: "Search & run command" },
        { keys: "?", desc: "Toggle this help" },
        { keys: "Esc", desc: "Dismiss panels & overlays" },
      ],
    },
  ];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <button
        type="button"
        aria-label="Close keyboard shortcuts"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-xl border border-white/[0.08] bg-[#0a0a0f]/95 shadow-[0_24px_64px_rgba(0,0,0,0.6)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <span className="eyebrow">Keyboard shortcuts</span>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded text-white/60 hover:text-white/85 hover:bg-white/[0.06] flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <span aria-hidden="true" className="text-base leading-none">×</span>
          </button>
        </div>
        <div className="p-4 space-y-3">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50 mb-1.5">{g.label}</p>
              <div className="rounded-lg border border-white/[0.05] divide-y divide-white/[0.04]">
                {g.rows.map((r) => (
                  <div key={r.keys} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[12px] text-white/75">{r.desc}</span>
                    <span className="flex gap-1">
                      {r.keys.split(" ").map((k, i) => (
                        <kbd key={i} className="kbd-lux">{k}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
