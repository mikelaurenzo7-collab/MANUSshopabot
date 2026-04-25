/**
 * Queue Health Check Router
 * Provides endpoints for monitoring BullMQ queue status
 */

import { z } from 'zod';
import { publicProcedure } from '../_core/trpc';
import { getQueueHealth } from '../queue/config';

export const queueHealthRouter = {
  getHealth: publicProcedure.query(async () => {
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

  getQueueStats: publicProcedure
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
