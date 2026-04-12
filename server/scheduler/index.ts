/**
 * ShopBot — Bot Task Scheduler
 *
 * Uses node-cron to run recurring agent tasks with real platform adapter calls:
 * - Merchant: inventory checks, order fulfillment, pricing optimization
 * - Hype-Man: scheduled social posts, ad performance monitoring
 * - Architect: store health checks, product catalog refresh, token refresh
 *
 * The scheduler reads bot configs to determine which tasks to run
 * and at what frequency, respecting autonomy levels.
 */

import cron from "node-cron";
import * as db from "../db";
import { notifyOwner } from "../_core/notification";
import {
  syncProductsFromStore,
  checkInventoryAcrossStores,
  fulfillOrderOnPlatform,
  getCrossPlatformSocialAnalytics,
  publishSocialPost,
} from "../engine/platformBridge";
import { getEcommerceAdapter, buildCredentials } from "../adapters/ecommerce";
import { logAgentAction } from "../telemetry";

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  agentType: "architect" | "merchant" | "hypeman";
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
    console.log("[Scheduler] Starting agent task scheduler...");

    Array.from(this.taskConfigs.values()).forEach(config => {
      if (config.enabled) {
        this.startTask(config);
      }
    });

    console.log(`[Scheduler] ${this.tasks.size} tasks scheduled`);
  }

  stop(): void {
    console.log("[Scheduler] Stopping all scheduled tasks...");
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
    console.log(`[Scheduler] Manual trigger: ${config.name}`);
    await config.handler();
  }

  private startTask(config: ScheduledTask): void {
    const existing = this.tasks.get(config.id);
    if (existing) existing.stop();

    if (!cron.validate(config.cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression for ${config.id}: ${config.cronExpression}`);
      return;
    }

    const task = cron.schedule(config.cronExpression, async () => {
      console.log(`[Scheduler] Running: ${config.name} (${config.id})`);
      try {
        await config.handler();
        console.log(`[Scheduler] Completed: ${config.name}`);
      } catch (err) {
        console.error(`[Scheduler] Failed: ${config.name}`, err);
      }
    });

    this.tasks.set(config.id, task);
    console.log(`[Scheduler] Scheduled: ${config.name} (${config.cronExpression})`);
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
      console.error(`[Scheduler] Inventory check failed for user ${userId}:`, err.message);
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
        console.error(`[Scheduler] Failed to log telemetry for order ${order.id}:`, telemetryErr.message);
      });
    } catch (err: any) {
      console.error(`[Scheduler] Auto-fulfill failed for order ${order.id}:`, err.message);

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
        console.error(`[Scheduler] Failed to log telemetry for failed fulfillment ${order.id}:`, telemetryErr.message);
      });
    }
  }
}

async function handleProductSync(): Promise<void> {
  const allStores = await db.getActiveStores();

  for (const store of allStores) {
    try {
      const result = await syncProductsFromStore(store.id, store.userId);
      console.log(`[Scheduler] Synced ${result.synced} products from ${store.name} (${store.platform})`);
    } catch (err: any) {
      console.error(`[Scheduler] Product sync failed for store ${store.name}:`, err.message);
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
          agentType: "hypeman",
          type: "warning",
          title: "Social Account Issues Detected",
          message: `Unable to fetch analytics from: ${errorPlatforms.join(", ")}`,
          actionUrl: "/integrations",
        });
      }

      await db.createAgentTask({
        agentType: "hypeman",
        taskType: "ad_monitoring",
        title: "Social analytics check completed",
        description: `Checked ${analytics.length} connected accounts`,
        status: "completed",
        result: { accounts: analytics.length, errors: analytics.filter(a => a.error).length },
      });
    } catch (err: any) {
      console.error(`[Scheduler] Ad monitoring failed for user ${userId}:`, err.message);
    }
  }
}

async function handleScheduledPosts(): Promise<void> {
  const now = new Date();
  const duePosts = await db.getDueScheduledPosts(now);

  for (const post of duePosts) {
    try {
      // Resolve the store owner to find the linked social account for this platform
      const store = await db.getStoreById(post.storeId);
      if (!store) {
        console.warn(`[Scheduler] Post #${post.id}: store #${post.storeId} not found, skipping`);
        continue;
      }

      // Map DB platform enum to social_accounts platform enum
      const platformMap: Record<string, string> = {
        facebook: "meta",
        meta: "meta",
        instagram: "instagram",
        tiktok: "tiktok",
        twitter: "twitter",
        pinterest: "pinterest",
        linkedin: "linkedin",
        google_ads: "google_ads",
      };
      const socialPlatform = platformMap[post.platform] || post.platform;

      // Find the user's connected social account for this platform
      const accounts = await db.getSocialAccountsByPlatform(store.userId, socialPlatform);
      const activeAccount = accounts.find((a: any) => a.status === "active");

      if (!activeAccount) {
        // No connected account — mark as failed and notify
        await db.updateSocialPost(post.id, { status: "failed" });
        await db.createNotification({
          userId: store.userId,
          agentType: "hypeman",
          type: "warning",
          title: `Scheduled post failed: no active ${post.platform} account`,
          message: `Post #${post.id} could not be published. Connect a ${post.platform} account in Integrations.`,
          actionUrl: "/integrations",
        });
        await db.createAgentTask({
          agentType: "hypeman",
          taskType: "scheduled_post",
          title: `Failed: no active ${post.platform} account`,
          description: `Post #${post.id} — no connected ${post.platform} account for user #${store.userId}`,
          status: "failed",
          storeId: post.storeId,
        });
        continue;
      }

      // Build the post input from the stored post data
      const postInput = {
        content: post.content || "",
        imageUrl: post.imageUrl || undefined,
        metadata: typeof post.engagement === "object" && post.engagement !== null
          ? (post.engagement as Record<string, any>)
          : undefined,
      };

      // Actually publish to the external platform via the adapter
      await publishSocialPost(activeAccount.id, postInput, post.storeId);

      // Mark as published in local DB
      await db.updateSocialPost(post.id, {
        status: "published",
        publishedAt: now,
      });

      await db.createAgentTask({
        agentType: "hypeman",
        taskType: "scheduled_post",
        title: `Published scheduled ${post.platform} post`,
        description: `Post #${post.id} published via ${activeAccount.accountName || activeAccount.platform} account`,
        status: "completed",
        storeId: post.storeId,
      });

      console.log(`[Scheduler] Published post #${post.id} to ${post.platform} via account #${activeAccount.id}`);
    } catch (err: any) {
      // On API failure: mark the post as failed (not published) and notify the owner
      console.error(`[Scheduler] Failed to publish post ${post.id}:`, err.message);
      try {
        await db.updateSocialPost(post.id, { status: "failed" });
        // Get store for userId (may already be fetched above, but handle re-fetch safely)
        const store = await db.getStoreById(post.storeId);
        if (store) {
          await db.createNotification({
            userId: store.userId,
            agentType: "hypeman",
            type: "error",
            title: `Scheduled post failed: ${post.platform}`,
            message: `Post #${post.id} could not be published: ${err.message}`,
            actionUrl: "/hypeman",
          });
        }
        await db.createAgentTask({
          agentType: "hypeman",
          taskType: "scheduled_post",
          title: `Failed to publish ${post.platform} post`,
          description: `Post #${post.id} error: ${err.message}`,
          status: "failed",
          storeId: post.storeId,
        });
      } catch (innerErr: any) {
        console.error(`[Scheduler] Could not update failed post status for #${post.id}:`, innerErr.message);
      }
    }
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
      console.error(`[Scheduler] Token refresh failed for credential ${cred.id}:`, err.message);
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
        agentType: "hypeman",
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
          agentType: "hypeman",
          type: "info",
          title: `SEO Audit: ${lowPerformers.length} underperforming keywords`,
          message: `Store "${store.name}" has ${lowPerformers.length} keywords with low relevance scores. Consider refreshing your SEO strategy.`,
          actionUrl: "/hypeman",
        });
      }
    } catch (err: any) {
      console.error(`[Scheduler] SEO audit failed for store ${store.name}:`, err.message);
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
        agentType: "hypeman",
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
          agentType: "hypeman",
          type: "warning",
          title: `${abandonedCarts.length} abandoned carts detected`,
          message: `Store "${store.name}" has ${abandonedCarts.length} abandoned carts but no active recovery email campaign. Set one up in the Hype-Man Agent.`,
          actionUrl: "/hypeman",
        });
      }
    } catch (err: any) {
      console.error(`[Scheduler] Email recovery scan failed for store ${store.name}:`, err.message);
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
      console.error(`[Scheduler] Competitor scan failed for user ${userId}:`, err.message);
    }
  }
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

  // ─── Hype-Man Bot Tasks ────────────────────────────────────────
  agentScheduler.register({
    id: "hypeman:scheduled-posts",
    name: "Scheduled Post Publisher",
    cronExpression: "*/5 * * * *", // Every 5 minutes
    agentType: "hypeman",
    taskType: "scheduled_posts",
    enabled: true,
    handler: handleScheduledPosts,
  });

  agentScheduler.register({
    id: "hypeman:ad-performance",
    name: "Ad Performance Monitor",
    cronExpression: "0 */4 * * *", // Every 4 hours
    agentType: "hypeman",
    taskType: "ad_monitoring",
    enabled: true,
    handler: handleAdMonitoring,
  });

  agentScheduler.register({
    id: "hypeman:seo-audit",
    name: "SEO Health Audit",
    cronExpression: "0 3 * * 1", // Weekly on Monday at 3 AM
    agentType: "hypeman",
    taskType: "seo_audit",
    enabled: true,
    handler: handleSeoAudit,
  });

  agentScheduler.register({
    id: "hypeman:email-recovery",
    name: "Abandoned Cart Email Recovery",
    cronExpression: "0 */1 * * *", // Every hour
    agentType: "hypeman",
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
}
