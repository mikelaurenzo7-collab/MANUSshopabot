/**
 * ShopBOTS — Bot Task Scheduler
 *
 * Uses node-cron to run recurring agent tasks with real platform adapter calls:
 * - Merchant: inventory checks, order fulfillment, pricing optimization
 * - Social Bot: scheduled social posts, ad performance monitoring
 * - Architect: store health checks, product catalog refresh, token refresh
 *
 * The scheduler reads bot configs to determine which tasks to run
 * and at what frequency, respecting autonomy levels.
 */

import cron from "node-cron";
import { logger } from "../_core/logger";
import * as db from "../db";
import { notifyOwner } from "../_core/notification";
import {
  syncProductsFromStore,
  checkInventoryAcrossStores,
  fulfillOrderOnPlatform,
  getCrossPlatformSocialAnalytics,
} from "../engine/platformBridge";
import { getEcommerceAdapter, buildCredentials } from "../adapters/ecommerce";
import { logAgentAction } from "../telemetry";
import {
  pauseAdsForOutOfStockProducts,
  runDynamicPricingEngine,
  runCreativeVelocityOptimization,
  detectAnomalies,
  processDLQ,
} from "../engine/eliteOrchestrator";
import { processPendingBotEvents } from "../engine/botCoordination";
import { enqueueDueScheduledPosts, processRunnableJobs } from "../engine/jobQueue";

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  agentType: "architect" | "merchant" | "social";
  taskType: string;
  handler: () => Promise<void>;
  enabled: boolean;
}

class AgentScheduler {
  private tasks: Map<string, ReturnType<typeof cron.schedule>> = new Map();
  private taskConfigs: Map<string, ScheduledTask> = new Map();
  private isRunning = false;

  register(config: ScheduledTask): void {
    this.taskConfigs.set(config.id, config);
    if (this.isRunning && config.enabled) {
      this.startTask(config);
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info("scheduler_starting", { message: "Starting agent task scheduler" });

    Array.from(this.taskConfigs.values()).forEach(config => {
      if (config.enabled) {
        this.startTask(config);
      }
    });

    logger.info("scheduler_started", { taskCount: this.tasks.size });
  }

  stop(): void {
    logger.info("scheduler_stopping", { message: "Stopping all scheduled tasks" });
    Array.from(this.tasks.entries()).forEach(([id, task]) => {
      task.stop();
    });
    this.tasks.clear();
    this.isRunning = false;
  }

  setEnabled(taskId: string, enabled: boolean): void {
    const config = this.taskConfigs.get(taskId);
    if (!config) return;
    config.enabled = enabled;

    if (enabled && this.isRunning) {
      this.startTask(config);
    } else if (!enabled) {
      const existing = this.tasks.get(taskId);
      if (existing) {
        existing.stop();
        this.tasks.delete(taskId);
      }
    }
  }

  getStatus(): Array<{
    id: string;
    name: string;
    agentType: string;
    taskType: string;
    cronExpression: string;
    enabled: boolean;
    isScheduled: boolean;
  }> {
    return Array.from(this.taskConfigs.values()).map(config => ({
      id: config.id,
      name: config.name,
      agentType: config.agentType,
      taskType: config.taskType,
      cronExpression: config.cronExpression,
      enabled: config.enabled,
      isScheduled: this.tasks.has(config.id),
    }));
  }

  async triggerNow(taskId: string): Promise<void> {
    const config = this.taskConfigs.get(taskId);
    if (!config) throw new Error(`Task ${taskId} not found`);
      logger.info("scheduler_manual_trigger", { taskId, taskName: config.name });
    await config.handler();
  }

  private startTask(config: ScheduledTask): void {
    const existing = this.tasks.get(config.id);
    if (existing) existing.stop();

    if (!cron.validate(config.cronExpression)) {
      logger.error("scheduler_invalid_cron", { taskId: config.id, cronExpression: config.cronExpression });
      return;
    }

    const task = cron.schedule(config.cronExpression, async () => {
      logger.info("scheduler_task_start", { taskId: config.id, taskName: config.name });
      try {
        await config.handler();
        logger.info("scheduler_task_complete", { taskId: config.id, taskName: config.name });
      } catch (err) {
        logger.error("scheduler_task_failed", { taskId: config.id, taskName: config.name, error: (err as any)?.message ?? String(err) });
      }
    });

    this.tasks.set(config.id, task);
    logger.info("scheduler_task_registered", { taskId: config.id, taskName: config.name, cron: config.cronExpression });
  }
}

// Singleton scheduler instance
export const agentScheduler = new AgentScheduler();

// ─── Real Task Handlers ───────────────────────────────────────────────────

async function handleInventoryCheck(): Promise<void> {
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

async function handleOrderFulfillment(): Promise<void> {
  const pendingOrders = await db.getPendingFulfillmentOrders();

  for (const order of pendingOrders) {
    try {
      // Look up store to get userId
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

      // Telemetry: log scheduler auto-fulfillment
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

      // Telemetry: log scheduler fulfillment failure
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

async function handleProductSync(): Promise<void> {
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

async function handleAdMonitoring(): Promise<void> {
  const allStores = await db.getActiveStores();
  const userIdSet2 = new Set<number>();
  allStores.forEach(s => userIdSet2.add(s.userId));
  const userIds = Array.from(userIdSet2);

  for (const userId of userIds) {
    try {
      const analytics = await getCrossPlatformSocialAnalytics(userId);
      const hasErrors = analytics.some(a => a.error);

      if (hasErrors) {
        const errorPlatforms = analytics.filter(a => a.error).map(a => a.platform);
        await db.createNotification({
          userId,
          agentType: "social",
          type: "warning",
          title: "Social Account Issues Detected",
          message: `Unable to fetch analytics from: ${errorPlatforms.join(", ")}`,
          actionUrl: "/integrations",
        });
      }

      await db.createAgentTask({
        agentType: "social",
        taskType: "ad_monitoring",
        title: "Social analytics check completed",
        description: `Checked ${analytics.length} connected accounts`,
        status: "completed",
        result: { accounts: analytics.length, errors: analytics.filter(a => a.error).length },
      });
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Ad monitoring failed", userId, error: err.message });
    }
  }
}

async function handleScheduledPosts(): Promise<void> {
  const result = await enqueueDueScheduledPosts(new Date());
  if (result.duePosts > 0) {
    logger.info("scheduler_event", { message: `Enqueued ${result.enqueued} scheduled social publishing jobs from ${result.duePosts} due posts` });
  }
}

async function handleJobQueue(): Promise<void> {
  const result = await processRunnableJobs(10);
  if (result.total > 0) {
    logger.info("scheduler_event", { message: `Job queue processed ${result.processed}, failed ${result.failed}` });
  }
}

async function handleStoreHealthCheck(): Promise<void> {
  const allStores = await db.getActiveStores();

  for (const store of allStores) {
    try {
      const creds = await db.getCredentialsByStoreId(store.id);
      if (!creds) continue;

      const adapter = getEcommerceAdapter(store.platform);
      const credentials = buildCredentials(creds, store);
      const storeInfo = await adapter.verifyConnection(credentials);

      if (storeInfo.status !== "active") {
        await db.createNotification({
          userId: store.userId,
          agentType: "architect",
          type: "warning",
          title: `Store "${store.name}" health issue`,
          message: `Store status: ${storeInfo.status}. Check your ${store.platform} account.`,
          actionUrl: "/integrations",
        });
      }
    } catch (err: any) {
      const creds = await db.getCredentialsByStoreId(store.id);
      if (creds) {
        await db.updatePlatformCredential(creds.id, { status: "error" });
      }

      await db.createNotification({
        userId: store.userId,
        agentType: "architect",
        type: "error",
        title: `Store "${store.name}" connection failed`,
        message: `Unable to connect to ${store.platform}: ${err.message}`,
        actionUrl: "/integrations",
      });
    }
  }
}

async function handleTokenRefresh(): Promise<void> {
  const expired = await db.getExpiredCredentials();

  for (const cred of expired) {
    try {
      await db.updatePlatformCredential(cred.id, { status: "expired" });

      await db.createNotification({
        userId: cred.userId,
        agentType: "system",
        type: "warning",
        title: `${cred.platform} token expired`,
        message: `Your ${cred.platform} connection needs to be re-authenticated.`,
        actionUrl: "/integrations",
      });
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Token refresh failed", credId: cred.id, error: err.message });
    }
  }
}

async function handleSeoAudit(): Promise<void> {
  const allStores = await db.getActiveStores();

  for (const store of allStores) {
    try {
      // Fetch SEO keywords for this store and assess health
      const keywords = await db.getSeoKeywords(store.id);
      const activeKeywords = keywords.filter((k: any) => k.status === "active");
      const lowPerformers = keywords.filter((k: any) => k.relevanceScore && k.relevanceScore < 30);

      await db.createAgentTask({
        agentType: "social",
        taskType: "seo_audit",
        title: `SEO audit for "${store.name}"`,
        description: `${activeKeywords.length} active keywords, ${lowPerformers.length} low performers`,
        status: "completed",
        storeId: store.id,
        result: {
          totalKeywords: keywords.length,
          activeKeywords: activeKeywords.length,
          lowPerformers: lowPerformers.length,
        },
      });

      if (lowPerformers.length > 0) {
        await db.createNotification({
          userId: store.userId,
          agentType: "social",
          type: "info",
          title: `SEO Audit: ${lowPerformers.length} underperforming keywords`,
          message: `Store "${store.name}" has ${lowPerformers.length} keywords with low relevance scores. Consider refreshing your SEO strategy.`,
          actionUrl: "/social",
        });
      }
    } catch (err: any) {
      logger.error("scheduler_error", { event: "SEO audit failed", storeName: store.name, error: err.message });
    }
  }
}

async function handleEmailRecovery(): Promise<void> {
  const allStores = await db.getActiveStores();

  for (const store of allStores) {
    try {
      // Find orders that are pending (potential abandoned carts)
      const pendingOrders = await db.getOrdersByStore(store.id, 50);
      const abandonedCarts = pendingOrders.filter((o: any) => {
        if (o.status !== "pending") return false;
        const createdAt = new Date(o.createdAt).getTime();
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        return createdAt < oneHourAgo;
      });

      if (abandonedCarts.length === 0) continue;

      // Check if email campaigns exist for recovery
      const campaigns = await db.getEmailCampaigns(store.id);
      const hasRecoveryCampaign = campaigns.some((c: any) => c.campaignType === "abandoned_cart" && c.status === "active");

      await db.createAgentTask({
        agentType: "social",
        taskType: "email_recovery",
        title: `Abandoned cart scan: ${abandonedCarts.length} carts found`,
        description: `Store "${store.name}" — recovery campaign ${hasRecoveryCampaign ? "active" : "not configured"}`,
        status: "completed",
        storeId: store.id,
        result: {
          abandonedCarts: abandonedCarts.length,
          recoveryCampaignActive: hasRecoveryCampaign,
        },
      });

      if (abandonedCarts.length > 3 && !hasRecoveryCampaign) {
        await db.createNotification({
          userId: store.userId,
          agentType: "social",
          type: "warning",
          title: `${abandonedCarts.length} abandoned carts detected`,
          message: `Store "${store.name}" has ${abandonedCarts.length} abandoned carts but no active recovery email campaign. Set one up in the Social Bot Agent.`,
          actionUrl: "/social",
        });
      }
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Email recovery scan failed", storeName: store.name, error: err.message });
    }
  }
}

async function handleCompetitorScan(): Promise<void> {
  const allStores = await db.getActiveStores();
  const userIdSet3 = new Set<number>();
  allStores.forEach(s => userIdSet3.add(s.userId));
  const userIds = Array.from(userIdSet3);

  for (const userId of userIds) {
    try {
      // Gather niche reports to understand competitive landscape
      const reports = await db.getNicheReports();
      const userReports = reports.filter((r: any) => r.status === "completed");

      if (userReports.length === 0) continue;

      // Aggregate competitive intelligence from existing niche reports
      const niches = userReports.map((r: any) => {
        const data = typeof r.report === "string" ? JSON.parse(r.report) : r.report;
        return {
          keyword: r.keyword,
          competition: data?.competition || "unknown",
          viabilityScore: data?.viabilityScore || 0,
        };
      });

      const highCompetition = niches.filter((n: any) => n.competition === "high");

      await db.createAgentTask({
        agentType: "architect",
        taskType: "competitor_scan",
        title: `Competitor scan: ${niches.length} niches analyzed`,
        description: `${highCompetition.length} high-competition niches detected`,
        status: "completed",
        result: {
          nichesAnalyzed: niches.length,
          highCompetition: highCompetition.length,
          niches,
        },
      });

      if (highCompetition.length > 0) {
        await db.createNotification({
          userId,
          agentType: "architect",
          type: "info",
          title: `Competitor Intelligence: ${highCompetition.length} high-competition niches`,
          message: `Consider diversifying into lower-competition niches. High-competition: ${highCompetition.map((n: any) => n.keyword).join(", ")}`,
          actionUrl: "/architect",
        });
      }
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Competitor scan failed", userId, error: err.message });
    }
  }
}

async function handleBotCoordination(): Promise<void> {
  const result = await processPendingBotEvents(25);
  if (result.total > 0) {
    logger.info("scheduler_event", { message: `Bot coordination processed ${result.processed}, failed ${result.failed}, ignored ${result.ignored}` });
  }
}

async function handleOAuthStateCleanup(): Promise<void> {
  await db.deleteExpiredOAuthStateTokens();
}

// ─── Register Default Tasks ─────────────────────────────────────────────

export function registerDefaultTasks(): void {
  // ─── Merchant Bot Tasks ────────────────────────────────────────
  agentScheduler.register({
    id: "merchant:inventory-check",
    name: "Inventory Level Monitor",
    cronExpression: "0 */2 * * *", // Every 2 hours
    agentType: "merchant",
    taskType: "inventory_check",
    enabled: true,
    handler: handleInventoryCheck,
  });

  agentScheduler.register({
    id: "merchant:order-fulfillment",
    name: "Auto-Fulfillment Processor",
    cronExpression: "*/15 * * * *", // Every 15 minutes
    agentType: "merchant",
    taskType: "order_fulfillment",
    enabled: true,
    handler: handleOrderFulfillment,
  });

  agentScheduler.register({
    id: "merchant:product-sync",
    name: "Product Catalog Sync",
    cronExpression: "0 */4 * * *", // Every 4 hours
    agentType: "merchant",
    taskType: "catalog_refresh",
    enabled: true,
    handler: handleProductSync,
  });

  // ─── Social Bot Bot Tasks ────────────────────────────────────────
  agentScheduler.register({
    id: "social:scheduled-posts",
    name: "Scheduled Post Queue Enqueuer",
    cronExpression: "*/5 * * * *", // Every 5 minutes
    agentType: "social",
    taskType: "scheduled_posts",
    enabled: true,
    handler: handleScheduledPosts,
  });

  agentScheduler.register({
    id: "system:job-queue",
    name: "Durable Job Queue Processor",
    cronExpression: "*/2 * * * *", // Every 2 minutes
    agentType: "social",
    taskType: "job_queue",
    enabled: true,
    handler: handleJobQueue,
  });

  agentScheduler.register({
    id: "system:oauth-state-cleanup",
    name: "OAuth State Cleanup",
    cronExpression: "0 * * * *", // Every hour
    agentType: "architect",
    taskType: "oauth_state_cleanup",
    enabled: true,
    handler: handleOAuthStateCleanup,
  });

  agentScheduler.register({
    id: "social:ad-performance",
    name: "Ad Performance Monitor",
    cronExpression: "0 */4 * * *", // Every 4 hours
    agentType: "social",
    taskType: "ad_monitoring",
    enabled: true,
    handler: handleAdMonitoring,
  });

  agentScheduler.register({
    id: "social:seo-audit",
    name: "SEO Health Audit",
    cronExpression: "0 3 * * 1", // Weekly on Monday at 3 AM
    agentType: "social",
    taskType: "seo_audit",
    enabled: true,
    handler: handleSeoAudit,
  });

  agentScheduler.register({
    id: "social:email-recovery",
    name: "Abandoned Cart Email Recovery",
    cronExpression: "0 */1 * * *", // Every hour
    agentType: "social",
    taskType: "email_recovery",
    enabled: true,
    handler: handleEmailRecovery,
  });

  // ─── Architect Bot Tasks ───────────────────────────────────────
  agentScheduler.register({
    id: "architect:store-health",
    name: "Store Health Monitor",
    cronExpression: "0 */6 * * *", // Every 6 hours
    agentType: "architect",
    taskType: "store_health",
    enabled: true,
    handler: handleStoreHealthCheck,
  });

  agentScheduler.register({
    id: "architect:token-refresh",
    name: "OAuth Token Refresh",
    cronExpression: "0 */1 * * *", // Every hour
    agentType: "architect",
    taskType: "token_refresh",
    enabled: true,
    handler: handleTokenRefresh,
  });

  agentScheduler.register({
    id: "architect:competitor-scan",
    name: "Competitor Intelligence Scan",
    cronExpression: "0 4 * * 3,6", // Wed and Sat at 4 AM
    agentType: "architect",
    taskType: "competitor_scan",
    enabled: true,
    handler: handleCompetitorScan,
  });

  // ─── Elite Orchestrator Tasks ──────────────────────────────────
  agentScheduler.register({
    id: "merchant:inventory-aware-ad-pause",
    name: "Inventory-Aware Ad Pausing",
    cronExpression: "*/30 * * * *", // Every 30 minutes
    agentType: "merchant",
    taskType: "inventory_ad_pause",
    enabled: true,
    handler: async () => {
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
    },
  });

  agentScheduler.register({
    id: "merchant:dynamic-pricing",
    name: "Dynamic Pricing Engine",
    cronExpression: "0 */6 * * *", // Every 6 hours
    agentType: "merchant",
    taskType: "dynamic_pricing",
    enabled: true,
    handler: async () => {
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
    },
  });

  agentScheduler.register({
    id: "social:creative-velocity",
    name: "Creative Velocity A/B Optimizer",
    cronExpression: "0 */4 * * *", // Every 4 hours
    agentType: "social",
    taskType: "creative_velocity",
    enabled: true,
    handler: async () => {
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
    },
  });

  agentScheduler.register({
    id: "system:anomaly-detection",
    name: "Anomaly Detection Engine",
    cronExpression: "0 */1 * * *", // Every hour
    agentType: "merchant",
    taskType: "anomaly_detection",
    enabled: true,
    handler: async () => {
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
    },
  });

  agentScheduler.register({
    id: "system:dlq-processor",
    name: "Dead-Letter Queue Processor",
    cronExpression: "*/10 * * * *", // Every 10 minutes
    agentType: "merchant",
    taskType: "dlq_retry",
    enabled: true,
    handler: async () => {
      const { processed, failed } = await processDLQ(async (entry) => {
        logger.info("scheduler_log", { message: `[DLQ] Retrying event: ${entry.event} on ${entry.platform}` });
        // In production, re-dispatch to the appropriate webhook handler
      });
      if (processed + failed > 0) {
        logger.info("scheduler_log", { message: `[DLQ] Processed ${processed}, failed ${failed}` });
      }
    },
  });

  agentScheduler.register({
    id: "system:bot-coordination",
    name: "Bot Coordination Engine",
    cronExpression: "*/5 * * * *", // Every 5 minutes
    agentType: "social",
    taskType: "bot_coordination",
    enabled: true,
    handler: handleBotCoordination,
  });
}
