/**
 * SubscriptionGate
 * Wraps premium features — shows an upgrade prompt when the user has no active subscription.
 * Usage: <SubscriptionGate feature="Workflow Automation">...</SubscriptionGate>
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Zap, CheckCircle, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface SubscriptionGateProps {
  feature: string;
  children: React.ReactNode;
  soft?: boolean;
}

type PlanId = "starter" | "growth" | "pro" | "scale";

/** Pick the next-tier upsell from the user's current plan. */
function nextTier(current: PlanId | null | undefined): PlanId {
  switch (current) {
    case "starter": return "growth";
    case "growth":  return "pro";
    case "pro":     return "scale";
    case "scale":   return "scale";
    default:        return "growth"; // fresh user → Growth is the entry-point upsell
  }
}

const PLAN_LABEL: Record<PlanId, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  scale: "Scale",
};

/** Surfaced under the upgrade card — keeps each tier's pitch honest. */
const TIER_HIGHLIGHTS: Record<PlanId, string[]> = {
  starter: [
    "1 connected store",
    "Launch mode — niche research + store setup",
    "Operator mode — basic fulfillment",
    "500 AI actions / month",
    "Email support",
  ],
  growth: [
    "3 connected stores",
    "All three modes — Launch, Operator & Growth",
    "5,000 AI actions / month",
    "Meta + TikTok ad automation",
    "Priority support",
  ],
  pro: [
    "10 connected stores",
    "All 3 Bots + Elite workflows",
    "25,000 AI actions / month",
    "Full platform integration suite",
    "Dedicated Slack support",
  ],
  scale: [
    "Unlimited stores",
    "All 3 Bots + custom workflows",
    "Unlimited AI actions",
    "White-label option",
    "Dedicated success manager",
  ],
};

export default function SubscriptionGate({ feature, children, soft = false }: SubscriptionGateProps) {
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const { data: subscriptionData, isLoading } = trpc.stripe.getSubscription.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  const createCheckout = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("Redirecting to Stripe checkout…");
        window.open(data.url, "_blank");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start checkout");
      setCheckoutLoading(false);
    },
    onSettled: () => setCheckoutLoading(false),
  });

  const currentPlan = (subscriptionData?.plan ?? null) as PlanId | null;
  const upsellPlan = nextTier(currentPlan);

  const handleUpgrade = () => {
    setCheckoutLoading(true);
    createCheckout.mutate({ planId: upsellPlan, origin: window.location.origin });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isActive = subscriptionData?.isActive === true;
  if (isActive) return <>{children}</>;

  // ── Soft gate: banner + children ──────────────────────────────────────────
  if (soft) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-amber-500/20">
          <div className="h-7 w-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-300">Upgrade to unlock full {feature}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">You're on the free plan. Some features may be limited.</p>
          </div>
          <Button
            size="sm"
            className="text-xs shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-semibold shadow-lg shadow-amber-500/20"
            onClick={handleUpgrade}
            disabled={checkoutLoading}
          >
            {checkoutLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Upgrade →"}
          </Button>
        </div>
        {children}
      </div>
    );
  }

  // ── Hard gate: full upgrade card ──────────────────────────────────────────
  return (
    <div className="flex items-center justify-center min-h-[460px] p-6">
      {/* Outer glow ring */}
      <div className="relative w-full max-w-sm">
        {/* Ambient glow */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-sky-500/10 via-violet-500/5 to-transparent blur-2xl -z-10" />

        {/* Card */}
        <div className="relative rounded-2xl border border-white/[0.08] bg-[#0a0b0f]/90 backdrop-blur-xl overflow-hidden">
          {/* Top gradient bar */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />

          <div className="p-8 text-center">
            {/* Icon */}
            <div className="mx-auto mb-5 relative w-fit">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-sky-500/20 to-violet-500/20 border border-white/[0.08] flex items-center justify-center">
                <Lock className="h-7 w-7 text-sky-400" />
              </div>
              {/* Sparkle badge */}
              <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Sparkles className="h-2.5 w-2.5 text-white" />
              </div>
            </div>

            {/* Headline */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 mb-4">
              <Zap className="h-3 w-3 text-sky-400" />
              <span className="text-[10px] font-semibold text-sky-400 uppercase tracking-wider">{PLAN_LABEL[upsellPlan]} Feature</span>
            </div>

            <h2 className="text-lg font-bold text-foreground mb-2 leading-snug">
              {feature} requires<br />the {PLAN_LABEL[upsellPlan]} plan
            </h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {currentPlan
                ? `You're on ${PLAN_LABEL[currentPlan]}. Upgrade to ${PLAN_LABEL[upsellPlan]} to unlock this and the rest of the tier's capabilities.`
                : "Start your 7-day free trial — bots running 24/7 across your store."}
            </p>

            {/* Feature list — tier-aware */}
            <ul className="text-left space-y-2.5 mb-7 px-1">
              {TIER_HIGHLIGHTS[upsellPlan].map((f, i) => (
                <li key={i} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <div className="h-4 w-4 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-2.5 w-2.5 text-emerald-400" />
                  </div>
                  {f}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Button
              className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold shadow-lg shadow-sky-500/25 transition-all duration-200"
              onClick={handleUpgrade}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Starting checkout…</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" />Upgrade to {PLAN_LABEL[upsellPlan]}</>
              )}
            </Button>

            <p className="text-[11px] text-muted-foreground mt-3">
              Secure checkout via Stripe.{" "}
              <a
                href="https://stripe.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors inline-flex items-center gap-0.5"
              >
                Learn more <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </p>
          </div>

          {/* Bottom gradient bar */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-violet-400/30 to-transparent" />
        </div>
      </div>
    </div>
  );
}
