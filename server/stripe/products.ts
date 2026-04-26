/**
 * Shop_a_Bot — Stripe Subscription Plans
 * Centralized plan definitions. Price IDs are created on first checkout
 * using Stripe's inline price creation (no pre-seeding required).
 */

export type PlanId = "starter" | "growth" | "pro" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  priceCents: number; // monthly, in cents
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "Perfect for launching your first automated store",
    priceCents: 4900,
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
    features: [
      "Unlimited stores",
      "All 3 Bots + custom workflows",
      "Unlimited AI actions",
      "White-label option",
      "Dedicated success manager",
    ],
  },
};
