/**
 * StripeSuccessBanner.tsx — celebration moment after a successful Stripe checkout.
 *
 * The user just paid us — this is the only "they gave us money" moment
 * the product has, so the banner has to feel celebratory, not utility.
 * Emerald halo + plan-name capitalisation + a single "Start using your
 * bots" CTA. The historical implementation rendered a flat green strip
 * AND fired a duplicate toast for the same event; the toast is gone
 * now so the banner is the canonical confirmation.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  scale: "Scale",
};

export function StripeSuccessBanner() {
  const [_location] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Extract session_id from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session_id");
    if (id) {
      setSessionId(id);
      // Strip the param so it doesn't survive a refresh.
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const subscriptionQuery = trpc.stripe.getSubscription.useQuery(undefined, {
    enabled: Boolean(sessionId) && !dismissed,
  });

  if (!sessionId || dismissed || !subscriptionQuery.data?.isActive) {
    return null;
  }

  const planRaw = subscriptionQuery.data.plan ?? "starter";
  const planLabel = PLAN_LABEL[planRaw] ?? planRaw;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 border-b border-emerald-500/30 bg-gradient-to-r from-emerald-500/[0.10] via-emerald-500/[0.06] to-sky-500/[0.06] backdrop-blur-md shadow-[0_8px_32px_-12px_rgba(16,185,129,0.35)]"
    >
      {/* Subtle moving aurora — just enough to feel alive without
          stealing focus from the page underneath. */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none bg-gradient-to-r from-transparent via-emerald-400/[0.08] to-transparent animate-pulse"
        aria-hidden="true"
      />

      <div className="relative max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div
              className="absolute inset-0 rounded-xl bg-emerald-400/30 blur-md"
              aria-hidden="true"
            />
            <div className="relative h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shadow-[0_0_18px_rgba(16,185,129,0.35)]">
              <ShieldCheck className="h-4 w-4 text-emerald-200" aria-hidden="true" />
            </div>
          </div>
          <div className="flex flex-col min-w-0">
            <p className="text-sm font-heading font-bold tracking-tight text-emerald-100 truncate">
              Welcome to {planLabel} — your bots are live
            </p>
            <p className="text-xs text-emerald-200/70 truncate">
              Subscription activated. Time to put them to work.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Link href="/chat">
            <Button
              size="sm"
              className="hidden sm:inline-flex h-8 gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-50 border border-emerald-400/30"
              onClick={() => setDismissed(true)}
            >
              <span className="text-xs font-medium">Start using your bots</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss subscription confirmation"
            className="h-8 w-8 p-0 text-emerald-200/80 hover:text-emerald-100 hover:bg-emerald-500/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
