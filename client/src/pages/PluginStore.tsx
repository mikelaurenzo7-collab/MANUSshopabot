/**
 * PluginStore.tsx — first-party micro-bot marketplace.
 *
 * Rendered as the "Plugins" tab in the Storefronts hub. Lists
 * available plugins (Customer Support, Email Marketing, Reviews,
 * etc.), shows what the user has installed, and lets them toggle /
 * uninstall. Pre-launch the catalog is empty — the empty state
 * sets honest expectations instead of looking broken.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plug,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Download,
  Loader2,
  Check,
  Sparkles,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { HaloEmptyState } from "@/components/HaloEmptyState";

export default function PluginStore() {
  const available = trpc.plugins.listAvailable.useQuery();
  const myPlugins = trpc.plugins.myPlugins.useQuery();

  const [installingId, setInstallingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<{ id: number; name: string } | null>(null);

  const installMutation = trpc.plugins.install.useMutation({
    onMutate: (vars) => setInstallingId(vars.pluginId),
    onSuccess: (_data, vars) => {
      const plugin = (available.data || []).find((p: any) => p.id === vars.pluginId);
      toast.success(`Installed ${plugin?.pluginName ?? "plugin"}`);
      available.refetch();
      myPlugins.refetch();
    },
    onError: (err) => toast.error(err.message || "Install failed"),
    onSettled: () => setInstallingId(null),
  });

  const uninstallMutation = trpc.plugins.uninstall.useMutation({
    onSuccess: () => {
      toast.success("Plugin uninstalled");
      myPlugins.refetch();
    },
    onError: (err) => toast.error(err.message || "Uninstall failed"),
    onSettled: () => setUninstallTarget(null),
  });

  const toggleMutation = trpc.plugins.toggle.useMutation({
    onMutate: (vars) => setTogglingId(vars.pluginId),
    onSuccess: () => myPlugins.refetch(),
    onError: (err) => toast.error(err.message || "Toggle failed"),
    onSettled: () => setTogglingId(null),
  });

  const installedIds = new Set((myPlugins.data || []).map((p: any) => p.pluginId));
  const availableCount = (available.data || []).length;
  const installedCount = (myPlugins.data || []).length;

  return (
    <div className="space-y-6 p-3 relative">
      {/* ── Available Plugins ────────────────────────────────────── */}
      <section>
        <header className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-fuchsia-400" />
          <h2 className="text-sm font-heading font-bold tracking-tight text-foreground">
            Plugin marketplace
          </h2>
          <span className="text-[10px] text-white/35 ml-auto font-mono">
            {available.isLoading ? "loading…" : `${availableCount} available`}
          </span>
        </header>

        {available.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl bg-white/[0.03]" />
            ))}
          </div>
        ) : availableCount === 0 ? (
          // Pre-launch state — first-party micro-bots ship in waves
          // post-GA. Violet halo for "quiet contemplation"; no CTA
          // because there's nothing to install yet. The build-one
          // hint stays as a footer line below the helper.
          <div>
            <HaloEmptyState
              tone="violet"
              icon={Plug}
              title="Catalog opens at launch"
              description="First-party micro-bots — Customer Support (Zendesk), Email Marketing (Klaviyo), Reviews (Judge.me), Loyalty (LoyaltyLion) — ship in waves once we hit GA. You'll see them here automatically."
            />
            <p className="text-[10px] text-white/35 mt-4 font-mono uppercase tracking-widest text-center">
              Want to build one? Hit hello@shop-a-bot.app
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {available.data!.map((plugin: any) => {
              const isInstalled = installedIds.has(plugin.id);
              const isInstalling = installingId === plugin.id;
              return (
                <article
                  key={plugin.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-fuchsia-400/25 hover:bg-white/[0.035]"
                >
                  <header className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate">{plugin.pluginName}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                        by {plugin.author} · v{plugin.version}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-white/10 text-white/55 capitalize shrink-0"
                    >
                      {plugin.category || "utility"}
                    </Badge>
                  </header>
                  <p className="text-xs text-white/60 leading-relaxed line-clamp-3 mb-4 min-h-[3rem]">
                    {plugin.description}
                  </p>
                  {isInstalled ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-medium text-emerald-300">
                      <Check className="h-3 w-3" /> Installed
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => installMutation.mutate({ pluginId: plugin.id })}
                      disabled={isInstalling || installMutation.isPending}
                    >
                      {isInstalling ? (
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3 mr-1.5" />
                      )}
                      {isInstalling ? "Installing…" : "Install"}
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Installed Plugins ────────────────────────────────────── */}
      <section>
        <header className="flex items-center gap-2 mb-3">
          <Store className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-heading font-bold tracking-tight text-foreground">
            My installed plugins
          </h2>
          <span className="text-[10px] text-white/35 ml-auto font-mono">
            {installedCount} installed
          </span>
        </header>

        {myPlugins.isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl bg-white/[0.03]" />
            ))}
          </div>
        ) : installedCount === 0 ? (
          // Installed list is empty but the marketplace is right
          // above on the same page — so the next-action is "scroll
          // up", which isn't a CTA worth wiring. Cyan halo signals
          // the connect/install lane.
          <HaloEmptyState
            tone="cyan"
            icon={Plug}
            title="No plugins installed yet"
            description="Install one from the marketplace above and it'll appear here. You can toggle plugins on/off without uninstalling — handy for A/B testing a new bot's behavior."
          />
        ) : (
          <div className="space-y-2">
            {myPlugins.data!.map((inst: any) => {
              const isToggling = togglingId === inst.pluginId;
              const enabled = !!inst.enabled;
              return (
                <article
                  key={inst.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-cyan-400/25 hover:bg-white/[0.035] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                        enabled
                          ? "bg-emerald-500/10 border border-emerald-500/25"
                          : "bg-white/[0.04] border border-white/[0.08]"
                      }`}
                    >
                      <Plug
                        className={`h-4 w-4 ${enabled ? "text-emerald-400" : "text-white/60"}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">
                        {inst.plugin?.pluginName || `Plugin #${inst.pluginId}`}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {inst.plugin?.description ?? "No description"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        toggleMutation.mutate({ pluginId: inst.pluginId, enabled: !enabled })
                      }
                      disabled={isToggling}
                      className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                      title={enabled ? "Disable plugin" : "Enable plugin"}
                      aria-label={enabled ? "Disable plugin" : "Enable plugin"}
                    >
                      {isToggling ? (
                        <Loader2 className="w-5 h-5 text-white/55 animate-spin" />
                      ) : enabled ? (
                        <ToggleRight className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-white/60" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUninstallTarget({
                          id: inst.pluginId,
                          name: inst.plugin?.pluginName || `Plugin #${inst.pluginId}`,
                        })
                      }
                      className="p-1.5 rounded-md text-white/60 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Uninstall plugin"
                      aria-label="Uninstall plugin"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Confirm uninstall — destructive actions deserve a click-twice gate */}
      <AlertDialog
        open={!!uninstallTarget}
        onOpenChange={(open) => !open && setUninstallTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall {uninstallTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the plugin from your account. Settings and connection data are deleted.
              You can reinstall from the marketplace at any time, but custom configuration won't be
              restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() =>
                uninstallTarget && uninstallMutation.mutate({ pluginId: uninstallTarget.id })
              }
              disabled={uninstallMutation.isPending}
            >
              {uninstallMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uninstalling…
                </>
              ) : (
                "Uninstall"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
