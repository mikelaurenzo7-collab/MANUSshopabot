/**
 * BeastBots — Social Bot Scheduler Tasks
 *
 * Handles: ad monitoring, scheduled posts, SEO audit, email recovery, bot coordination
 */
import { logger } from "../../_core/logger";
import * as db from "../../db";
import { getCrossPlatformSocialAnalytics } from "../../engine/platformBridge";
import { getEcommerceAdapter, buildCredentials } from "../../adapters/ecommerce";
import { enqueueDueScheduledPosts } from "../../engine/jobQueue";
import { processPendingBotEvents } from "../../engine/botCoordination";

export async function handleAdMonitoring(): Promise<void> {
  const allStores = await db.getActiveStores();
  const userIdSet = new Set<number>();
  allStores.forEach(s => userIdSet.add(s.userId));
  const userIds = Array.from(userIdSet);

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

export async function handleScheduledPosts(): Promise<void> {
  const result = await enqueueDueScheduledPosts(new Date());
  if (result.duePosts > 0) {
    logger.info("scheduler_event", { message: `Enqueued ${result.enqueued} scheduled social publishing jobs from ${result.duePosts} due posts` });
  }
}

export async function handleSeoAudit(): Promise<void> {
  const allStores = await db.getActiveStores();
  for (const store of allStores) {
    try {
      const adapter = getEcommerceAdapter(store.platform);
      const creds = await db.getCredentialsByStoreId(store.id);
      const credentials = creds
        ? buildCredentials(creds, store)
        : {
            platform: store.platform,
            accessToken: store.platformAccessToken || undefined,
            storeUrl: store.platformDomain || undefined,
            shopDomain: store.platformDomain || undefined,
          };

      const products = await adapter.listProducts(credentials, { limit: 50 });

      const lowPerformers = products.filter((p: any) => {
        const titleLength = (p.title || "").length;
        const descLength = (p.description || "").length;
        return titleLength < 20 || descLength < 50;
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

export async function handleEmailRecovery(): Promise<void> {
  const allStores = await db.getActiveStores();
  for (const store of allStores) {
    try {
      const pendingOrders = await db.getOrdersByStore(store.id, 50);
      const abandonedCarts = pendingOrders.filter((o: any) => {
        if (o.status !== "pending") return false;
        const createdAt = new Date(o.createdAt).getTime();
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        return createdAt < oneHourAgo;
      });

      if (abandonedCarts.length === 0) continue;

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

export async function handleBotCoordination(): Promise<void> {
  const result = await processPendingBotEvents(25);
  if (result.total > 0) {
    logger.info("scheduler_event", { message: `Bot coordination processed ${result.processed}, failed ${result.failed}, ignored ${result.ignored}` });
  }
}
