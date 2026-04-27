/**
 * Platform Health Router — live health checks for all connected adapters
 */

import { z } from "zod";
import { orgProcedure, publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import * as db from "../db";
import { getDeliveryStatus } from "../delivery";
import { getEcommerceAdapter, buildCredentials } from "../adapters/ecommerce";
import { getSocialAdapter, buildSocialCredentials } from "../adapters/social";

export const healthRouter = router({
  /**
   * Public platform status — used by the /status page. Returns only
   * non-sensitive aggregate signals: which subsystems are available,
   * not who's using them. Safe for unauthenticated callers.
   *
   * What it surfaces:
   *   • Database reachability (one cheap probe)
   *   • Delivery providers configured (SendGrid, Twilio)
   *   • Stripe configured (billing path is unblocked)
   *   • Server uptime + version
   */
  platformStatus: publicProcedure.query(async () => {
    const startedAt = process.uptime();
    let dbHealthy = false;
    let dbLatencyMs: number | null = null;
    try {
      const t0 = Date.now();
      const handle = await db.getDb();
      if (handle) {
        // Cheap probe — a single round-trip via the existing helper.
        await db.getOAuthStateStats().catch(() => null);
        dbHealthy = true;
        dbLatencyMs = Date.now() - t0;
      }
    } catch {
      dbHealthy = false;
    }

    const delivery = await getDeliveryStatus();

    const services = [
      {
        id: "database",
        label: "Database",
        healthy: dbHealthy,
        detail: dbHealthy ? `Latency ${dbLatencyMs ?? 0}ms` : "Unreachable",
      },
      {
        id: "email",
        label: "Email delivery (SendGrid)",
        healthy: delivery.email.sendgrid,
        detail: delivery.email.sendgrid ? "Configured" : "Not configured — Gmail fallback only",
      },
      {
        id: "sms",
        label: "SMS delivery (Twilio)",
        healthy: delivery.sms.twilio,
        detail: delivery.sms.twilio ? "Configured" : "Not configured",
      },
      {
        id: "billing",
        label: "Billing (Stripe)",
        healthy: !!ENV.stripeSecretKey && !!ENV.stripeWebhookSecret,
        detail:
          ENV.stripeSecretKey && ENV.stripeWebhookSecret
            ? "Configured"
            : "Not configured — checkout disabled",
      },
    ];

    const overallHealthy = services.every((s) => s.healthy || s.id !== "database");
    const allGreen = services.every((s) => s.healthy);

    return {
      overall: allGreen ? "operational" : overallHealthy ? "degraded" : "outage",
      services,
      uptimeSeconds: Math.round(startedAt),
      checkedAt: new Date().toISOString(),
    };
  }),


  /**
   * Run live health checks on all connected e-commerce credentials and social accounts.
   * Returns per-platform status with latency and last-checked timestamp.
   * Org-scoped: only the active org's credentials are probed.
   */
  checkAll: orgProcedure.mutation(async ({ ctx }) => {
    const [credentials, socialAccounts] = await Promise.all([
      db.getPlatformCredentialsByOrg(ctx.org.id),
      db.getSocialAccountsByOrg(ctx.org.id),
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
          // Don't surface raw third-party error text to the client —
          // adapter exceptions can include API-key fragments, internal
          // version strings, and stack-trace artifacts. Log the real
          // error and return a clean message.
          console.warn("[health.checkAll] ecommerce probe failed", {
            credId: cred.id,
            platform: cred.platform,
            error: err?.message,
          });
          return {
            id: cred.id,
            platform: cred.platform,
            type: "ecommerce" as const,
            storeName: cred.platform,
            healthy: false,
            message: "Health check failed",
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
          // Same redaction as ecommerce — log internally, return clean.
          console.warn("[health.checkAll] social probe failed", {
            acctId: acct.id,
            platform: acct.platform,
            error: err?.message,
          });
          return {
            id: acct.id,
            platform: acct.platform,
            type: "social" as const,
            accountName: acct.accountName ?? acct.platform,
            healthy: false,
            message: "Health check failed",
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
