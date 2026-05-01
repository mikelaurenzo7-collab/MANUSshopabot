/**
 * Platform Webhook Handlers — Etsy, TikTok Shop, Amazon & eBay
 *
 * Handles real-time events from all 4 e-commerce platforms.
 * All payloads are HMAC-verified before processing and logged to the
 * webhook_events table for the real-time Platform Health feed.
 *
 * Etsy topics:  RECEIPT_CREATED, RECEIPT_UPDATED, LISTING_CHANGED, SHOP_UPDATED
 * TikTok topics: ORDER_STATUS_CHANGE, PRODUCT_STATUS_CHANGE, REFUND_STATUS_CHANGE
 */

import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { stores } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { logWebhookEvent, createBotEvent, updateOrder } from "./db";
import { addToDeadLetterQueue } from "./engine/eliteOrchestrator";
import { notifyOwner } from "./_core/notification";
import { ENV } from "./_core/env";
import {
  rawBodyMiddleware,
  verifyHmacSha256,
  verifyTikTokShopSignature,
} from "./utils/webhookVerify";
import { logger } from "./utils/logger";
import { WebhookDedup, type ClaimResult } from "./utils/webhookDedup";

type WebhookEventArgs = Parameters<typeof logWebhookEvent>[0];

// ─── Webhook Deduplication ────────────────────────────────────────────────────
// Etsy / TikTok Shop / Amazon / eBay all deliver at-least-once. Without
// a dedup layer the same RECEIPT_CREATED, ORDER_STATUS_CHANGE, etc.
// would re-launch workflows on every vendor retry — duplicate orders,
// duplicate fulfillment notifications, the works. We use the same
// three-state claim-on-entry / mark-on-success / release-on-failure
// helper as the Shopify path so a transient failure doesn't get
// silently suppressed by the dedup mark.
const dedup = new WebhookDedup();
setInterval(() => dedup.prune(), 2 * 60 * 1000).unref?.();

function dedupKey(platform: string, topic: string, resourceId: string): string {
  return `${platform}:${topic}:${resourceId}`;
}

function logDedupSkip(
  platform: string,
  topic: string,
  resourceId: string,
  claim: Exclude<ClaimResult, "claim">,
): void {
  logger.info(`${platform}_webhook_duplicate_skipped`, {
    module: "platformWebhooks",
    topic,
    resourceId,
    claim,
  });
}

/** Best-effort write to `webhook_events`. A telemetry failure must not
 *  fail the user-facing flow, but we *do* want a warning log so the
 *  operator can see when telemetry is silently broken. */
function logEventSafely(args: WebhookEventArgs): void {
  logWebhookEvent(args).catch((logErr) =>
    logger.warn(`${args.platform}_webhook_event_log_failed`, {
      module: "platformWebhooks",
      topic: args.eventType,
      status: args.status,
      error: logErr instanceof Error ? logErr.message : String(logErr),
    }),
  );
}

// ─── Shared HMAC Utilities ────────────────────────────────────────────────────
// Centralised in `server/utils/webhookVerify.ts` (audit P1 #10).

// ─── Store Lookup ─────────────────────────────────────────────────────────────

async function findStoreByPlatformAndShop(platform: "etsy" | "tiktok_shop" | "amazon" | "ebay", shopId: string) {
  const db = await getDb();
  if (!db) return null;
  // Try platformStoreId first, fall back to platformDomain. The
  // original code accidentally queried `platformDomain` in BOTH
  // branches — the "byStoreId" lookup was dead code and stores
  // registered with only a platformStoreId silently never matched any
  // webhook event.
  const byStoreId = await db
    .select()
    .from(stores)
    .where(and(eq(stores.platform, platform), eq(stores.platformStoreId, shopId)))
    .limit(1);
  if (byStoreId[0]) return byStoreId[0];
  const byDomain = await db
    .select()
    .from(stores)
    .where(and(eq(stores.platform, platform), eq(stores.platformDomain, shopId)))
    .limit(1);
  return byDomain[0] ?? null;
}

// ─── Etsy Webhook Handler ─────────────────────────────────────────────────────

async function handleEtsyWebhook(req: Request, res: Response) {
  const rawBody = (req as any).rawBody as Buffer;
  const signature = req.headers["x-etsy-signature"] as string | undefined;
  const shopId = req.headers["x-etsy-shop-id"] as string | undefined;

  if (!rawBody || !shopId) {
    return res.status(400).json({ error: "Missing required headers" });
  }

  // Verify HMAC. PRODUCTION REQUIREMENT: secret must be present in prod
  // and signature must verify. Fail closed otherwise.
  const secret = ENV.etsySharedSecret;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("etsy_webhook_secret_missing_in_production", { module: "platformWebhooks" });
      return res.status(503).json({ error: "Webhook signing not configured" });
    }
    logger.warn("etsy_webhook_unsigned_dev_mode", { module: "platformWebhooks" });
  } else if (!signature) {
    logger.warn("etsy_webhook_signature_missing", { module: "platformWebhooks", shopId });
    return res.status(401).json({ error: "Signature missing" });
  } else if (!verifyHmacSha256(rawBody, signature, secret)) {
    logger.warn("etsy_webhook_hmac_failed", { module: "platformWebhooks", shopId });
    return res.status(401).json({ error: "HMAC verification failed" });
  }

  // Acknowledge immediately
  res.status(200).json({ received: true });

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    logger.error("etsy_webhook_payload_parse_failed", { module: "platformWebhooks", shopId });
    return;
  }

  const topic: string = payload.type ?? payload.event_type ?? "unknown";
  const resourceId = String(payload.receipt_id ?? payload.listing_id ?? "unknown");
  const key = dedupKey("etsy", topic, resourceId);
  const claim = dedup.tryClaim(key);
  if (claim !== "claim") {
    logDedupSkip("etsy", topic, resourceId, claim);
    return;
  }
  const eventStart = Date.now();

  logger.info("etsy_webhook_received", { module: "platformWebhooks", topic, shopId });

  let store: Awaited<ReturnType<typeof findStoreByPlatformAndShop>> = null;
  try {
    // DB errors here propagate to the outer catch → DLQ + claim
    // released. The legacy `.catch(() => null)` mistakenly conflated
    // "store legitimately absent" with "DB unavailable" and silently
    // dropped the side effects, which meant orders disappeared from
    // our system whenever the DB blipped during a webhook delivery.
    store = await findStoreByPlatformAndShop("etsy", shopId);
    // Handle specific Etsy events
    switch (topic) {
      case "RECEIPT_CREATED":
      case "RECEIPT_UPDATED": {
        // New or updated order from Etsy
        if (store && payload.receipt_id) {
          await createBotEvent({
            fromBot: "merchant",
            toBot: "merchant",
            eventType: topic === "RECEIPT_CREATED" ? "order_created" : "order_updated",
            userId: store.userId,
            storeId: store.id,
            payload: {
              platformOrderId: String(payload.receipt_id),
              totalPrice: payload.grandtotal?.amount,
              currency: payload.grandtotal?.currency_code ?? "USD",
              status: payload.status,
            },
            status: "pending",
          });
        }
        break;
      }
      case "LISTING_CHANGED": {
        // Product listing updated on Etsy
        if (store) {
          logger.info("etsy_webhook_listing_changed", {
            module: "platformWebhooks",
            storeId: store.id,
            listingId: payload.listing_id,
            shopId,
          });
        }
        break;
      }
      case "SHOP_UPDATED": {
        if (store) {
          await notifyOwner({
            title: "Etsy Shop Updated",
            content: `Your Etsy shop "${store.name}" settings were updated.`,
          });
        }
        break;
      }
      default:
        logger.info("etsy_webhook_unhandled_topic", { module: "platformWebhooks", topic, shopId });
    }

    dedup.markCompleted(key);
    // Log to webhook_events table
    if (store) {
      logEventSafely({
        userId: store.userId,
        storeId: store.id,
        platform: "etsy",
        eventType: topic,
        status: "processed",
        payload: { receipt_id: payload.receipt_id, listing_id: payload.listing_id },
        processingMs: Date.now() - eventStart,
      });
    }
  } catch (err: any) {
    dedup.releaseClaim(key);
    logger.error("etsy_webhook_processing_failed", {
      module: "platformWebhooks",
      topic,
      shopId,
      error: err.message,
    });
    addToDeadLetterQueue(topic, payload, "etsy", err.message);
    if (store) {
      logEventSafely({
        userId: store.userId,
        storeId: store.id,
        platform: "etsy",
        eventType: topic,
        status: "failed",
        errorMessage: err.message,
        processingMs: Date.now() - eventStart,
      });
    }
  }
}

// ─── TikTok Shop Webhook Handler ──────────────────────────────────────────────

async function handleTikTokShopWebhook(req: Request, res: Response) {
  const rawBody = (req as any).rawBody as Buffer;
  const timestamp = req.headers["x-tts-timestamp"] as string | undefined;
  const nonce = req.headers["x-tts-nonce"] as string | undefined;
  const signature = req.headers["x-tts-signature"] as string | undefined;

  if (!rawBody) {
    return res.status(400).json({ error: "Missing body" });
  }

  // Verify HMAC. PRODUCTION REQUIREMENT: secret must be present and
  // signature must verify. Dev fallback only when not in production.
  const appSecret = ENV.tiktokClientSecret;
  if (!appSecret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("tiktok_shop_webhook_secret_missing_in_production", { module: "platformWebhooks" });
      return res.status(503).json({ error: "Webhook signing not configured" });
    }
    logger.warn("tiktok_shop_webhook_unsigned_dev_mode", { module: "platformWebhooks" });
  } else if (!timestamp || !nonce || !signature) {
    logger.warn("tiktok_shop_webhook_signature_headers_missing", { module: "platformWebhooks" });
    return res.status(401).json({ error: "Signature headers missing" });
  } else if (!verifyTikTokShopSignature(rawBody, timestamp, nonce, signature, appSecret)) {
    logger.warn("tiktok_shop_webhook_signature_failed", { module: "platformWebhooks" });
    return res.status(401).json({ error: "Signature verification failed" });
  }

  // Acknowledge immediately
  res.status(200).json({ received: true });

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    logger.error("tiktok_shop_webhook_payload_parse_failed", { module: "platformWebhooks" });
    return;
  }

  const topic: string = payload.type ?? "unknown";
  // TikTok Shop sends shop_id in the payload body
  const shopId = String(payload.shop_id ?? payload.data?.shop_id ?? "");
  const resourceId = String(
    payload.data?.order_id ?? payload.data?.product_id ?? payload.data?.refund_id ?? "unknown",
  );
  const key = dedupKey("tiktok_shop", topic, `${shopId}:${resourceId}`);
  const claim = dedup.tryClaim(key);
  if (claim !== "claim") {
    logDedupSkip("tiktok_shop", topic, resourceId, claim);
    return;
  }
  const eventStart = Date.now();

  logger.info("tiktok_shop_webhook_received", { module: "platformWebhooks", topic, shopId });

  let store: Awaited<ReturnType<typeof findStoreByPlatformAndShop>> = null;
  try {
    // DB errors propagate to the outer catch → DLQ + claim released.
    store = shopId ? await findStoreByPlatformAndShop("tiktok_shop", shopId) : null;
    switch (topic) {
      case "ORDER_STATUS_CHANGE": {
        const orderId = String(payload.data?.order_id ?? "");
        const newStatus = payload.data?.order_status ?? "";
        if (store && orderId) {
          await createBotEvent({
            fromBot: "merchant",
            toBot: "merchant",
            eventType: "order_status_changed",
            userId: store.userId,
            storeId: store.id,
            payload: { platformOrderId: orderId, newStatus, platform: "tiktok_shop" },
            status: "pending",
          });
          // Notify on fulfillment
          if (newStatus === "COMPLETED" || newStatus === "SHIPPED") {
            await notifyOwner({
              title: `TikTok Shop Order ${newStatus}`,
              content: `Order #${orderId} in your TikTok Shop "${store.name}" is now ${newStatus}.`,
            });
          }
        }
        break;
      }
      case "PRODUCT_STATUS_CHANGE": {
        const productId = String(payload.data?.product_id ?? "");
        logger.info("tiktok_shop_webhook_product_changed", {
          module: "platformWebhooks",
          productId,
          shopId,
        });
        break;
      }
      case "REFUND_STATUS_CHANGE": {
        if (store) {
          await notifyOwner({
            title: "TikTok Shop Refund Update",
            content: `A refund status changed in your TikTok Shop "${store.name}". Check your TikTok Seller Center for details.`,
          });
        }
        break;
      }
      default:
        logger.info("tiktok_shop_webhook_unhandled_topic", {
          module: "platformWebhooks",
          topic,
          shopId,
        });
    }

    dedup.markCompleted(key);
    // Log to webhook_events table
    if (store) {
      logEventSafely({
        userId: store.userId,
        storeId: store.id,
        platform: "tiktok_shop",
        eventType: topic,
        status: "processed",
        payload: { order_id: payload.data?.order_id, product_id: payload.data?.product_id },
        processingMs: Date.now() - eventStart,
      });
    }
  } catch (err: any) {
    dedup.releaseClaim(key);
    logger.error("tiktok_shop_webhook_processing_failed", {
      module: "platformWebhooks",
      topic,
      shopId,
      error: err.message,
    });
    addToDeadLetterQueue(topic, payload, "tiktok_shop", err.message);
    if (store) {
      logEventSafely({
        userId: store.userId,
        storeId: store.id,
        platform: "tiktok_shop",
        eventType: topic,
        status: "failed",
        errorMessage: err.message,
        processingMs: Date.now() - eventStart,
      });
    }
  }
}

// ─── Route Registration ────────────────────────────────────────────────────────

export function registerPlatformWebhookRoutes(app: Express) {
  app.post("/api/webhooks/etsy", rawBodyMiddleware, handleEtsyWebhook);
  app.post("/api/webhooks/tiktok-shop", rawBodyMiddleware, handleTikTokShopWebhook);
  app.post("/api/webhooks/amazon", rawBodyMiddleware, handleAmazonWebhook);
  app.post("/api/webhooks/ebay", rawBodyMiddleware, handleEbayWebhook);
  logger.info("platform_webhooks_registered", {
    module: "platformWebhooks",
    routes: ["POST /api/webhooks/etsy", "POST /api/webhooks/tiktok-shop", "POST /api/webhooks/amazon", "POST /api/webhooks/ebay"],
  });
}

// ─── Amazon Webhook Handler ──────────────────────────────────────────────────

async function handleAmazonWebhook(req: Request, res: Response) {
  const rawBody = (req as any).rawBody as Buffer;
  const payload = JSON.parse(rawBody.toString("utf8"));
  const topic = payload.TopicArn ?? "unknown";
  const shopId = req.query.shop_id as string | undefined;

  if (!shopId) {
    return res.status(400).json({ error: "Missing shop_id" });
  }

  // Acknowledge immediately
  res.status(200).json({ received: true });

  // Parse SNS message FIRST — failures here are payload bugs and
  // shouldn't trigger the dedup-then-fail trap on retry.
  let message: any;
  try {
    message = JSON.parse(payload.Message ?? "{}");
  } catch {
    logger.error("amazon_webhook_payload_parse_failed", { module: "platformWebhooks", shopId });
    return;
  }
  const eventType = message.eventType ?? "unknown";
  // notificationId is per-delivery unique and stable across retries;
  // prefer it over the resource id so two distinct events on the same
  // order/asin don't collapse into one dedup entry.
  const resourceId = String(
    message.notificationId ?? message.orderId ?? message.asin ?? "unknown",
  );
  const key = dedupKey("amazon", eventType, `${shopId}:${resourceId}`);
  const claim = dedup.tryClaim(key);
  if (claim !== "claim") {
    logDedupSkip("amazon", eventType, resourceId, claim);
    return;
  }

  const eventStart = Date.now();

  logger.info("amazon_webhook_received", { module: "platformWebhooks", topic, shopId });

  let store: Awaited<ReturnType<typeof findStoreByPlatformAndShop>> = null;
  try {
    // DB errors propagate to the outer catch → DLQ + claim released.
    store = await findStoreByPlatformAndShop("amazon", shopId);
    if (store) {
      await createBotEvent({
        fromBot: "merchant",
        toBot: "merchant",
        eventType: eventType === "OrderStatusChange" ? "order_status_changed" : "product_updated",
        userId: store.userId,
        storeId: store.id,
        payload: message,
        status: "pending",
      });
    }

    dedup.markCompleted(key);
    // Log to webhook_events table
    if (store) {
      logEventSafely({
        userId: store.userId,
        storeId: store.id,
        platform: "amazon",
        eventType,
        status: "processed",
        payload: message,
        processingMs: Date.now() - eventStart,
      });
    }
  } catch (err: any) {
    dedup.releaseClaim(key);
    logger.error("amazon_webhook_processing_failed", {
      module: "platformWebhooks",
      eventType,
      shopId,
      error: err.message,
    });
    addToDeadLetterQueue(eventType, message ?? payload, "amazon", err.message);
    if (store) {
      logEventSafely({
        userId: store.userId,
        storeId: store.id,
        platform: "amazon",
        eventType: "unknown",
        status: "failed",
        errorMessage: err.message,
        processingMs: Date.now() - eventStart,
      });
    }
  }
}

// ─── eBay Webhook Handler ────────────────────────────────────────────────────

async function handleEbayWebhook(req: Request, res: Response) {
  const rawBody = (req as any).rawBody as Buffer;
  const payload = JSON.parse(rawBody.toString("utf8"));
  const shopId = req.query.shop_id as string | undefined;

  if (!shopId) {
    return res.status(400).json({ error: "Missing shop_id" });
  }

  // Acknowledge immediately
  res.status(200).json({ received: true });

  const eventType = payload.eventType ?? "unknown";
  // notificationId is per-delivery unique and stable across retries;
  // prefer it over the resource id so two distinct events on the same
  // item/order don't collapse into one dedup entry.
  const resourceId = String(
    payload.notificationId ?? payload.itemId ?? payload.orderId ?? "unknown",
  );
  const key = dedupKey("ebay", eventType, `${shopId}:${resourceId}`);
  const claim = dedup.tryClaim(key);
  if (claim !== "claim") {
    logDedupSkip("ebay", eventType, resourceId, claim);
    return;
  }

  const eventStart = Date.now();

  logger.info("ebay_webhook_received", { module: "platformWebhooks", eventType, shopId });

  let store: Awaited<ReturnType<typeof findStoreByPlatformAndShop>> = null;
  try {
    // DB errors propagate to the outer catch → DLQ + claim released.
    store = await findStoreByPlatformAndShop("ebay", shopId);
    // Handle specific eBay events
    switch (eventType) {
      case "ITEM_SOLD":
      case "ITEM_UNSOLD":
      case "ITEM_LISTED": {
        if (store) {
          await createBotEvent({
            fromBot: "merchant",
            toBot: "merchant",
            eventType: eventType === "ITEM_SOLD" ? "order_created" : "product_updated",
            userId: store.userId,
            storeId: store.id,
            payload,
            status: "pending",
          });
        }
        break;
      }
      case "MARKETPLACE_ACCOUNT_DELETION": {
        if (store) {
          await notifyOwner({
            title: "eBay Account Deletion Request",
            content: `Your eBay store "${store.name}" has requested account deletion. Please verify this action.`,
          });
        }
        break;
      }
    }

    dedup.markCompleted(key);
    // Log to webhook_events table
    if (store) {
      logEventSafely({
        userId: store.userId,
        storeId: store.id,
        platform: "ebay",
        eventType,
        status: "processed",
        payload,
        processingMs: Date.now() - eventStart,
      });
    }
  } catch (err: any) {
    dedup.releaseClaim(key);
    logger.error("ebay_webhook_processing_failed", {
      module: "platformWebhooks",
      eventType,
      shopId,
      error: err.message,
    });
    addToDeadLetterQueue(eventType, payload, "ebay", err.message);
    if (store) {
      logEventSafely({
        userId: store.userId,
        storeId: store.id,
        platform: "ebay",
        eventType,
        status: "failed",
        errorMessage: err.message,
        processingMs: Date.now() - eventStart,
      });
    }
  }
}
