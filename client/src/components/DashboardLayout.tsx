import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Bot,
  Package,
  Megaphone,
  Activity,
  BarChart3,
  Settings,
  Bell,
  Zap,
  Plug,
  Workflow,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

const APP_TITLE = (import.meta.env.VITE_APP_TITLE as string) || "ShopBOTS";
const APP_LOGO = import.meta.env.VITE_APP_LOGO as string | undefined;

const allMenuItems = [
  { icon: LayoutDashboard, label: "Command Center", path: "/", group: "overview", adminOnly: false },
  { icon: Bot, label: "Builder Bot", path: "/architect", group: "bots", color: "text-violet-400", adminOnly: false },
  { icon: Package, label: "Merchant Bot", path: "/merchant", group: "bots", color: "text-cyan-400", adminOnly: false },
  { icon: Megaphone, label: "Social Bot", path: "/hypeman", group: "bots", color: "text-amber-400", adminOnly: false },
  { icon: Activity, label: "Activity Log", path: "/activity", group: "operations", adminOnly: false },
  { icon: BarChart3, label: "Analytics", path: "/analytics", group: "operations", adminOnly: false },
  { icon: Plug, label: "Integrations", path: "/integrations", group: "operations", color: "text-emerald-400", adminOnly: false },
  { icon: Workflow, label: "Workflows", path: "/workflows", group: "operations", color: "text-rose-400", adminOnly: false },
  { icon: Settings, label: "Bot Config", path: "/config", group: "settings", adminOnly: true },
];

const groupLabels: Record<string, string> = {
  overview: "OVERVIEW",
  bots: "BOTS",
  operations: "OPERATIONS",
  settings: "SETTINGS",
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-2">
              <div className="flex flex-col items-center gap-4 mb-4">
              {APP_LOGO ? (
                <img src={APP_LOGO} alt={APP_TITLE} className="h-24 w-24 object-contain" />
              ) : (
                <Zap className="h-12 w-12 text-primary" />
              )}
              <span className="text-2xl font-bold tracking-tight gradient-text text-center">{APP_TITLE}</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-center text-foreground">
              Your Bots Are Standing By
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Builder Bot, Merchant Bot, and Social Bot are ready to build, sell, and market your store — 24/7, fully autonomous.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all bg-primary hover:bg-primary/90 btn-glow"
          >
            <Zap className="h-4 w-4 mr-2" />
            Launch Command Center
          </Button>
          <p className="text-xs text-muted-foreground/50 text-center">
            Autonomous e-commerce. Zero manual work.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === "admin";
  const menuItems = allMenuItems.filter((item) => !item.adminOnly || isAdmin);
  const activeMenuItem = menuItems.find((item) => item.path === location);
  const isMobile = useIsMobile();

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  // Group menu items
  const groups = menuItems.reduce(
    (acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    },
    {} as Record<string, typeof menuItems>
  );

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border/50">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  {APP_LOGO ? (
                    <img src={APP_LOGO} alt={APP_TITLE} className="h-7 w-7 object-contain shrink-0 drop-shadow-lg" />
                  ) : (
                    <Zap className="h-5 w-5 text-primary shrink-0" />
                  )}
                  <span className="font-bold tracking-tight truncate gradient-text text-sm">
                    {APP_TITLE}
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-2 py-3">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group} className="mb-3">
                {!isCollapsed && (
                  <p className="px-3 py-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground/60 uppercase">
                    {groupLabels[group]}
                  </p>
                )}
                <SidebarMenu>
                  {items.map((item) => {
                    const isActive = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className={`h-9 transition-all font-normal ${isActive ? "bg-primary/10 text-primary" : ""}`}
                        >
                          <item.icon
                            className={`h-4 w-4 ${isActive ? "text-primary" : item.color || "text-muted-foreground"}`}
                          />
                          <span className={isActive ? "font-medium" : ""}>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-sidebar-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-8 w-8 border border-primary/20 shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-foreground">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {user?.role === "admin" ? "Admin" : "User"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setLocation("/config")} className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Bot Config</span>
                  </DropdownMenuItem>
                )}
                {isAdmin && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {/* Top bar */}
        <div className="flex border-b border-border/50 h-14 items-center justify-between bg-background/80 px-4 backdrop-blur-sm sticky top-0 z-40">
          <div className="flex items-center gap-3">
            {isMobile && <SidebarTrigger className="h-9 w-9 rounded-lg" />}
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-foreground">
                {activeMenuItem?.label ?? "ShopBOTS"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
              onClick={() => setLocation("/activity")}
            >
              <Bell className="h-4 w-4 text-muted-foreground" />
              {(unreadCount ?? 0) > 0 && (
                <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground border-0">
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
