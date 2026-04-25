import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  Settings,
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

  const navGroups = [
    {
      label: "Dashboard",
      items: [
        { title: "Command Center", path: "/", icon: LayoutDashboard },
        { title: "Activity", path: "/activity", icon: Activity },
        { title: "Intelligence", path: "/intelligence", icon: Globe },
      ],
    },
    {
      label: "Bots",
      items: [
        { title: "Builder Bot", path: "/architect", icon: Bot },
        { title: "Merchant Bot", path: "/merchant", icon: Package },
        { title: "Social Bot", path: "/social", icon: Megaphone },
      ],
    },
    {
      label: "Operations",
      items: [
        { title: "Workflows", path: "/workflows", icon: GitBranch },
        { title: "Integrations", path: "/integrations", icon: Zap },
        { title: "Analytics", path: "/analytics", icon: Settings },
        { title: "Platform Health", path: "/health", icon: HeartPulse },
        { title: "Bot Settings", path: "/bot-settings", icon: Sliders },
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
          <div className="px-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
              {group.label}
            </span>
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
              return (
                <Link
                  key={item.title}
                  href={item.path}
                  onClick={() => isMobile && setMobileMenuOpen(false)}
                  className={`flex items-center h-9 px-3 rounded-lg transition-all duration-200 group relative ${
                    isActive
                      ? "bg-sky-500/12 text-sky-400 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.2)]"
                      : "text-white/45 hover:text-white/85 hover:bg-white/[0.04]"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-sky-400 rounded-full" />
                  )}
                  <item.icon className={`w-4 h-4 mr-2.5 transition-all duration-200 ${
                    isActive ? "text-sky-400" : "opacity-50 group-hover:opacity-80"
                  }`} />
                  <span className="text-sm font-medium truncate">{item.title}</span>
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
      <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500/30 to-cyan-500/20 border border-sky-500/30 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-sky-300">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </span>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-semibold text-white/80 truncate">{user?.name}</span>
          <span className="text-[10px] text-white/30 truncate">{user?.email}</span>
        </div>
      </div>
      <Button
        onClick={handleLogout}
        variant="ghost"
        size="sm"
        className="w-full justify-start text-xs font-medium h-8 text-white/35 hover:text-red-400 hover:bg-red-500/8 transition-all"
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
        <div className="flex items-center justify-between h-14 px-4 border-b border-[#1e293b] bg-[#050505]/80 backdrop-blur-sm sticky top-0 z-40">
          <BrandName size="sm" />
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-[#050505] border-r border-[#1e293b]">
              <div className="flex h-full flex-col">
                <div className="h-14 flex items-center px-4 border-b border-[#1e293b]">
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
        <div className="h-14 flex items-center px-5 border-b border-white/[0.05]">
          <BrandName size="sm" className="w-full" />
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
