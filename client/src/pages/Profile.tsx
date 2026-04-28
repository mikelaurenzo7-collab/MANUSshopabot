import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CountUp } from "@/components/CountUp";
import {
  User,
  Mail,
  Shield,
  Calendar,
  Clock,
  Store,
  Plug,
  Bot,
  Package,
  Megaphone,
  Activity,
  Zap,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useLocation } from "wouter";

function StatCard({ icon: Icon, label, value, color, loading }: {
  icon: any; label: string; value: string | number; color: string; loading?: boolean;
}) {
  // Numeric values get the CountUp treatment; strings (e.g. "Healthy")
  // render as plain text. Strips $/, characters before parsing so
  // currency strings still animate ($1,234.56 → animates from 0).
  const numericMatch =
    typeof value === "string"
      ? value.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/)
      : null;
  const animatedValue =
    typeof value === "number" ? (
      <CountUp value={value} />
    ) : numericMatch ? (
      <>
        {numericMatch[1]}
        <CountUp
          value={parseFloat(numericMatch[2].replace(/,/g, ""))}
          decimals={numericMatch[2].includes(".") ? 2 : 0}
        />
        {numericMatch[3]}
      </>
    ) : (
      value
    );

  return (
    <div className={`p-4 rounded-xl border transition-colors hover:bg-white/[0.02] ${color}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <p className="text-2xl font-bold text-foreground">{animatedValue}</p>
      )}
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const { data: connSummary, isLoading: connLoading } = trpc.connectors.connectionSummary.useQuery();
  const { data: agentStatus, isLoading: agentLoading } = trpc.dashboard.agentStatus.useQuery();
  const { data: metrics, isLoading: metricsLoading } = trpc.dashboard.metrics.useQuery({});
  const { data: installedPlugins, isLoading: pluginsLoading } = trpc.plugins.myPlugins.useQuery();

  const storeList = (stores as any[]) || [];
  const totalTasks = agentStatus?.reduce((sum: number, s: any) => sum + Number(s.total || 0), 0) || 0;
  const completedTasks = agentStatus?.reduce((sum: number, s: any) => sum + Number(s.completed || 0), 0) || 0;

  return (
    <div className="relative">
      {/* Ghost watermark */}
      <div className="ghost-watermark" aria-hidden="true">PROFILE</div>
      {/* Light leaks */}
      <div className="light-leak-blue" style={{top: '5%', left: '10%'}} aria-hidden="true" />
      <div className="light-leak-cyan" style={{top: '50%', right: '5%'}} aria-hidden="true" />
    <div className="space-y-4 p-3 max-w-4xl mx-auto page-enter">
      {/* Profile Header */}
      <div className="flex items-start gap-4">
        <Avatar className="h-14 w-14 border-2 border-primary/30 shadow-[0_0_20px_rgba(157,78,221,0.2)]">
          <AvatarFallback className="text-lg font-bold bg-primary/15 text-primary">
            {user?.name?.charAt(0).toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h2 className="text-base font-black tracking-tight font-heading text-foreground leading-tight">
            {user?.name || "User"}
          </h2>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Badge
              variant="outline"
              className={user?.role === "admin"
                ? "text-primary border-primary/30 bg-sky-500/10"
                : "text-muted-foreground border-border"
              }
            >
              <Shield className="h-3 w-3 mr-1" />
              {user?.role === "admin" ? "Admin" : "Member"}
            </Badge>
            {user?.email && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Joined {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "—"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last login {user?.lastSignedIn ? new Date(user.lastSignedIn).toLocaleString() : "—"}
            </span>
          </div>
        </div>
      </div>

      <Separator className="border-white/[0.06]" />

      {/* Usage Stats */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Usage Overview
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={Store}
            label="Stores"
            value={storeList.length}
            color="bg-emerald-500/8 border-emerald-500/15"
            loading={storesLoading}
          />
          <StatCard
            icon={Plug}
            label="Integrations"
            value={(connSummary?.credentials ?? 0) + (connSummary?.socialAccounts ?? 0)}
            color="bg-blue-500/8 border-blue-500/15"
            loading={connLoading}
          />
          <StatCard
            icon={Zap}
            label="Bot Tasks Run"
            value={totalTasks}
            color="bg-sky-500/8 border-sky-500/15"
            loading={agentLoading}
          />
          <StatCard
            icon={CheckCircle2}
            label="Tasks Completed"
            value={completedTasks}
            color="bg-cyan-500/8 border-cyan-500/15"
            loading={agentLoading}
          />
        </div>
      </div>

      {/* Connected Stores */}
      <Card className="bento-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Store className="h-4 w-4 text-emerald-400" />
              Connected Stores
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={() => setLocation("/integrations")}
            >
              Manage <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {storesLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg bg-white/5" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : storeList.length > 0 ? (
            <div className="space-y-2">
              {storeList.map((store: any) => (
                <div key={store.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/[0.03] transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-white/[0.03] flex items-center justify-center border border-white/[0.05]">
                    <Store className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{store.name}</p>
                    <p className="text-xs text-muted-foreground">{store.platform} · {store.domain || "No domain"}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={store.status === "active"
                      ? "text-emerald-400 border-emerald-500/30"
                      : "text-amber-400 border-amber-500/30"
                    }
                  >
                    {store.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Store className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No stores connected yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setLocation("/architect")}
              >
                Connect Your First Store
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bot Performance Summary */}
      <Card className="bento-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Bot className="h-4 w-4 text-sky-400" />
            Bot Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agentLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: "Builder Bot", type: "architect", icon: Bot, color: "bg-sky-500/8 border-sky-500/20 text-sky-400" },
                { name: "Merchant Bot", type: "merchant", icon: Package, color: "bg-cyan-500/8 border-cyan-500/20 text-cyan-400" },
                { name: "Social Bot", type: "social", icon: Megaphone, color: "bg-amber-500/8 border-amber-500/20 text-amber-400" },
              ].map(bot => {
                const stats = agentStatus?.find((s: any) => s.agentType === bot.type);
                return (
                  <div key={bot.type} className={`p-4 rounded-xl border ${bot.color}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <bot.icon className="h-4 w-4" />
                      <span className="text-xs font-semibold">{bot.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-foreground">{stats ? Number(stats.completed) : 0}</p>
                        <p className="text-[9px] text-muted-foreground uppercase">Done</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-foreground">{stats ? Number(stats.failed) : 0}</p>
                        <p className="text-[9px] text-muted-foreground uppercase">Failed</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installed Plugins */}
      <Card className="bento-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-400" />
              Installed Plugins
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={() => setLocation("/plugins")}
            >
              App Store <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pluginsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : installedPlugins && installedPlugins.length > 0 ? (
            <div className="space-y-2">
              {installedPlugins.map((inst: any) => (
                <div key={inst.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/[0.03] transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <Zap className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{inst.plugin?.pluginName || "Plugin"}</p>
                    <p className="text-xs text-muted-foreground">v{inst.plugin?.version || "1.0"}</p>
                  </div>
                  <Badge variant="outline" className={inst.enabled ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground border-border"}>
                    {inst.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No plugins installed</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setLocation("/plugins")}
              >
                Browse App Store
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
