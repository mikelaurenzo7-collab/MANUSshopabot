import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  BarChart3,
  Workflow,
  Zap,
  Activity,
  Bot,
  Package,
  Megaphone,
  LogOut,
  Menu,
  X,
  Globe,
  Sliders,
  HeartPulse,
  GitBranch,
  Brain,
  Store,
  Truck,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BrandName, BRAND_NAME } from "@/components/BrandName";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const navigateTo = (path: string) => setLocation(path);
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: pendingApprovals } = trpc.approvals.pending.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const pendingCount = pendingApprovals?.length ?? 0;

  const navGroups = [
    {
      label: "Dashboard",
      items: [
        { title: "Command Center", path: "/", icon: LayoutDashboard, badge: 0 },
        { title: "Activity", path: "/activity", icon: Activity, badge: 0 },
        { title: "Intelligence", path: "/intelligence", icon: Globe, badge: 0 },
      ],
    },
    {
      label: "Bots",
      items: [
        { title: "Builder Bot", path: "/architect", icon: Bot, badge: 0 },
        { title: "Merchant Bot", path: "/merchant", icon: Package, badge: 0 },
        { title: "Social Bot", path: "/social", icon: Megaphone, badge: 0 },
        { title: "Bot Chat", path: "/chat", icon: MessageSquare, badge: 0 },
      ],
    },
    {
      label: "Operations",
      items: [
        { title: "Workflows", path: "/workflows", icon: GitBranch, badge: 0 },
        { title: "Approvals", path: "/approvals", icon: ShieldCheck, badge: pendingCount },
        { title: "Integrations", path: "/integrations", icon: Zap, badge: 0 },
        { title: "Analytics", path: "/analytics", icon: BarChart3, badge: 0 },
        { title: "Platform Health", path: "/health", icon: HeartPulse, badge: 0 },
        { title: "Bot Settings", path: "/bot-settings", icon: Sliders, badge: 0 },
      ],
    },
    {
      label: "Tools",
      items: [
        { title: "Plugin Store", path: "/plugins", icon: Store, badge: 0 },
        { title: "Prompt Lab", path: "/prompt-lab", icon: Brain, badge: 0 },
        { title: "Supplier POs", path: "/supplier", icon: Truck, badge: 0 },
      ],
    },
  ];

  const handleLogout = () => {
    window.location.href = getLoginUrl() + "?action=logout";
  };

  const NavContent = () => (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3">
      {navGroups.map((group, i) => (
        <div key={i} className="mb-6">
          <div className="px-2 mb-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/20">
              {group.label}
            </span>
            <div className="h-px mt-1.5 bg-gradient-to-r from-white/8 to-transparent" />
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
              const botDot = item.path === "/architect" ? "bg-sky-400" : item.path === "/merchant" ? "bg-cyan-400" : item.path === "/social" ? "bg-amber-400" : null;
              return (
                <Link
                  key={item.title}
                  href={item.path}
                  onClick={() => isMobile && setMobileMenuOpen(false)}
                  className={`flex items-center h-9 px-3 rounded-lg transition-all duration-200 group relative ${
                    isActive
                      ? "bg-sky-500/10 text-sky-300 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.18)]"
                      : "text-white/40 hover:text-white/80 hover:bg-white/[0.04]"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gradient-to-b from-sky-400 to-cyan-500 rounded-full" />
                  )}
                  <item.icon className={`w-4 h-4 mr-2.5 transition-all duration-200 ${
                    isActive ? "text-sky-400" : "opacity-40 group-hover:opacity-70"
                  }`} />
                  <span className={`text-sm truncate flex-1 ${isActive ? "font-semibold" : "font-medium"}`}>{item.title}</span>
                  {botDot && (
                    <span className={`w-1.5 h-1.5 rounded-full ${botDot} opacity-70 shrink-0 mr-1`} />
                  )}
                  {item.badge > 0 && (
                    <span className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center shrink-0">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const SidebarFooter = () => (
    <div className="border-t border-white/[0.05] p-3">
      <Link href="/profile" onClick={() => isMobile && setMobileMenuOpen(false)}>
        <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-lg bg-white/[0.025] border border-white/[0.05] hover:bg-white/[0.05] hover:border-sky-500/20 transition-all cursor-pointer group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(14,165,233,0.3)] group-hover:shadow-[0_0_14px_rgba(14,165,233,0.5)] transition-shadow">
            <span className="text-xs font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-white/75 truncate">{user?.name}</span>
            <span className="text-[10px] text-white/28 truncate">{user?.email}</span>
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

  if (isMobile) {
    return (
      <div className="flex h-screen w-screen flex-col bg-[#050505] text-white overflow-hidden">
        {/* Mobile Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.06] bg-[#050505]/90 backdrop-blur-sm sticky top-0 z-40">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shadow-[0_0_10px_rgba(14,165,233,0.35)]">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <BrandName size="sm" />
          </div>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-[#040406] border-r border-white/[0.06]">
              <div className="flex h-full flex-col">
                <div className="h-14 flex items-center px-4 border-b border-white/[0.05] gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shadow-[0_0_10px_rgba(14,165,233,0.35)]">
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
    <div className="flex h-screen w-screen overflow-hidden bg-[#050505] text-white">
      {/* Desktop Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-white/[0.05] bg-[#040406] relative z-20">
        {/* Header */}
        <div className="h-14 flex items-center px-5 border-b border-white/[0.05] gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(14,165,233,0.35)]">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <BrandName size="sm" className="flex-1" />
        </div>

        {/* Nav Content */}
        <NavContent />

        {/* Footer */}
        <SidebarFooter />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full min-w-0 bg-[#050505] overflow-hidden">
        {children}
      </main>
    </div>
  );
}
