/**
 * Webhook Processor
 * Handles incoming webhooks from Shopify, Amazon, Etsy, etc. with retry logic
 */

import { Worker, Job } from 'bullmq';
import { getWebhookQueue } from '../config';
import { ENV } from '../../_core/env';
import { validateWebhookPayload } from '../../adapters/validation';
import { logger } from '../../_core/logger';

// ─── Webhook Handler Types ────────────────────────────────────────────

export interface WebhookPayload {
  platform: 'shopify' | 'amazon' | 'etsy' | 'tiktok' | 'walmart';
  event: string;
  data: Record<string, any>;
  timestamp: number;
  signature?: string;
}

// ─── Platform-Specific Handlers ────────────────────────────────────────

// Per-platform handlers. Each one is a thin dispatcher that logs the event
// in a structured way and returns a result. Real domain processing lives in
// the platform-specific Shopify/Amazon/etc. webhook handlers registered on
// the Express app — this BullMQ pipeline is the durable retry layer.
async function handleShopifyWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  logger.info('webhook_processed', { platform: 'shopify', event, orderId: data?.id });
  return { processed: true, platform: 'shopify', event };
}

async function handleAmazonWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  logger.info('webhook_processed', { platform: 'amazon', event, orderId: data?.id });
  return { processed: true, platform: 'amazon', event };
}

async function handleEtsyWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  logger.info('webhook_processed', { platform: 'etsy', event, orderId: data?.id });
  return { processed: true, platform: 'etsy', event };
}

async function handleTikTokWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  logger.info('webhook_processed', { platform: 'tiktok', event, orderId: data?.id });
  return { processed: true, platform: 'tiktok', event };
}

async function handleWalmartWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  logger.info('webhook_processed', { platform: 'walmart', event, orderId: data?.id });
  return { processed: true, platform: 'walmart', event };
}

// ─── Main Processor ────────────────────────────────────────────────────

async function processWebhook(job: Job<WebhookPayload>) {
  const { platform, event, data } = job.data;
  const jobId = job.id;
  const attempt = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts || 5;

  logger.info('webhook_job_start', { jobId, platform, event, attempt, maxAttempts });

  try {
    // Note: signature verification is performed at the HTTP edge (see
    // shopifyWebhooks.ts) before enqueueing — by the time a job reaches this
    // worker, the payload has already been authenticated.

    const validation = validateWebhookPayload(platform, event, data);
    if (!validation.valid) {
      logger.warn('webhook_payload_validation_failed', {
        jobId, platform, event, error: validation.error,
      });
    }

    let result;
    switch (platform) {
      case 'shopify':
        result = await handleShopifyWebhook(job);
        break;
      case 'amazon':
        result = await handleAmazonWebhook(job);
        break;
      case 'etsy':
        result = await handleEtsyWebhook(job);
        break;
      case 'tiktok':
        result = await handleTikTokWebhook(job);
        break;
      case 'walmart':
        result = await handleWalmartWebhook(job);
        break;
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }

    logger.info('webhook_job_completed', { jobId, platform, event });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('webhook_job_failed', {
      jobId, platform, event, attempt, maxAttempts, error: error.message,
    });

    if (attempt >= maxAttempts) {
      logger.error('webhook_job_dead_lettered', {
        jobId, platform, event, attempts: maxAttempts, error: error.message,
      });
    }

    throw error;
  }
}

// ─── Worker Registration ────────────────────────────────────────────────

let webhookWorker: Worker | null = null;

export async function startWebhookWorker() {
  if (webhookWorker) {
    logger.info('webhook_worker_already_running');
    return;
  }

  // Touch the queue so it's instantiated alongside the worker (idempotent).
  await getWebhookQueue();

  webhookWorker = new Worker('webhooks', processWebhook, {
    connection: {
      url: ENV.redisUrl,
    },
    concurrency: 10,
  });

  webhookWorker.on('completed', (job) => {
    logger.info('webhook_worker_job_completed', { jobId: job.id });
  });

  webhookWorker.on('failed', (job, err) => {
    logger.error('webhook_worker_job_failed', { jobId: job?.id, error: err?.message });
  });

  webhookWorker.on('error', (err) => {
    logger.error('webhook_worker_error', { error: err?.message ?? String(err) });
  });

  logger.info('webhook_worker_started', { concurrency: 10 });
}

export async function stopWebhookWorker() {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
    logger.info('webhook_worker_stopped');
  }
}

// ─── Add Webhook to Queue ────────────────────────────────────────────────

export async function enqueueWebhook(payload: WebhookPayload) {
  const queue = await getWebhookQueue();

  // Deduplicate on a stable identifier — the platform's webhook id is the
  // only safe key, since the same event can legitimately arrive twice (e.g.
  // a Shopify retry after a 5xx). Using `Math.floor(timestamp/10000)` was
  // a 10-second window that BOTH split bursts incorrectly (an event at
  // t=9999ms and t=10000ms got different keys) AND failed to dedup events
  // resent more than 10s later. Prefer the upstream id; fall back to a
  // composite of a content hint when the id is missing so we still make
  // forward progress instead of de-duping legitimately distinct events.
  const data = payload.data ?? {};
  const upstreamId =
    (data as any).webhook_id ??
    (data as any).id ??
    (data as any).order_id ??
    (data as any).resource_id ??
    `${payload.timestamp}-${Math.random().toString(36).slice(2, 10)}`;

  const job = await queue.add(
    `${payload.platform}:${payload.event}`,
    payload,
    {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      jobId: `${payload.platform}:${payload.event}:${upstreamId}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: false,
    }
  );

  logger.info('webhook_enqueued', {
    jobId: job.id,
    platform: payload.platform,
    event: payload.event,
  });
  return job;
}
