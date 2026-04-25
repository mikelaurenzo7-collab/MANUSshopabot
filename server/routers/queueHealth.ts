/**
 * Queue Health Check Router
 * Provides endpoints for monitoring BullMQ queue status
 */

import { z } from 'zod';
import { adminProcedure } from '../_core/trpc';
import { getQueueHealth, listRecentFailedJobs } from '../queue/config';

export const queueHealthRouter = {
  getHealth: adminProcedure.query(async () => {
    try {
      const health = await getQueueHealth();
      return {
        success: true,
        data: health,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error,
      };
    }
  }),

  /**
   * Inspect the most recent failed jobs across all queues. Use this to
   * triage why a webhook is stuck or which platform is throwing — much
   * faster than tailing logs. Limited to admins.
   */
  recentFailures: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(25) }).optional())
    .query(async ({ input }) => {
      try {
        const data = await listRecentFailedJobs(input?.limit ?? 25);
        return { success: true as const, data };
      } catch (err) {
        return {
          success: false as const,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }),

  getQueueStats: adminProcedure
    .input(z.object({
      queueName: z.enum(['webhooks', 'external-apis']),
    }))
    .query(async ({ input }) => {
      try {
        const health = await getQueueHealth();

        if (!health.queues) {
          return {
            success: false,
            error: 'Redis connection failed',
          };
        }

        const queueStats = health.queues[input.queueName as keyof typeof health.queues];

        if (!queueStats) {
          return {
            success: false,
            error: `Queue ${input.queueName} not found`,
          };
        }

        const total = Object.values(queueStats).reduce((a, b) => a + b, 0);

        return {
          success: true,
          data: {
            ...queueStats,
            total,
          },
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        return {
          success: false,
          error,
        };
      }
    }),
};
