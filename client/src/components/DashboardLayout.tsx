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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BrandName } from "@/components/BrandName";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navGroups = [
    {
      label: "Dashboard",
      items: [
        { title: "Command Center", url: "/", icon: LayoutDashboard },
        { title: "Activity", url: "/activity", icon: Activity },
        { title: "Intelligence", url: "/intelligence", icon: Globe },
      ],
    },
    {
      label: "Bots",
      items: [
        { title: "Builder Bot", url: "/architect", icon: Bot },
        { title: "Merchant Bot", url: "/merchant", icon: Package },
        { title: "Social Bot", url: "/social", icon: Megaphone },
      ],
    },
    {
      label: "Operations",
      items: [
        { title: "Workflows", url: "/workflows", icon: Workflow },
        { title: "Integrations", url: "/integrations", icon: Zap },
        { title: "Analytics", url: "/analytics", icon: Settings },
      ],
    },
  ];

  const handleLogout = () => {
    window.location.href = getLoginUrl() + "?action=logout";
  };

  const NavContent = () => (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden p-4">
      {navGroups.map((group, i) => (
        <div key={i} className="mb-8">
          <div className="px-2 mb-3">
            <span className="text-xs font-mono uppercase tracking-widest text-[#64748b] font-semibold">
              {group.label}
            </span>
          </div>
          <div className="space-y-1">
            {group.items.map((item) => {
              const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
              return (
                <Link
                  key={item.title}
                  href={item.url}
                  onClick={() => isMobile && setMobileMenuOpen(false)}
                  className={`flex items-center h-9 px-3 rounded-md transition-all duration-200 group ${
                    isActive
                      ? "bg-sky-500/15 border border-sky-500/30 text-sky-400"
                      : "hover:bg-[#1e293b]/50 text-[#94a3b8] hover:text-white"
                  }`}
                >
                  <item.icon className="w-4 h-4 mr-2.5 opacity-70 group-hover:opacity-100 transition-opacity" />
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
    <div className="border-t border-[#1e293b] p-4 bg-gradient-to-t from-[#050505] to-transparent">
      <div className="flex items-center gap-3 px-3 py-2.5 mb-3 rounded-md bg-[#1e293b]/30 border border-[#1e293b]/50">
        <div className="w-8 h-8 rounded-md bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0">
          <span className="font-mono text-xs font-bold text-sky-400">
            {user?.name?.charAt(0) || "U"}
          </span>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-medium text-white truncate">{user?.name}</span>
          <span className="text-[10px] text-[#64748b] truncate">{user?.email}</span>
        </div>
      </div>
      <Button
        onClick={handleLogout}
        variant="outline"
        size="sm"
        className="w-full justify-start text-xs font-medium h-8 border-[#1e293b] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400"
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
      <aside className="w-64 shrink-0 flex flex-col border-r border-[#1e293b] bg-[#050505] relative z-20">
        {/* Header */}
        <div className="h-14 flex items-center px-4 border-b border-[#1e293b]">
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
