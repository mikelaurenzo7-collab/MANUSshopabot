/**
 * CommandPalette.tsx — Global ⌘K Command Palette
 *
 * Fast navigation to pages, bot workflows, and product search.
 * Open with ⌘K (Cmd+K on Mac, Ctrl+K on Windows/Linux).
 */

import { useEffect, useState } from "react";
import { useLocation, useRouter } from "wouter";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  action: () => void;
  group: "navigation" | "workflows" | "search";
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [_location, setLocation] = useLocation();
  const { user } = useAuth();
  const storesQuery = trpc.stores.list.useQuery();
  const firstStore = storesQuery.data?.[0];
  const productsQuery = trpc.stores.products.useQuery(
    firstStore ? { storeId: firstStore.id, limit: 50, search } : { storeId: 0, limit: 0 },
    { enabled: Boolean(firstStore) && search.length > 2 }
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

  // Build command items
  const navigationItems: CommandItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      description: "View your overview",
      icon: Home,
      action: () => {
        setLocation("/");
        setOpen(false);
      },
      group: "navigation",
    },
    {
      id: "stores",
      label: "Stores",
      description: "Manage connected stores",
      icon: ShoppingCart,
      action: () => {
        setLocation("/stores");
        setOpen(false);
      },
      group: "navigation",
    },
    {
      id: "architect",
      label: "Builder Bot",
      description: "Niche research & products",
      icon: Package,
      action: () => {
        setLocation("/architect");
        setOpen(false);
      },
      group: "navigation",
    },
    {
      id: "merchant",
      label: "Merchant Bot",
      description: "Inventory & pricing",
      icon: Layers,
      action: () => {
        setLocation("/merchant");
        setOpen(false);
      },
      group: "navigation",
    },
    {
      id: "social",
      label: "Social Bot",
      description: "Ads & campaigns",
      icon: Megaphone,
      action: () => {
        setLocation("/social");
        setOpen(false);
      },
      group: "navigation",
    },
    {
      id: "chat",
      label: "Bot Chat",
      description: "Talk to your bots",
      icon: MessageSquare,
      action: () => {
        setLocation("/chat");
        setOpen(false);
      },
      group: "navigation",
    },
    {
      id: "analytics",
      label: "Analytics",
      description: "View metrics",
      icon: BarChart3,
      action: () => {
        setLocation("/analytics");
        setOpen(false);
      },
      group: "navigation",
    },
    {
      id: "approvals",
      label: "Approvals",
      description: "Review bot decisions",
      icon: Shield,
      action: () => {
        setLocation("/approvals");
        setOpen(false);
      },
      group: "navigation",
    },
    {
      id: "settings",
      label: "Settings",
      description: "Configure your account",
      icon: Settings,
      action: () => {
        setLocation("/settings");
        setOpen(false);
      },
      group: "navigation",
    },
  ];

  const workflowItems: CommandItem[] = [
    {
      id: "niche-research",
      label: "Launch Niche Research",
      description: "Find profitable niches",
      icon: Sparkles,
      action: () => {
        setLocation("/architect");
        setOpen(false);
      },
      group: "workflows",
    },
    {
      id: "product-sourcing",
      label: "Source Products",
      description: "Find winning products",
      icon: Zap,
      action: () => {
        setLocation("/architect");
        setOpen(false);
      },
      group: "workflows",
    },
    {
      id: "pricing-optimization",
      label: "Optimize Pricing",
      description: "Set smart pricing rules",
      icon: BarChart3,
      action: () => {
        setLocation("/merchant");
        setOpen(false);
      },
      group: "workflows",
    },
  ];

  // Product search results
  const searchItems: CommandItem[] = (productsQuery.data ?? [])
    .slice(0, 5)
    .map((product: any) => ({
      id: `product-${product.id}`,
      label: product.title,
      description: `${product.platform} • $${((product.price ?? 0) / 100).toFixed(2)}`,
      icon: Package,
      action: () => {
        if (firstStore) setLocation(`/stores/${firstStore.id}`);
        setOpen(false);
      },
      group: "search" as const,
    }));

  const allItems = [...navigationItems, ...workflowItems, ...searchItems];
  const filtered = search
    ? allItems.filter((item) =>
        `${item.label} ${item.description}`.toLowerCase().includes(search.toLowerCase())
      )
    : navigationItems;

  const grouped = {
    navigation: filtered.filter((i) => i.group === "navigation"),
    workflows: filtered.filter((i) => i.group === "workflows"),
    search: filtered.filter((i) => i.group === "search"),
  };

  return (
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
  );
}
