/**
 * Bot Coordination Engine
 *
 * Durable handoff layer between ShopBOTS agents.
 * Processes queued bot events and converts them into internal tasks,
 * notifications, or draft follow-up actions.
 */

import * as db from "../db";

type SupportedEventType = "order_fulfilled_review_request";

interface OrderFulfilledReviewPayload {
  orderId: number;
  platformOrderId: string;
  orderNumber?: string;
  totalAmountCents: number;
  currency: string;
  customerName?: string;
}

async function handleOrderFulfilledReviewRequest(event: any) {
  const store = event.storeId ? await db.getStoreById(event.storeId) : undefined;
  const payload = (event.payload ?? {}) as OrderFulfilledReviewPayload;
  const orderLabel = payload.orderNumber || payload.platformOrderId || `#${payload.orderId}`;

  await db.createAgentTask({
    agentType: "social",
    taskType: "post_purchase_engagement",
    title: `Post-purchase follow-up queued for order ${orderLabel}`,
    description: `Social Bot identified a review-request and UGC opportunity after fulfillment${store ? ` for ${store.name}` : ""}.`,
    status: "completed",
    storeId: event.storeId ?? undefined,
    metadata: {
      sourceEventId: event.id,
      sourceBot: event.fromBot,
      orderId: payload.orderId,
      platformOrderId: payload.platformOrderId,
    },
  });

  await db.createNotification({
    userId: event.userId,
    agentType: "social",
    type: "info",
    title: "Social Bot spotted a post-purchase growth opportunity",
    message: `Order ${orderLabel} was fulfilled${payload.customerName ? ` for ${payload.customerName}` : ""}. Social Bot is ready to follow up for reviews, UGC, and repeat-purchase momentum.`,
    actionUrl: "/social",
    metadata: {
      sourceEventId: event.id,
      eventType: event.eventType,
      orderId: payload.orderId,
      storeId: event.storeId,
    },
  });
}

const eventHandlers: Record<SupportedEventType, (event: any) => Promise<void>> = {
  order_fulfilled_review_request: handleOrderFulfilledReviewRequest,
};

export async function processPendingBotEvents(limit = 25) {
  const events = await db.getPendingBotEvents(limit);
  let processed = 0;
  let failed = 0;
  let ignored = 0;

  for (const event of events) {
    const handler = eventHandlers[event.eventType as SupportedEventType];

    if (!handler) {
      await db.updateBotEvent(event.id, {
        status: "ignored",
        error: `No handler registered for ${event.eventType}`,
        processedAt: new Date(),
      });
      ignored++;
      continue;
    }

    try {
      await handler(event);
      await db.updateBotEvent(event.id, {
        status: "processed",
        error: null,
        processedAt: new Date(),
      });
      processed++;
    } catch (err: any) {
      await db.updateBotEvent(event.id, {
        status: "failed",
        error: err.message || String(err),
        processedAt: new Date(),
      });
      failed++;
    }
  }

  return { processed, failed, ignored, total: events.length };
}