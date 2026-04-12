/**
 * orchAIstrate — Architect Bot Scheduler Tasks
 *
 * Handles: store health checks, token refresh, competitor scan
 */
import { logger } from "../../_core/logger";
import { notifyOwner } from "../../_core/notification";
import * as db from "../../db";
import { getEcommerceAdapter, buildCredentials } from "../../adapters/ecommerce";

export async function handleStoreHealthCheck(): Promise<void> {
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

      const storeInfo = await adapter.verifyConnection(credentials);
      const isHealthy = storeInfo.status === "active";

      if (!isHealthy) {
        await db.createNotification({
          userId: store.userId,
          agentType: "architect",
          type: "error",
          title: `Store "${store.name}" health check failed`,
          message: `Platform reports status: ${storeInfo.status}. Please check your store configuration.`,
          actionUrl: "/integrations",
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
}

export async function handleTokenRefresh(): Promise<void> {
  const allStores = await db.getActiveStores();
  for (const store of allStores) {
    try {
      const creds = await db.getCredentialsByStoreId(store.id);
      if (!creds?.refreshToken) continue;

      const expiresAt = creds.tokenExpiresAt ? new Date(creds.tokenExpiresAt).getTime() : 0;
      const now = Date.now();
      const oneHourFromNow = now + 60 * 60 * 1000;

      if (expiresAt > oneHourFromNow) continue;

      const adapter = getEcommerceAdapter(store.platform);
      const credentials = buildCredentials(creds, store);

      try {
        const storeInfo = await adapter.verifyConnection(credentials);
        logger.info("scheduler_token_refresh", { storeName: store.name, platform: store.platform, status: storeInfo.status });
      } catch (refreshErr: any) {
        if (refreshErr.message?.includes("401") || refreshErr.message?.includes("unauthorized")) {
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
