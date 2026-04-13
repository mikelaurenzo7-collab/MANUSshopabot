/**
 * orchAIstrate — Social Bot Scheduler Tasks
 *
 * Handles: ad monitoring, scheduled posts, SEO audit, email recovery, bot coordination
 *
 * Enhancements:
 * - ROAS-aware ad monitoring with per-campaign performance scoring
 * - Comprehensive SEO scoring (title length, description, tags, price presence)
 * - Recoverable revenue estimation for abandoned cart detection
 * - Telemetry instrumentation across all social scheduler actions
 */
import { logger } from "../../_core/logger";
import * as db from "../../db";
import { getCrossPlatformSocialAnalytics } from "../../engine/platformBridge";
import { getEcommerceAdapter, buildCredentials } from "../../adapters/ecommerce";
import { enqueueDueScheduledPosts } from "../../engine/jobQueue";
import { processPendingBotEvents } from "../../engine/botCoordination";
import { logAgentAction } from "../../telemetry";

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

      // ── Enhanced: Per-campaign ROAS scoring ──
      const campaigns = await db.getAdCampaignsByUser(userId);
      const activeCampaigns = campaigns.filter((c: any) => c.status === "active");
      let underperformers = 0;
      let topPerformers = 0;

      for (const campaign of activeCampaigns) {
        const spend = (campaign.spentCents ?? 0) / 100;
        const conversions = campaign.conversions ?? 0;
        const clicks = campaign.clicks ?? 0;

        if (spend < 10) continue; // Minimum spend threshold

        const cpa = conversions > 0 ? spend / conversions : Infinity;
        const ctr = clicks > 0 ? (campaign.impressions ?? 0) > 0 ? clicks / (campaign.impressions ?? 1) : 0 : 0;

        if (cpa > 50 && spend > 25) {
          underperformers++;
        } else if (cpa > 0 && cpa < 15 && conversions >= 3) {
          topPerformers++;
        }
      }

      if (underperformers > 0) {
        await db.createNotification({
          userId,
          agentType: "social",
          type: "warning",
          title: `${underperformers} Ad Campaign${underperformers > 1 ? "s" : ""} Underperforming`,
          message: `${underperformers} active campaign${underperformers > 1 ? "s have" : " has"} CPA above $50. Consider pausing or refreshing creatives.${topPerformers > 0 ? ` ${topPerformers} campaign${topPerformers > 1 ? "s are" : " is"} performing well — consider scaling.` : ""}`,
          actionUrl: "/social",
        });
      }

      await db.createAgentTask({
        agentType: "social",
        taskType: "ad_monitoring",
        title: "Social analytics check completed",
        description: `Checked ${analytics.length} connected accounts, ${activeCampaigns.length} active campaigns`,
        status: "completed",
        result: {
          accounts: analytics.length,
          errors: analytics.filter(a => a.error).length,
          activeCampaigns: activeCampaigns.length,
          underperformers,
          topPerformers,
        },
      });

      // ── Telemetry ──
      logAgentAction({
        agentType: "social",
        actionType: "scheduled_ad_monitoring",
        triggerSource: "scheduler",
        input: { userId, accountCount: analytics.length },
        output: { errors: analytics.filter(a => a.error).length, underperformers, topPerformers },
        success: true,
      }).catch((telemetryErr: any) => {
        logger.warn("scheduler_telemetry_failed", { userId, context: "ad_monitoring", error: telemetryErr.message });
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

      // ── Enhanced: Comprehensive SEO scoring ──
      const seoScores: { productId: string; title: string; score: number; issues: string[] }[] = [];

      const lowPerformers = products.filter((p: any) => {
        const titleLength = (p.title || "").length;
        const descLength = (p.description || "").length;
        const hasPrice = (p.price ?? 0) > 0;
        const hasTags = Array.isArray(p.tags) && p.tags.length > 0;
        const hasImages = Array.isArray(p.images) && p.images.length > 0;

        // Compute SEO score (0-100)
        let score = 0;
        const issues: string[] = [];

        if (titleLength >= 30 && titleLength <= 80) score += 25;
        else if (titleLength >= 20) { score += 15; issues.push("Title length should be 30-80 chars"); }
        else { issues.push("Title too short (<20 chars)"); }

        if (descLength >= 150) score += 25;
        else if (descLength >= 50) { score += 10; issues.push("Description should be 150+ chars"); }
        else { issues.push("Description too short (<50 chars)"); }

        if (hasPrice) score += 15;
        else issues.push("No price set");

        if (hasTags) score += 15;
        else issues.push("No tags/keywords");

        if (hasImages) score += 20;
        else issues.push("No product images");

        seoScores.push({
          productId: String(p.id || p.platformId || "unknown"),
          title: p.title || "Untitled",
          score,
          issues,
        });

        return score < 50; // Flag products scoring below 50
      });

      const avgScore = seoScores.length > 0
        ? Math.round(seoScores.reduce((sum, s) => sum + s.score, 0) / seoScores.length)
        : 0;

      if (lowPerformers.length > 0) {
        await db.createNotification({
          userId: store.userId,
          agentType: "social",
          type: "info",
          title: `SEO Audit: ${lowPerformers.length} products need attention (avg score: ${avgScore}/100)`,
          message: `Store "${store.name}" has ${lowPerformers.length} products scoring below 50/100 on SEO health. Top issues: ${Array.from(new Set(seoScores.flatMap(s => s.issues))).slice(0, 3).join(", ")}.`,
          actionUrl: "/social",
        });
      }

      // ── Telemetry for SEO audit ──
      logAgentAction({
        agentType: "social",
        actionType: "scheduled_seo_audit",
        storeId: store.id,
        triggerSource: "scheduler",
        input: { storeName: store.name, productsAudited: products.length },
        output: { lowPerformers: lowPerformers.length, avgSeoScore: avgScore },
        success: true,
      }).catch((telemetryErr: any) => {
        logger.warn("scheduler_telemetry_failed", { storeId: store.id, context: "seo_audit", error: telemetryErr.message });
      });
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

      // ── Enhanced: Estimate recoverable revenue ──
      const recoverableRevenueCents = abandonedCarts.reduce((sum: number, o: any) => {
        return sum + (o.totalCents ?? o.totalAmountCents ?? 0);
      }, 0);
      const recoverableRevenue = recoverableRevenueCents / 100;

      // Industry average recovery rate of ~15%
      const estimatedRecovery = Math.round(recoverableRevenue * 0.15 * 100) / 100;

      const campaigns = await db.getEmailCampaigns(store.id);
      const hasRecoveryCampaign = campaigns.some((c: any) => c.campaignType === "abandoned_cart" && c.status === "active");

      await db.createAgentTask({
        agentType: "social",
        taskType: "email_recovery",
        title: `Abandoned cart scan: ${abandonedCarts.length} carts ($${recoverableRevenue.toFixed(0)} at risk)`,
        description: `Store "${store.name}" — recovery campaign ${hasRecoveryCampaign ? "active" : "not configured"}. Estimated recoverable: $${estimatedRecovery.toFixed(0)}`,
        status: "completed",
        storeId: store.id,
        result: {
          abandonedCarts: abandonedCarts.length,
          recoveryCampaignActive: hasRecoveryCampaign,
          recoverableRevenueCents,
          estimatedRecoveryCents: Math.round(estimatedRecovery * 100),
        },
      });

      if (abandonedCarts.length > 3 && !hasRecoveryCampaign) {
        await db.createNotification({
          userId: store.userId,
          agentType: "social",
          type: "warning",
          title: `${abandonedCarts.length} abandoned carts — $${recoverableRevenue.toFixed(0)} at risk`,
          message: `Store "${store.name}" has ${abandonedCarts.length} abandoned carts worth $${recoverableRevenue.toFixed(0)} with no active recovery campaign. Estimated recoverable: $${estimatedRecovery.toFixed(0)}.`,
          actionUrl: "/social",
        });
      }

      // ── Telemetry ──
      logAgentAction({
        agentType: "social",
        actionType: "scheduled_email_recovery",
        storeId: store.id,
        triggerSource: "scheduler",
        input: { storeName: store.name, pendingOrders: pendingOrders.length },
        output: { abandonedCarts: abandonedCarts.length, recoverableRevenueCents, hasRecoveryCampaign },
        success: true,
      }).catch((telemetryErr: any) => {
        logger.warn("scheduler_telemetry_failed", { storeId: store.id, context: "email_recovery", error: telemetryErr.message });
      });
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
