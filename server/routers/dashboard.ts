import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { checkInventoryAcrossStores, getCrossPlatformSocialAnalytics } from "../engine/platformBridge";
import { agentScheduler } from "../scheduler";

export const dashboardRouter = router({
  metrics: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return db.getDashboardMetrics(input?.storeId);
    }),

  agentStatus: protectedProcedure.query(async () => {
    return db.getAgentStatusSummary();
  }),

  recentOrders: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ input }) => {
      return db.getRecentOrders(input?.limit ?? 10);
    }),

  recentActivity: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ input }) => {
      return db.getAgentTasks({ limit: input?.limit ?? 10 });
    }),

  // ─── Cross-Store Intelligence ───────────────────────────────────
  crossStoreIntelligence: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const stores = await db.getStoresByUser(userId);
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
