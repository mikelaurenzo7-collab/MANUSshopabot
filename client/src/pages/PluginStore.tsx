import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Store,
  Plug,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Download,
  Package,
} from "lucide-react";

export default function PluginStore() {
  const available = trpc.plugins.listAvailable.useQuery();
  const myPlugins = trpc.plugins.myPlugins.useQuery();
  const installMutation = trpc.plugins.install.useMutation({
    onSuccess: () => {
      available.refetch();
      myPlugins.refetch();
    },
  });
  const uninstallMutation = trpc.plugins.uninstall.useMutation({
    onSuccess: () => myPlugins.refetch(),
  });
  const toggleMutation = trpc.plugins.toggle.useMutation({
    onSuccess: () => myPlugins.refetch(),
  });

  const installedIds = new Set((myPlugins.data || []).map((p: any) => p.pluginId));

  if (available.isLoading) {
    return (
      <div className="relative overflow-hidden page-enter space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden page-enter space-y-6 p-6">
      <div className="ghost-watermark" aria-hidden="true">PLUGINS</div>
      <div className="light-leak-blue" style={{ top: "5%", left: "10%" }} aria-hidden="true" />
      <div className="light-leak-purple" style={{ top: "50%", right: "5%" }} aria-hidden="true" />

      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(14,165,233,0.12)] shrink-0">
            <Store className="w-5 h-5 text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="micro-label mb-1">Marketplace</p>
            <h1 className="font-heading font-bold tracking-tight text-2xl text-white">
              Bot App Store
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Extend your SHOPaBOT with first-party micro-bots. One click to install.
            </p>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-sky-400/30 to-transparent mt-4" />
      </div>

      {/* Available Plugins */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
          <Package className="w-3.5 h-3.5" /> Available Plugins
        </h2>
        {!available.data?.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Plug className="w-6 h-6 text-sky-400" />
            </div>
            <p className="font-medium text-white/80 mb-1">No Plugins Available Yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              First-party micro-bots are coming soon — Customer Support (Zendesk),
              Email Marketing (Klaviyo), Reviews (Judge.me), and more.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {available.data.map((plugin: any) => (
              <div key={plugin.id} className="glass-card relative overflow-hidden group">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Plug className="w-4 h-4 text-amber-400" />
                    </div>
                    <Badge variant="outline" className="text-xs">{plugin.category || "utility"}</Badge>
                  </div>
                  <p className="font-semibold text-sm text-white mt-3 mb-0.5">{plugin.pluginName}</p>
                  <p className="text-xs text-muted-foreground mb-3">by {plugin.author} · v{plugin.version}</p>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{plugin.description}</p>
                  {installedIds.has(plugin.id) ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Installed</Badge>
                  ) : (
                    <Button
                      size="sm"
                      className="btn-glow w-full"
                      onClick={() => installMutation.mutate({ pluginId: plugin.id })}
                      disabled={installMutation.isPending}
                    >
                      <Download className="w-3 h-3 mr-1" /> Install
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Installed Plugins */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
          <Plug className="w-3.5 h-3.5" /> My Installed Plugins
        </h2>
        {!myPlugins.data?.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Package className="w-6 h-6 text-sky-400" />
            </div>
            <p className="font-medium text-white/80 mb-1">No Plugins Installed</p>
            <p className="text-sm text-muted-foreground">
              You haven't installed any plugins yet. Browse the store above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {myPlugins.data.map((inst: any) => (
              <div key={inst.id} className="glass-subtle rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                    <Plug className="w-4 h-4 text-sky-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-white">
                      {inst.plugin?.pluginName || `Plugin #${inst.pluginId}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inst.plugin?.description?.slice(0, 80) || "No description"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleMutation.mutate({ pluginId: inst.pluginId, enabled: !inst.enabled })}
                  >
                    {inst.enabled ? (
                      <ToggleRight className="w-5 h-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-gray-400" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-400"
                    onClick={() => uninstallMutation.mutate({ pluginId: inst.pluginId })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
