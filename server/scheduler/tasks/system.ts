/**
 * BeastBots — System Scheduler Tasks
 *
 * Handles: job queue processing, OAuth cleanup, elite orchestrator tasks
 * (anomaly detection, DLQ, dynamic pricing, creative velocity, ad pausing)
 */
import { logger } from "../../_core/logger";
import * as db from "../../db";
import { processRunnableJobs } from "../../engine/jobQueue";
import {
  pauseAdsForOutOfStockProducts,
  runDynamicPricingEngine,
  runCreativeVelocityOptimization,
  detectAnomalies,
  processDLQ,
} from "../../engine/eliteOrchestrator";

export async function handleJobQueue(): Promise<void> {
  const result = await processRunnableJobs(10);
  if (result.processed + result.failed > 0) {
    logger.info("scheduler_job_queue", { processed: result.processed, failed: result.failed });
  }
}

export async function handleOAuthStateCleanup(): Promise<void> {
  await db.deleteExpiredOAuthStateTokens();
}

export async function handleInventoryAwareAdPause(): Promise<void> {
  const allStores = await db.getActiveStores();
  const userIds = Array.from(new Set(allStores.map((s: any) => s.userId)));
  for (const userId of userIds) {
    try {
      const result = await pauseAdsForOutOfStockProducts(userId);
      if (result.paused > 0) {
        logger.info("scheduler_ad_pause", { userId, paused: result.paused });
      }
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Inventory-aware ad pause failed", userId, error: err.message });
    }
  }
}

export async function handleDynamicPricing(): Promise<void> {
  const allStores = await db.getActiveStores();
  const userIds = Array.from(new Set(allStores.map((s: any) => s.userId)));
  for (const userId of userIds) {
    try {
      const results = await runDynamicPricingEngine(userId);
      const autoApplied = results.filter(r => r.approved).length;
      const queued = results.filter(r => r.requiresApproval).length;
      if (results.length > 0) {
        logger.info("scheduler_dynamic_pricing", { userId, autoApplied, queued });
      }
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Dynamic pricing failed", userId, error: err.message });
    }
  }
}

export async function handleCreativeVelocity(): Promise<void> {
  const allStores = await db.getActiveStores();
  const userIds = Array.from(new Set(allStores.map((s: any) => s.userId)));
  for (const userId of userIds) {
    try {
      const result = await runCreativeVelocityOptimization(userId);
      if (result.paused + result.scaled > 0) {
        logger.info("scheduler_creative_velocity", { userId, paused: result.paused, scaled: result.scaled });
      }
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Creative velocity failed", userId, error: err.message });
    }
  }
}

export async function handleAnomalyDetection(): Promise<void> {
  const allStores = await db.getActiveStores();
  const userIds = Array.from(new Set(allStores.map((s: any) => s.userId)));
  for (const userId of userIds) {
    try {
      const anomalies = await detectAnomalies(userId);
      const critical = anomalies.filter(a => a.severity === "critical");
      if (critical.length > 0) {
        await db.createNotification({
          userId,
          agentType: "merchant",
          type: "error",
          title: `Critical Anomaly: ${critical[0].type.replace(/_/g, " ")}`,
          message: critical[0].message,
          actionUrl: "/home",
        });
      }
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Anomaly detection failed", userId, error: err.message });
    }
  }
}

export async function handleDLQProcessor(): Promise<void> {
  const { processed, failed } = await processDLQ(async (entry) => {
    logger.info("scheduler_log", { message: `[DLQ] Retrying event: ${entry.event} on ${entry.platform}` });
  });
  if (processed + failed > 0) {
    logger.info("scheduler_log", { message: `[DLQ] Processed ${processed}, failed ${failed}` });
  }
}
