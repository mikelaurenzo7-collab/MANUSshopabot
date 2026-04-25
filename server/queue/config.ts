/**
 * BullMQ Queue Configuration
 * Centralized configuration for all job queues (webhooks, external APIs, etc.)
 */

import { Queue, QueueOptions } from 'bullmq';
import { createClient, RedisClientType } from 'redis';
import { ENV } from '../_core/env';
import { logger } from '../_core/logger';

// ─── Redis URL Sanitization ──────────────────────────────────────────────
// Strip credentials from a Redis URL before exposing it via health endpoints.
// Returns "redis://<host>:<port>" — never the password.
export function sanitizeRedisUrl(url: string | undefined | null): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const host = u.hostname || "localhost";
    const port = u.port || (u.protocol === "rediss:" ? "6380" : "6379");
    return `${u.protocol}//${host}:${port}`;
  } catch {
    return "redis://[unparseable]";
  }
}

// ─── Redis Connection ────────────────────────────────────────────────────

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient) return redisClient;

  redisClient = createClient({
    url: ENV.redisUrl,
  });

  redisClient.on('error', (err: any) => {
    logger.error('redis_connection_error', { error: err?.message ?? String(err) });
  });

  redisClient.on('connect', () => {
    logger.info('redis_connected');
  });

  await redisClient.connect();
  return redisClient;
}

// ─── Queue Configuration ────────────────────────────────────────────────

const defaultQueueOptions: QueueOptions = {
  connection: {
    url: ENV.redisUrl,
  },
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600,
    },
    removeOnFail: false,
  },
};

// ─── Queue Instances ────────────────────────────────────────────────────

let webhookQueue: Queue | null = null;
let externalApiQueue: Queue | null = null;

export async function getWebhookQueue(): Promise<Queue> {
  if (webhookQueue) return webhookQueue;

  webhookQueue = new Queue('webhooks', {
    ...defaultQueueOptions,
  });

  webhookQueue.on('error', (err: any) => {
    logger.error('webhook_queue_error', { error: err?.message ?? String(err) });
  });

  return webhookQueue;
}

export async function getExternalApiQueue(): Promise<Queue> {
  if (externalApiQueue) return externalApiQueue;

  externalApiQueue = new Queue('external-apis', {
    ...defaultQueueOptions,
  });

  externalApiQueue.on('error', (err: any) => {
    logger.error('external_api_queue_error', { error: err?.message ?? String(err) });
  });

  return externalApiQueue;
}

// ─── Queue Health Check ────────────────────────────────────────────

export async function getQueueHealth() {
  try {
    const webhooks = await getWebhookQueue();
    const apis = await getExternalApiQueue();

    const webhookCounts = await webhooks.getJobCounts();
    const apiCounts = await apis.getJobCounts();

    return {
      redis: {
        connected: true,
        url: sanitizeRedisUrl(ENV.redisUrl),
      },
      queues: {
        webhooks: {
          active: webhookCounts.active,
          waiting: webhookCounts.waiting,
          failed: webhookCounts.failed,
          delayed: webhookCounts.delayed,
          paused: webhookCounts.paused,
        },
        externalApis: {
          active: apiCounts.active,
          waiting: apiCounts.waiting,
          failed: apiCounts.failed,
          delayed: apiCounts.delayed,
          paused: apiCounts.paused,
        },
      },
    };
  } catch (err) {
    return {
      redis: {
        connected: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      queues: null,
    };
  }
}

// ─── Cleanup ────────────────────────────────────────────────────────────

export async function closeQueues() {
  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
  }
  if (externalApiQueue) {
    await externalApiQueue.close();
    externalApiQueue = null;
  }
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
