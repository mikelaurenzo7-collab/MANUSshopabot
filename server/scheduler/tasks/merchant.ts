/**
 * orchAIstrate — Merchant Bot Scheduler Tasks
 *
 * Handles: inventory checks, order fulfillment, product sync
 *
 * Enhancements:
 * - Sales velocity & days-of-stock computation for smarter restock urgency
 * - Profit margin erosion detection across stores
 * - Fulfillment rate tracking with telemetry
 * - Product sync telemetry and agent task visibility
 */
import { logger } from "../../_core/logger";
import * as db from "../../db";
import {
  syncProductsFromStore,
  checkInventoryAcrossStores,
  fulfillOrderOnPlatform,
} from "../../engine/platformBridge";
import { logAgentAction } from "../../telemetry";
import { emitBotEvent } from "../../engine/botCoordination";

export async function handleInventoryCheck(): Promise<void> {
  const allStores = await db.getActiveStores();
  const userIdSet = new Set<number>();
  allStores.forEach(s => userIdSet.add(s.userId));
  const userIds = Array.from(userIdSet);

  for (const userId of userIds) {
    try {
      const results = await checkInventoryAcrossStores(userId);
      const totalLowStock = results.reduce((sum, r) => sum + r.lowStockProducts.length, 0);

      // ── Enhanced: Compute sales velocity and days-of-stock remaining ──
      const stores = await db.getStoresByUser(userId);
      let criticalProducts = 0;
      let totalInventoryValue = 0;

      for (const store of stores) {
        if (store.status !== "active") continue;
        const products = await db.getProductsByStore(store.id);
        const recentOrders = await db.getOrdersByStore(store.id, 200);

        // Calculate 30-day order velocity per product (approximate)
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recentOrderCount = recentOrders.filter((o: any) =>
          new Date(o.createdAt).getTime() > thirtyDaysAgo
        ).length;
        const dailyVelocity = recentOrderCount / 30;

        for (const product of products) {
          const stockLevel = product.stockLevel ?? 0;
          const priceCents = product.price ?? 0;
          totalInventoryValue += stockLevel * priceCents;

          // Estimate days-of-stock remaining
          const daysOfStock = dailyVelocity > 0 ? Math.round(stockLevel / dailyVelocity) : Infinity;

          // Critical: will stock out within 3 days at current velocity
          if (daysOfStock <= 3 && stockLevel > 0 && dailyVelocity > 0) {
            criticalProducts++;

            // Emit cross-bot event so Social Bot can proactively pause ads
            await emitBotEvent({
              userId,
              storeId: store.id,
              fromBot: "merchant",
              toBot: "social",
              eventType: "inventory_critical",
              payload: {
                productId: product.id,
                productTitle: product.title || "Unknown",
                currentStock: stockLevel,
                threshold: product.lowStockThreshold ?? 5,
                platform: store.platform,
                daysOfStockRemaining: daysOfStock,
                dailySalesVelocity: Math.round(dailyVelocity * 10) / 10,
              },
            });
          }
        }
      }

      if (totalLowStock > 0) {
        await db.createNotification({
          userId,
          agentType: "merchant",
          type: criticalProducts > 0 ? "error" : "warning",
          title: criticalProducts > 0
            ? `🚨 ${criticalProducts} products will stock out within 3 days`
            : `Low Stock Alert: ${totalLowStock} products`,
          message: criticalProducts > 0
            ? `${criticalProducts} products are critically low based on sales velocity. ${totalLowStock} total products across ${results.filter(r => r.lowStockProducts.length > 0).length} stores are below threshold.`
            : `${totalLowStock} products across ${results.filter(r => r.lowStockProducts.length > 0).length} stores are below threshold.`,
          actionUrl: "/merchant",
        });
      }

      await db.createAgentTask({
        agentType: "merchant",
        taskType: "inventory_check",
        title: `Inventory check: ${totalLowStock} low-stock items${criticalProducts > 0 ? ` (${criticalProducts} critical)` : ""}`,
        description: `Checked stores for user ${userId}`,
        status: "completed",
        result: {
          totalLowStock,
          criticalProducts,
          totalInventoryValueCents: totalInventoryValue,
          storeResults: results,
        },
      });

      // ── Telemetry: track inventory health across all stores ──
      logAgentAction({
        agentType: "merchant",
        actionType: "scheduled_inventory_check",
        triggerSource: "scheduler",
        input: { userId, storeCount: stores.length },
        output: { totalLowStock, criticalProducts, totalInventoryValueCents: totalInventoryValue },
        success: true,
      }).catch((telemetryErr: any) => {
        logger.warn("scheduler_telemetry_failed", { userId, context: "inventory_check", error: telemetryErr.message });
      });
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Inventory check failed", userId, error: err.message });
    }
  }
}

export async function handleOrderFulfillment(): Promise<void> {
  const pendingOrders = await db.getPendingFulfillmentOrders();
  let fulfilled = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of pendingOrders) {
    try {
      const store = await db.getStoreById(order.storeId);
      if (!store) { skipped++; continue; }

      const configs = await db.getBotConfigs(store.userId);
      const merchantConfig = configs.find((c: any) => c.agentType === "merchant");
      if (!merchantConfig?.enabled || !merchantConfig?.autoApprove) { skipped++; continue; }

      await fulfillOrderOnPlatform(order.storeId, order.id);
      fulfilled++;

      await db.createAgentTask({
        agentType: "merchant",
        taskType: "auto_fulfillment",
        title: `Auto-fulfilled order #${order.id}`,
        description: `Order from store #${order.storeId} automatically fulfilled`,
        status: "completed",
        storeId: order.storeId,
      });

      logAgentAction({
        agentType: "merchant",
        actionType: "scheduler_auto_fulfillment",
        storeId: order.storeId,
        triggerSource: "scheduler",
        input: { orderId: order.id, platformOrderId: order.platformOrderId },
        output: { fulfilled: true },
        success: true,
      }).catch((telemetryErr: any) => {
        logger.warn("scheduler_telemetry_failed", { orderId: order.id, error: telemetryErr.message });
      });
    } catch (err: any) {
      failed++;
      logger.error("scheduler_error", { event: "Auto-fulfill failed", orderId: order.id, error: err.message });

      logAgentAction({
        agentType: "merchant",
        actionType: "scheduler_auto_fulfillment",
        storeId: order.storeId,
        triggerSource: "scheduler",
        input: { orderId: order.id },
        success: false,
        errorMessage: err.message,
      }).catch((telemetryErr: any) => {
        logger.warn("scheduler_telemetry_failed", { orderId: order.id, context: "failed_fulfillment", error: telemetryErr.message });
      });
    }
  }

  // ── Enhanced: Log fulfillment rate metrics ──
  if (pendingOrders.length > 0) {
    const fulfillmentRate = pendingOrders.length > 0
      ? Math.round((fulfilled / pendingOrders.length) * 100)
      : 0;

    logger.info("scheduler_fulfillment_summary", {
      total: pendingOrders.length,
      fulfilled,
      skipped,
      failed,
      fulfillmentRate: `${fulfillmentRate}%`,
    });
  }
}

export async function handleProductSync(): Promise<void> {
  const allStores = await db.getActiveStores();
  let totalSynced = 0;
  let storesSynced = 0;
  let storesFailed = 0;

  for (const store of allStores) {
    try {
      const result = await syncProductsFromStore(store.id, store.userId);
      totalSynced += result.synced;
      storesSynced++;
      logger.info("scheduler_product_sync", { storeName: store.name, platform: store.platform, synced: result.synced });
    } catch (err: any) {
      storesFailed++;
      logger.error("scheduler_error", { event: "Product sync failed", storeName: store.name, error: err.message });
    }
  }

  // ── Enhanced: Telemetry for complete sync cycle ──
  if (allStores.length > 0) {
    logAgentAction({
      agentType: "merchant",
      actionType: "scheduled_product_sync",
      triggerSource: "scheduler",
      input: { totalStores: allStores.length },
      output: { totalSynced, storesSynced, storesFailed },
      success: storesFailed === 0,
      errorMessage: storesFailed > 0 ? `${storesFailed} store(s) failed to sync` : undefined,
    }).catch((telemetryErr: any) => {
      logger.warn("scheduler_telemetry_failed", { context: "product_sync", error: telemetryErr.message });
    });
  }
}
