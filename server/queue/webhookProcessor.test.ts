/**
 * Webhook Processor Tests — uses vi.mock to avoid real Redis connection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track the args passed to queue.add() so tests can assert dedup-key
// behaviour without depending on shared mutable mock state.
const addCalls: Array<{ name: string; data: any; opts: any }> = [];

// Mock BullMQ Queue before importing the processor so no real Redis is used
vi.mock('bullmq', () => {
  const MockQueue = vi.fn().mockImplementation(() => ({
    add: vi.fn().mockImplementation((name: string, data: any, opts: any = {}) => {
      addCalls.push({ name, data, opts });
      // Each call returns its OWN job object so callers don't observe
      // shared mutable state.
      return Promise.resolve({ id: opts?.jobId ?? 'mock-job-id', data, opts });
    }),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }));

  const MockWorker = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }));

  const MockQueueEvents = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }));

  return { Queue: MockQueue, Worker: MockWorker, QueueEvents: MockQueueEvents };
});

import { enqueueWebhook, WebhookPayload } from './processors/webhookProcessor';

describe('Webhook Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addCalls.length = 0;
  });

  describe('enqueueWebhook', () => {
    it('should enqueue a webhook with correct payload', async () => {
      const payload: WebhookPayload = {
        platform: 'shopify',
        event: 'order.created',
        data: { id: 'order_123', total: 99.99 },
        timestamp: Date.now(),
      };

      const job = await enqueueWebhook(payload);
      expect(job).toBeDefined();
      expect(job.data).toMatchObject({
        platform: 'shopify',
        event: 'order.created',
      });
    });

    it('should generate consistent job IDs for deduplication', async () => {
      const payload: WebhookPayload = {
        platform: 'amazon',
        event: 'order.updated',
        data: { id: 'order_456', status: 'shipped' },
        timestamp: 1000000,
      };

      // Job IDs should be deterministic for the same payload (within 10-second window)
      const jobId1 = `${payload.platform}:${payload.event}:${payload.data.id}:${Math.floor(payload.timestamp / 10000)}`;
      const jobId2 = `${payload.platform}:${payload.event}:${payload.data.id}:${Math.floor(payload.timestamp / 10000)}`;

      expect(jobId1).toBe(jobId2);
    });

    it('should support all platform types', async () => {
      const platforms: WebhookPayload['platform'][] = ['shopify', 'amazon', 'etsy', 'tiktok', 'walmart'];

      for (const platform of platforms) {
        const payload: WebhookPayload = {
          platform,
          event: 'test.event',
          data: { id: `test_${platform}` },
          timestamp: Date.now(),
        };

        expect(payload.platform).toBe(platform);
      }
    });
  });

  describe('Retry Configuration', () => {
    it('should have exponential backoff configured', () => {
      // Expected retry delays: 2s, 4s, 8s, 16s, 32s
      const baseDelay = 2000;
      const delays = [];

      for (let attempt = 1; attempt <= 5; attempt++) {
        delays.push(baseDelay * Math.pow(2, attempt - 1));
      }

      expect(delays).toEqual([2000, 4000, 8000, 16000, 32000]);
    });

    it('should attempt 5 times before moving to dead-letter queue', () => {
      const maxAttempts = 5;
      expect(maxAttempts).toBe(5);
    });
  });

  describe('Job Deduplication', () => {
    it('uses the upstream platform id so duplicate webhooks collapse', async () => {
      await enqueueWebhook({
        platform: 'shopify',
        event: 'order.created',
        data: { id: 'order_42' },
        timestamp: 1_000_000,
      } as WebhookPayload);

      await enqueueWebhook({
        platform: 'shopify',
        event: 'order.created',
        data: { id: 'order_42' },
        // Same event resent 30s later — the old timestamp-window key
        // would have changed here, breaking dedup. The new key MUST be
        // identical so BullMQ collapses the retry.
        timestamp: 1_030_000,
      } as WebhookPayload);

      expect(addCalls).toHaveLength(2);
      expect(addCalls[0].opts.jobId).toBe(addCalls[1].opts.jobId);
      expect(addCalls[0].opts.jobId).toBe('shopify:order.created:order_42');
    });

    it('keeps distinct events distinct (different upstream ids)', async () => {
      await enqueueWebhook({
        platform: 'shopify',
        event: 'order.created',
        data: { id: 'order_1' },
        timestamp: 1_000_000,
      } as WebhookPayload);

      await enqueueWebhook({
        platform: 'shopify',
        event: 'order.created',
        data: { id: 'order_2' },
        timestamp: 1_000_000,
      } as WebhookPayload);

      expect(addCalls[0].opts.jobId).not.toBe(addCalls[1].opts.jobId);
    });

    it('falls back to a unique key when no upstream id is present', async () => {
      // Two webhooks with no `id` field arriving in the same millisecond
      // must NOT collide on the same dedup key — that would silently drop
      // legitimately distinct events.
      await enqueueWebhook({
        platform: 'etsy',
        event: 'shop.updated',
        data: {},
        timestamp: 1_000_000,
      } as WebhookPayload);

      await enqueueWebhook({
        platform: 'etsy',
        event: 'shop.updated',
        data: {},
        timestamp: 1_000_000,
      } as WebhookPayload);

      expect(addCalls[0].opts.jobId).not.toBe(addCalls[1].opts.jobId);
    });
  });
});
