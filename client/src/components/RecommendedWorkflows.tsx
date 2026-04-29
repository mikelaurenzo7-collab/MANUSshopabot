/**
 * RecommendedWorkflows.tsx — persona-aware "next three" surface.
 *
 * Reads `workflows.recommendedForOrg`, which classifies the org's
 * lifecycle stage from real data (store count + product count) and
 * returns 3 workflows with reasons. Renders them as launch-ready
 * cards on the Home dashboard so the user always knows what to do
 * next without scrolling a 30-item picker.
 *
 * Why this exists: a fresh-start operator and an existing-store
 * operator have different "first wins". Without state-aware
 * recommendations, both see the same generic workflow list and
 * either pick wrong or pick nothing.
 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Palette, DollarSign, Package, LayoutGrid, ShieldCheck,
  Shield, ClipboardCheck, Sparkles, Target, TrendingUp, Globe,
  Zap, Loader2, ArrowRight, Wand2,
} from "lucide-react";
import { toast } from "sonner";

const ICON_MAP: Record<string, typeof Search> = {
  Search,
  Palette,
  DollarSign,
  Package,
  LayoutGrid,
  ShieldCheck,
  Shield,
  ClipboardCheck,
  Sparkles,
  Target,
  TrendingUp,
  Globe,
};

const ACCENT_STYLES: Record<string, { bg: string; border: string; text: string; ring: string; glow: string }> = {
  sky:     { bg: "bg-sky-500/10",     border: "border-sky-500/25",     text: "text-sky-300",     ring: "ring-sky-500/20",     glow: "hover:shadow-sky-500/15"     },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/25",    text: "text-cyan-300",    ring: "ring-cyan-500/20",    glow: "hover:shadow-cyan-500/15"    },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/25",  text: "text-violet-300",  ring: "ring-violet-500/20",  glow: "hover:shadow-violet-500/15"  },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-300", ring: "ring-emerald-500/20", glow: "hover:shadow-emerald-500/15" },
  fuchsia: { bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/25", text: "text-fuchsia-300", ring: "ring-fuchsia-500/20", glow: "hover:shadow-fuchsia-500/15" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/25",   text: "text-amber-300",   ring: "ring-amber-500/20",   glow: "hover:shadow-amber-500/15"   },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/25",    text: "text-rose-300",    ring: "ring-rose-500/20",    glow: "hover:shadow-rose-500/15"    },
};

const STAGE_COPY: Record<string, { eyebrow: string; lead: string }> = {
  fresh:     { eyebrow: "Recommended for you · Fresh start",       lead: "You haven't connected a store yet — start with discovery." },
  launching: { eyebrow: "Recommended for you · Launching",          lead: "Your store is connected and the catalog is filling up." },
  operating: { eyebrow: "Recommended for you · Operating",          lead: "Your store has products and orders. Time to tighten operations." },
  scaling:   { eyebrow: "Recommended for you · Scaling",            lead: "You're past the operating threshold. Expand and squeeze every margin." },
};

export function RecommendedWorkflows() {
  const recsQuery = trpc.workflows.recommendedForOrg.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const utils = trpc.useUtils();
  const [launchingType, setLaunchingType] = useState<string | null>(null);

  const launchMutation = trpc.workflows.launch.useMutation({
    onMutate: (vars) => setLaunchingType(vars.workflowType),
    onSuccess: () => {
      toast.success("Workflow launched — track it in the Activity feed");
      utils.workflows.active.invalidate();
      utils.workflows.list.invalidate();
      utils.workflows.counts.invalidate();
      utils.dashboard.recentActivity.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to launch workflow");
    },
    onSettled: () => setLaunchingType(null),
  });

  if (recsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-48 bg-white/[0.04]" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  if (recsQuery.error || !recsQuery.data) {
    return null; // Fail silent — the rest of Home should still render.
  }

  const { stage, recommendations, defaultStoreId, productCount, storeCount } = recsQuery.data;
  const stageCopy = STAGE_COPY[stage] ?? STAGE_COPY.fresh;

  return (
    <section aria-labelledby="recommended-workflows-heading" className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">
            <span className="inline-flex items-center gap-1">
              <Wand2 className="h-3 w-3 text-fuchsia-400/70" aria-hidden="true" />
              {stageCopy.eyebrow}
            </span>
          </p>
          <h2 id="recommended-workflows-heading" className="text-base font-heading font-bold tracking-tight text-foreground mt-0.5">
            Your next three moves
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{stageCopy.lead}</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/40 uppercase tracking-widest">
          <span><span className="text-white/65">{storeCount}</span> {storeCount === 1 ? "store" : "stores"}</span>
          <span><span className="text-white/65">{productCount}</span> products</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {recommendations.map((rec, idx) => {
          const Icon = ICON_MAP[rec.icon] ?? Sparkles;
          const accent = ACCENT_STYLES[rec.accent] ?? ACCENT_STYLES.sky;
          const isLaunching = launchingType === rec.type;
          const needsStore = rec.scope === "specific_store";
          const canLaunch = !needsStore || defaultStoreId !== null;

          const handleLaunch = () => {
            if (!canLaunch) {
              toast.error("Connect a store first to run this workflow");
              return;
            }
            launchMutation.mutate({
              agentType: rec.agentType,
              workflowType: rec.type,
              title: rec.title,
              scope: rec.scope,
              ...(needsStore && defaultStoreId ? { storeId: defaultStoreId } : {}),
              input: {},
            });
          };

          return (
            <article
              key={rec.type}
              className={`rounded-xl border ${accent.border} ${accent.bg} p-4 transition-all hover:bg-white/[0.04] hover:shadow-lg ${accent.glow}`}
            >
              <div className="flex items-start gap-2.5 mb-2.5">
                <div className={`h-8 w-8 rounded-lg ${accent.bg} border ${accent.border} ring-1 ${accent.ring} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-4 w-4 ${accent.text}`} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[9px] font-bold uppercase tracking-widest ${accent.text}`}>
                      {idx + 1} · {rec.agentType === "architect" ? "Builder" : rec.agentType === "merchant" ? "Merchant" : "Social"}
                    </p>
                    {(rec as any).autonomous && (
                      <span
                        className="inline-flex items-center text-[8px] font-bold uppercase tracking-[0.1em] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5 leading-none"
                        title="Autonomous workflow — the bot picks which tools to call. Audit trail surfaces every dispatch on the workflow detail."
                      >
                        Auto
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-foreground leading-tight mt-0.5">
                    {rec.title}
                  </h3>
                </div>
              </div>
              <p className="text-[11px] text-white/60 leading-relaxed mb-3 min-h-[3.5rem]">
                {rec.reason}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={isLaunching || launchMutation.isPending || !canLaunch}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg ${accent.bg} border ${accent.border} ${accent.text} text-xs font-medium hover:bg-white/[0.04] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 ${accent.ring}`}
                >
                  {isLaunching ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Launching…
                    </>
                  ) : (
                    <>
                      <Zap className="h-3 w-3" aria-hidden="true" />
                      Launch
                    </>
                  )}
                </button>
                <Link
                  href={
                    rec.agentType === "architect" ? "/architect"
                      : rec.agentType === "merchant" ? "/merchant"
                        : "/social"
                  }
                  className="inline-flex items-center justify-center px-2.5 py-2 rounded-lg border border-white/[0.08] text-white/55 hover:text-white hover:border-white/20 hover:bg-white/[0.03] transition-colors text-xs"
                  aria-label={`Open ${rec.agentType} bot details`}
                  title="See bot details"
                >
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
              {!canLaunch && (
                <p className="text-[10px] text-amber-300/85 mt-2 leading-relaxed">
                  Connect a store first — <Link href="/storefronts#integrations" className="underline underline-offset-2 hover:text-amber-200">go to integrations</Link>
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
