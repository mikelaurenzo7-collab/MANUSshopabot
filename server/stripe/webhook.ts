/**
 * Shop_a_Bot — Stripe Webhook Handler
 * Handles subscription lifecycle events and updates user plan status in DB.
 */
import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "../_core/env";
import * as db from "../db";
import { logger } from "../_core/logger";

function getStripe(): Stripe {
  if (!ENV.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(ENV.stripeSecretKey, { apiVersion: "2026-03-25.dahlia" });
}

export function registerStripeWebhook(app: Express): void {
  // MUST use express.raw() — registered before express.json() in _core/index.ts
  app.post(
    "/api/stripe/webhook",
    (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = ENV.stripeWebhookSecret;

      let event: Stripe.Event;

      try {
        if (!webhookSecret) {
          // Dev fallback: parse raw body as JSON
          event = JSON.parse((req as any).rawBody || req.body.toString()) as Stripe.Event;
        } else {
          const stripe = getStripe();
          const rawBody = (req as any).rawBody ?? req.body;
          event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
        }
      } catch (err: any) {
        logger.warn("stripe_webhook_signature_failed", { error: err.message });
        res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
        return;
      }

      // ⚠️ Required: test events must return verified: true
      if (event.id.startsWith("evt_test_")) {
        logger.info("stripe_webhook_test_event", { eventId: event.id });
        res.json({ verified: true });
        return;
      }

      logger.info("stripe_webhook_received", { type: event.type, eventId: event.id });

      handleEvent(event).catch((err) => {
        logger.error("stripe_webhook_handler_error", { error: err.message, type: event.type });
      });

      // Respond immediately — process async
      res.json({ received: true });
    }
  );
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id ? parseInt(session.metadata.user_id) : null;
      const planId = session.metadata?.plan_id as string | undefined;
      const customerId = session.customer as string | null;
      const subscriptionId = session.subscription as string | null;

      if (!userId) {
        logger.warn("stripe_checkout_missing_user_id", { sessionId: session.id });
        return;
      }

      await db.updateUserStripe(userId, {
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subscriptionId ?? undefined,
        stripePlan: (planId as any) ?? undefined,
        stripeSubscriptionStatus: "active",
      });

      logger.info("stripe_checkout_completed", { userId, planId, customerId, subscriptionId });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const user = await db.getUserByStripeSubscriptionId(sub.id);
      if (!user) {
        logger.warn("stripe_subscription_user_not_found", { subscriptionId: sub.id });
        return;
      }
      const planId = sub.metadata?.plan_id as string | undefined;
      await db.updateUserStripe(user.id, {
        stripeSubscriptionStatus: sub.status,
        stripePlan: (planId as any) ?? user.stripePlan ?? undefined,
      });
      logger.info("stripe_subscription_updated", { userId: user.id, status: sub.status });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const user = await db.getUserByStripeSubscriptionId(sub.id);
      if (!user) return;
      await db.updateUserStripe(user.id, {
        stripeSubscriptionStatus: "canceled",
        stripePlan: undefined,
      });
      logger.info("stripe_subscription_canceled", { userId: user.id });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = (invoice as any).subscription as string | null;
      if (!subId) return;
      const user = await db.getUserByStripeSubscriptionId(subId);
      if (!user) return;
      await db.updateUserStripe(user.id, { stripeSubscriptionStatus: "past_due" });
      logger.warn("stripe_payment_failed", { userId: user.id, invoiceId: invoice.id });
      break;
    }

    default:
      logger.info("stripe_webhook_unhandled", { type: event.type });
  }
}
