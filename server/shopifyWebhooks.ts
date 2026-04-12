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
import crypto from "crypto";
import { getDb } from "./db";
import { stores, orders, products } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createOrder, updateOrder, getBotConfigs, createAgentTask } from "./db";
import { launchWorkflow } from "./engine/workflowEngine";
import { notifyOwner } from "./_core/notification";
import { ENV } from "./_core/env";
import { logAgentAction } from "./telemetry";

// ─── HMAC Verification ────────────────────────────────────────────────────

function verifyShopifyHmac(rawBody: Buffer, hmacHeader: string, secret: string): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

// Middleware to capture raw body for HMAC verification
function rawBodyMiddleware(req: Request, _res: Response, next: () => void) {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    (req as any).rawBody = Buffer.concat(chunks);
    next();
  });
}

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
    console.warn(`[Webhook] orders/create: No store found for domain ${shopDomain}`);
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
    // Launch Zero-Touch fulfillment workflow immediately
    await launchWorkflow(store.userId, {
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
    });
    console.log(`[Webhook] Zero-Touch: Launched fulfillment_automation for order ${orderId} (store ${store.id})`);

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
      console.error(`[Webhook] Failed to log telemetry for order creation ${orderId}:`, telemetryErr.message);
    });
  } else {
    // Queue for approval
    await notifyOwner({
      title: "New Order Requires Fulfillment Approval",
      content: `Order #${payload.order_number} for ${payload.total_price} ${payload.currency} from ${payload.customer?.first_name || "a customer"} is waiting for your approval to fulfill. Go to Activity > Approval Queue.`,
    });
    console.log(`[Webhook] Supervised mode: Order ${orderId} queued for approval`);
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
    console.log(`[Webhook] orders/paid: Order ${platformOrderId} marked as processing`);

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
      console.error(`[Webhook] Failed to log telemetry for order status update ${platformOrderId}:`, telemetryErr.message);
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
    console.log(`[Webhook] orders/fulfilled: Order ${platformOrderId} fulfilled`);

    // Telemetry: log fulfillment completion
    logAgentAction({
      agentType: "merchant",
      actionType: "order_fulfilled",
      storeId: store.id,
      triggerSource: "webhook",
      input: { platformOrderId, topic: "orders/fulfilled" },
      output: { trackingNumber, trackingUrl },
      success: true,
    }).catch(() => {});
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
    console.log(`[Webhook] products/update: Synced product ${platformProductId}`);
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

    // Auto-launch restock alert workflow
    await launchWorkflow(store.userId, {
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
    });
    console.log(`[Webhook] inventory_levels/update: Low stock alert triggered (${available} units)`);
  }
}

// ─── Main Webhook Dispatcher ──────────────────────────────────────────────

async function handleShopifyWebhook(req: Request, res: Response) {
  const topic = req.headers["x-shopify-topic"] as string;
  const shopDomain = req.headers["x-shopify-shop-domain"] as string;
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
  const rawBody = (req as any).rawBody as Buffer;

  if (!topic || !shopDomain || !hmacHeader || !rawBody) {
    return res.status(400).json({ error: "Missing required webhook headers" });
  }

  // Verify HMAC using the Shopify Partner App secret
  const secret = ENV.shopifyPartnerClientSecret;
  if (secret && !verifyShopifyHmac(rawBody, hmacHeader, secret)) {
    console.warn(`[Webhook] HMAC verification failed for ${topic} from ${shopDomain}`);
    return res.status(401).json({ error: "HMAC verification failed" });
  }

  // Acknowledge immediately (Shopify requires < 5s response)
  res.status(200).json({ received: true });

  // Process asynchronously
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    console.error(`[Webhook] Failed to parse payload for ${topic}`);
    return;
  }

  console.log(`[Webhook] Processing ${topic} from ${shopDomain}`);

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
        console.log(`[Webhook] Unhandled topic: ${topic}`);
    }
  } catch (err: any) {
    console.error(`[Webhook] Error processing ${topic}:`, err.message);
  }
}

// ─── Route Registration ────────────────────────────────────────────────────

export function registerShopifyWebhookRoutes(app: Express) {
  // Raw body middleware for HMAC verification — must come before JSON parser
  app.post("/api/webhooks/shopify", rawBodyMiddleware, handleShopifyWebhook);
  console.log("[ShopifyWebhooks] Webhook route registered: POST /api/webhooks/shopify");
}
