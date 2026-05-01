/**
 * Shop_a_Bot — Stripe Webhook Handler
 * Handles subscription lifecycle events and updates user plan status in DB.
 */
import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "../_core/env";
import * as db from "../db";
import { logger } from "../_core/logger";
import { WebhookDedup } from "../utils/webhookDedup";
import { isValidPlanId, type PlanId } from "./products";

/**
 * Validate a wire-supplied planId against the closed allowlist. Returns
 * the typed PlanId on success or `undefined` on rejection — and emits
 * a structured warn log so Stripe metadata tampering surfaces in the
 * operator's audit trail. Without this gate an attacker (or a
 * misconfigured Stripe price) could plant `metadata.plan_id="scale"`
 * and silently upgrade the user past the billing tier they paid for.
 */
function safePlanId(value: unknown, context: string): PlanId | undefined {
  if (value == null) return undefined;
  if (isValidPlanId(value)) return value;
  logger.warn("stripe_invalid_plan_id_rejected", {
    module: "stripe.webhook",
    context,
    received: typeof value === "string" ? value.slice(0, 64) : typeof value,
  });
  return undefined;
}

function getStripe(): Stripe {
  if (!ENV.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(ENV.stripeSecretKey, { apiVersion: "2026-03-25.dahlia" });
}

const stripeEventDedup = new WebhookDedup();

export function registerStripeWebhook(app: Express): void {
  // MUST use express.raw() — registered before express.json() in _core/index.ts
  app.post(
    "/api/stripe/webhook",
    (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = ENV.stripeWebhookSecret;

      if (!webhookSecret) {
        logger.error("stripe_webhook_secret_missing", {});
        res.status(400).json({ error: "Webhook secret not configured" });
        return;
      }

      let event: Stripe.Event;

      try {
        const stripe = getStripe();
        const rawBody = (req as any).rawBody ?? req.body;
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
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

      // Idempotency: skip events already processed or currently in-flight
      const dedupResult = stripeEventDedup.tryClaim(event.id);
      if (dedupResult === "completed") {
        logger.info("stripe_webhook_duplicate_skipped", { eventId: event.id, type: event.type });
        res.json({ received: true });
        return;
      }
      if (dedupResult === "in_flight") {
        logger.info("stripe_webhook_in_flight_skipped", { eventId: event.id, type: event.type });
        res.json({ received: true });
        return;
      }

      logger.info("stripe_webhook_received", { type: event.type, eventId: event.id });

      handleEvent(event)
        .then(() => {
          stripeEventDedup.markCompleted(event.id);
        })
        .catch((err) => {
          stripeEventDedup.releaseClaim(event.id);
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
      // Allowlist-gate the planId — Stripe metadata is operator-writable
      // so an attacker who controls the dashboard could plant arbitrary
      // strings here. `safePlanId` returns undefined on rejection and
      // logs `stripe_invalid_plan_id_rejected`, which keeps the rest of
      // the lifecycle update flowing (customerId / subscriptionId /
      // status are all Stripe-trusted) without silently writing a bad
      // tier into `users.stripePlan`.
      const planId = safePlanId(session.metadata?.plan_id, "checkout.session.completed");
      const customerId = session.customer as string | null;
      const subscriptionId = session.subscription as string | null;

      if (!userId) {
        logger.warn("stripe_checkout_missing_user_id", { sessionId: session.id });
        return;
      }

      await db.updateUserStripe(userId, {
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subscriptionId ?? undefined,
        stripePlan: planId ?? undefined,
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
      const planId = safePlanId(sub.metadata?.plan_id, "customer.subscription.updated");
      await db.updateUserStripe(user.id, {
        stripeSubscriptionStatus: sub.status,
        // If the wire-supplied planId is invalid we keep the user's
        // existing plan rather than fall through to undefined (which
        // would clear it).
        stripePlan: planId ?? user.stripePlan ?? undefined,
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

    /**
     * Stripe fires this 3 days before a trial ends. We email the user
     * a heads-up via the delivery layer so they can update payment
     * method or cancel before the auto-conversion charge.
     */
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      const user = await db.getUserByStripeSubscriptionId(sub.id);
      if (!user || !user.email) {
        logger.info("stripe_trial_warning_skipped", {
          subId: sub.id,
          reason: !user ? "user-not-found" : "no-email",
        });
        break;
      }
      try {
        const { sendEmail } = await import("../delivery");
        const { renderTrialEndingEmail } = await import("../delivery/templates");
        const trialEndDate = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
        const { subject, html, text } = renderTrialEndingEmail({
          recipientEmail: user.email,
          firstName: user.name?.split(" ")[0] ?? "there",
          planName: user.stripePlan ?? "Growth",
          trialEndDate: trialEndDate?.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          }) ?? "in 3 days",
          billingPortalUrl: "https://billing.stripe.com/p/login",
        });
        await sendEmail(
          { to: { email: user.email, name: user.name ?? undefined }, subject, html, text },
          { provider: "sendgrid", userId: user.id },
        );
        logger.info("stripe_trial_warning_sent", { userId: user.id });
      } catch (err) {
        logger.error("stripe_trial_warning_failed", {
          userId: user.id,
          error: (err as Error).message,
        });
      }
      break;
    }

    default:
      logger.info("stripe_webhook_unhandled", { type: event.type });
  }
}
