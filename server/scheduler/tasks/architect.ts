/**
 * orchAIstrate — Architect Bot Scheduler Tasks
 *
 * Handles: store health checks, token refresh, competitor scan
 *
 * Enhancements:
 * - Multi-store health scoring with aggregate health dashboard metric
 * - Token expiry forecasting with proactive early-warning (24h / 4h / expired tiers)
 * - Competitor viability scoring with strategic pivot recommendations
 * - Full telemetry instrumentation for ML training pipeline
 */
import { logger } from "../../_core/logger";
import { notifyOwner } from "../../_core/notification";
import * as db from "../../db";
import { getEcommerceAdapter, buildCredentials } from "../../adapters/ecommerce";
import { logAgentAction } from "../../telemetry";
import { emitBotEvent } from "../../engine/botCoordination";

export async function handleStoreHealthCheck(): Promise<void> {
  const allStores = await db.getActiveStores();
  let healthyCount = 0;
  let unhealthyCount = 0;
  let unreachableCount = 0;

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

      const storeInfo = await adapter.verifyConnection(credentials);
      const isHealthy = storeInfo.status === "active";

      if (isHealthy) {
        healthyCount++;
      } else {
        unhealthyCount++;
        await db.createNotification({
          userId: store.userId,
          agentType: "architect",
          type: "error",
          title: `Store "${store.name}" health check failed`,
          message: `Platform reports status: ${storeInfo.status}. Please check your store configuration.`,
          actionUrl: "/integrations",
        });

        // ── Enhanced: Emit cross-bot event so Merchant + Social can react ──
        await emitBotEvent({
          userId: store.userId,
          storeId: store.id,
          fromBot: "architect",
          toBot: "all",
          eventType: "revenue_drop_detected",
          payload: {
            storeId: store.id,
            periodHours: 0,
            revenueCents: 0,
            baselineRevenueCents: 0,
            dropPercent: 100,
            reason: `Store "${store.name}" reported unhealthy status: ${storeInfo.status}`,
          },
        });
      }

      await db.createAgentTask({
        agentType: "architect",
        taskType: "store_health",
        title: `Health check: ${store.name} — ${isHealthy ? "Healthy" : "Unhealthy"}`,
        description: `Platform: ${store.platform}, Status: ${storeInfo.status}`,
        status: "completed",
        storeId: store.id,
        result: { healthy: isHealthy, storeInfo },
      });
    } catch (err: any) {
      unreachableCount++;
      logger.error("scheduler_error", { event: "Store health check failed", storeName: store.name, error: err.message });

      await db.createNotification({
        userId: store.userId,
        agentType: "architect",
        type: "error",
        title: `Store "${store.name}" unreachable`,
        message: `Could not connect to ${store.platform}: ${err.message}`,
        actionUrl: "/integrations",
      });
    }
  }

  // ── Enhanced: Aggregate health score telemetry ──
  if (allStores.length > 0) {
    const healthScore = allStores.length > 0
      ? Math.round((healthyCount / allStores.length) * 100)
      : 0;

    logAgentAction({
      agentType: "architect",
      actionType: "scheduled_store_health",
      triggerSource: "scheduler",
      input: { totalStores: allStores.length },
      output: { healthyCount, unhealthyCount, unreachableCount, healthScore },
      success: unreachableCount === 0 && unhealthyCount === 0,
    }).catch((telemetryErr: any) => {
      logger.warn("scheduler_telemetry_failed", { context: "store_health", error: telemetryErr.message });
    });

    logger.info("scheduler_health_summary", {
      totalStores: allStores.length,
      healthy: healthyCount,
      unhealthy: unhealthyCount,
      unreachable: unreachableCount,
      healthScore: `${healthScore}%`,
    });
  }
}

export async function handleTokenRefresh(): Promise<void> {
  const allStores = await db.getActiveStores();
  let refreshed = 0;
  let expiringSoon = 0;
  let expired = 0;

  for (const store of allStores) {
    try {
      const creds = await db.getCredentialsByStoreId(store.id);
      if (!creds?.refreshToken) continue;

      const expiresAt = creds.tokenExpiresAt ? new Date(creds.tokenExpiresAt).getTime() : 0;
      const now = Date.now();
      const oneHourFromNow = now + 60 * 60 * 1000;
      const fourHoursFromNow = now + 4 * 60 * 60 * 1000;
      const twentyFourHoursFromNow = now + 24 * 60 * 60 * 1000;

      // ── Enhanced: Tiered expiry urgency ──
      if (expiresAt > twentyFourHoursFromNow) continue; // Token is fine

      const adapter = getEcommerceAdapter(store.platform);
      const credentials = buildCredentials(creds, store);

      if (expiresAt <= now) {
        // Already expired
        expired++;
        await db.createNotification({
          userId: store.userId,
          agentType: "architect",
          type: "error",
          title: `🚨 Token expired: ${store.name}`,
          message: `Please reconnect your ${store.platform} store immediately — the access token has expired.`,
          actionUrl: "/integrations",
        });
        continue;
      }

      if (expiresAt <= fourHoursFromNow) {
        // Critical: expires within 4 hours
        expiringSoon++;
        await db.createNotification({
          userId: store.userId,
          agentType: "architect",
          type: "warning",
          title: `⚠️ Token expiring soon: ${store.name}`,
          message: `Your ${store.platform} token expires in ${Math.round((expiresAt - now) / (60 * 60 * 1000))} hour(s). Reconnect to avoid disruption.`,
          actionUrl: "/integrations",
        });
      }

      try {
        const storeInfo = await adapter.verifyConnection(credentials);
        refreshed++;
        logger.info("scheduler_token_refresh", { storeName: store.name, platform: store.platform, status: storeInfo.status, expiresInHours: Math.round((expiresAt - now) / (60 * 60 * 1000)) });
      } catch (refreshErr: any) {
        if (refreshErr.message?.includes("401") || refreshErr.message?.includes("unauthorized")) {
          expired++;
          await db.createNotification({
            userId: store.userId,
            agentType: "architect",
            type: "error",
            title: `Token expired: ${store.name}`,
            message: `Please reconnect your ${store.platform} store — the access token has expired.`,
            actionUrl: "/integrations",
          });
        }
      }
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Token refresh failed", storeName: store.name, error: err.message });
    }
  }

  // ── Telemetry ──
  if (refreshed + expiringSoon + expired > 0) {
    logAgentAction({
      agentType: "architect",
      actionType: "scheduled_token_refresh",
      triggerSource: "scheduler",
      input: { totalStores: allStores.length },
      output: { refreshed, expiringSoon, expired },
      success: expired === 0,
    }).catch((telemetryErr: any) => {
      logger.warn("scheduler_telemetry_failed", { context: "token_refresh", error: telemetryErr.message });
    });
  }
}

export async function handleCompetitorScan(): Promise<void> {
  const allStores = await db.getActiveStores();
  const userIdSet = new Set<number>();
  allStores.forEach(s => userIdSet.add(s.userId));
  const userIds = Array.from(userIdSet);

  for (const userId of userIds) {
    try {
      const reports = await db.getNicheReports();
      const userReports = reports.filter((r: any) => r.status === "completed");
      if (userReports.length === 0) continue;

      const niches = userReports.map((r: any) => {
        const data = typeof r.report === "string" ? JSON.parse(r.report) : r.report;
        return {
          keyword: r.keyword,
          competition: data?.competition || "unknown",
          viabilityScore: data?.viabilityScore || 0,
          trendDirection: data?.trendDirection || "stable",
        };
      });

      const highCompetition = niches.filter((n: any) => n.competition === "high");
      const lowCompetition = niches.filter((n: any) => n.competition === "low" && n.viabilityScore >= 60);
      const risingTrends = niches.filter((n: any) => n.trendDirection === "rising");

      // ── Enhanced: Strategic viability scoring ──
      const avgViability = niches.length > 0
        ? Math.round(niches.reduce((sum: number, n: any) => sum + (n.viabilityScore || 0), 0) / niches.length)
        : 0;

      await db.createAgentTask({
        agentType: "architect",
        taskType: "competitor_scan",
        title: `Competitor scan: ${niches.length} niches (avg viability: ${avgViability}/100)`,
        description: `${highCompetition.length} high-competition, ${lowCompetition.length} low-competition opportunities, ${risingTrends.length} rising trends`,
        status: "completed",
        result: {
          nichesAnalyzed: niches.length,
          highCompetition: highCompetition.length,
          lowCompetitionOpportunities: lowCompetition.length,
          risingTrends: risingTrends.length,
          avgViabilityScore: avgViability,
          niches,
        },
      });

      // Notify about high-competition threats
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

      // ── Enhanced: Proactive opportunity alerts ──
      if (lowCompetition.length > 0) {
        await db.createNotification({
          userId,
          agentType: "architect",
          type: "info",
          title: `🎯 ${lowCompetition.length} low-competition niche${lowCompetition.length > 1 ? "s" : ""} discovered`,
          message: `Architect Bot identified ${lowCompetition.length} underserved niche${lowCompetition.length > 1 ? "s" : ""} with viability scores above 60: ${lowCompetition.slice(0, 3).map((n: any) => `${n.keyword} (${n.viabilityScore}/100)`).join(", ")}${lowCompetition.length > 3 ? ` +${lowCompetition.length - 3} more` : ""}.`,
          actionUrl: "/architect",
        });
      }

      if (risingTrends.length > 0) {
        await db.createNotification({
          userId,
          agentType: "architect",
          type: "info",
          title: `📈 ${risingTrends.length} rising trend${risingTrends.length > 1 ? "s" : ""} detected`,
          message: `Trending niches: ${risingTrends.slice(0, 3).map((n: any) => n.keyword).join(", ")}. Consider early positioning before competition increases.`,
          actionUrl: "/architect",
        });
      }

      // ── Telemetry ──
      logAgentAction({
        agentType: "architect",
        actionType: "scheduled_competitor_scan",
        triggerSource: "scheduler",
        input: { userId, nichesAnalyzed: niches.length },
        output: { highCompetition: highCompetition.length, lowCompetition: lowCompetition.length, risingTrends: risingTrends.length, avgViability },
        success: true,
      }).catch((telemetryErr: any) => {
        logger.warn("scheduler_telemetry_failed", { userId, context: "competitor_scan", error: telemetryErr.message });
      });
    } catch (err: any) {
      logger.error("scheduler_error", { event: "Competitor scan failed", userId, error: err.message });
    }
  }
}
