/**
 * SendGrid Event Webhook handler.
 *
 * SendGrid POSTs a JSON array of events to a single endpoint whenever
 * messages move through the delivery lifecycle. We persist each event
 * to `email_delivery_events` for analytics and replay; signature
 * verification is supported but optional (unset env → handler accepts
 * unsigned events with a warning).
 *
 * Event types we care about:
 *   processed | delivered          — success path
 *   open | click                   — engagement
 *   bounce | dropped | deferred    — delivery problems
 *   spamreport | unsubscribe       — recipient signals
 *
 * SendGrid recommends ECDSA verification using the public key from
 * the Mail Settings → Event Webhook page. Set `SENDGRID_WEBHOOK_PUBLIC_KEY`
 * to enable it. Unsigned mode is intended for local dev only.
 *
 * Reference: https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
 */
import type { Express, Request, Response } from "express";
import express from "express";
import crypto from "node:crypto";
import { logger } from "./_core/logger";
import { recordEmailDeliveryEvent } from "./db";

interface SendGridEvent {
  email?: string;
  timestamp?: number;
  event?: string;
  sg_event_id?: string;
  sg_message_id?: string;
  category?: string | string[];
  url?: string;
  reason?: string;
  /** We pass campaignId via the unique_args field on send. */
  unique_args?: Record<string, unknown>;
  /** SendGrid sometimes nests args under custom_args (newer API). */
  custom_args?: Record<string, unknown>;
  /** Custom field we tag from `delivery/sendgrid.ts` so the webhook can re-attach to the campaign. */
  campaignId?: number;
}

const ACCEPTED_EVENTS = new Set([
  "processed",
  "delivered",
  "open",
  "click",
  "bounce",
  "dropped",
  "deferred",
  "spamreport",
  "unsubscribe",
]);

/**
 * Verify the webhook payload using SendGrid's ECDSA signing scheme.
 * Returns true if signature matches OR if no public key is configured
 * (the caller logs a warning in that case).
 */
function verifySignature(
  publicKeyPem: string | undefined,
  signature: string | undefined,
  timestamp: string | undefined,
  rawBody: Buffer,
): { ok: boolean; reason?: string } {
  if (!publicKeyPem) return { ok: true, reason: "no-public-key" };
  if (!signature || !timestamp) {
    return { ok: false, reason: "missing-headers" };
  }
  try {
    const signedPayload = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
    const verifier = crypto.createVerify("SHA256");
    verifier.update(signedPayload);
    verifier.end();
    const valid = verifier.verify(
      { key: publicKeyPem, format: "pem" },
      Buffer.from(signature, "base64"),
    );
    return { ok: valid, reason: valid ? undefined : "bad-signature" };
  } catch (err) {
    return { ok: false, reason: `verify-error: ${(err as Error).message}` };
  }
}

function extractCampaignId(evt: SendGridEvent): number | null {
  // We tag `campaignId` directly via custom_args when sending — pull it back.
  const direct = evt.campaignId;
  if (typeof direct === "number") return direct;
  const fromCustom = evt.custom_args?.campaignId ?? evt.unique_args?.campaignId;
  if (typeof fromCustom === "number") return fromCustom;
  if (typeof fromCustom === "string" && /^\d+$/.test(fromCustom)) return Number(fromCustom);
  return null;
}

function normalizeCategories(v: SendGridEvent["category"]): string[] | null {
  if (!v) return null;
  return Array.isArray(v) ? v : [v];
}

export async function handleSendgridWebhook(req: Request, res: Response) {
  const rawBody: Buffer | undefined = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    // Express didn't capture the raw body — fall back to re-stringifying
    // the parsed body, which loses bytes-equality but lets us proceed
    // when no signature is required.
    logger.warn("sendgrid_webhook_no_raw_body");
  }

  const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
  const signature = req.header("X-Twilio-Email-Event-Webhook-Signature");
  const timestamp = req.header("X-Twilio-Email-Event-Webhook-Timestamp");

  const verify = verifySignature(
    publicKey,
    signature ?? undefined,
    timestamp ?? undefined,
    rawBody ?? Buffer.from(JSON.stringify(req.body)),
  );

  if (!verify.ok) {
    logger.warn("sendgrid_webhook_signature_rejected", { reason: verify.reason });
    return res.status(401).json({ error: "invalid_signature", reason: verify.reason });
  }

  if (!publicKey) {
    logger.warn("sendgrid_webhook_unsigned_accepted", {
      hint: "Set SENDGRID_WEBHOOK_PUBLIC_KEY in production to verify webhook origin.",
    });
  }

  const events: SendGridEvent[] = Array.isArray(req.body) ? req.body : [];
  if (events.length === 0) {
    return res.status(204).end();
  }

  let recorded = 0;
  let skipped = 0;

  for (const evt of events) {
    const eventType = evt.event ?? "unknown";
    if (!ACCEPTED_EVENTS.has(eventType)) {
      skipped++;
      continue;
    }
    if (!evt.sg_message_id || !evt.timestamp) {
      skipped++;
      continue;
    }

    try {
      await recordEmailDeliveryEvent({
        providerMessageId: evt.sg_message_id,
        eventId: evt.sg_event_id ?? null,
        eventType,
        email: evt.email ?? null,
        campaignId: extractCampaignId(evt),
        categories: normalizeCategories(evt.category),
        url: evt.url ?? null,
        reason: evt.reason ?? null,
        occurredAt: new Date(evt.timestamp * 1000),
      });
      recorded++;
    } catch (err) {
      logger.error("sendgrid_webhook_event_persist_failed", {
        eventType,
        sg_event_id: evt.sg_event_id,
        message: (err as Error).message,
      });
    }
  }

  logger.info("sendgrid_webhook_batch", {
    received: events.length,
    recorded,
    skipped,
  });

  return res.status(200).json({ received: events.length, recorded, skipped });
}

/**
 * Capture the raw body so we can verify the SendGrid signature. Express's
 * built-in JSON parser consumes the stream, so we hook into its `verify`
 * option to stash the bytes on the request before parsing.
 */
function rawBodyCapture(req: Request, _res: Response, buf: Buffer) {
  (req as Request & { rawBody?: Buffer }).rawBody = buf;
}

export function registerSendGridWebhookRoutes(app: Express): void {
  // SendGrid sends JSON; we want both the parsed body AND the raw bytes
  // for signature verification. The custom limit covers large batched
  // event arrays.
  app.post(
    "/api/webhooks/sendgrid",
    express.json({ limit: "1mb", verify: rawBodyCapture }),
    handleSendgridWebhook,
  );
  logger.info("sendgrid_webhook_route_registered", { path: "/api/webhooks/sendgrid" });
}
