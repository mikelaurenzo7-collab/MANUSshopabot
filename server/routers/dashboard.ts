import { z } from "zod";
import { orgProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { agentScheduler } from "../scheduler";

/**
 * Dashboard router — every procedure here surfaces tenant data
 * (revenue, orders, agent activity) and must be org-scoped. The
 * legacy `protectedProcedure` versions read globals (`getRecentOrders`,
 * `getAgentStatusSummary`) and were a cross-tenant leak.
 */
export const dashboardRouter = router({
  metrics: orgProcedure
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return db.getDashboardMetricsForOrg(ctx.org.id, input?.storeId);
    }),

  agentStatus: orgProcedure.query(async ({ ctx }) => {
    return db.getAgentStatusSummaryByOrg(ctx.org.id);
  }),

  recentOrders: orgProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      return db.getRecentOrdersByOrg(ctx.org.id, input?.limit ?? 10);
    }),

  recentActivity: orgProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      return db.getAgentTasksByOrg(ctx.org.id, { limit: input?.limit ?? 10 });
    }),

  /**
   * Daily Brief — what the bots did since you last logged in.
   * Powers the "morning report" hero on the Home dashboard, which
   * makes the brand promise ("touch nothing, bots run your store
   * overnight") visible the moment the user opens the app.
   *
   * Returns per-bot rollups (Builder / Merchant / Social) for the
   * trailing window: completed tasks count, top 3 highlight tasks
   * by recency, total revenue captured, fulfillments processed, and
   * any pending-attention items. The endpoint is read-only +
   * org-scoped, so caching it client-side for 60s is safe.
   */
  dailyBrief: orgProcedure
    .input(z.object({ hoursBack: z.number().min(1).max(168).default(24) }).optional())
    .query(async ({ ctx, input }) => {
      const hoursBack = input?.hoursBack ?? 24;
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      // Pull the active store list + a window of recent tasks. Both
      // queries run in parallel; the rest is in-memory rollup so we
      // don't add latency to a route that lives above the fold.
      const [stores, tasks] = await Promise.all([
        db.getStoresByOrg(ctx.org.id),
        db.getAgentTasksByOrg(ctx.org.id, { limit: 200 }),
      ]);

      const recent = tasks.filter((t: any) => {
        const ts = t.createdAt ? new Date(t.createdAt).getTime() : 0;
        return ts >= since.getTime();
      });

      // Per-bot rollups. We count completed work + capture the 3
      // most-recent completion titles per bot so the UI has
      // something concrete to show ("synced 47 products from
      // Shopify · launched ad campaign · ...").
      const rollupFor = (agentType: "architect" | "merchant" | "social") => {
        const own = recent.filter((t: any) => t.agentType === agentType);
        const completed = own.filter((t: any) => t.status === "completed");
        const failed = own.filter((t: any) => t.status === "failed");
        const running = own.filter((t: any) => t.status === "running" || t.status === "pending");
        const highlights = completed
          .slice(0, 3)
          .map((t: any) => ({
            id: t.id,
            title: t.title || t.taskType || "Task",
            taskType: t.taskType,
            storeId: t.storeId,
            createdAt: t.createdAt,
          }));
        return {
          completedCount: completed.length,
          failedCount: failed.length,
          runningCount: running.length,
          highlights,
        };
      };

      // Cross-store order velocity for the same window. We pull
      // orders directly so the window matches the brief — the
      // dashboard-metrics primitive returns lifetime totals, which
      // would overstate "what happened overnight" by orders of
      // magnitude.
      const activeStores = stores.filter((s: any) => s.status === "active");
      const ordersByStore = await Promise.all(
        activeStores.map((s: any) => db.getOrdersByStoreSince(s.id, since).catch(() => [])),
      );
      const flatOrders = ordersByStore.flat();
      const ordersInWindow = flatOrders.length;
      const revenueInWindow = flatOrders.reduce(
        (sum: number, o: any) => sum + Number(o.totalAmount ?? 0),
        0,
      );

      return {
        since: since.toISOString(),
        hoursBack,
        builder: rollupFor("architect"),
        merchant: rollupFor("merchant"),
        social: rollupFor("social"),
        commerce: {
          orders: ordersInWindow,
          revenueCents: revenueInWindow,
          activeStoreCount: activeStores.length,
        },
        // Total work the bots did — single number for the headline.
        totalCompleted:
          recent.filter((t: any) => t.status === "completed").length,
      };
    }),

  // ─── Cross-Store Intelligence ───────────────────────────────────
  crossStoreIntelligence: orgProcedure.query(async ({ ctx }) => {
    const stores = await db.getStoresByOrg(ctx.org.id);
    const activeStores = stores.filter(s => s.status === "active");

    // Batch: fetch all metrics and low-stock counts in parallel (2 queries total instead of 2*N)
    const [allMetrics, allLowStockCounts] = await Promise.all([
      Promise.all(activeStores.map(s => db.getDashboardMetrics(s.id))),
      db.getLowStockCountsByStores(activeStores.map(s => s.id)),
    ]);

    const storeMetrics = activeStores.map((store, i) => {
      const metrics = allMetrics[i];
      const lowStockCount = allLowStockCounts[store.id] ?? 0;
      return {
        storeId: store.id,
        storeName: store.name,
        platform: store.platform,
        status: store.status,
        revenue: metrics.totalRevenue ?? 0,
        orders: metrics.totalOrders ?? 0,
        products: metrics.activeProducts ?? 0,
        lowStockCount,
        conversionRate: metrics.totalOrders && metrics.activeProducts
          ? Math.round((metrics.totalOrders / Math.max(metrics.activeProducts, 1)) * 100) / 100
          : 0,
      };
    });

    // Cross-store aggregates
    const totalRevenue = storeMetrics.reduce((sum, s) => sum + s.revenue, 0);
    const totalOrders = storeMetrics.reduce((sum, s) => sum + s.orders, 0);
    const totalProducts = storeMetrics.reduce((sum, s) => sum + s.products, 0);
    const totalLowStock = storeMetrics.reduce((sum, s) => sum + s.lowStockCount, 0);
    const topStore = storeMetrics.length > 0
      ? storeMetrics.reduce((a, b) => a.revenue > b.revenue ? a : b)
      : null;

    // Platform distribution
    const platformBreakdown: Record<string, { stores: number; revenue: number; orders: number }> = {};
    for (const s of storeMetrics) {
      if (!platformBreakdown[s.platform]) {
        platformBreakdown[s.platform] = { stores: 0, revenue: 0, orders: 0 };
      }
      platformBreakdown[s.platform].stores++;
      platformBreakdown[s.platform].revenue += s.revenue;
      platformBreakdown[s.platform].orders += s.orders;
    }

    // Scheduler status
    const schedulerTasks = agentScheduler.getStatus();

    return {
      storeCount: activeStores.length,
      totalRevenue,
      totalOrders,
      totalProducts,
      totalLowStock,
      topStore: topStore ? { name: topStore.storeName, platform: topStore.platform, revenue: topStore.revenue } : null,
      platformBreakdown,
      storeMetrics,
      schedulerTasks,
    };
  }),
});
