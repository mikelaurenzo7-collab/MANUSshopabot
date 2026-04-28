/**
 * StripeSuccessBanner.tsx — Subscription Success Banner
 *
 * Shows after user returns from Stripe checkout with ?session_id=...
 * Verifies the session and displays a success message.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StripeSuccessBanner() {
  const [_location, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Extract session_id from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session_id");
    if (id) {
      setSessionId(id);
      // Remove the query param from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const subscriptionQuery = trpc.stripe.getSubscription.useQuery(undefined, {
    enabled: Boolean(sessionId) && !dismissed,
  });

  // Show success message when subscription is active
  useEffect(() => {
    if (sessionId && subscriptionQuery.data?.isActive && !dismissed) {
      toast.success(
        `Subscription activated. You're now on the ${subscriptionQuery.data.plan} plan.`,
        { duration: 5000 }
      );
    }
  }, [sessionId, subscriptionQuery.data?.isActive, dismissed]);

  if (!sessionId || dismissed) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-b border-green-500/30 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
          <div className="flex flex-col">
            <p className="text-sm font-semibold text-green-300">
              Subscription activated
            </p>
            <p className="text-xs text-green-200/70">
              Your plan is now active. Welcome to Shop_a_Bot.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDismissed(true)}
          className="text-green-300 hover:text-green-200 hover:bg-green-500/10"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
