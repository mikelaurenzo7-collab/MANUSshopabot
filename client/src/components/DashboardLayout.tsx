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
  Package,
  Megaphone,
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

type AgentType = "architect" | "merchant" | "social";

interface NavItem {
  title: string;
  path: string;
  icon: any;
  badge?: number;
  /** Live colored dot rendered to the right of the label (e.g. bot status). */
  dot?: "ok" | "running" | "error" | null;
  /** Bot brand dot (purely visual). */
  brand?: "sky" | "cyan" | "amber";
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
    default:
      return null;
  }
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
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    const targets: Record<string, string> = {
      h: "/", c: "/", // home / command center
      i: "/inbox",
      b: "/architect", // builder
      m: "/merchant",
      o: "/social",    // social — `s` is taken by Settings
      w: "/workflows",
      f: "/storefronts", // storefronts
      n: "/insights",   // iNsights
      s: "/settings",
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

  // Map agent status rows into per-bot dot status.
  const statusByAgent: Partial<Record<AgentType, NavItem["dot"]>> = {};
  for (const row of (agentStatus as any[] | undefined) ?? []) {
    const t = row?.agentType as AgentType | undefined;
    if (!t) continue;
    if ((row.failed ?? 0) > 0) statusByAgent[t] = "error";
    else if ((row.running ?? 0) > 0) statusByAgent[t] = "running";
    else statusByAgent[t] = "ok";
  }

  const totalRunning = ((agentStatus as any[]) ?? []).reduce(
    (a: number, s: any) => a + (s?.running ?? 0),
    0,
  );

  // Active workspace store (for the switcher pill)
  const activeStore = stores?.find((s: any) => s.id === activeStoreId) ?? stores?.[0];

  // Flat nav — 8 destinations, no group headers. The earlier grouping
  // (Workspace/Bots/Operate/Account) added vertical noise without aiding
  // discovery. A single thin separator before the bot triad keeps the
  // visual rhythm without consuming a row per label.
  const navItems: NavItem[] = [
    { title: "Command Center", path: "/", icon: LayoutDashboard },
    { title: "Inbox", path: "/inbox", icon: InboxIcon, badge: pendingCount },
    // ── divider before bots ──
    { title: "Builder", path: "/architect", icon: Bot, brand: "sky", dot: statusByAgent.architect ?? "ok" },
    { title: "Merchant", path: "/merchant", icon: Package, brand: "cyan", dot: statusByAgent.merchant ?? "ok" },
    { title: "Social", path: "/social", icon: Megaphone, brand: "amber", dot: statusByAgent.social ?? "ok" },
    // ── divider before operate ──
    { title: "Workflows", path: "/workflows", icon: GitBranch, badge: totalRunning },
    { title: "Storefronts", path: "/storefronts", icon: Globe },
    { title: "Insights", path: "/insights", icon: BarChart3 },
    { title: "Settings", path: "/settings", icon: SettingsIcon },
  ];

  // Index in navItems where a thin divider sits ABOVE the row.
  const dividerIndices = new Set<number>([2, 5]);

  const handleLogout = () => {
    window.location.href = getLoginUrl() + "?action=logout";
  };

  // Determine which top-level path is "active" so legacy deep links also
  // highlight the consolidated entry point (e.g. /activity → Inbox).
  const activePathFor = (path: string): boolean => {
    if (path === "/") return location === "/";
    if (path === "/inbox") {
      return (
        location.startsWith("/inbox") ||
        location.startsWith("/activity") ||
        location.startsWith("/approvals")
      );
    }
    if (path === "/storefronts") {
      return (
        location.startsWith("/storefronts") ||
        location.startsWith("/integrations") ||
        location.startsWith("/plugins") ||
        location.startsWith("/supplier") ||
        location.startsWith("/gmail-bot")
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
    return location === path || location.startsWith(path + "/");
  };

  const renderNavItem = (item: NavItem, rail: boolean = false) => {
    const isActive = activePathFor(item.path);
    // For bots we collapse brand-dot + status-dot into a single dot. When
    // the bot is healthy we paint with brand color; when it changes state
    // (running/error) we let status take over so the user notices.
    const dotCls = statusDotClass(item.dot) ?? brandDotClass(item.brand);
    if (rail) {
      return (
        <Link
          key={item.title}
          href={item.path}
          onClick={() => isMobile && setMobileMenuOpen(false)}
          title={item.title + (item.badge && item.badge > 0 ? ` (${item.badge})` : "")}
          aria-label={item.title}
          className={`relative w-9 h-9 mx-auto flex items-center justify-center rounded-md transition-all duration-200 group ${
            isActive
              ? "bg-sky-500/[0.14] text-sky-200 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.22)]"
              : "text-white/40 hover:text-white/85 hover:bg-white/[0.04]"
          }`}
        >
          {isActive && <span className="nav-active-bar" aria-hidden="true" />}
          <item.icon
            aria-hidden="true"
            className={`w-4 h-4 transition-all duration-200 ${
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
    return (
      <Link
        key={item.title}
        href={item.path}
        onClick={() => isMobile && setMobileMenuOpen(false)}
        className={`flex items-center h-7 pl-3 pr-2.5 rounded-md transition-all duration-200 group relative ${
          isActive
            ? "bg-gradient-to-r from-sky-500/[0.14] via-sky-500/[0.06] to-transparent text-sky-200 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.18)]"
            : "text-white/40 hover:text-white/85 hover:bg-white/[0.035]"
        }`}
      >
        {isActive && <span className="nav-active-bar" aria-hidden="true" />}
        <item.icon
          aria-hidden="true"
          className={`w-3.5 h-3.5 mr-2 transition-all duration-200 ${
            isActive ? "text-sky-400" : "opacity-40 group-hover:opacity-70"
          }`}
        />
        <span className={`text-[13px] truncate flex-1 ${isActive ? "font-semibold" : "font-medium"}`}>
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
      {/* Workspace (store) switcher */}
      {stores && stores.length > 0 && (
        <div className="mb-2 px-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-white/[0.06] bg-gradient-to-r from-white/[0.025] to-white/[0.01] hover:from-white/[0.05] hover:to-white/[0.02] hover:border-sky-400/25 transition-all group"
                data-testid="workspace-switcher"
              >
                <span className="w-5 h-5 rounded bg-sky-500/12 border border-sky-500/25 flex items-center justify-center shrink-0">
                  <Store className="w-2.5 h-2.5 text-sky-300" />
                </span>
                <span className="min-w-0 flex-1 text-[12px] font-semibold text-white/85 truncate text-left">
                  {activeStore?.name ?? "All stores"}
                </span>
                <ChevronDown className="w-3 h-3 text-white/35 shrink-0 group-hover:text-sky-300 transition-colors" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-[#0a0a0f] border-white/10">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-white/40">
                Workspace
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => setActiveStoreId(null)}
                className={!activeStoreId ? "bg-sky-500/10 text-sky-300" : ""}
              >
                <Globe className="w-3.5 h-3.5 mr-2 opacity-70" /> All stores
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {stores.map((s: any) => {
                const brand = getBrand(s.platform);
                return (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={() => setActiveStoreId(s.id)}
                    className={s.id === activeStoreId ? "bg-sky-500/10 text-sky-300" : ""}
                  >
                    <span className="text-sm leading-none mr-2">{brand.icon}</span>
                    <span className="truncate">{s.name}</span>
                    <span className="ml-auto text-[10px] text-white/55">{brand.name}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Command palette trigger */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="w-full mb-3 flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.045] hover:border-sky-400/25 transition-all text-left group"
        data-testid="command-palette-trigger"
      >
        <Search className="w-3 h-3 text-white/40 shrink-0 group-hover:text-sky-300 transition-colors" />
        <span className="text-[11px] text-white/40 truncate flex-1 group-hover:text-white/70 transition-colors">Search & run…</span>
        <kbd className="kbd-lux">⌘K</kbd>
      </button>

      <div className="space-y-px">
        {navItems.map((item, i) => (
          <div key={item.title}>
            {dividerIndices.has(i) && (
              <div className="my-1.5 mx-2 nav-group-rule" aria-hidden="true" />
            )}
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
        className="w-9 h-9 mb-2 rounded-md border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.045] hover:border-sky-400/25 transition-all flex items-center justify-center text-white/40 hover:text-sky-300"
      >
        <Search className="w-4 h-4" />
      </button>
      {navItems.map((item, i) => (
        <div key={item.title} className="w-full flex flex-col items-center">
          {dividerIndices.has(i) && (
            <div className="my-1 w-6 h-px bg-white/[0.08]" aria-hidden="true" />
          )}
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
    return (
      <div className="flex h-screen w-screen flex-col bg-[#050505] text-white overflow-hidden app-chrome">
        {/* Mobile Header */}
        <div className="flex items-center justify-between h-12 px-3.5 border-b border-white/[0.06] topbar-glass sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="brand-mark">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <BrandName size="sm" />
          </div>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open navigation menu">
                <Menu className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0 bg-[#040406]/95 border-r border-white/[0.06] backdrop-blur-2xl">
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

        {/* Mobile Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>

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

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full min-w-0 bg-[#050505]/80 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 main-ambient-animate" />
        {children}
      </main>

      {/* Keyboard shortcut help overlay (toggled by `?`) */}
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

// ─── Keyboard help overlay ────────────────────────────────────────────────────
function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const groups: { label: string; rows: Array<{ keys: string; desc: string }> }[] = [
    {
      label: "Navigation",
      rows: [
        { keys: "g h", desc: "Command Center" },
        { keys: "g i", desc: "Inbox" },
        { keys: "g b", desc: "Builder" },
        { keys: "g m", desc: "Merchant" },
        { keys: "g o", desc: "Social" },
        { keys: "g w", desc: "Workflows" },
        { keys: "g f", desc: "Storefronts" },
        { keys: "g n", desc: "Insights" },
        { keys: "g s", desc: "Settings" },
      ],
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
            className="w-6 h-6 rounded text-white/40 hover:text-white/85 hover:bg-white/[0.06] flex items-center justify-center transition-colors"
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
