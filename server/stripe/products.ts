/**
 * Shop_a_Bot — Stripe Subscription Plans
 * Centralized plan definitions. Price IDs are created on first checkout
 * using Stripe's inline price creation (no pre-seeding required).
 */

export type PlanId = "starter" | "growth" | "pro" | "scale";

const PLAN_IDS: readonly PlanId[] = ["starter", "growth", "pro", "scale"] as const;

/** Type-safe planId narrowing. Use this anywhere we accept a planId from
 *  an untrusted boundary (Stripe metadata, webhook payload, request input). */
export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  priceCents: number; // monthly, in cents
  features: string[];
  /**
   * Maximum number of connected stores per organization. `Infinity` for
   * unlimited (Scale). Enforced server-side in `stores.create`; surfaced
   * in the UI by `SubscriptionGate`.
   */
  storeLimit: number;
}

/**
 * Look up the store limit for a plan. Defaults to the Starter cap (1)
 * when the user has no plan yet — matches the trial behaviour: one
 * store while trialing, more after upgrade.
 */
export function getStoreLimit(planId: PlanId | null | undefined): number {
  if (!planId) return PLANS.starter.storeLimit;
  return PLANS[planId]?.storeLimit ?? PLANS.starter.storeLimit;
}

/**
 * Suggest the next-tier upsell for a user already on `current`. Used by
 * the SubscriptionGate when a feature is locked behind a higher plan.
 */
export function nextTier(current: PlanId | null | undefined): PlanId {
  switch (current) {
    case "starter": return "growth";
    case "growth":  return "pro";
    case "pro":     return "scale";
    case "scale":   return "scale"; // already at top
    default:        return "growth"; // fresh trial → Growth is the default upsell
  }
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "Perfect for launching your first automated store",
    priceCents: 4900,
    storeLimit: 1,
    features: [
      "1 connected store",
      "Builder Bot (niche research + store setup)",
      "Merchant Bot (basic fulfillment)",
      "500 AI actions/month",
      "Email support",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    description: "Scale your operations with all three bots",
    priceCents: 14900,
    storeLimit: 3,
    features: [
      "3 connected stores",
      "All 3 Bots (Builder + Merchant + Social)",
      "5,000 AI actions/month",
      "Meta + TikTok ad automation",
      "Priority support",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Full autonomy across unlimited stores",
    priceCents: 29900,
    storeLimit: 10,
    features: [
      "10 connected stores",
      "All 3 Bots + Elite workflows",
      "25,000 AI actions/month",
      "All 13 platform integrations",
      "Dedicated Slack support",
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    description: "Enterprise-grade orchestration at any volume",
    priceCents: 59900,
    storeLimit: Infinity,
    features: [
      "Unlimited stores",
      "All 3 Bots + custom workflows",
      "Unlimited AI actions",
      "White-label option",
      "Dedicated success manager",
    ],
  },
};
