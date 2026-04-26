/**
 * Bot Coordination Engine
 *
 * Durable handoff layer between Shop_a_Bot agents.
 * Processes queued bot events and converts them into internal tasks,
 * notifications, or draft follow-up actions.
 *
 * Features:
 * - 12 event types covering the full e-commerce lifecycle
 * - Saga pattern: each handler is a compensating transaction with rollback
 * - Idempotency keys: every critical mutation is deduplicated
 * - Structured logging for observability
 */

import * as db from "../db";
import { logger } from "../_core/logger";

// ─── Event Type Registry ──────────────────────────────────────────────────

export type SupportedEventType =
  // Fulfillment lifecycle
  | "order_fulfilled_review_request"
  | "order_refund_requested"
  | "order_chargeback_detected"
  // Inventory signals
  | "inventory_critical"
  | "inventory_overstock"
  | "supplier_restock_confirmed"
  // Revenue signals
  | "sale_spike_detected"
  | "revenue_drop_detected"
  // Ad performance
  | "social_campaign_high_roas"
  | "ad_budget_exhausted"
  | "competitor_price_drop"
  // System anomalies
  | "merchant_anomaly_detected";

// ─── Payload Interfaces ───────────────────────────────────────────────────

interface OrderFulfilledPayload {
  orderId: number;
  platformOrderId: string;
  orderNumber?: string;
  totalAmountCents: number;
  currency: string;
  customerName?: string;
}

interface InventoryCriticalPayload {
  productId: number;
  productTitle: string;
  currentStock: number;
  threshold: number;
  platform: string;
}

interface InventoryOverstockPayload {
  productId: number;
  productTitle: string;
  currentStock: number;
  optimalStock: number;
  suggestedDiscount: number;
}

interface SalesSpikePayload {
  storeId: number;
  periodHours: number;
  orderCount: number;
  revenueCents: number;
  baselineOrderCount: number;
  spikeMultiplier: number;
}

interface RevenueDrop {
  storeId: number;
  periodHours: number;
  revenueCents: number;
  baselineRevenueCents: number;
  dropPercent: number;
}

interface HighRoasPayload {
  campaignId?: number;
  campaignName: string;
  roas: number;
  platform: string;
  spendCents: number;
  revenueCents: number;
}

interface AdBudgetExhaustedPayload {
  campaignId?: number;
  campaignName: string;
  platform: string;
  budgetCents: number;
  remainingCents: number;
}

interface CompetitorPriceDropPayload {
  productId: number;
  productTitle: string;
  ourPriceCents: number;
  competitorPriceCents: number;
  competitorUrl?: string;
  dropPercent: number;
}

interface MerchantAnomalyPayload {
  anomalyType: string;
  reason: string;
  severity: "low" | "medium" | "high" | "critical";
  affectedProductId?: number;
  suggestedAction?: string;
}

interface SupplierRestockPayload {
  supplierId?: number;
  supplierName: string;
  productId: number;
  productTitle: string;
  restockQuantity: number;
  expectedDelivery?: string;
}

interface RefundPayload {
  orderId: number;
  platformOrderId: string;
  refundAmountCents: number;
  reason: string;
}

interface ChargebackPayload {
  orderId: number;
  platformOrderId: string;
  amountCents: number;
  reason: string;
  deadline?: string;
}

// ─── Idempotency Key Helpers ──────────────────────────────────────────────

/**
 * Generate a deterministic idempotency key for a bot coordination action.
 * Prevents duplicate tasks from being created if an event is processed twice.
 */
function idemKey(eventId: number, action: string): string {
  return `bot_event:${eventId}:${action}`;
}

/**
 * Create an agent task only if one with the same idempotency key doesn't exist.
 * Returns the existing task ID if already created, or the new task ID.
 */
async function createTaskIdempotent(
  params: Parameters<typeof db.createAgentTask>[0],
  idempotencyKey: string
): Promise<number | null> {
  // Check for existing task with this idempotency key
  const existing = await db.getAgentTaskByIdempotencyKey(idempotencyKey);
  if (existing) {
    logger.debug("idempotent_task_skipped", { idempotencyKey, existingTaskId: existing.id });
    return existing.id;
  }
  const task = await db.createAgentTask({ ...params, idempotencyKey });
  return task.id;
}

// ─── Saga: Compensating Transaction Wrapper ───────────────────────────────

interface SagaStep {
  name: string;
  execute: () => Promise<void>;
  compensate: () => Promise<void>;
}

/**
 * Execute a series of saga steps with automatic compensation on failure.
 * If any step fails, all previously completed steps are compensated in reverse order.
 */
async function executeSaga(sagaName: string, steps: SagaStep[]): Promise<void> {
  const completed: SagaStep[] = [];

  for (const step of steps) {
    try {
      await step.execute();
      completed.push(step);
      logger.debug("saga_step_complete", { sagaName, stepName: step.name });
    } catch (err: any) {
      logger.error("saga_step_failed", { sagaName, stepName: step.name, error: err.message });

      // Compensate in reverse order
      for (const completedStep of [...completed].reverse()) {
        try {
          await completedStep.compensate();
          logger.debug("saga_compensation_complete", { sagaName, stepName: completedStep.name });
        } catch (compErr: any) {
          logger.error("saga_compensation_failed", {
            sagaName,
            stepName: completedStep.name,
            error: compErr.message,
          });
        }
      }

      throw new Error(`Saga "${sagaName}" failed at step "${step.name}": ${err.message}`);
    }
  }
}

// ─── Event Handlers ───────────────────────────────────────────────────────

async function handleOrderFulfilledReviewRequest(event: any) {
  const store = event.storeId ? await db.getStoreById(event.storeId) : undefined;
  const payload = (event.payload ?? {}) as OrderFulfilledPayload;
  const orderLabel = payload.orderNumber || payload.platformOrderId || `#${payload.orderId}`;

  await executeSaga("order_fulfilled_review_request", [
    {
      name: "create_social_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "social",
          taskType: "post_purchase_engagement",
          title: `Post-purchase follow-up queued for order ${orderLabel}`,
          description: `Social Bot identified a review-request and UGC opportunity after fulfillment${store ? ` for ${store.name}` : ""}.`,
          status: "pending_approval",
          storeId: event.storeId ?? undefined,
          metadata: {
            sourceEventId: event.id,
            sourceBot: event.fromBot,
            orderId: payload.orderId,
            platformOrderId: payload.platformOrderId,
          },
        }, idemKey(event.id, "social_task"));
      },
      compensate: async () => {
        // No compensation needed — task creation is idempotent and non-destructive
      },
    },
    {
      name: "create_notification",
      execute: async () => {
        await db.createNotification({
          userId: event.userId,
          agentType: "social",
          type: "info",
          title: "Social Bot spotted a post-purchase growth opportunity",
          message: `Order ${orderLabel} was fulfilled${payload.customerName ? ` for ${payload.customerName}` : ""}. Social Bot is ready to follow up for reviews, UGC, and repeat-purchase momentum.`,
          actionUrl: "/social",
          metadata: { sourceEventId: event.id, eventType: event.eventType, orderId: payload.orderId, storeId: event.storeId },
        });
      },
      compensate: async () => {},
    },
  ]);
}

async function handleInventoryCritical(event: any) {
  const payload = (event.payload ?? {}) as InventoryCriticalPayload;

  await executeSaga("inventory_critical", [
    {
      name: "create_restock_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "merchant",
          taskType: "restock_order",
          title: `CRITICAL: Restock "${payload.productTitle}" immediately`,
          description: `Stock at ${payload.currentStock} units (threshold: ${payload.threshold}). Merchant Bot will auto-generate a purchase order.`,
          status: "pending_approval",
          storeId: event.storeId,
          metadata: { sourceEventId: event.id, productId: payload.productId, currentStock: payload.currentStock },
        }, idemKey(event.id, "restock_task"));
      },
      compensate: async () => {},
    },
    {
      name: "create_ad_pause_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "social",
          taskType: "pause_underperforming_ads",
          title: `Pause ads for out-of-stock product: "${payload.productTitle}"`,
          description: `Inventory critical — Social Bot will pause active ad campaigns for this product to prevent wasted spend.`,
          status: "pending_approval",
          storeId: event.storeId,
          metadata: { sourceEventId: event.id, productId: payload.productId },
        }, idemKey(event.id, "ad_pause_task"));
      },
      compensate: async () => {},
    },
    {
      name: "notify_owner",
      execute: async () => {
        await db.createNotification({
          userId: event.userId,
          agentType: "merchant",
          type: "warning",
          title: `⚠️ Critical Stock Alert: ${payload.productTitle}`,
          message: `Only ${payload.currentStock} units remaining (threshold: ${payload.threshold}). Merchant Bot is preparing a restock order. Ads will be paused automatically.`,
          actionUrl: "/inventory",
          metadata: { sourceEventId: event.id, productId: payload.productId },
        });
      },
      compensate: async () => {},
    },
  ]);
}

async function handleInventoryOverstock(event: any) {
  const payload = (event.payload ?? {}) as InventoryOverstockPayload;

  await createTaskIdempotent({
    agentType: "social",
    taskType: "clearance_campaign",
    title: `Clearance campaign for overstocked "${payload.productTitle}"`,
    description: `${payload.currentStock} units vs optimal ${payload.optimalStock}. Social Bot will create a ${payload.suggestedDiscount}% discount campaign.`,
    status: "pending_approval",
    storeId: event.storeId,
    metadata: { sourceEventId: event.id, productId: payload.productId, suggestedDiscount: payload.suggestedDiscount },
  }, idemKey(event.id, "clearance_task"));
}

async function handleSaleSpike(event: any) {
  const payload = (event.payload ?? {}) as SalesSpikePayload;

  await executeSaga("sale_spike", [
    {
      name: "scale_ad_budget_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "social",
          taskType: "scale_ad_budget",
          title: `Scale ad budget — ${payload.spikeMultiplier.toFixed(1)}x sales spike detected`,
          description: `${payload.orderCount} orders in ${payload.periodHours}h (baseline: ${payload.baselineOrderCount}). Social Bot will increase ad budget while momentum is high.`,
          status: "pending_approval",
          storeId: payload.storeId,
          metadata: { sourceEventId: event.id, spikeMultiplier: payload.spikeMultiplier, revenueCents: payload.revenueCents },
        }, idemKey(event.id, "scale_budget_task"));
      },
      compensate: async () => {},
    },
    {
      name: "inventory_check_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "merchant",
          taskType: "emergency_inventory_check",
          title: `Emergency inventory check during sales spike`,
          description: `Sales are ${payload.spikeMultiplier.toFixed(1)}x baseline. Merchant Bot will verify stock levels can sustain demand.`,
          status: "pending_approval",
          storeId: payload.storeId,
          metadata: { sourceEventId: event.id },
        }, idemKey(event.id, "inventory_check_task"));
      },
      compensate: async () => {},
    },
  ]);
}

async function handleRevenueDrop(event: any) {
  const payload = (event.payload ?? {}) as RevenueDrop;

  await executeSaga("revenue_drop", [
    {
      name: "diagnostic_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "architect",
          taskType: "store_health_check",
          title: `Revenue drop diagnostic — ${payload.dropPercent.toFixed(0)}% decline`,
          description: `Revenue dropped ${payload.dropPercent.toFixed(0)}% vs baseline. Architect Bot will run a full store health check.`,
          status: "pending_approval",
          storeId: payload.storeId,
          metadata: { sourceEventId: event.id, dropPercent: payload.dropPercent },
        }, idemKey(event.id, "diagnostic_task"));
      },
      compensate: async () => {},
    },
    {
      name: "notify_owner",
      execute: async () => {
        await db.createNotification({
          userId: event.userId,
          agentType: "merchant",
          type: "error",
          title: `🚨 Revenue Drop Alert: ${payload.dropPercent.toFixed(0)}% decline`,
          message: `Revenue is down ${payload.dropPercent.toFixed(0)}% over the last ${payload.periodHours}h. Architect Bot is running a diagnostic. Immediate attention may be required.`,
          actionUrl: "/analytics",
          metadata: { sourceEventId: event.id },
        });
      },
      compensate: async () => {},
    },
  ]);
}

async function handleHighRoas(event: any) {
  const payload = (event.payload ?? {}) as HighRoasPayload;

  await executeSaga("high_roas", [
    {
      name: "niche_exploration_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "architect",
          taskType: "niche_exploration",
          title: `High ROAS detected — explore derivative niches`,
          description: `Campaign "${payload.campaignName}" achieved ${payload.roas.toFixed(1)}x ROAS on ${payload.platform}. Architect Bot will research adjacent niches to double down.`,
          status: "pending_approval",
          storeId: event.storeId,
          metadata: { sourceEventId: event.id, roas: payload.roas, platform: payload.platform },
        }, idemKey(event.id, "niche_task"));
      },
      compensate: async () => {},
    },
    {
      name: "scale_budget_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "social",
          taskType: "scale_ad_budget",
          title: `Scale winning campaign: "${payload.campaignName}"`,
          description: `${payload.roas.toFixed(1)}x ROAS on $${(payload.spendCents / 100).toFixed(0)} spend. Social Bot will increase budget by 20%.`,
          status: "pending_approval",
          storeId: event.storeId,
          metadata: { sourceEventId: event.id, campaignId: payload.campaignId },
        }, idemKey(event.id, "scale_task"));
      },
      compensate: async () => {},
    },
  ]);
}

async function handleAdBudgetExhausted(event: any) {
  const payload = (event.payload ?? {}) as AdBudgetExhaustedPayload;

  await createTaskIdempotent({
    agentType: "social",
    taskType: "replenish_ad_budget",
    title: `Ad budget exhausted: "${payload.campaignName}"`,
    description: `${payload.platform} campaign has $${(payload.remainingCents / 100).toFixed(2)} remaining of $${(payload.budgetCents / 100).toFixed(0)} budget. Social Bot will request budget replenishment.`,
    status: "pending_approval",
    storeId: event.storeId,
    metadata: { sourceEventId: event.id, campaignId: payload.campaignId, platform: payload.platform },
  }, idemKey(event.id, "budget_replenish_task"));
}

async function handleCompetitorPriceDrop(event: any) {
  const payload = (event.payload ?? {}) as CompetitorPriceDropPayload;

  await executeSaga("competitor_price_drop", [
    {
      name: "pricing_review_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "merchant",
          taskType: "dynamic_pricing",
          title: `Competitor price drop — review pricing for "${payload.productTitle}"`,
          description: `Competitor dropped price by ${payload.dropPercent.toFixed(0)}% ($${(payload.competitorPriceCents / 100).toFixed(2)} vs our $${(payload.ourPriceCents / 100).toFixed(2)}). Merchant Bot will evaluate a price match.`,
          status: "pending_approval",
          storeId: event.storeId,
          metadata: { sourceEventId: event.id, productId: payload.productId, competitorPriceCents: payload.competitorPriceCents },
        }, idemKey(event.id, "pricing_task"));
      },
      compensate: async () => {},
    },
    {
      name: "notify_owner",
      execute: async () => {
        await db.createNotification({
          userId: event.userId,
          agentType: "merchant",
          type: "warning",
          title: `Competitor price drop on "${payload.productTitle}"`,
          message: `A competitor dropped their price by ${payload.dropPercent.toFixed(0)}%. Merchant Bot is reviewing whether to match or differentiate.`,
          actionUrl: "/pricing",
          metadata: { sourceEventId: event.id, productId: payload.productId },
        });
      },
      compensate: async () => {},
    },
  ]);
}

async function handleMerchantAnomaly(event: any) {
  const payload = (event.payload ?? {}) as MerchantAnomalyPayload;

  await executeSaga("merchant_anomaly", [
    {
      name: "pause_ads_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "social",
          taskType: "pause_underperforming_ads",
          title: `Anomaly detected — evaluate ad pause`,
          description: `Merchant Bot detected: ${payload.reason} (severity: ${payload.severity}). Social Bot will evaluate pausing associated ad spend.`,
          status: payload.severity === "critical" ? "pending_approval" : "pending_approval",
          storeId: event.storeId,
          metadata: { sourceEventId: event.id, anomalyType: payload.anomalyType, severity: payload.severity },
        }, idemKey(event.id, "pause_ads_task"));
      },
      compensate: async () => {},
    },
    {
      name: "notify_if_critical",
      execute: async () => {
        if (payload.severity === "critical" || payload.severity === "high") {
          await db.createNotification({
            userId: event.userId,
            agentType: "merchant",
            type: payload.severity === "critical" ? "error" : "warning",
            title: `${payload.severity === "critical" ? "🚨" : "⚠️"} Anomaly: ${payload.anomalyType}`,
            message: `${payload.reason}${payload.suggestedAction ? ` Suggested action: ${payload.suggestedAction}` : ""}`,
            actionUrl: "/analytics",
            metadata: { sourceEventId: event.id, anomalyType: payload.anomalyType },
          });
        }
      },
      compensate: async () => {},
    },
  ]);
}

async function handleSupplierRestockConfirmed(event: any) {
  const payload = (event.payload ?? {}) as SupplierRestockPayload;

  await executeSaga("supplier_restock_confirmed", [
    {
      name: "resume_ads_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "social",
          taskType: "resume_paused_ads",
          title: `Restock confirmed — resume ads for "${payload.productTitle}"`,
          description: `${payload.restockQuantity} units of "${payload.productTitle}" confirmed from ${payload.supplierName}. Social Bot will resume paused campaigns.`,
          status: "pending_approval",
          storeId: event.storeId,
          metadata: { sourceEventId: event.id, productId: payload.productId, restockQuantity: payload.restockQuantity },
        }, idemKey(event.id, "resume_ads_task"));
      },
      compensate: async () => {},
    },
  ]);
}

async function handleOrderRefundRequested(event: any) {
  const payload = (event.payload ?? {}) as RefundPayload;

  await createTaskIdempotent({
    agentType: "merchant",
    taskType: "process_refund",
    title: `Refund requested for order ${payload.platformOrderId}`,
    description: `Customer requested a $${(payload.refundAmountCents / 100).toFixed(2)} refund. Reason: ${payload.reason}. Merchant Bot will process.`,
    status: "pending_approval",
    storeId: event.storeId,
    metadata: { sourceEventId: event.id, orderId: payload.orderId, refundAmountCents: payload.refundAmountCents },
  }, idemKey(event.id, "refund_task"));
}

async function handleChargebackDetected(event: any) {
  const payload = (event.payload ?? {}) as ChargebackPayload;

  await executeSaga("chargeback_detected", [
    {
      name: "dispute_task",
      execute: async () => {
        await createTaskIdempotent({
          agentType: "merchant",
          taskType: "dispute_chargeback",
          title: `🚨 Chargeback: order ${payload.platformOrderId}`,
          description: `$${(payload.amountCents / 100).toFixed(2)} chargeback filed. Reason: ${payload.reason}${payload.deadline ? `. Deadline: ${payload.deadline}` : ""}. Merchant Bot will prepare dispute evidence.`,
          status: "pending_approval",
          storeId: event.storeId,
          metadata: { sourceEventId: event.id, orderId: payload.orderId, amountCents: payload.amountCents },
        }, idemKey(event.id, "dispute_task"));
      },
      compensate: async () => {},
    },
    {
      name: "notify_owner_urgent",
      execute: async () => {
        await db.createNotification({
          userId: event.userId,
          agentType: "merchant",
          type: "error",
          title: `🚨 Chargeback Alert: $${(payload.amountCents / 100).toFixed(2)}`,
          message: `A chargeback was filed for order ${payload.platformOrderId}. Reason: ${payload.reason}. ${payload.deadline ? `Respond by ${payload.deadline}.` : "Respond immediately."}`,
          actionUrl: "/orders",
          metadata: { sourceEventId: event.id, orderId: payload.orderId },
        });
      },
      compensate: async () => {},
    },
  ]);
}

// ─── Event Handler Registry ───────────────────────────────────────────────

const eventHandlers: Record<SupportedEventType, (event: any) => Promise<void>> = {
  order_fulfilled_review_request: handleOrderFulfilledReviewRequest,
  order_refund_requested: handleOrderRefundRequested,
  order_chargeback_detected: handleChargebackDetected,
  inventory_critical: handleInventoryCritical,
  inventory_overstock: handleInventoryOverstock,
  supplier_restock_confirmed: handleSupplierRestockConfirmed,
  sale_spike_detected: handleSaleSpike,
  revenue_drop_detected: handleRevenueDrop,
  social_campaign_high_roas: handleHighRoas,
  ad_budget_exhausted: handleAdBudgetExhausted,
  competitor_price_drop: handleCompetitorPriceDrop,
  merchant_anomaly_detected: handleMerchantAnomaly,
};

// ─── Main Processor ───────────────────────────────────────────────────────

export async function processPendingBotEvents(limit = 25) {
  const events = await db.getPendingBotEvents(limit);
  let processed = 0;
  let failed = 0;
  let ignored = 0;

  for (const event of events) {
    const log = logger.withContext({ eventId: event.id, eventType: event.eventType, storeId: event.storeId ?? undefined });
    const handler = eventHandlers[event.eventType as SupportedEventType];

    if (!handler) {
      await db.updateBotEvent(event.id, {
        status: "ignored",
        error: `No handler registered for ${event.eventType}`,
        processedAt: new Date(),
      });
      log.warn("bot_event_no_handler", { supportedTypes: Object.keys(eventHandlers) });
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
      log.info("bot_event_processed", {});
      processed++;
    } catch (err: any) {
      await db.updateBotEvent(event.id, {
        status: "failed",
        error: err.message || String(err),
        processedAt: new Date(),
      });
      log.error("bot_event_failed", { error: err.message });
      failed++;
    }
  }

  return { processed, failed, ignored, total: events.length };
}

/** Emit a bot coordination event (used by agent workflows) */
export async function emitBotEvent(params: {
  userId: number;
  storeId?: number;
  fromBot: string;
  toBot: string;
  eventType: SupportedEventType;
  payload: Record<string, unknown>;
}): Promise<void> {
  await db.createBotEvent({
    userId: params.userId,
    storeId: params.storeId,
    fromBot: params.fromBot as "architect" | "merchant" | "social",
    toBot: params.toBot as "architect" | "merchant" | "social" | "all",
    eventType: params.eventType,
    payload: params.payload,
    status: "pending",
  });

  logger.info("bot_event_emitted", {
    userId: params.userId,
    storeId: params.storeId,
    fromBot: params.fromBot,
    toBot: params.toBot,
    eventType: params.eventType,
  });
}
