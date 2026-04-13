import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  HeartPulse,
  Brain,
  GitBranch,
  Store,
  Truck,
  Sparkles,
  User,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { BrandName, BRAND_NAME } from "./BrandName";

const APP_TITLE = BRAND_NAME;

const allMenuItems = [
  { icon: LayoutDashboard, label: "Command Center", path: "/", group: "overview", adminOnly: false },
  { icon: Bot, label: "Builder Bot", path: "/architect", group: "bots", color: "text-sky-400", adminOnly: false },
  { icon: Package, label: "Merchant Bot", path: "/merchant", group: "bots", color: "text-cyan-400", adminOnly: false },
  { icon: Megaphone, label: "Social Bot", path: "/social", group: "bots", color: "text-amber-400", adminOnly: false },
  { icon: Activity, label: "Activity Log", path: "/activity", group: "operations", adminOnly: false },
  { icon: BarChart3, label: "Analytics", path: "/analytics", group: "operations", adminOnly: false },
  { icon: Plug, label: "Integrations", path: "/integrations", group: "operations", color: "text-emerald-400", adminOnly: false },
  { icon: Workflow, label: "Workflows", path: "/workflows", group: "operations", color: "text-rose-400", adminOnly: false },
  { icon: HeartPulse, label: "Platform Health", path: "/health", group: "operations", color: "text-emerald-400", adminOnly: false },
  { icon: Brain, label: "Intelligence", path: "/intelligence", group: "operations", color: "text-sky-400", adminOnly: false },
  { icon: GitBranch, label: "Orchestrator", path: "/orchestrator", group: "operations", color: "text-indigo-400", adminOnly: false },
  { icon: Store, label: "App Store", path: "/plugins", group: "operations", color: "text-blue-400", adminOnly: false },
  { icon: Truck, label: "Supplier POs", path: "/supplier", group: "operations", color: "text-orange-400", adminOnly: false },
  { icon: Sparkles, label: "Prompt Lab", path: "/prompt-lab", group: "operations", color: "text-pink-400", adminOnly: false },
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
  const [, navigateTo] = useLocation();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  // Redirect unauthenticated users to the public landing page
  useEffect(() => {
    if (!loading && !user) {
      navigateTo("/landing");
    }
  }, [loading, user, navigateTo]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return <DashboardLayoutSkeleton />; // Brief skeleton while redirect fires
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

function formatRelativeNotificationTime(value: Date | string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  if (diffMs < 60_000) return "Just now";

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { data: subscription } = trpc.stripe.getSubscription.useQuery();
  const billingPortal = trpc.stripe.createBillingPortalSession.useMutation({
    onSuccess: (data) => { window.open(data.url, '_blank'); },
  });
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: notifications, isLoading: notificationsLoading } = trpc.notifications.list.useQuery(
    { limit: 12 },
    {
      refetchInterval: 30000,
      enabled: notificationsOpen,
    }
  );
  const utils = trpc.useUtils();
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
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
        <Sidebar collapsible="icon" className="border-r border-white/[0.05] glass-subtle rounded-none" disableTransition={isResizing}>
          <SidebarHeader className="h-16 justify-center border-b border-white/[0.06] bg-transparent">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-white/[0.06] rounded-lg transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <BrandName size="lg" />
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-2 py-3 bg-transparent">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group} className="mb-3">
                {!isCollapsed && (
                  <p className="px-3 py-1.5 micro-label text-sky-500/60">
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
                          className={`h-9 transition-all duration-500 font-normal rounded-lg ${
                            isActive
                              ? "bg-sky-500/10 text-sky-400 border border-sky-500/25 shadow-[0_0_12px_rgba(14,165,233,0.15)]"
                              : "hover:bg-white/[0.04] hover:border hover:border-white/[0.08] hover:translate-x-1 hover:shadow-lg"
                          }`}
                        >
                          <item.icon
                            className={`h-4 w-4 shrink-0 transition-colors duration-500 ${
                              isActive ? "text-sky-400 drop-shadow-[0_0_6px_rgba(14,165,233,0.6)]" : item.color || "text-muted-foreground/70"
                            }`}
                          />
                          <span className={`truncate ${isActive ? "font-semibold tracking-wide" : "font-medium"}`}>{item.label}</span>
                          {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0 shadow-[0_0_6px_rgba(14,165,233,0.8)]" />}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-white/[0.06] bg-transparent">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04] hover:border hover:border-white/[0.08] transition-all duration-500 w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50">
                  <Avatar className="h-8 w-8 border border-sky-500/30 shrink-0 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
                    <AvatarFallback className="text-xs font-bold bg-sky-500/15 text-sky-400">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-semibold truncate leading-none text-foreground">
                      {user?.name || "-"}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                      {user?.role === "admin" ? "✦ Admin" : "Member"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setLocation("/profile")} className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  <span>My Profile</span>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setLocation("/config")} className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Bot Config</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
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
        <div className="flex border-b border-white/[0.06] h-14 items-center justify-between glass-subtle px-4 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            {isMobile && <SidebarTrigger className="h-9 w-9 rounded-lg" />}
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-foreground">
                {activeMenuItem?.label ?? BRAND_NAME}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
              {subscription?.isActive && subscription.plan && (
                <button
                  onClick={() => billingPortal.mutate({ origin: window.location.origin })}
                  disabled={billingPortal.isPending}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/25 text-sky-400 text-[11px] font-semibold tracking-wide hover:bg-sky-500/20 transition-all duration-300 cursor-pointer"
                  title="Manage subscription"
                >
                  <Sparkles className="h-3 w-3" />
                  {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                </button>
              )}
              {!subscription?.isActive && (
                <a
                  href="/#pricing"
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[11px] font-semibold tracking-wide hover:bg-amber-500/20 transition-all duration-300"
                >
                  <Zap className="h-3 w-3" />
                  Upgrade
                </a>
              )}
              <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-9 w-9"
                    aria-label="Notifications"
                  >
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    {(unreadCount ?? 0) > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground border-0">
                        {unreadCount}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[360px] p-0">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                    <DropdownMenuLabel className="p-0 text-sm font-semibold">Notifications</DropdownMenuLabel>
                    <div className="flex items-center gap-2">
                      {(unreadCount ?? 0) > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markAllRead.mutate();
                          }}
                          disabled={markAllRead.isPending}
                        >
                          Mark all read
                        </Button>
                      )}
                    </div>
                  </div>

                  {notificationsLoading ? (
                    <div className="p-3 space-y-2">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="rounded-md border border-border/40 p-3 space-y-2">
                          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                          <div className="h-4 w-full rounded bg-muted animate-pulse" />
                          <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                        </div>
                      ))}
                    </div>
                  ) : notifications && notifications.length > 0 ? (
                    <>
                      <ScrollArea className="max-h-[420px]">
                        <div className="p-2 space-y-1">
                          {notifications.map((notification: any) => (
                            <DropdownMenuItem
                              key={notification.id}
                              className="items-start gap-3 rounded-md border border-transparent p-3 focus:bg-secondary/60 cursor-pointer"
                              onClick={() => {
                                if (!notification.isRead) {
                                  markRead.mutate({ id: notification.id });
                                }
                                setNotificationsOpen(false);
                                setLocation(notification.actionUrl || "/activity");
                              }}
                            >
                              <div className="pt-0.5 shrink-0">
                                <div className={`h-2 w-2 rounded-full ${notification.isRead ? "bg-muted-foreground/30" : "bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.5)]"}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <p className={`text-sm leading-snug ${notification.isRead ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                                    {notification.title}
                                  </p>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {formatRelativeNotificationTime(notification.createdAt)}
                                  </span>
                                </div>
                                {notification.message && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {notification.message}
                                  </p>
                                )}
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </ScrollArea>
                      <DropdownMenuSeparator />
                      <div className="p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-center"
                          onClick={() => {
                            setNotificationsOpen(false);
                            setLocation("/activity");
                          }}
                        >
                          View all activity
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="p-6 text-center">
                      <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-foreground">No notifications yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Bot activity and approval alerts will appear here.
                      </p>
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </div>
        <main className="flex-1 p-4 md:p-6 bg-transparent">{children}</main>
      </SidebarInset>
    </>
  );
}
