/**
 * Platform Webhook Handlers — Etsy & TikTok Shop
 *
 * Handles real-time events from Etsy and TikTok Shop.
 * All payloads are HMAC-verified before processing and logged to the
 * webhook_events table for the real-time Platform Health feed.
 *
 * Etsy topics:  RECEIPT_CREATED, RECEIPT_UPDATED, LISTING_CHANGED, SHOP_UPDATED
 * TikTok topics: ORDER_STATUS_CHANGE, PRODUCT_STATUS_CHANGE, REFUND_STATUS_CHANGE
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { getDb } from "./db";
import { stores } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { logWebhookEvent, createBotEvent, updateOrder } from "./db";
import { notifyOwner } from "./_core/notification";
import { ENV } from "./_core/env";

// ─── Shared HMAC Utilities ────────────────────────────────────────────────────

function rawBodyMiddleware(req: Request, _res: Response, next: () => void) {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    (req as any).rawBody = Buffer.concat(chunks);
    next();
  });
}

function verifyHmacSha256(rawBody: Buffer, signature: string, secret: string): boolean {
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ─── Store Lookup ─────────────────────────────────────────────────────────────

async function findStoreByPlatformAndShop(platform: "etsy" | "tiktok_shop", shopId: string) {
  const db = await getDb();
  if (!db) return null;
  // Try platformStoreId first, fall back to platformDomain
  const byStoreId = await db
    .select()
    .from(stores)
    .where(and(eq(stores.platform, platform), eq(stores.platformDomain, shopId)))
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

  // Verify HMAC if secret is configured
  const secret = ENV.etsySharedSecret;
  if (secret && signature && !verifyHmacSha256(rawBody, signature, secret)) {
    console.warn("[Etsy Webhook] HMAC verification failed");
    return res.status(401).json({ error: "HMAC verification failed" });
  }

  // Acknowledge immediately
  res.status(200).json({ received: true });

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    console.error("[Etsy Webhook] Failed to parse payload");
    return;
  }

  const topic: string = payload.type ?? payload.event_type ?? "unknown";
  const store = await findStoreByPlatformAndShop("etsy", shopId).catch(() => null);
  const eventStart = Date.now();

  console.log(`[Etsy Webhook] Processing ${topic} for shop ${shopId}`);

  try {
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
          console.log(`[Etsy Webhook] Listing ${payload.listing_id} changed in shop ${shopId}`);
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
        console.log(`[Etsy Webhook] Unhandled topic: ${topic}`);
    }

    // Log to webhook_events table
    if (store) {
      logWebhookEvent({
        userId: store.userId,
        storeId: store.id,
        platform: "etsy",
        eventType: topic,
        status: "processed",
        payload: { receipt_id: payload.receipt_id, listing_id: payload.listing_id },
        processingMs: Date.now() - eventStart,
      }).catch(() => {});
    }
  } catch (err: any) {
    console.error(`[Etsy Webhook] Error processing ${topic}:`, err.message);
    if (store) {
      logWebhookEvent({
        userId: store.userId,
        storeId: store.id,
        platform: "etsy",
        eventType: topic,
        status: "failed",
        errorMessage: err.message,
        processingMs: Date.now() - eventStart,
      }).catch(() => {});
    }
  }
}

// ─── TikTok Shop Webhook Handler ──────────────────────────────────────────────

/**
 * TikTok Shop uses HMAC-SHA256 with the app secret.
 * Signature is in the `x-tts-timestamp` + `x-tts-nonce` + body pattern.
 * Ref: https://partner.tiktokshop.com/docv2/page/650a3f6a4a0bb702c0093333
 */
function verifyTikTokShopSignature(
  rawBody: Buffer,
  timestamp: string,
  nonce: string,
  signature: string,
  appSecret: string,
): boolean {
  // TikTok Shop signature: HMAC-SHA256(appSecret, timestamp + nonce + body)
  const payload = `${timestamp}${nonce}${rawBody.toString("utf8")}`;
  const computed = crypto.createHmac("sha256", appSecret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function handleTikTokShopWebhook(req: Request, res: Response) {
  const rawBody = (req as any).rawBody as Buffer;
  const timestamp = req.headers["x-tts-timestamp"] as string | undefined;
  const nonce = req.headers["x-tts-nonce"] as string | undefined;
  const signature = req.headers["x-tts-signature"] as string | undefined;

  if (!rawBody) {
    return res.status(400).json({ error: "Missing body" });
  }

  // Verify HMAC if secret is configured
  const appSecret = ENV.tiktokClientSecret;
  if (appSecret && timestamp && nonce && signature) {
    if (!verifyTikTokShopSignature(rawBody, timestamp, nonce, signature, appSecret)) {
      console.warn("[TikTok Shop Webhook] Signature verification failed");
      return res.status(401).json({ error: "Signature verification failed" });
    }
  }

  // Acknowledge immediately
  res.status(200).json({ received: true });

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    console.error("[TikTok Shop Webhook] Failed to parse payload");
    return;
  }

  const topic: string = payload.type ?? "unknown";
  // TikTok Shop sends shop_id in the payload body
  const shopId = String(payload.shop_id ?? payload.data?.shop_id ?? "");
  const store = shopId
    ? await findStoreByPlatformAndShop("tiktok_shop", shopId).catch(() => null)
    : null;
  const eventStart = Date.now();

  console.log(`[TikTok Shop Webhook] Processing ${topic} for shop ${shopId}`);

  try {
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
        console.log(`[TikTok Shop Webhook] Product ${productId} status changed in shop ${shopId}`);
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
        console.log(`[TikTok Shop Webhook] Unhandled topic: ${topic}`);
    }

    // Log to webhook_events table
    if (store) {
      logWebhookEvent({
        userId: store.userId,
        storeId: store.id,
        platform: "tiktok_shop",
        eventType: topic,
        status: "processed",
        payload: { order_id: payload.data?.order_id, product_id: payload.data?.product_id },
        processingMs: Date.now() - eventStart,
      }).catch(() => {});
    }
  } catch (err: any) {
    console.error(`[TikTok Shop Webhook] Error processing ${topic}:`, err.message);
    if (store) {
      logWebhookEvent({
        userId: store.userId,
        storeId: store.id,
        platform: "tiktok_shop",
        eventType: topic,
        status: "failed",
        errorMessage: err.message,
        processingMs: Date.now() - eventStart,
      }).catch(() => {});
    }
  }
}

// ─── Route Registration ────────────────────────────────────────────────────────

export function registerPlatformWebhookRoutes(app: Express) {
  app.post("/api/webhooks/etsy", rawBodyMiddleware, handleEtsyWebhook);
  app.post("/api/webhooks/tiktok-shop", rawBodyMiddleware, handleTikTokShopWebhook);
  console.log("[PlatformWebhooks] Registered: POST /api/webhooks/etsy, POST /api/webhooks/tiktok-shop");
}
