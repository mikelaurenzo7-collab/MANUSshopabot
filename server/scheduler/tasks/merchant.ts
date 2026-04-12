/**
 * orchAIstrate — Merchant Bot Scheduler Tasks
 *
 * Handles: inventory checks, order fulfillment, product sync
 */
import { logger } from "../../_core/logger";
import * as db from "../../db";
import {
  syncProductsFromStore,
  checkInventoryAcrossStores,
  fulfillOrderOnPlatform,
} from "../../engine/platformBridge";
import { logAgentAction } from "../../telemetry";

export async function handleInventoryCheck(): Promise<void> {
  const allStores = await db.getActiveStores();
  const userIdSet = new Set<number>();
  allStores.forEach(s => userIdSet.add(s.userId));
  const userIds = Array.from(userIdSet);

  for (const userId of userIds) {
    try {
      const results = await checkInventoryAcrossStores(userId);
      const totalLowStock = results.reduce((sum, r) => sum + r.lowStockProducts.length, 0);

      if (totalLowStock > 0) {
        await db.createNotification({
          userId,
          agentType: "merchant",
          type: "warning",
          title: `Low Stock Alert: ${totalLowStock} products`,
          message: `${totalLowStock} products across ${results.filter(r => r.lowStockProducts.length > 0).length} stores are below threshold.`,
          actionUrl: "/merchant",
        });
      }

      await db.createAgentTask({
        agentType: "merchant",
        taskType: "inventory_check",
        title: `Inventory check: ${totalLowStock} low-stock items`,
        description: `Checked stores for user ${userId}`,
        status: "completed",
        result: { totalLowStock, storeResults: results },
      });
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Inventory check failed", userId, error: err.message });
    }
  }
}

export async function handleOrderFulfillment(): Promise<void> {
  const pendingOrders = await db.getPendingFulfillmentOrders();

  for (const order of pendingOrders) {
    try {
      const store = await db.getStoreById(order.storeId);
      if (!store) continue;

      const configs = await db.getBotConfigs(store.userId);
      const merchantConfig = configs.find((c: any) => c.agentType === "merchant");
      if (!merchantConfig?.enabled || !merchantConfig?.autoApprove) continue;

      await fulfillOrderOnPlatform(order.storeId, order.id);

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
}

export async function handleProductSync(): Promise<void> {
  const allStores = await db.getActiveStores();
  for (const store of allStores) {
    try {
      const result = await syncProductsFromStore(store.id, store.userId);
      logger.info("scheduler_product_sync", { storeName: store.name, platform: store.platform, synced: result.synced });
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Product sync failed", storeName: store.name, error: err.message });
    }
  }
}
