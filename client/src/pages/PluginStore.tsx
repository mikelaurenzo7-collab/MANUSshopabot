import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 relative">
      {/* Ghost watermark */}
      <div className="ghost-watermark" aria-hidden="true">PLUGINS</div>
      {/* Light leaks */}
      <div className="light-leak-blue" style={{top: '5%', left: '10%'}} aria-hidden="true" />
      <div className="light-leak-purple" style={{top: '50%', right: '5%'}} aria-hidden="true" />
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Store className="w-6 h-6 text-blue-500" />
          Bot App Store
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Extend your orchAIstrate with first-party micro-bots. One click to install.
        </p>
      </div>

      {/* Available Plugins */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Available Plugins</h2>
        {!available.data?.length ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Plug className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No plugins available yet. First-party micro-bots are coming soon — Customer Support (Zendesk),
                Email Marketing (Klaviyo), Reviews (Judge.me), and more.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {available.data.map((plugin: any) => (
              <Card key={plugin.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plugin.pluginName}</CardTitle>
                    <Badge variant="outline">{plugin.category || "utility"}</Badge>
                  </div>
                  <CardDescription>by {plugin.author} · v{plugin.version}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">{plugin.description}</p>
                  {installedIds.has(plugin.id) ? (
                    <Badge className="bg-green-100 text-green-800">Installed</Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => installMutation.mutate({ pluginId: plugin.id })}
                      disabled={installMutation.isPending}
                    >
                      <Download className="w-3 h-3 mr-1" /> Install
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Installed Plugins */}
      <div>
        <h2 className="text-lg font-semibold mb-3">My Installed Plugins</h2>
        {!myPlugins.data?.length ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                You haven't installed any plugins yet. Browse the store above.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {myPlugins.data.map((inst: any) => (
              <Card key={inst.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Plug className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{inst.plugin?.pluginName || `Plugin #${inst.pluginId}`}</p>
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
                      className="text-red-500 hover:text-red-700"
                      onClick={() => uninstallMutation.mutate({ pluginId: inst.pluginId })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
