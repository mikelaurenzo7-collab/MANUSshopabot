/**
 * Shop_a_Bot — Stripe Webhook Handler
 * Handles subscription lifecycle events and updates user plan status in DB.
 *
 * Security posture:
 *   - In production, `STRIPE_WEBHOOK_SECRET` is REQUIRED. Unsigned bodies
 *     are rejected with 503 to prevent forged-event subscription tampering.
 *   - Every successfully-verified event.id is recorded in the dedup store
 *     before `handleEvent` runs. Stripe's at-least-once delivery means
 *     duplicates would otherwise double-write billing state.
 *   - `plan_id` from Stripe metadata is validated against PlanId before
 *     it lands in the `stripePlan` column.
 */
import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "../_core/env";
import * as db from "../db";
import { logger } from "../_core/logger";
import { isPlanId, type PlanId } from "./products";

function getStripe(): Stripe {
  if (!ENV.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(ENV.stripeSecretKey, { apiVersion: "2026-03-25.dahlia" });
}

/**
 * In-memory dedup ring for Stripe `event.id`s. Stripe redelivers events on
 * at-least-once semantics; we MUST suppress duplicates before the handler
 * runs or webhook redrives during a deploy will double-write billing state.
 *
 * The ring is bounded (10k entries) so a long-running process doesn't grow
 * unbounded; in practice Stripe doesn't redeliver months later.
 *
 * For multi-instance deployments, swap this for a Redis-backed dedup store —
 * see MANUS_SYNC.md for the integration note.
 */
const STRIPE_EVENT_DEDUP = new Set<string>();
const STRIPE_DEDUP_MAX = 10_000;
function markEventProcessed(eventId: string): boolean {
  if (STRIPE_EVENT_DEDUP.has(eventId)) return false;
  if (STRIPE_EVENT_DEDUP.size >= STRIPE_DEDUP_MAX) {
    // Drop oldest by clearing — bounded retention is enough for our SLA.
    const drop = Array.from(STRIPE_EVENT_DEDUP).slice(0, STRIPE_DEDUP_MAX / 2);
    for (const id of drop) STRIPE_EVENT_DEDUP.delete(id);
  }
  STRIPE_EVENT_DEDUP.add(eventId);
  return true;
}

function safePlanId(value: unknown): PlanId | undefined {
  return isPlanId(value) ? value : undefined;
}

export function registerStripeWebhook(app: Express): void {
  // MUST use express.raw() — registered before express.json() in _core/index.ts
  app.post(
    "/api/stripe/webhook",
    (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = ENV.stripeWebhookSecret;

      // PRODUCTION REQUIREMENT: never accept unsigned events when the secret
      // is configured anywhere in the environment. The dev fallback path
      // exists ONLY for local testing where the env is intentionally empty.
      if (!webhookSecret) {
        if (process.env.NODE_ENV === "production") {
          logger.error("stripe_webhook_secret_missing_in_production");
          res.status(503).json({ error: "Webhook signing not configured" });
          return;
        }
        // Dev-only fallback. The unsigned path is gated by NODE_ENV so any
        // accidental prod deploy with the secret unset fails closed instead
        // of silently accepting forged events.
        try {
          const rawBody = (req as any).rawBody ?? req.body;
          const parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString()) as Stripe.Event;
          logger.warn("stripe_webhook_unsigned_dev_fallback", { eventId: parsed.id, type: parsed.type });
          handleVerifiedEvent(parsed, res);
        } catch (err: any) {
          logger.warn("stripe_webhook_dev_parse_failed", { error: err.message });
          res.status(400).json({ error: "Invalid payload" });
        }
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

      handleVerifiedEvent(event, res);
    }
  );
}

function handleVerifiedEvent(event: Stripe.Event, res: Response): void {
  // ⚠️ Required: test events must return verified: true
  if (event.id.startsWith("evt_test_")) {
    logger.info("stripe_webhook_test_event", { eventId: event.id });
    res.json({ verified: true });
    return;
  }

  if (!markEventProcessed(event.id)) {
    logger.info("stripe_webhook_duplicate_suppressed", { eventId: event.id, type: event.type });
    res.json({ received: true, duplicate: true });
    return;
  }

  logger.info("stripe_webhook_received", { type: event.type, eventId: event.id });

  handleEvent(event).catch((err) => {
    logger.error("stripe_webhook_handler_error", {
      error: err.message,
      type: event.type,
      eventId: event.id,
    });
  });

  // Respond immediately — process async
  res.json({ received: true });
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

      const validatedPlan = safePlanId(planId);
      if (planId && !validatedPlan) {
        logger.warn("stripe_checkout_invalid_plan", { userId, planId });
      }

      await db.updateUserStripe(userId, {
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subscriptionId ?? undefined,
        stripePlan: validatedPlan,
        stripeSubscriptionStatus: "active",
      });

      logger.info("stripe_checkout_completed", { userId, planId: validatedPlan, customerId, subscriptionId });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const user = await db.getUserByStripeSubscriptionId(sub.id);
      if (!user) {
        logger.warn("stripe_subscription_user_not_found", { subscriptionId: sub.id });
        return;
      }
      const planMeta = sub.metadata?.plan_id as string | undefined;
      const validatedPlan = safePlanId(planMeta) ?? safePlanId(user.stripePlan);
      await db.updateUserStripe(user.id, {
        stripeSubscriptionStatus: sub.status,
        stripePlan: validatedPlan,
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
