import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle2, Loader2, KeyRound, ExternalLink, Sparkles, Bot as BotIcon, Wrench, Eye, EyeOff, RefreshCw, Trash2,
  Package, Megaphone, LayoutGrid, Boxes, Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrand, type PlatformBrand } from "@/lib/platformBrand";

function hexToRgbTriple(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.substring(0, 2), 16)}, ${parseInt(h.substring(2, 4), 16)}, ${parseInt(h.substring(4, 6), 16)}`;
}
function tileVars(brand: PlatformBrand): React.CSSProperties {
  return {
    ["--tile-color" as any]: hexToRgbTriple(brand.color),
    ["--tile-accent" as any]: hexToRgbTriple(brand.accent),
  };
}

const BOT_LABEL: Record<string, string> = {
  architect: "Builder",
  merchant: "Merchant",
  social: "Social",
};

const BOT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  architect: BotIcon,
  merchant: Package,
  social: Megaphone,
};

const CATEGORY_LABEL: Record<string, string> = {
  data: "Data",
  marketing: "Marketing",
  messaging: "Messaging",
  logistics: "Logistics",
  fulfillment: "Fulfillment",
  reviews: "Reviews",
  support: "Support",
  analytics: "Analytics",
};

interface ToolConnector {
  id: string;
  name: string;
  icon: string;
  color: string;
  category: string;
  bots: readonly string[];
  description: string;
  capabilities: readonly string[];
  whereToFind: string;
  connectionType: "oauth" | "api_key";
  fields?: ReadonlyArray<{
    key: string;
    label: string;
    placeholder?: string;
    helpText?: string;
    type?: "text" | "password";
    required?: boolean;
  }>;
}

interface ConnectedTool {
  id: number;
  platform: string;
  status?: string;
  createdAt: string | Date;
  lastHealthCheck?: string | Date | null;
}

type GroupMode = "bot" | "category";

/**
 * Tools tab — organized two ways:
 *   - "By Bot" (default): shows each of the three bots and the tools that
 *     power them, so users see operational impact at a glance.
 *   - "By Category": groups by data/marketing/logistics/etc for users
 *     who think in terms of capability before bot.
 */
export function ToolsTab() {
  const [groupMode, setGroupMode] = useState<GroupMode>("bot");
  const { data: tools, isLoading } = trpc.tools.list.useQuery();
  const { data: connected, refetch: refetchConnected } = trpc.tools.listConnected.useQuery();
  const { data: byBot } = trpc.tools.byBot.useQuery();

  const generateOAuth = trpc.tools.generateOAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
      else toast.error(data.message || "OAuth setup required");
    },
    onError: (err) => toast.error(err.message),
  });

  const disconnect = trpc.tools.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Tool disconnected");
      refetchConnected();
    },
    onError: (err) => toast.error(err.message),
  });

  const checkHealth = trpc.tools.checkHealth.useMutation({
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => toast.error(err.message),
  });

  const connectedSet = new Set((connected || []).map((c: ConnectedTool) => c.platform));

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-44 bg-white/4 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Bot overview row — quick scan of where each bot stands */}
      {byBot && (
        <div className="grid gap-3 sm:grid-cols-3">
          {byBot.map((b) => {
            const Icon = BOT_ICONS[b.bot.id] || BotIcon;
            const ratio = b.toolCount === 0 ? 0 : b.connectedCount / b.toolCount;
            const botBrand: PlatformBrand = {
              id: b.bot.id, name: b.bot.name, icon: "", color: b.bot.color, accent: b.bot.color,
              category: "data", tagline: b.bot.tagline,
            };
            return (
              <div
                key={b.bot.id}
                className="platform-tile p-4 group"
                style={tileVars(botBrand)}
              >
                <span className="platform-tile-ribbon" />
                <span className="platform-tile-seam" />
                <div className="flex items-center gap-2.5 mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{
                      background: `linear-gradient(135deg, ${b.bot.color}30, ${b.bot.color}10)`,
                      border: `1px solid ${b.bot.color}40`,
                      color: b.bot.color,
                      boxShadow: `0 4px 14px -4px ${b.bot.color}55`,
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-heading font-semibold tracking-tight text-white">{b.bot.name}</div>
                    <div className="text-[11px] text-slate-400/90">{b.bot.tagline}</div>
                  </div>
                </div>
                <p className="text-xs text-slate-300/80 line-clamp-2 leading-relaxed mb-3">{b.bot.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">
                    <span className="font-mono font-semibold text-white">{b.connectedCount}</span>
                    <span className="text-slate-500"> / {b.toolCount} tools</span>
                  </span>
                  <div className="w-24 h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${ratio * 100}%`,
                        background: `linear-gradient(90deg, ${b.bot.color}, ${b.bot.color}aa)`,
                        boxShadow: `0 0 8px ${b.bot.color}80`,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Group toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-sky-400" /> Tool Library
          <span className="text-xs text-slate-500">({(tools || []).length} available)</span>
        </h3>
        <div
          className="inline-flex items-center bg-white/4 border border-white/8 rounded-lg p-0.5"
          role="tablist"
          aria-label="Group tools by"
        >
          <button
            role="tab"
            aria-selected={groupMode === "bot"}
            onClick={() => setGroupMode("bot")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              groupMode === "bot" ? "bg-sky-500/15 text-sky-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BotIcon className="w-3 h-3" /> By Bot
          </button>
          <button
            role="tab"
            aria-selected={groupMode === "category"}
            onClick={() => setGroupMode("category")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              groupMode === "category" ? "bg-sky-500/15 text-sky-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <LayoutGrid className="w-3 h-3" /> By Category
          </button>
        </div>
      </div>

      {/* Connected tools strip */}
      {connected && connected.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold tracking-wider uppercase text-emerald-400/80 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3" /> Active ({connected.length})
          </h4>
          <div className="space-y-2">
            {(connected as ConnectedTool[]).map((c) => {
              const tool = (tools || []).find((t: ToolConnector) => t.id === c.platform);
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl p-3 hover:bg-white/6 transition-colors"
                  style={{ borderLeft: `3px solid ${tool?.color || "#64748b"}40` }}
                >
                  <div className="text-xl">{tool?.icon || "🔌"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{tool?.name || c.platform}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <span>{CATEGORY_LABEL[tool?.category || ""]}</span>
                      <span>·</span>
                      <span>Powers {(tool?.bots || []).map((b) => BOT_LABEL[b]).join(", ")}</span>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Connected
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                    onClick={() => checkHealth.mutate({ id: c.id })}
                    disabled={checkHealth.isPending}
                    aria-label={`Check ${tool?.name || c.platform} health`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkHealth.isPending ? "animate-spin" : ""}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                    onClick={() => disconnect.mutate({ id: c.id })}
                    aria-label={`Disconnect ${tool?.name || c.platform}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available tools — grouped */}
      {groupMode === "bot" && byBot
        ? byBot.map((group) => {
            const Icon = BOT_ICONS[group.bot.id] || BotIcon;
            return (
              <div key={group.bot.id}>
                <h4 className="text-xs font-semibold tracking-wider uppercase mb-3 flex items-center gap-2" style={{ color: group.bot.color }}>
                  <Icon className="w-3 h-3" /> {group.bot.name}
                  <span className="text-slate-500 font-normal normal-case tracking-normal">
                    · {group.tools.length} tool{group.tools.length === 1 ? "" : "s"}
                  </span>
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.tools.map((tool) => (
                    <ToolCard
                      key={`${group.bot.id}-${tool.id}`}
                      tool={tool as ToolConnector}
                      isConnected={connectedSet.has(tool.id)}
                      onOAuth={() => generateOAuth.mutate({ tool: tool.id, origin: window.location.origin })}
                      oauthPending={generateOAuth.isPending}
                      onApiKeySaved={() => refetchConnected()}
                    />
                  ))}
                </div>
              </div>
            );
          })
        : groupByCategory(tools || []).map(({ category, items }) => (
            <div key={category}>
              <h4 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-3">
                {CATEGORY_LABEL[category] || category}
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    isConnected={connectedSet.has(tool.id)}
                    onOAuth={() => generateOAuth.mutate({ tool: tool.id, origin: window.location.origin })}
                    oauthPending={generateOAuth.isPending}
                    onApiKeySaved={() => refetchConnected()}
                  />
                ))}
              </div>
            </div>
          ))}
    </div>
  );
}

function groupByCategory(tools: ToolConnector[]): Array<{ category: string; items: ToolConnector[] }> {
  const order = ["data", "analytics", "marketing", "messaging", "logistics", "fulfillment", "reviews", "support"];
  const map = new Map<string, ToolConnector[]>();
  for (const t of tools) {
    const cat = t.category || "data";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(t);
  }
  return order.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
}

function ToolCard({
  tool,
  isConnected,
  onOAuth,
  oauthPending,
  onApiKeySaved,
}: {
  tool: ToolConnector;
  isConnected: boolean;
  onOAuth: () => void;
  oauthPending: boolean;
  onApiKeySaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const brand = getBrand(tool.id);
  return (
    <div
      className="platform-tile p-4 flex flex-col gap-3"
      style={tileVars(brand)}
    >
      <span className="platform-tile-ribbon" />
      <span className="platform-tile-seam" />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="platform-tile-icon-halo text-2xl leading-none flex-shrink-0">{tool.icon}</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white tracking-tight truncate">{tool.name}</div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <Boxes className="w-2.5 h-2.5" />
              {tool.bots.map((b) => BOT_LABEL[b]).join(" · ")}
            </div>
          </div>
        </div>
        {isConnected && (
          <span className="platform-connected-dot inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-2.5 h-2.5" /> Live
          </span>
        )}
      </div>

      <p className="text-xs text-slate-300/80 leading-relaxed line-clamp-3">{tool.description}</p>

      <div className="flex flex-wrap gap-1">
        {tool.capabilities.slice(0, 3).map((cap) => (
          <span
            key={cap}
            className="platform-cap-chip text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-1 font-medium"
          >
            <Sparkles className="w-2 h-2" />
            {cap}
          </span>
        ))}
      </div>

      {tool.connectionType === "oauth" ? (
        <button
          type="button"
          className="platform-tile-cta w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md text-white"
          onClick={onOAuth}
          disabled={oauthPending}
        >
          {oauthPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
          {isConnected ? "Reconnect with Google" : "Connect with Google"}
        </button>
      ) : !expanded ? (
        <button
          type="button"
          className="platform-tile-cta w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md text-white"
          onClick={() => setExpanded(true)}
        >
          <KeyRound className="w-3 h-3" />
          {isConnected ? "Update API Key" : "Add API Key"}
        </button>
      ) : (
        <ApiKeyForm
          tool={tool}
          onCancel={() => setExpanded(false)}
          onSuccess={() => {
            setExpanded(false);
            onApiKeySaved();
          }}
        />
      )}
    </div>
  );
}

function ApiKeyForm({
  tool,
  onCancel,
  onSuccess,
}: {
  tool: ToolConnector;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const connect = trpc.tools.connectWithApiKey.useMutation({
    onSuccess: (data) => {
      toast.success(`${tool.name} connected${data.accountLabel ? ` — ${data.accountLabel}` : ""}`);
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    connect.mutate({ tool: tool.id, credentials: values });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 bg-black/30 border border-white/8 rounded-lg p-3">
      <div className="text-[11px] text-slate-400 mb-1 flex items-start gap-1.5">
        <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 text-sky-400" />
        <span>{tool.whereToFind}</span>
      </div>
      {(tool.fields || []).map((field) => {
        const isSecret = field.type === "password";
        const visible = showSecrets[field.key];
        return (
          <div key={field.key} className="space-y-1">
            <Label htmlFor={`${tool.id}-${field.key}`} className="text-[11px] text-slate-300">
              {field.label}
              {field.required && <span className="text-red-400 ml-0.5">*</span>}
            </Label>
            <div className="relative">
              <Input
                id={`${tool.id}-${field.key}`}
                type={isSecret && !visible ? "password" : "text"}
                placeholder={field.placeholder}
                required={field.required}
                value={values[field.key] || ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                className="text-xs h-8 bg-white/4 border-white/10 text-white pr-8"
              />
              {isSecret && (
                <button
                  type="button"
                  onClick={() => setShowSecrets((s) => ({ ...s, [field.key]: !s[field.key] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  aria-label={visible ? "Hide value" : "Show value"}
                >
                  {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            {field.helpText && <p className="text-[10px] text-slate-500">{field.helpText}</p>}
          </div>
        );
      })}
      <div className="flex gap-2 mt-1">
        <Button
          type="submit"
          size="sm"
          className="flex-1 text-xs text-white hover:opacity-90"
          style={{ backgroundColor: tool.color }}
          disabled={connect.isPending}
        >
          {connect.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
          Verify & Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-white h-8"
          disabled={connect.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
