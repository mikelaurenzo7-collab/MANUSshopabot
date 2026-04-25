/**
 * Platform Health Router — live health checks for all connected adapters
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getEcommerceAdapter, buildCredentials } from "../adapters/ecommerce";
import { getSocialAdapter, buildSocialCredentials } from "../adapters/social";

export const healthRouter = router({
  /**
   * Run live health checks on all connected e-commerce credentials and social accounts.
   * Returns per-platform status with latency and last-checked timestamp.
   */
  checkAll: protectedProcedure.mutation(async ({ ctx }) => {
    const [credentials, socialAccounts] = await Promise.all([
      db.getPlatformCredentials(ctx.user.id),
      db.getSocialAccounts(ctx.user.id),
    ]);

    const ecomResults = await Promise.allSettled(
      credentials.map(async (cred) => {
        const start = Date.now();
        try {
          const adapter = getEcommerceAdapter(cred.platform);
          const store = cred.storeId ? await db.getStoreById(cred.storeId) : undefined;
          const adapterCreds = buildCredentials(cred, store);
          const result = await adapter.healthCheck(adapterCreds);
          return {
            id: cred.id,
            platform: cred.platform,
            type: "ecommerce" as const,
            storeName: store?.name ?? cred.platform,
            healthy: result.healthy,
            message: result.message,
            latencyMs: result.latencyMs,
            checkedAt: Date.now(),
          };
        } catch (err: any) {
          return {
            id: cred.id,
            platform: cred.platform,
            type: "ecommerce" as const,
            storeName: cred.platform,
            healthy: false,
            message: err.message || "Health check failed",
            latencyMs: Date.now() - start,
            checkedAt: Date.now(),
          };
        }
      })
    );

    const socialResults = await Promise.allSettled(
      socialAccounts.map(async (acct) => {
        const start = Date.now();
        try {
          const adapter = getSocialAdapter(acct.platform);
          const socialCreds = buildSocialCredentials(acct);
          const result = await adapter.healthCheck(socialCreds);
          return {
            id: acct.id,
            platform: acct.platform,
            type: "social" as const,
            accountName: acct.accountName ?? acct.platform,
            healthy: result.healthy,
            message: result.message,
            latencyMs: result.latencyMs,
            checkedAt: Date.now(),
          };
        } catch (err: any) {
          return {
            id: acct.id,
            platform: acct.platform,
            type: "social" as const,
            accountName: acct.accountName ?? acct.platform,
            healthy: false,
            message: err.message || "Health check failed",
            latencyMs: Date.now() - start,
            checkedAt: Date.now(),
          };
        }
      })
    );

    const ecom = ecomResults.map((r) =>
      r.status === "fulfilled" ? r.value : { id: 0, platform: "unknown", type: "ecommerce" as const, storeName: "Unknown", healthy: false, message: "Check failed", latencyMs: 0, checkedAt: Date.now() }
    );
    const social = socialResults.map((r) =>
      r.status === "fulfilled" ? r.value : { id: 0, platform: "unknown", type: "social" as const, accountName: "Unknown", healthy: false, message: "Check failed", latencyMs: 0, checkedAt: Date.now() }
    );

    const allResults = [...ecom, ...social];
    const healthyCount = allResults.filter((r) => r.healthy).length;
    const totalCount = allResults.length;

    return {
      ecommerce: ecom,
      social,
      summary: {
        total: totalCount,
        healthy: healthyCount,
        unhealthy: totalCount - healthyCount,
        overallHealthy: totalCount === 0 || healthyCount === totalCount,
      },
    };
  }),

  /**
   * Get a quick summary of connection counts without running live checks.
   */
  summary: protectedProcedure.query(async ({ ctx }) => {
    return db.getConnectedPlatformSummary(ctx.user.id);
  }),

  /**
   * Recent webhook events for the real-time event log in PlatformHealth.
   */
  webhookEvents: protectedProcedure
    .input(z.object({ storeId: z.number().optional(), limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return db.getWebhookEvents(ctx.user.id, {
        storeId: input?.storeId,
        limit: input?.limit ?? 50,
      });
    }),

  /**
   * Background systems summary for durable automation layers.
   */
  backgroundSystems: protectedProcedure.query(async () => {
    const [jobQueue, botCoordination, oauthState] = await Promise.all([
      db.getJobQueueStats(),
      db.getBotEventStats(),
      db.getOAuthStateStats(),
    ]);

    return {
      jobQueue,
      botCoordination,
      oauthState,
    };
  }),
});
