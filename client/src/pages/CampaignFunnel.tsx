/**
 * CampaignFunnel.tsx — Email campaign delivery analytics.
 *
 * Surfaces the data flowing in via the SendGrid Event Webhook
 * (`email_delivery_events`). For each store the user owns, lists
 * recent email campaigns and lets them drill into a delivery funnel
 * (sent → delivered → opened → clicked → bounced).
 *
 * Tabs into the Insights page as "Campaigns".
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  Mail,
  Send,
  Inbox,
  Eye,
  MousePointerClick,
  AlertTriangle,
  Loader2,
  ChevronRight,
} from "lucide-react";

interface FunnelStage {
  label: string;
  value: number;
  rate?: number; // % of previous stage
  Icon: typeof Mail;
  color: string;
  border: string;
}

export default function CampaignFunnel() {
  const { activeStoreId } = useWorkspace();
  const { data: stores } = trpc.stores.list.useQuery();
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(activeStoreId);
  const effectiveStoreId = selectedStoreId ?? stores?.[0]?.id ?? null;

  const campaignsQuery = trpc.social.emailCampaigns.useQuery(
    { storeId: effectiveStoreId ?? 0 },
    { enabled: effectiveStoreId !== null },
  );

  const [openCampaignId, setOpenCampaignId] = useState<number | null>(null);
  const funnelQuery = trpc.social.campaignFunnel.useQuery(
    { campaignId: openCampaignId ?? 0 },
    { enabled: openCampaignId !== null },
  );

  if (!stores || stores.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Mail className="w-5 h-5 text-white/25" />
        </div>
        <p className="text-sm font-semibold text-foreground">No stores connected</p>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
          Email campaign analytics appear here once you've connected a store and sent at least one campaign.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Store selector — only when multiple stores exist */}
      {stores.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Store</span>
          <select
            value={effectiveStoreId ?? ""}
            onChange={(e) => setSelectedStoreId(Number(e.target.value))}
            className="bg-white/[0.04] border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-400/40"
          >
            {stores.map((s: any) => (
              <option key={s.id} value={s.id} className="bg-surface-overlay">
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Campaign list */}
      <div className="bento-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-4 h-4 text-sky-400" aria-hidden="true" />
          <h3 className="text-sm font-heading font-bold tracking-tight text-white">
            Recent campaigns
          </h3>
        </div>

        {campaignsQuery.isLoading && (
          <div className="flex items-center gap-2 text-white/45 text-sm py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading campaigns…
          </div>
        )}

        {campaignsQuery.data && campaignsQuery.data.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-white/55">No campaigns sent yet.</p>
            <p className="text-xs text-white/35 mt-1">
              Generate one from Store Bot growth mode, then send it to your list.
            </p>
          </div>
        )}

        {campaignsQuery.data && campaignsQuery.data.length > 0 && (
          <div className="space-y-2">
            {campaignsQuery.data.map((c: any) => {
              const isOpen = c.id === openCampaignId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOpenCampaignId(isOpen ? null : c.id)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                    isOpen
                      ? "border-sky-500/30 bg-sky-500/[0.06]"
                      : "border-white/[0.06] bg-white/[0.02] hover:border-sky-400/20"
                  }`}
                >
                  <Send
                    className={`w-3.5 h-3.5 shrink-0 ${
                      c.status === "sent" ? "text-emerald-400" : "text-white/35"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">
                      {c.subject ?? c.name}
                    </div>
                    <div className="text-[10px] text-white/40 font-mono">
                      {c.recipientCount ?? 0} recipient{c.recipientCount === 1 ? "" : "s"} ·{" "}
                      <span className="capitalize">{c.status}</span>
                      {c.sentAt && ` · ${new Date(c.sentAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-3.5 h-3.5 shrink-0 text-white/35 transition-transform ${
                      isOpen ? "rotate-90 text-sky-300" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Funnel for selected campaign */}
      {openCampaignId !== null && (
        <div className="bento-card spotlight-card p-5">
          {funnelQuery.isLoading && (
            <div className="flex items-center gap-2 text-white/45 text-sm py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Computing funnel…
            </div>
          )}
          {funnelQuery.data && (
            <FunnelDisplay data={funnelQuery.data as unknown as FunnelData} />
          )}
          {funnelQuery.error && (
            <div className="flex items-center gap-2 text-red-400 text-sm py-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{funnelQuery.error.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FunnelData {
  campaignId: number;
  name: string;
  subject: string | null;
  status: string;
  sentAt: Date | string | null;
  recipients: number;
  funnel: {
    delivered: number;
    opens: number;
    clicks: number;
    bounces: number;
    dropped: number;
    unsubscribes: number;
  };
  rates: {
    delivery: number;
    open: number;
    click: number;
  };
}

function FunnelDisplay({ data }: { data: FunnelData }) {
  const stages: FunnelStage[] = [
    {
      label: "Sent",
      value: data.recipients,
      Icon: Send,
      color: "text-sky-300",
      border: "border-sky-500/25",
    },
    {
      label: "Delivered",
      value: data.funnel.delivered,
      rate: data.rates.delivery,
      Icon: Inbox,
      color: "text-cyan-300",
      border: "border-cyan-500/25",
    },
    {
      label: "Opened",
      value: data.funnel.opens,
      rate: data.rates.open,
      Icon: Eye,
      color: "text-emerald-300",
      border: "border-emerald-500/25",
    },
    {
      label: "Clicked",
      value: data.funnel.clicks,
      rate: data.rates.click,
      Icon: MousePointerClick,
      color: "text-amber-300",
      border: "border-amber-500/25",
    },
  ];

  const max = Math.max(...stages.map((s) => s.value), 1);
  const issueCount = data.funnel.bounces + data.funnel.dropped + data.funnel.unsubscribes;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="text-base font-heading font-bold text-white truncate">
            {data.subject ?? data.name}
          </h3>
          <p className="text-[11px] text-white/40 font-mono mt-0.5">
            {data.sentAt ? `Sent ${new Date(data.sentAt).toLocaleString()}` : "Not yet sent"}
          </p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">
          Funnel
        </span>
      </div>

      <div className="space-y-3">
        {stages.map((stage, i) => {
          const widthPct = max > 0 ? (stage.value / max) * 100 : 0;
          return (
            <div key={stage.label} className="relative">
              <div className="flex items-center gap-2 mb-1">
                <stage.Icon className={`w-3.5 h-3.5 ${stage.color}`} aria-hidden="true" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/55">
                  {stage.label}
                </span>
                {i > 0 && stage.rate !== undefined && (
                  <span className="text-[10px] text-white/40 font-mono ml-auto">
                    {stage.rate.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="relative h-7 rounded-md border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 ease-out ${stage.border}`}
                  style={{
                    width: `${Math.max(widthPct, 4)}%`,
                    background: `linear-gradient(90deg, rgba(14,165,233,0.18), rgba(14,165,233,0.04))`,
                  }}
                />
                <span className="absolute inset-0 flex items-center px-3 text-sm font-semibold text-white">
                  {stage.value.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {issueCount > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-2">
          <IssuePill label="Bounced" value={data.funnel.bounces} tone="red" />
          <IssuePill label="Dropped" value={data.funnel.dropped} tone="amber" />
          <IssuePill label="Unsub'd" value={data.funnel.unsubscribes} tone="white" />
        </div>
      )}
    </div>
  );
}

function IssuePill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "white";
}) {
  const cls =
    tone === "red"
      ? "border-red-500/20 bg-red-500/[0.05] text-red-300"
      : tone === "amber"
        ? "border-amber-500/20 bg-amber-500/[0.05] text-amber-300"
        : "border-white/10 bg-white/[0.03] text-white/65";
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-[9px] font-bold uppercase tracking-widest opacity-80">{label}</div>
      <div className="text-sm font-semibold mt-0.5 font-mono">{value.toLocaleString()}</div>
    </div>
  );
}
