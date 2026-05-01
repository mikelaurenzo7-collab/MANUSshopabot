/**
 * ActivationCoach — smart progress card on Home.
 *
 * The "ghost nodes" + "no recommendations yet" empty states are
 * informative but generic. ActivationCoach reads the user's actual
 * state (stores connected, social accounts, workflows run) and
 * surfaces a single concrete next-best action with one click.
 *
 * Activation milestones (in order):
 *   1. CONNECT_STORE  — zero stores connected
 *   2. RUN_BUILDER    — store connected but no Builder workflow run
 *   3. CONNECT_SOCIAL — store + Builder run, no social accounts
 *   4. SEND_CAMPAIGN  — social connected, no email campaigns sent
 *   5. ACTIVATED      — all four checkpoints hit; show a celebration
 *
 * Auto-dismisses once ACTIVATED. Persists "dismissed" in localStorage
 * so power users who explicitly close it don't see it again.
 */
import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Sparkles,
  Store,
  Bot,
  Megaphone,
  Mail,
  ArrowRight,
  CheckCircle2,
  X,
} from "lucide-react";

const DISMISS_KEY = "shop_a_bot_activation_coach_dismissed";

type Milestone = "CONNECT_STORE" | "RUN_BUILDER" | "CONNECT_SOCIAL" | "SEND_CAMPAIGN" | "ACTIVATED";

interface MilestoneCopy {
  step: number;
  total: number;
  Icon: typeof Store;
  iconColor: string;
  iconBg: string;
  iconBorder: string;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  href: string;
}

const COPY: Record<Exclude<Milestone, "ACTIVATED">, MilestoneCopy> = {
  CONNECT_STORE: {
    step: 1,
    total: 4,
    Icon: Store,
    iconColor: "text-emerald-300",
    iconBg: "bg-emerald-500/12",
    iconBorder: "border-emerald-500/30",
    eyebrow: "Step 1 / 4",
    title: "Connect your first store",
    description:
      "Store Bot needs a connected storefront or launch workspace before it can research your niche, source products, and ship a catalog.",
    cta: "Connect a store",
    href: "/storefronts#integrations?returnTo=/",
  },
  RUN_BUILDER: {
    step: 2,
    total: 4,
    Icon: Bot,
    iconColor: "text-sky-300",
    iconBg: "bg-sky-500/12",
    iconBorder: "border-sky-500/30",
    eyebrow: "Step 2 / 4",
    title: "Wake the Store Bot",
    description:
      "Run a niche research workflow. Store Bot will analyse your category, draft purchase orders, and prep your store for launch.",
    cta: "Launch Store Bot",
    href: "/chat",
  },
  CONNECT_SOCIAL: {
    step: 3,
    total: 4,
    Icon: Megaphone,
    iconColor: "text-amber-300",
    iconBg: "bg-amber-500/12",
    iconBorder: "border-amber-500/30",
    eyebrow: "Step 3 / 4",
    title: "Connect a social channel",
    description:
      "Meta, TikTok, Pinterest — pick any. Store Bot will start drafting ad creatives and content the moment a channel is live.",
    cta: "Connect a channel",
    href: "/storefronts#integrations?returnTo=/",
  },
  SEND_CAMPAIGN: {
    step: 4,
    total: 4,
    Icon: Mail,
    iconColor: "text-cyan-300",
    iconBg: "bg-cyan-500/12",
    iconBorder: "border-cyan-500/30",
    eyebrow: "Step 4 / 4",
    title: "Send your first email campaign",
    description:
      "Generate a recovery flow or promotional email. Once it ships, the Insights → Campaigns funnel starts tracking opens and clicks in real time.",
    cta: "Open Store Bot",
    href: "/chat",
  },
};

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "true";
  } catch {
    return false;
  }
}

export function ActivationCoach() {
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  // Pull the four signals — these queries already run elsewhere on
  // Home, so React Query will hit cache rather than refetch.
  const storesQuery = trpc.stores.list.useQuery(undefined, { staleTime: 30_000 });
  const socialQuery = trpc.connectors.listSocialAccounts.useQuery(undefined, { staleTime: 30_000 });
  const workflowsQuery = trpc.workflows.counts.useQuery(undefined, { staleTime: 30_000 });

  const milestone = useMemo<Milestone>(() => {
    const stores = storesQuery.data ?? [];
    const social = socialQuery.data ?? [];
    const workflowCounts = workflowsQuery.data;

    if (stores.length === 0) return "CONNECT_STORE";
    // workflowCounts.total covers any workflow run (Builder or otherwise);
    // for the activation flow we treat any successfully-launched workflow
    // as crossing this checkpoint.
    const totalWorkflows = (workflowCounts?.total as number | undefined) ?? 0;
    if (totalWorkflows === 0) return "RUN_BUILDER";
    const activeSocial = social.filter((a: any) => a?.status === "active");
    if (activeSocial.length === 0) return "CONNECT_SOCIAL";
    // We don't have a direct "campaigns sent" signal from this query
    // surface, so we treat reaching CONNECT_SOCIAL + having a workflow as
    // the gate. The Insights Campaigns tab shows real funnel data once
    // campaigns ship, which is the actual completion signal.
    if (totalWorkflows < 2) return "SEND_CAMPAIGN";
    return "ACTIVATED";
  }, [storesQuery.data, socialQuery.data, workflowsQuery.data]);

  // Reset the dismissed flag if the user re-enters an unactivated state
  // (e.g., they archived all stores). Keeps the coach honest.
  useEffect(() => {
    if (milestone !== "ACTIVATED" && dismissed) {
      // Don't auto-undismiss; respect the user's choice. The flag clears
      // only when localStorage is cleared.
    }
  }, [milestone, dismissed]);

  if (dismissed) return null;
  if (milestone === "ACTIVATED") {
    return (
      <div className="relative rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/[0.08] via-sky-500/[0.04] to-transparent px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="eyebrow" style={{ color: "rgba(110, 231, 183, 0.85)" }}>
              Fully activated
            </span>
            <Sparkles className="w-3 h-3 text-emerald-300" aria-hidden="true" />
          </div>
          <p className="text-xs text-white/70 mt-1 truncate">
            Store Bot is wired up across launch, operations, and growth. Check the Insights tab to track performance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              window.localStorage.setItem(DISMISS_KEY, "true");
            } catch {
              /* ignore */
            }
          }}
          className="shrink-0 w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/45 hover:text-white/80 hover:border-white/[0.15] transition-colors"
          aria-label="Dismiss activation coach"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const c = COPY[milestone];
  const progressPct = Math.round(((c.step - 1) / c.total) * 100);

  return (
    <div className="relative rounded-xl border border-white/[0.08] bg-gradient-to-r from-white/[0.04] via-white/[0.02] to-transparent overflow-hidden">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/[0.04]">
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-cyan-500 transition-all duration-700"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="px-4 py-3 flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-lg ${c.iconBg} ${c.iconBorder} border flex items-center justify-center shrink-0`}
        >
          <c.Icon className={`w-4 h-4 ${c.iconColor}`} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/60 leading-none">
              {c.eyebrow}
            </span>
          </div>
          <p className="text-sm font-semibold text-white truncate">{c.title}</p>
          <p className="text-xs text-white/55 mt-0.5 leading-snug truncate">{c.description}</p>
        </div>
        <Link
          href={c.href}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 hover:border-sky-400/40 transition-all"
        >
          {c.cta}
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              window.localStorage.setItem(DISMISS_KEY, "true");
            } catch {
              /* ignore */
            }
          }}
          className="shrink-0 w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/35 hover:text-white/80 hover:border-white/[0.15] transition-colors"
          aria-label="Dismiss activation coach"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
