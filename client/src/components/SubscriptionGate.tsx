/**
 * SubscriptionGate
 * Wraps premium features — shows an upgrade prompt when the user has no active subscription.
 * Usage: <SubscriptionGate feature="Workflow Automation">...</SubscriptionGate>
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, Zap, CheckCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface SubscriptionGateProps {
  /** Feature name shown in the upgrade prompt */
  feature: string;
  /** Children rendered when subscription is active */
  children: React.ReactNode;
  /** If true, renders children but shows a banner instead of blocking */
  soft?: boolean;
}

const PLAN_FEATURES = [
  "Unlimited workflow automation",
  "All 3 bots: Builder, Merchant, Social",
  "Multi-platform integrations (Shopify, Amazon, Etsy, TikTok)",
  "AI-powered product sourcing & pricing",
  "Email campaigns & social scheduling",
  "Priority support",
];

export default function SubscriptionGate({ feature, children, soft = false }: SubscriptionGateProps) {
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const { data: subscriptionData, isLoading } = trpc.stripe.getSubscription.useQuery(undefined, {
    retry: false,
    staleTime: 60_000, // cache for 1 minute
  });

  const createCheckout = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("Redirecting to checkout...");
        window.open(data.url, "_blank");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start checkout");
      setCheckoutLoading(false);
    },
    onSettled: () => setCheckoutLoading(false),
  });

  const handleUpgrade = () => {
    setCheckoutLoading(true);
    createCheckout.mutate({ planId: "pro", origin: window.location.origin });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isActive = subscriptionData?.isActive === true;

  // Active subscription — render children
  if (isActive) return <>{children}</>;

  // Soft gate — show banner but still render children
  if (soft) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
          <Zap className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-amber-300">Upgrade to unlock full {feature}</p>
            <p className="text-[11px] text-muted-foreground">You're on the free plan. Some features may be limited.</p>
          </div>
          <Button size="sm" className="text-xs shrink-0 bg-amber-500 hover:bg-amber-600 text-black" onClick={handleUpgrade} disabled={checkoutLoading}>
            {checkoutLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Upgrade"}
          </Button>
        </div>
        {children}
      </div>
    );
  }

  // Hard gate — block access with upgrade card
  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <Card className="w-full max-w-md bg-card border-white/[0.08]">
        <CardContent className="p-8 text-center">
          {/* Lock icon */}
          <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Lock className="h-7 w-7 text-primary" />
          </div>

          {/* Headline */}
          <Badge variant="outline" className="mb-3 text-[10px] border-primary/30 text-primary">
            Pro Feature
          </Badge>
          <h2 className="text-lg font-bold text-foreground mb-2">{feature} requires a subscription</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Unlock the full power of SHOPaBOT with a Pro plan — automate your entire e-commerce operation.
          </p>

          {/* Feature list */}
          <ul className="text-left space-y-2 mb-7">
            {PLAN_FEATURES.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            onClick={handleUpgrade}
            disabled={checkoutLoading}
          >
            {checkoutLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Starting checkout...</>
            ) : (
              <><Zap className="h-4 w-4 mr-2" />Upgrade to Pro</>
            )}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-3">
            Secure checkout powered by Stripe.{" "}
            <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors inline-flex items-center gap-0.5">
              Learn more <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
