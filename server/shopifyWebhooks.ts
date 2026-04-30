/**
 * Shopify Webhook Handlers
 * Processes real-time events from Shopify stores for Zero-Touch fulfillment.
 * All webhooks are HMAC-verified before processing.
 *
 * Registered topics:
 *   orders/create      → triggers immediate fulfillment_automation workflow
 *   orders/paid        → updates order status to "processing"
 *   orders/fulfilled   → marks order fulfilled + notifies owner
 *   products/update    → syncs product changes to DB
 *   inventory_levels/update → triggers low-stock alert if below threshold
 */

import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { stores, orders, products } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createBotEvent, createOrder, updateOrder, getBotConfigs, createAgentTask, logWebhookEvent } from "./db";
import { launchWorkflow } from "./engine/workflowEngine";
import { addToDeadLetterQueue } from "./engine/eliteOrchestrator";
import { notifyOwner } from "./_core/notification";
import { ENV } from "./_core/env";
import { logAgentAction, logTimeToFulfill } from "./telemetry";
import { rawBodyMiddleware, verifyShopifyHmac } from "./utils/webhookVerify";
import { WebhookDedup } from "./utils/webhookDedup";
import { logger } from "./utils/logger";

// ─── HMAC Verification ────────────────────────────────────────────────────
// Shopify-specific verification + the raw-body middleware live in
// `server/utils/webhookVerify.ts` so every webhook surface uses the same
// constant-time comparison + buffering pattern. (Audit P1 #10.)

// ─── Store Lookup ─────────────────────────────────────────────────────────

async function findStoreByDomain(shopDomain: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(stores)
    .where(and(eq(stores.platformDomain, shopDomain), eq(stores.platform, "shopify")))
    .limit(1);
  return result[0] || null;
}

// ─── Webhook Handlers ─────────────────────────────────────────────────────

/**
 * orders/create — The core Zero-Touch trigger.
 * Creates an order record and immediately launches the fulfillment_automation workflow.
 */
async function handleOrderCreate(shopDomain: string, payload: any) {
  const store = await findStoreByDomain(shopDomain);
  if (!store) {
    logger.warn("shopify_webhook_unknown_store", {
      module: "shopifyWebhooks",
      topic: "orders/create",
      shopDomain,
    });
    return;
  }

  const orderId = String(payload.id);
  const totalCents = Math.round(parseFloat(payload.total_price || "0") * 100);

  // Upsert order in DB
  const { id: dbOrderId } = await createOrder({
    storeId: store.id,
    platformOrderId: orderId,
    customerName: `${payload.customer?.first_name || ""} ${payload.customer?.last_name || ""}`.trim() || "Guest",
    customerEmail: payload.customer?.email || payload.email || null,
    totalAmount: totalCents,
    currency: payload.currency || store.currency || "USD",
    status: "pending",
    fulfillmentStatus: "unfulfilled",
    itemCount: payload.line_items?.length || 1,
    orderData: payload,
  });

  // Log the bot action
  await createAgentTask({
    agentType: "merchant",
    taskType: "order_received",
    title: `Order #${payload.order_number || orderId} received`,
    description: `New order from ${payload.customer?.first_name || "customer"} for ${payload.total_price} ${payload.currency}`,
    storeId: store.id,
    status: "completed",
    result: { dbOrderId, shopifyOrderId: orderId },
  });

  // Check autonomy level — only auto-fulfill if fully_autonomous
  const configs = await getBotConfigs(store.userId);
  const merchantConfig = configs.find(c => c.agentType === "merchant");
  const autonomy = merchantConfig?.autonomyLevel || "fully_autonomous";

  if (autonomy === "fully_autonomous") {
    // Launch Zero-Touch fulfillment workflow immediately. Org context
    // comes from the store row (not the user) so multi-org users
    // attribute to the right tenant.
    await launchWorkflow(
      store.userId,
      {
        agentType: "merchant",
        workflowType: "fulfillment_automation",
        title: `Auto-Fulfill Order #${payload.order_number || orderId}`,
        scope: "specific_store",
        storeId: store.id,
        input: {
          orderId: dbOrderId,
          platformOrderId: orderId,
          storeId: store.id,
          customerName: `${payload.customer?.first_name || ""} ${payload.customer?.last_name || ""}`.trim(),
          totalAmount: payload.total_price,
          currency: payload.currency,
          lineItems: payload.line_items,
        },
        steps: [],
      },
      { orgId: store.orgId },
    );
    logger.info("shopify_webhook_zero_touch_launched", {
      module: "shopifyWebhooks",
      agentType: "merchant",
      storeId: store.id,
      platformOrderId: orderId,
    });

    // Telemetry: log zero-touch fulfillment trigger
    logAgentAction({
      agentType: "merchant",
      actionType: "zero_touch_fulfillment_triggered",
      storeId: store.id,
      triggerSource: "webhook",
      input: { orderId: dbOrderId, platformOrderId: orderId, totalCents, itemCount: payload.line_items?.length },
      output: { workflowLaunched: true, autonomyLevel: autonomy },
      success: true,
      metadata: { shopDomain, orderNumber: payload.order_number },
    }).catch((telemetryErr: any) => {
      logger.error("shopify_webhook_telemetry_failed", {
        module: "shopifyWebhooks",
        topic: "orders/create",
        platformOrderId: orderId,
        error: telemetryErr.message,
      });
    });
  } else {
    // Queue for approval
    await notifyOwner({
      title: "New Order Requires Fulfillment Approval",
      content: `Order #${payload.order_number} for ${payload.total_price} ${payload.currency} from ${payload.customer?.first_name || "a customer"} is waiting for your approval to fulfill. Go to Activity > Approval Queue.`,
    });
    logger.info("shopify_webhook_supervised_queued", {
      module: "shopifyWebhooks",
      agentType: "merchant",
      storeId: store.id,
      platformOrderId: orderId,
    });
  }
}

/**
 * orders/paid — Update order status to processing.
 */
async function handleOrderPaid(shopDomain: string, payload: any) {
  const store = await findStoreByDomain(shopDomain);
  if (!store) return;

  const db = await getDb();
  if (!db) return;

  const platformOrderId = String(payload.id);
  const existing = await db.select().from(orders)
    .where(and(eq(orders.storeId, store.id), eq(orders.platformOrderId, platformOrderId)))
    .limit(1);

  if (existing.length > 0) {
    await updateOrder(existing[0].id, { status: "processing" });
    logger.info("shopify_webhook_order_paid", {
      module: "shopifyWebhooks",
      agentType: "merchant",
      storeId: store.id,
      platformOrderId,
    });

    // Telemetry: log order status update
    logAgentAction({
      agentType: "merchant",
      actionType: "order_status_update",
      storeId: store.id,
      triggerSource: "webhook",
      input: { platformOrderId, topic: "orders/paid" },
      output: { newStatus: "processing" },
      success: true,
    }).catch((telemetryErr: any) => {
      logger.error("shopify_webhook_telemetry_failed", {
        module: "shopifyWebhooks",
        topic: "orders/paid",
        platformOrderId,
        error: telemetryErr.message,
      });
    });
  }
}

/**
 * orders/fulfilled — Mark order fulfilled and notify owner.
 */
async function handleOrderFulfilled(shopDomain: string, payload: any) {
  const store = await findStoreByDomain(shopDomain);
  if (!store) return;

  const db = await getDb();
  if (!db) return;

  const platformOrderId = String(payload.id);
  const existing = await db.select().from(orders)
    .where(and(eq(orders.storeId, store.id), eq(orders.platformOrderId, platformOrderId)))
    .limit(1);

  if (existing.length > 0) {
    const trackingNumber = payload.fulfillments?.[0]?.tracking_number || null;
    const trackingUrl = payload.fulfillments?.[0]?.tracking_url || null;
    await updateOrder(existing[0].id, {
      status: "fulfilled",
      fulfillmentStatus: "fulfilled",
      trackingNumber,
      trackingUrl,
    });
    await notifyOwner({
      title: `Order #${payload.order_number} Fulfilled`,
      content: `Order for ${payload.total_price} ${payload.currency} has been fulfilled.${trackingNumber ? ` Tracking: ${trackingNumber}` : ""}`,
    });
    logger.info("shopify_webhook_order_fulfilled", {
      module: "shopifyWebhooks",
      agentType: "merchant",
      storeId: store.id,
      platformOrderId,
      trackingNumber,
    });

    // Telemetry: log fulfillment completion
    logAgentAction({
      agentType: "merchant",
      actionType: "order_fulfilled",
      storeId: store.id,
      triggerSource: "webhook",
      input: { platformOrderId, topic: "orders/fulfilled" },
      output: { trackingNumber, trackingUrl },
      success: true,
    }).catch((err) =>
      logger.error("shopify_webhook_telemetry_failed", {
        module: "shopifyWebhooks",
        topic: "orders/fulfilled",
        platformOrderId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );

    // Business metric: time-to-fulfill
    const orderCreatedAt = existing[0].createdAt ? new Date(existing[0].createdAt) : null;
    if (orderCreatedAt) {
      logTimeToFulfill(store.id, platformOrderId, orderCreatedAt).catch((err) =>
        logger.error("shopify_webhook_time_to_fulfill_failed", {
          module: "shopifyWebhooks",
          storeId: store.id,
          platformOrderId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }

    await createBotEvent({
      fromBot: "merchant",
      toBot: "social",
      eventType: "order_fulfilled_review_request",
      userId: store.userId,
      storeId: store.id,
      payload: {
        orderId: existing[0].id,
        platformOrderId,
        orderNumber: payload.order_number ? String(payload.order_number) : undefined,
        totalAmountCents: existing[0].totalAmount,
        currency: existing[0].currency || store.currency || "USD",
        customerName: existing[0].customerName || undefined,
      },
      status: "pending",
    });
  }
}

/**
 * products/update — Sync product changes to DB.
 */
async function handleProductUpdate(shopDomain: string, payload: any) {
  const store = await findStoreByDomain(shopDomain);
  if (!store) return;

  const db = await getDb();
  if (!db) return;

  const platformProductId = String(payload.id);
  const existing = await db.select().from(products)
    .where(and(eq(products.storeId, store.id), eq(products.platformProductId, platformProductId)))
    .limit(1);

  if (existing.length > 0) {
    const variant = payload.variants?.[0];
    const updates: Record<string, any> = {
      title: payload.title,
      description: payload.body_html?.replace(/<[^>]*>/g, "").slice(0, 500) || null,
      status: payload.status === "active" ? "active" : "draft",
    };
    if (variant) {
      updates.price = Math.round(parseFloat(variant.price || "0") * 100);
      updates.stockLevel = variant.inventory_quantity ?? null;
    }
    await db.update(products).set(updates).where(eq(products.id, existing[0].id));
    logger.info("shopify_webhook_product_synced", {
      module: "shopifyWebhooks",
      storeId: store.id,
      platformProductId,
    });
  }
}

/**
 * inventory_levels/update — Trigger low-stock alert if below threshold.
 */
async function handleInventoryUpdate(shopDomain: string, payload: any) {
  const store = await findStoreByDomain(shopDomain);
  if (!store) return;

  const available = payload.available ?? 0;
  const configs = await getBotConfigs(store.userId);
  const merchantConf = configs.find(c => c.agentType === "merchant");
  const threshold = merchantConf?.lowStockThreshold ?? 5;

  if (available <= threshold && available >= 0) {
    await notifyOwner({
      title: "Low Stock Alert",
      content: `Inventory for a product in your ${store.name} store has dropped to ${available} units (threshold: ${threshold}). The Merchant Bot will initiate a restock workflow.`,
    });

    // Auto-launch restock alert workflow — org-scoped via store.
    await launchWorkflow(
      store.userId,
      {
        agentType: "merchant",
        workflowType: "restock_alert",
        title: `Low Stock Alert — ${store.name}`,
        scope: "specific_store",
        storeId: store.id,
        input: {
          storeId: store.id,
          inventoryItemId: payload.inventory_item_id,
          locationId: payload.location_id,
          available,
          threshold,
        },
        steps: [],
      },
      { orgId: store.orgId },
    );
    logger.info("shopify_webhook_low_stock_alert", {
      module: "shopifyWebhooks",
      agentType: "merchant",
      storeId: store.id,
      available,
      threshold,
    });
  }
}

// ─── Webhook Deduplication ────────────────────────────────────────────────
// Shopify may retry webhooks if it doesn't receive a 200 within 5 seconds.
// We use a three-state dedup (in_flight / completed / unseen) so a
// failed handler RELEASES its claim — letting Shopify's next retry
// reach the work — instead of silently dropping retries with a
// premature "seen" mark. See `server/utils/webhookDedup.ts`.

const dedup = new WebhookDedup();
// Cleanup expired entries every 2 minutes to keep the map healthy.
setInterval(() => dedup.prune(), 2 * 60 * 1000).unref?.();

function dedupKey(shopDomain: string, topic: string, resourceId: string): string {
  return `${shopDomain}:${topic}:${resourceId}`;
}

// ─── Main Webhook Dispatcher ──────────────────────────────────────────────

async function handleShopifyWebhook(req: Request, res: Response) {
  const topic = req.headers["x-shopify-topic"] as string;
  const shopDomain = req.headers["x-shopify-shop-domain"] as string;
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
  // X-Shopify-Webhook-Id is unique per delivery — Shopify added it in
  // 2022 specifically for at-least-once dedup. Two distinct events on
  // the same resource (e.g. consecutive inventory_levels/update bumps)
  // get distinct ids; vendor retries of one event share an id. This is
  // strictly more accurate than dedup-by-resource, which would silently
  // collapse legitimate distinct updates that arrived within the TTL.
  const webhookId = req.headers["x-shopify-webhook-id"] as string | undefined;
  const rawBody = (req as any).rawBody as Buffer;

  if (!topic || !shopDomain || !hmacHeader || !rawBody) {
    return res.status(400).json({ error: "Missing required webhook headers" });
  }

  // Verify HMAC using the Shopify Partner App secret
  const secret = ENV.shopifyPartnerClientSecret;
  if (secret && !verifyShopifyHmac(rawBody, hmacHeader, secret)) {
    logger.warn("shopify_webhook_hmac_failed", {
      module: "shopifyWebhooks",
      topic,
      shopDomain,
    });
    return res.status(401).json({ error: "HMAC verification failed" });
  }

  // Acknowledge immediately (Shopify requires < 5s response)
  res.status(200).json({ received: true });

  // Process asynchronously
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    logger.error("shopify_webhook_payload_parse_failed", {
      module: "shopifyWebhooks",
      topic,
      shopDomain,
    });
    return;
  }

  logger.info("shopify_webhook_received", {
    module: "shopifyWebhooks",
    topic,
    shopDomain,
  });

  // ── Deduplication: claim before processing, release on failure ──
  // Prefer X-Shopify-Webhook-Id (per-delivery unique) over the resource
  // id; the resource-id fallback exists for older Shopify webhook
  // payloads (pre-2022) and for tests that synthesize requests without
  // the header.
  const resourceId = String(payload.id || payload.inventory_item_id || "unknown");
  const key = webhookId
    ? dedupKey(shopDomain, "delivery", webhookId)
    : dedupKey(shopDomain, topic, resourceId);
  const claim = dedup.tryClaim(key);
  if (claim !== "claim") {
    logger.info("shopify_webhook_duplicate_skipped", {
      module: "shopifyWebhooks",
      topic,
      shopDomain,
      resourceId,
      webhookId,
      claim, // "in_flight" | "completed" — distinguishes a concurrent
             // retry from a successfully-processed-and-cached one.
    });
    return;
  }

  // Look up store for event log
  const store = await findStoreByDomain(shopDomain).catch(() => null);
  const eventStart = Date.now();

  try {
    switch (topic) {
      case "orders/create":
        await handleOrderCreate(shopDomain, payload);
        break;
      case "orders/paid":
        await handleOrderPaid(shopDomain, payload);
        break;
      case "orders/fulfilled":
        await handleOrderFulfilled(shopDomain, payload);
        break;
      case "products/update":
        await handleProductUpdate(shopDomain, payload);
        break;
      case "inventory_levels/update":
        await handleInventoryUpdate(shopDomain, payload);
        break;
      default:
        logger.info("shopify_webhook_unhandled_topic", {
          module: "shopifyWebhooks",
          topic,
          shopDomain,
        });
    }
    // Mark the work as completed AFTER it succeeded — future Shopify
    // retries within the TTL window will skip; failed runs released
    // their claim below so the next retry reaches the work.
    dedup.markCompleted(key);
    // Log processed event
    if (store) {
      logWebhookEvent({
        userId: store.userId,
        storeId: store.id,
        platform: "shopify",
        eventType: topic,
        status: "processed",
        payload: { id: payload.id, order_number: payload.order_number },
        processingMs: Date.now() - eventStart,
      }).catch((logErr) =>
        logger.warn("shopify_webhook_event_log_failed", {
          module: "shopifyWebhooks",
          topic,
          shopDomain,
          status: "processed",
          error: logErr instanceof Error ? logErr.message : String(logErr),
        }),
      );
    }
  } catch (err: any) {
    // Release the in-flight claim so vendor retries can re-attempt the
    // work. The legacy "mark on entry" pattern silently dropped retries
    // here and depended on the in-process DLQ to eventually recover.
    dedup.releaseClaim(key);
    logger.error("shopify_webhook_processing_failed", {
      module: "shopifyWebhooks",
      topic,
      shopDomain,
      error: err.message,
      stack: err.stack,
    });
    // Add to DLQ for retry
    addToDeadLetterQueue(topic, payload, "shopify", err.message);
    // Log failed event
    if (store) {
      logWebhookEvent({
        userId: store.userId,
        storeId: store.id,
        platform: "shopify",
        eventType: topic,
        status: "failed",
        errorMessage: err.message,
        processingMs: Date.now() - eventStart,
      }).catch((logErr) =>
        logger.warn("shopify_webhook_event_log_failed", {
          module: "shopifyWebhooks",
          topic,
          shopDomain,
          status: "failed",
          error: logErr instanceof Error ? logErr.message : String(logErr),
        }),
      );
    }
  }
}

// ─── Route Registration ────────────────────────────────────────────────────

export function registerShopifyWebhookRoutes(app: Express) {
  // Raw body middleware for HMAC verification — must come before JSON parser
  app.post("/api/webhooks/shopify", rawBodyMiddleware, handleShopifyWebhook);
  logger.info("shopify_webhook_route_registered", {
    module: "shopifyWebhooks",
    route: "POST /api/webhooks/shopify",
  });
}
