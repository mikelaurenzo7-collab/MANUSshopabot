/**
 * DashboardLayout — primary chrome around the authenticated app.
 *
 * Horizontal top-navigation layout: the previously left-rail destinations are
 * now surfaced as a single sticky top bar. Bots stay grouped behind a small
 * dropdown so the bar stays calm and scannable on smaller laptops.
 *
 * Live status comes from `dashboard.agentStatus`, `approvals.pending`,
 * `connectors.connectionSummary`, and `stores.list`.
 */
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
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
  Mail,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BrandName, BRAND_NAME } from "@/components/BrandName";
import { useCommandPalette } from "@/components/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/contexts/WorkspaceContext";

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

const ACTIVE_UNDERLINE_CLASS =
  "pointer-events-none absolute inset-x-3 bottom-0 h-px rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-sky-400 opacity-90";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const { activeStoreId, setActiveStoreId } = useWorkspace();

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

  const primaryNav: NavItem[] = [
    { title: "Command Center", path: "/", icon: LayoutDashboard },
    { title: "Inbox", path: "/inbox", icon: InboxIcon, badge: pendingCount },
    {
      title: "Workflows",
      path: "/workflows",
      icon: GitBranch,
      badge: totalRunning,
    },
    { title: "Storefronts & Channels", path: "/storefronts", icon: Globe },
    { title: "Insights", path: "/insights", icon: BarChart3 },
    { title: "Gmail Bot", path: "/gmail-bot", icon: Mail },
  ];

  const botsNav: NavItem[] = [
    {
      title: "Builder",
      path: "/architect",
      icon: Bot,
      brand: "sky",
      dot: statusByAgent.architect ?? "ok",
    },
    {
      title: "Merchant",
      path: "/merchant",
      icon: Package,
      brand: "cyan",
      dot: statusByAgent.merchant ?? "ok",
    },
    {
      title: "Social",
      path: "/social",
      icon: Megaphone,
      brand: "amber",
      dot: statusByAgent.social ?? "ok",
    },
  ];

  const settingsItem: NavItem = { title: "Settings", path: "/settings", icon: SettingsIcon };

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
    return location === path || location.startsWith(path + "/");
  };

  const botsActive = botsNav.some((b) => activePathFor(b.path));

  // ── Horizontal nav pill (desktop top bar) ───────────────────────────────
  const TopNavPill = ({ item }: { item: NavItem }) => {
    const isActive = activePathFor(item.path);
    const dotCls = statusDotClass(item.dot);
    const brandCls = brandDotClass(item.brand);
    return (
      <Link
        href={item.path}
        className={`relative inline-flex items-center h-9 px-3 rounded-lg text-sm transition-[background-color,color,box-shadow,transform] duration-150 group whitespace-nowrap ${
          isActive
            ? "text-sky-200 bg-sky-500/10 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.22)]"
            : "text-white/55 hover:text-white/90 hover:bg-white/[0.04]"
        }`}
      >
        <item.icon
          className={`w-4 h-4 mr-2 transition-all duration-150 ${
            isActive ? "text-sky-300" : "opacity-55 group-hover:opacity-90"
          }`}
        />
        <span className={isActive ? "font-semibold" : "font-medium"}>{item.title}</span>
        {brandCls && (
          <span className={`ml-2 w-1.5 h-1.5 rounded-full ${brandCls} opacity-80 shrink-0`} />
        )}
        {dotCls && (
          <span
            className={`ml-2 w-1.5 h-1.5 rounded-full ${dotCls} shrink-0`}
            aria-label={`status ${item.dot}`}
          />
        )}
        {item.badge && item.badge > 0 ? (
          <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-[0_0_0_1px_rgba(125,211,252,0.18)]">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
        {isActive && (
          <span className={ACTIVE_UNDERLINE_CLASS} />
        )}
      </Link>
    );
  };

  // ── Bots dropdown trigger (desktop) ─────────────────────────────────────
  const BotsDropdown = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open bots menu"
          className={`relative inline-flex items-center h-9 px-3 rounded-lg text-sm transition-[background-color,color,box-shadow,transform] duration-150 whitespace-nowrap ${
            botsActive
              ? "text-sky-200 bg-sky-500/10 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.22)]"
              : "text-white/55 hover:text-white/90 hover:bg-white/[0.04]"
          }`}
          data-testid="bots-menu-trigger"
        >
          <Bot
            className={`w-4 h-4 mr-2 transition-all duration-150 ${botsActive ? "text-sky-300" : "opacity-55"}`}
          />
          <span className={botsActive ? "font-semibold" : "font-medium"}>Bots</span>
          <ChevronDown className="ml-1.5 w-3 h-3 opacity-60" />
          {botsActive && (
            <span className={ACTIVE_UNDERLINE_CLASS} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 bg-[#0a0a0f] border-white/10">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-white/40">
          Bots
        </DropdownMenuLabel>
        {botsNav.map((item) => {
          const isActive = activePathFor(item.path);
          const dotCls = statusDotClass(item.dot);
          const brandCls = brandDotClass(item.brand);
          return (
            <DropdownMenuItem key={item.path} asChild>
              <Link
                href={item.path}
                className={`flex items-center gap-2 cursor-pointer ${
                  isActive ? "bg-sky-500/10 text-sky-300" : ""
                }`}
              >
                <item.icon className="w-3.5 h-3.5 opacity-70" />
                <span className="flex-1 truncate">{item.title}</span>
                {brandCls && <span className={`w-1.5 h-1.5 rounded-full ${brandCls} opacity-80`} />}
                {dotCls && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${dotCls}`}
                    aria-label={`status ${item.dot}`}
                  />
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ── Workspace switcher (compact, sits in top bar) ───────────────────────
  const WorkspaceSwitcher = ({ compact = false }: { compact?: boolean }) =>
    stores && stores.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`flex items-center gap-2 ${
              compact ? "px-2 h-9" : "px-2.5 py-2 w-full"
            } rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all`}
            data-testid="workspace-switcher"
          >
            <Store className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-xs font-semibold text-white/85 truncate max-w-[140px] text-left">
              {activeStore?.name ?? "All stores"}
            </span>
            <ChevronDown className="w-3 h-3 text-white/30 shrink-0" />
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
          {stores.map((s: any) => (
            <DropdownMenuItem
              key={s.id}
              onSelect={() => setActiveStoreId(s.id)}
              className={s.id === activeStoreId ? "bg-sky-500/10 text-sky-300" : ""}
            >
              <Store className="w-3.5 h-3.5 mr-2 opacity-70" />
              <span className="truncate">{s.name}</span>
              <span className="ml-auto text-[10px] text-white/30 uppercase">{s.platform}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  // ── User menu (replaces sidebar footer) ─────────────────────────────────
  const UserMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-sky-500/20 transition-all"
          data-testid="user-menu-trigger"
        >
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(14,165,233,0.3)]">
            <span className="text-xs font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </span>
          </div>
          <span className="hidden lg:inline text-xs font-semibold text-white/80 truncate max-w-[120px]">
            {user?.name ?? "Account"}
          </span>
          <ChevronDown className="w-3 h-3 text-white/40 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-[#0a0a0f] border-white/10">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-white/85 truncate">{user?.name}</span>
          <span className="text-[10px] text-white/40 truncate">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <UserIcon className="w-3.5 h-3.5 mr-2 opacity-70" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <SettingsIcon className="w-3.5 h-3.5 mr-2 opacity-70" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleLogout}
          className="text-red-300 focus:text-red-200 focus:bg-red-500/10"
        >
          <LogOut className="w-3.5 h-3.5 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ── ⌘K trigger ──────────────────────────────────────────────────────────
  const PaletteTrigger = ({ compact = false }: { compact?: boolean }) => (
    <button
      type="button"
      onClick={() => setPaletteOpen(true)}
      className={`flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all text-left ${
        compact ? "h-9 px-2.5 w-44 xl:w-64" : "px-2.5 py-2 w-full"
      }`}
      data-testid="command-palette-trigger"
    >
      <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <span className="text-xs text-white/40 truncate flex-1">Search & run…</span>
      <kbd className="text-[9px] text-white/30 font-mono px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
        ⌘K
      </kbd>
    </button>
  );

  // ── Mobile vertical nav (in sheet) ──────────────────────────────────────
  const MobileNavList = () => {
    const renderItem = (item: NavItem) => {
      const isActive = activePathFor(item.path);
      const dotCls = statusDotClass(item.dot);
      const brandCls = brandDotClass(item.brand);
      return (
        <Link
          key={item.path}
          href={item.path}
          onClick={() => setMobileMenuOpen(false)}
          className={`flex items-center h-9 px-3 rounded-lg transition-all duration-200 ${
            isActive
              ? "bg-sky-500/10 text-sky-300 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.18)]"
              : "text-white/55 hover:text-white/90 hover:bg-white/[0.04]"
          }`}
        >
          <item.icon className={`w-4 h-4 mr-2.5 ${isActive ? "text-sky-300" : "opacity-60"}`} />
          <span className={`text-sm flex-1 truncate ${isActive ? "font-semibold" : "font-medium"}`}>
            {item.title}
          </span>
          {brandCls && (
            <span className={`w-1.5 h-1.5 rounded-full ${brandCls} opacity-80 shrink-0 mr-1`} />
          )}
          {dotCls && (
            <span
              className={`w-1.5 h-1.5 rounded-full ${dotCls} shrink-0`}
              aria-label={`status ${item.dot}`}
            />
          )}
          {item.badge && item.badge > 0 ? (
            <span className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-[0_0_0_1px_rgba(125,211,252,0.18)]">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          ) : null}
        </Link>
      );
    };

    const sections: { label: string; items: NavItem[] }[] = [
      { label: "Workspace", items: primaryNav.slice(0, 2) },
      { label: "Bots", items: botsNav },
      { label: "Operate", items: primaryNav.slice(2) },
      { label: "Account", items: [settingsItem] },
    ];

    return (
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3">
        <div className="mb-3">
          <WorkspaceSwitcher />
        </div>
        <div className="mb-4">
          <PaletteTrigger />
        </div>
        {sections.map((section) => (
          <div key={section.label} className="mb-5">
            <div className="px-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">
                {section.label}
              </span>
              <div className="h-px mt-1.5 bg-gradient-to-r from-white/10 to-transparent" />
            </div>
            <div className="space-y-0.5">{section.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>
    );
  };

  const MobileFooter = () => (
    <div className="border-t border-white/[0.05] p-3">
      <Link href="/settings" onClick={() => setMobileMenuOpen(false)}>
        <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-lg bg-white/[0.025] border border-white/[0.05] hover:bg-white/[0.05] hover:border-sky-500/20 transition-all cursor-pointer group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(14,165,233,0.3)] group-hover:shadow-[0_0_14px_rgba(14,165,233,0.5)] transition-shadow">
            <span className="text-xs font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-white/75 truncate">{user?.name}</span>
            <span className="text-[10px] text-white/30 truncate">{user?.email}</span>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-70 shrink-0" />
        </div>
      </Link>
      <Button
        onClick={handleLogout}
        variant="ghost"
        size="sm"
        className="w-full justify-start text-xs font-medium h-8 text-white/30 hover:text-red-400 hover:bg-red-500/8 transition-all"
      >
        <LogOut className="w-3.5 h-3.5 mr-2" />
        Sign Out
      </Button>
    </div>
  );

  // ── Mobile chrome ───────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex h-screen w-screen flex-col bg-[#050505] text-white overflow-hidden app-chrome">
        <header
          className="flex items-center justify-between h-14 px-4 border-b border-white/[0.06] topbar-glass sticky top-0 z-40"
          aria-label={BRAND_NAME}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shadow-[0_0_10px_rgba(14,165,233,0.35)]">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <BrandName size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all"
              aria-label="Open command palette"
              data-testid="command-palette-trigger-mobile"
            >
              <Search className="w-3.5 h-3.5 text-white/60" />
            </button>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Menu className="w-4 h-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 p-0 bg-[#040406]/95 border-r border-white/[0.06] backdrop-blur-2xl"
              >
                <div className="flex h-full flex-col">
                  <div className="h-14 flex items-center px-4 border-b border-white/[0.05] gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shadow-[0_0_10px_rgba(14,165,233,0.35)]">
                      <Zap className="w-3.5 h-3.5 text-white" />
                    </div>
                    <BrandName size="sm" />
                  </div>
                  <MobileNavList />
                  <MobileFooter />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    );
  }

  // ── Desktop chrome ──────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#050505] text-white app-chrome">
      <header
        className="topbar-nav relative shrink-0 sticky top-0 z-40 border-b border-white/[0.06] topbar-glass"
        aria-label={BRAND_NAME}
      >
        <div className="flex items-center h-14 gap-3 px-5">
          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shadow-[0_0_10px_rgba(14,165,233,0.35)] group-hover:shadow-[0_0_14px_rgba(14,165,233,0.5)] transition-shadow">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <BrandName size="sm" />
            </Link>
          </div>

          {/* Workspace pill */}
          <div className="hidden md:flex items-center pl-2 ml-1 border-l border-white/[0.06] h-7">
            <WorkspaceSwitcher compact />
          </div>

          {/* Primary nav */}
          <nav
            className="flex-1 min-w-0 hidden md:flex items-center gap-0.5 overflow-x-auto no-scrollbar pl-2 pr-2 scroll-px-4"
            aria-label="Primary"
          >
            <TopNavPill item={primaryNav[0]} />
            <TopNavPill item={primaryNav[1]} />
            <BotsDropdown />
            {primaryNav.slice(2).map((item) => (
              <TopNavPill key={item.path} item={item} />
            ))}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <PaletteTrigger compact />
            <TopNavPill item={settingsItem} />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative min-w-0 bg-[#050505]/80 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(14,165,233,0.07),transparent_35%),radial-gradient(circle_at_85%_18%,rgba(6,182,212,0.05),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(249,115,22,0.04),transparent_28%)]" />
        {children}
      </main>
    </div>
  );
}
