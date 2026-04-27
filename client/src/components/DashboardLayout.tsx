/**
 * DashboardLayout — primary chrome around the authenticated app.
 *
 * The sidebar is intentionally compact (≈7 destinations) with everything
 * else folded into tabbed shell pages (Inbox, Storefronts & Channels,
 * Insights, Settings). Live status comes from `dashboard.agentStatus`,
 * `approvals.pending`, `connectors.connectionSummary`, and `stores.list`.
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
  ChevronRight,
  LogOut,
  Menu,
  Zap,
  Search,
  Store,
  Mail,
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

interface NavGroup {
  label: string;
  items: NavItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
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
  const [location] = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [botsOpen, setBotsOpen] = useState(true);
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

  const navGroups: NavGroup[] = [
    {
      label: "Workspace",
      items: [
        { title: "Command Center", path: "/", icon: LayoutDashboard },
        {
          title: "Inbox",
          path: "/inbox",
          icon: InboxIcon,
          badge: pendingCount,
        },
      ],
    },
    {
      label: "Bots",
      collapsible: true,
      defaultOpen: true,
      items: [
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
      ],
    },
    {
      label: "Operate",
      items: [
        {
          title: "Workflows",
          path: "/workflows",
          icon: GitBranch,
          badge: totalRunning,
        },
        {
          title: "Storefronts & Channels",
          path: "/storefronts",
          icon: Globe,
        },
        { title: "Insights", path: "/insights", icon: BarChart3 },
        { title: "Gmail Bot", path: "/gmail-bot", icon: Mail },
      ],
    },
    {
      label: "Account",
      items: [{ title: "Settings", path: "/settings", icon: SettingsIcon }],
    },
  ];

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

  const renderNavItem = (item: NavItem) => {
    const isActive = activePathFor(item.path);
    const dotCls = statusDotClass(item.dot);
    const brandCls = brandDotClass(item.brand);
    return (
      <Link
        key={item.title}
        href={item.path}
        onClick={() => isMobile && setMobileMenuOpen(false)}
        className={`flex items-center h-9 pl-3.5 pr-3 rounded-lg transition-all duration-300 group relative ${
          isActive
            ? "bg-gradient-to-r from-sky-500/[0.14] via-sky-500/[0.06] to-transparent text-sky-200 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.18)]"
            : "text-white/40 hover:text-white/85 hover:bg-white/[0.035]"
        }`}
      >
        {isActive && <span className="nav-active-bar" aria-hidden="true" />}
        <item.icon
          aria-hidden="true"
          className={`w-4 h-4 mr-2.5 transition-all duration-200 ${
            isActive ? "text-sky-400" : "opacity-40 group-hover:opacity-70"
          }`}
        />
        <span className={`text-sm truncate flex-1 ${isActive ? "font-semibold" : "font-medium"}`}>
          {item.title}
        </span>
        {brandCls && (
          <span className={`w-1.5 h-1.5 rounded-full ${brandCls} opacity-70 shrink-0 mr-1`} aria-hidden="true" />
        )}
        {dotCls && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${dotCls} shrink-0`}
            role="status"
            aria-label={`${item.title} status: ${item.dot}`}
          />
        )}
        {item.badge && item.badge > 0 ? (
          <span
            className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center shrink-0"
            aria-label={`${item.badge} pending`}
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const NavContent = () => (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3">
      {/* Organization switcher (always visible) */}
      <div className="mb-2 px-1">
        <OrgSwitcher />
      </div>
      {/* Workspace (store) switcher */}
      {stores && stores.length > 0 && (
        <div className="mb-3 px-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-white/[0.06] bg-gradient-to-r from-white/[0.025] to-white/[0.01] hover:from-white/[0.05] hover:to-white/[0.02] hover:border-sky-400/25 transition-all group"
                data-testid="workspace-switcher"
              >
                <span className="w-6 h-6 rounded-md bg-sky-500/12 border border-sky-500/25 flex items-center justify-center shrink-0">
                  <Store className="w-3 h-3 text-sky-300" />
                </span>
                <div className="min-w-0 flex-1 flex flex-col items-start">
                  <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/30 leading-none">Workspace</span>
                  <span className="text-xs font-semibold text-white/85 truncate w-full text-left">
                    {activeStore?.name ?? "All stores"}
                  </span>
                </div>
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
        </div>
      )}

      {/* Command palette trigger */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="w-full mb-4 flex items-center gap-2 px-2.5 py-2 rounded-lg border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.045] hover:border-sky-400/25 transition-all text-left group"
        data-testid="command-palette-trigger"
      >
        <Search className="w-3.5 h-3.5 text-white/40 shrink-0 group-hover:text-sky-300 transition-colors" />
        <span className="text-xs text-white/40 truncate flex-1 group-hover:text-white/70 transition-colors">Search & run…</span>
        <kbd className="kbd-lux">⌘K</kbd>
      </button>

      {navGroups.map((group, i) => {
        const open = group.collapsible ? botsOpen : true;
        return (
          <div key={i} className="mb-5">
            <div className="px-2 mb-2">
              {group.collapsible ? (
                <button
                  type="button"
                  onClick={() => setBotsOpen((o) => !o)}
                  className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/20 hover:text-white/45 transition-colors"
                >
                  <span>{group.label}</span>
                  {open ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </button>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/20">
                  {group.label}
                </span>
              )}
              <div className="nav-group-rule" />
            </div>
            {open && <div className="space-y-0.5">{group.items.map(renderNavItem)}</div>}
          </div>
        );
      })}
    </nav>
  );

  const SidebarFooter = () => (
    <div className="border-t border-white/[0.05] p-3 relative">
      <div className="absolute top-0 left-3 right-3 hairline opacity-40" />
      <Link href="/settings" onClick={() => isMobile && setMobileMenuOpen(false)}>
        <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-lg bg-white/[0.025] border border-white/[0.05] hover:bg-white/[0.05] hover:border-sky-500/25 transition-all cursor-pointer group">
          <div className="brand-mark shrink-0" style={{ width: "2rem", height: "2rem" }}>
            <span className="text-[11px] font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-white/85 truncate">{user?.name}</span>
            <span className="text-[10px] text-white/35 truncate font-mono">{user?.email}</span>
          </div>
          <div className="live-pip" aria-label="online" />
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

  if (isMobile) {
    return (
      <div className="flex h-screen w-screen flex-col bg-[#050505] text-white overflow-hidden app-chrome">
        {/* Mobile Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.06] topbar-glass sticky top-0 z-40">
          <div className="flex items-center gap-2.5">
            <div className="brand-mark">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <BrandName size="sm" />
          </div>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open navigation menu">
                <Menu className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-[#040406]/95 border-r border-white/[0.06] backdrop-blur-2xl">
              <div className="flex h-full flex-col">
                <div className="h-14 flex items-center px-4 border-b border-white/[0.05] gap-2.5">
                  <div className="brand-mark">
                    <Zap className="w-3.5 h-3.5 text-white" />
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
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#050505] text-white app-chrome">
      {/* Desktop Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-white/[0.05] bg-[#040406]/90 backdrop-blur-2xl relative z-20 sidebar-luxe">
        {/* Header */}
        <div className="h-14 flex items-center px-5 border-b border-white/[0.05] gap-2.5 relative" aria-label={BRAND_NAME}>
          <div className="brand-mark shrink-0">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <BrandName size="sm" className="flex-1" />
          <div className="absolute bottom-0 left-4 right-4 hairline opacity-50" />
        </div>

        {/* Nav Content */}
        <NavContent />

        {/* Footer */}
        <SidebarFooter />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full min-w-0 bg-[#050505]/80 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(14,165,233,0.07),transparent_35%),radial-gradient(circle_at_85%_18%,rgba(6,182,212,0.05),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(249,115,22,0.04),transparent_28%)]" />
        {children}
      </main>
    </div>
  );
}
