/**
 * Shop_a_Bot — Stripe tRPC Router
 * Handles checkout session creation and subscription status queries.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import Stripe from "stripe";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { PLANS, type PlanId } from "../stripe/products";
import * as db from "../db";

function getStripe(): Stripe {
  if (!ENV.stripeSecretKey) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe not configured" });
  }
  return new Stripe(ENV.stripeSecretKey, { apiVersion: "2026-03-25.dahlia" });
}

export const stripeRouter = router({
  /**
   * Get current subscription status for the logged-in user.
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.getUserByOpenId(ctx.user.openId);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    return {
      plan: user.stripePlan ?? null,
      status: user.stripeSubscriptionStatus ?? null,
      isActive: user.stripeSubscriptionStatus === "active" || user.stripeSubscriptionStatus === "trialing",
      customerId: user.stripeCustomerId ?? null,
      subscriptionId: user.stripeSubscriptionId ?? null,
    };
  }),

  /**
   * Create a Stripe Checkout Session for a subscription plan.
   * Returns the checkout URL to open in a new tab.
   */
  createCheckoutSession: protectedProcedure
    .input(z.object({
      planId: z.enum(["starter", "growth", "pro", "scale"]),
      origin: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const plan = PLANS[input.planId as PlanId];
      if (!plan) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid plan" });

      const user = await db.getUserByOpenId(ctx.user.openId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      // Reuse existing Stripe customer or create a new one
      let customerId = user.stripeCustomerId ?? undefined;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          metadata: { user_id: user.id.toString() },
        });
        customerId = customer.id;
        await db.updateUserStripe(user.id, { stripeCustomerId: customerId });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        mode: "subscription",
        allow_promotion_codes: true,
        line_items: [
          {
            price_data: {
              currency: "usd",
              recurring: { interval: "month" },
              product_data: {
                name: `Shop_a_Bot ${plan.name}`,
                description: plan.description,
              },
              unit_amount: plan.priceCents,
            },
            quantity: 1,
          },
        ],
        // Honor the "7-day free trial, no credit card" promise on Landing/FAQ.
        // Stripe will collect the card up-front but won't charge until day 7;
        // `customer.subscription.updated` fires when status flips to `active`.
        subscription_data: {
          trial_period_days: 7,
          trial_settings: {
            end_behavior: { missing_payment_method: "cancel" },
          },
        },
        client_reference_id: user.id.toString(),
        metadata: {
          user_id: user.id.toString(),
          plan_id: plan.id,
          customer_email: user.email ?? "",
          customer_name: user.name ?? "",
        },
        success_url: `${input.origin}/command-center?subscription=success&plan=${plan.id}`,
        cancel_url: `${input.origin}/?subscription=canceled`,
      });

      return { url: session.url! };
    }),

  /**
   * Create a Stripe Billing Portal session so users can manage their subscription.
   */
  createBillingPortalSession: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const user = await db.getUserByOpenId(ctx.user.openId);
      if (!user?.stripeCustomerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active subscription found" });
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${input.origin}/command-center`,
      });
      return { url: session.url };
    }),

  /**
   * Get all available plans (public — used on landing page).
   */
  getPlans: protectedProcedure.query(() => {
    return Object.values(PLANS);
  }),
});
