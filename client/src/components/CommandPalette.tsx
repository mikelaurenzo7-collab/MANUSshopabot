/**
 * CommandPalette.tsx — Global ⌘K Command Palette
 *
 * Fast navigation to pages, bot workflows, and product search.
 * Open with ⌘K (Cmd+K on Mac, Ctrl+K on Windows/Linux), or programmatically
 * via the `useCommandPalette()` hook.
 */

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  Search,
  Home,
  Package,
  Megaphone,
  BarChart3,
  Settings,
  Zap,
  ShoppingCart,
  MessageSquare,
  Shield,
  Layers,
  Sparkles,
  Inbox,
  GitBranch,
  Globe,
  Bot,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  action: () => void;
  group: "navigation" | "workflows" | "search";
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | undefined>(undefined);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    return { open: false, setOpen: () => {}, toggle: () => {} };
  }
  return ctx;
}

/** Optional wrapper that exposes the palette via context to anywhere in the tree.
 *  CommandPalette already exposes the same context internally, so use this only
 *  if you need the context above where <CommandPalette /> is mounted.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function CommandPalette({ children }: { children?: ReactNode } = {}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const storesQuery = trpc.stores.list.useQuery();
  const firstStore = storesQuery.data?.[0];
  const productsQuery = trpc.stores.products.useQuery(
    firstStore ? { storeId: firstStore.id, limit: 50, search } : { storeId: 0, limit: 0 },
    { enabled: Boolean(firstStore) && search.length > 2 },
  );

  // Register ⌘K globally
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const ctxValue = useMemo<CommandPaletteContextValue>(
    () => ({ open, setOpen, toggle: () => setOpen((o) => !o) }),
    [open],
  );

  const go = (path: string) => {
    setLocation(path);
    setOpen(false);
  };

  // Navigation entries match the consolidated sidebar (7 destinations)
  // plus per-bot deep links and common legacy aliases.
  const navigationItems: CommandItem[] = [
    { id: "command-center", label: "Command Center", description: "Personalized overview of your operation", icon: Home,    action: () => go("/"),             group: "navigation" },
    { id: "inbox",          label: "Inbox",          description: "Approvals, activity & alerts",            icon: Inbox,   action: () => go("/inbox"),        group: "navigation" },
    { id: "architect",      label: "Builder Bot",    description: "Niche research & store scaffolding",      icon: Bot,     action: () => go("/architect"),    group: "navigation" },
    { id: "merchant",       label: "Merchant Bot",   description: "Inventory, pricing & fulfilment",         icon: Package, action: () => go("/merchant"),     group: "navigation" },
    { id: "social",         label: "Social Bot",     description: "Ads, posts & campaigns",                  icon: Megaphone, action: () => go("/social"),     group: "navigation" },
    { id: "workflows",      label: "Workflows",      description: "Active and historical bot workflows",     icon: GitBranch, action: () => go("/workflows"),  group: "navigation" },
    { id: "storefronts",    label: "Storefronts & Channels", description: "Connections, plugins, suppliers", icon: Globe, action: () => go("/storefronts"),    group: "navigation" },
    { id: "insights",       label: "Insights",       description: "Per-store analytics & market intel",      icon: BarChart3, action: () => go("/insights"),   group: "navigation" },
    { id: "settings",       label: "Settings",       description: "Profile, bot config, platform health",    icon: Settings, action: () => go("/settings"),    group: "navigation" },
    // Legacy aliases — searchable, deep-linkable
    { id: "approvals",      label: "Approvals",      description: "Review pending bot decisions",            icon: Shield,   action: () => go("/inbox#approvals"), group: "navigation" },
    { id: "activity",       label: "Activity Log",   description: "Bot task history",                        icon: Sparkles, action: () => go("/inbox#activity"),  group: "navigation" },
    { id: "stores",         label: "Stores",         description: "Manage connected stores",                 icon: ShoppingCart, action: () => go("/storefronts"),    group: "navigation" },
    { id: "chat",           label: "Bot Chat",       description: "Talk to your bots",                       icon: MessageSquare, action: () => go("/chat"),          group: "navigation" },
  ];

  const workflowItems: CommandItem[] = [
    { id: "niche-research",       label: "Launch Niche Research", description: "Find profitable niches",  icon: Sparkles, action: () => go("/architect"), group: "workflows" },
    { id: "product-sourcing",     label: "Source Products",       description: "Find winning products",   icon: Zap,      action: () => go("/architect"), group: "workflows" },
    { id: "pricing-optimization", label: "Optimize Pricing",      description: "Set smart pricing rules", icon: Layers,   action: () => go("/merchant"),  group: "workflows" },
  ];

  const searchItems: CommandItem[] = (productsQuery.data ?? [])
    .slice(0, 5)
    .map((product: any) => ({
      id: `product-${product.id}`,
      label: product.title,
      description: `${product.platform} • $${((product.price ?? 0) / 100).toFixed(2)}`,
      icon: Package,
      action: () => {
        if (firstStore) go(`/stores/${firstStore.id}`);
      },
      group: "search" as const,
    }));

  const allItems = [...navigationItems, ...workflowItems, ...searchItems];
  const filtered = search
    ? allItems.filter((item) =>
        `${item.label} ${item.description}`.toLowerCase().includes(search.toLowerCase()),
      )
    : navigationItems;

  const grouped = {
    navigation: filtered.filter((i) => i.group === "navigation"),
    workflows: filtered.filter((i) => i.group === "workflows"),
    search: filtered.filter((i) => i.group === "search"),
  };

  return (
    <CommandPaletteContext.Provider value={ctxValue}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 shadow-lg">
          <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group]:overflow-hidden [&_[cmdk-group]]:px-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12">
            <div className="flex items-center border-b border-border px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Command.Input
                placeholder="Search pages, workflows, products... ⌘K"
                value={search}
                onValueChange={setSearch}
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden">
              {!search && (
                <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                  No results found.
                </Command.Empty>
              )}

              {grouped.navigation.length > 0 && (
                <Command.Group heading="Navigation">
                  {grouped.navigation.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={item.action}
                        className="cursor-pointer"
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        <div className="flex flex-1 flex-col">
                          <span className="text-sm font-medium">{item.label}</span>
                          {item.description && (
                            <span className="text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          )}
                        </div>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {grouped.workflows.length > 0 && (
                <Command.Group heading="Workflows">
                  {grouped.workflows.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={item.action}
                        className="cursor-pointer"
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        <div className="flex flex-1 flex-col">
                          <span className="text-sm font-medium">{item.label}</span>
                          {item.description && (
                            <span className="text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          )}
                        </div>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {grouped.search.length > 0 && (
                <Command.Group heading="Products">
                  {grouped.search.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={item.action}
                        className="cursor-pointer"
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        <div className="flex flex-1 flex-col">
                          <span className="text-sm font-medium">{item.label}</span>
                          {item.description && (
                            <span className="text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          )}
                        </div>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
            </Command.List>

            <div className="border-t border-border px-2 py-2">
              <p className="text-xs text-muted-foreground">
                Press{" "}
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>{" "}
                to toggle
              </p>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </CommandPaletteContext.Provider>
  );
}
