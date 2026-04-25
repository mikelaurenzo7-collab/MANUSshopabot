/**
 * Webhook Processor
 * Handles incoming webhooks from Shopify, Amazon, Etsy, etc. with retry logic
 */

import { Worker, Job } from 'bullmq';
import { getWebhookQueue } from '../config';
import { ENV } from '../../_core/env';

// ─── Webhook Handler Types ────────────────────────────────────────────

export interface WebhookPayload {
  platform: 'shopify' | 'amazon' | 'etsy' | 'tiktok' | 'walmart';
  event: string;
  data: Record<string, any>;
  timestamp: number;
  signature?: string;
}

// ─── Platform-Specific Handlers ────────────────────────────────────────

async function handleShopifyWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  console.log(`[Shopify] Processing ${event}:`, { orderId: data.id });

  // TODO: Implement Shopify webhook handlers
  // - order.created
  // - order.updated
  // - order.fulfilled
  // - product.created
  // - product.updated
  // - inventory.level.updated

  return { processed: true, platform: 'shopify', event };
}

async function handleAmazonWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  console.log(`[Amazon] Processing ${event}:`, { orderId: data.id });

  // TODO: Implement Amazon webhook handlers
  // - order.placed
  // - order.shipped
  // - order.cancelled
  // - inventory.updated

  return { processed: true, platform: 'amazon', event };
}

async function handleEtsyWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  console.log(`[Etsy] Processing ${event}:`, { orderId: data.id });

  // TODO: Implement Etsy webhook handlers
  // - order.created
  // - order.updated
  // - shop.updated

  return { processed: true, platform: 'etsy', event };
}

async function handleTikTokWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  console.log(`[TikTok] Processing ${event}:`, { orderId: data.id });

  // TODO: Implement TikTok webhook handlers
  // - order.created
  // - order.updated
  // - product.updated

  return { processed: true, platform: 'tiktok', event };
}

async function handleWalmartWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  console.log(`[Walmart] Processing ${event}:`, { orderId: data.id });

  // TODO: Implement Walmart webhook handlers
  // - order.created
  // - order.updated
  // - inventory.updated

  return { processed: true, platform: 'walmart', event };
}

// ─── Main Processor ────────────────────────────────────────────────────

async function processWebhook(job: Job<WebhookPayload>) {
  const { platform, event, data, timestamp } = job.data;
  const jobId = job.id;
  const attempt = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts || 5;

  console.log(`[Webhook] Job ${jobId} - Attempt ${attempt}/${maxAttempts} - ${platform}:${event}`);

  try {
    // Verify webhook signature if provided
    if (job.data.signature) {
      // TODO: Implement signature verification for each platform
      console.log(`[Webhook] Verifying signature for ${platform}`);
    }

    // Route to platform-specific handler
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

    console.log(`[Webhook] Job ${jobId} completed successfully:`, result);
    return result;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[Webhook] Job ${jobId} failed (attempt ${attempt}/${maxAttempts}):`, error.message);

    // If this is the last attempt, log to dead-letter queue
    if (attempt >= maxAttempts) {
      console.error(`[Webhook] Job ${jobId} moved to dead-letter queue after ${maxAttempts} attempts`);
      // TODO: Store in database for manual inspection
    }

    throw error;
  }
}

// ─── Worker Registration ────────────────────────────────────────────────

let webhookWorker: Worker | null = null;

export async function startWebhookWorker() {
  if (webhookWorker) {
    console.log('[Webhook Worker] Already running');
    return;
  }

  const queue = await getWebhookQueue();

  webhookWorker = new Worker('webhooks', processWebhook, {
    connection: {
      url: ENV.redisUrl,
    },
    concurrency: 10, // Process up to 10 webhooks concurrently
  });

  webhookWorker.on('completed', (job) => {
    console.log(`[Webhook Worker] Job ${job.id} completed`);
  });

  webhookWorker.on('failed', (job, err) => {
    console.error(`[Webhook Worker] Job ${job?.id} failed:`, err?.message);
  });

  webhookWorker.on('error', (err) => {
    console.error('[Webhook Worker] Error:', err);
  });

  console.log('[Webhook Worker] Started with concurrency=10');
}

export async function stopWebhookWorker() {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
    console.log('[Webhook Worker] Stopped');
  }
}

// ─── Add Webhook to Queue ────────────────────────────────────────────────

export async function enqueueWebhook(payload: WebhookPayload) {
  const queue = await getWebhookQueue();

  const job = await queue.add(
    `${payload.platform}:${payload.event}`,
    payload,
    {
      // Retry configuration
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds
      },
      // Job deduplication (prevent duplicate processing within 10 seconds)
      jobId: `${payload.platform}:${payload.event}:${payload.data.id}:${Math.floor(payload.timestamp / 10000)}`,
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
      },
      removeOnFail: false, // Keep failed jobs for inspection
    }
  );

  console.log(`[Webhook] Enqueued job ${job.id} - ${payload.platform}:${payload.event}`);
  return job;
}
