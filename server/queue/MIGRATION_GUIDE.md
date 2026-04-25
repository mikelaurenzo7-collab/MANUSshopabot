# BullMQ Webhook Migration Guide

## Overview

This guide explains how to migrate existing webhook handlers from the old scheduler-based system to the new BullMQ job queue system.

## Why BullMQ?

- **Reliability**: Automatic retry with exponential backoff (up to 5 attempts)
- **Deduplication**: Prevents duplicate webhook processing within 10-second windows
- **Dead-Letter Queue**: Failed jobs are recorded for manual inspection
- **Concurrency**: Process up to 10 webhooks simultaneously
- **Monitoring**: Built-in queue health checks and statistics

## Migration Steps

### 1. Update Webhook Handler Signature

**Before (Scheduler-based):**
```typescript
async function handleShopifyOrderCreated(payload: ShopifyOrder) {
  // Process order
  return { success: true };
}
```

**After (BullMQ):**
```typescript
// Handler is now in server/queue/processors/webhookProcessor.ts
async function handleShopifyWebhook(job: Job<WebhookPayload>) {
  const { event, data } = job.data;
  // Process order
  return { processed: true, platform: 'shopify', event };
}
```

### 2. Enqueue Webhooks Instead of Processing Directly

**Before:**
```typescript
// Directly call handler
const result = await handleShopifyOrderCreated(payload);
```

**After:**
```typescript
import { enqueueWebhook } from '../queue/processors/webhookProcessor';

// Enqueue for processing
const job = await enqueueWebhook({
  platform: 'shopify',
  event: 'order.created',
  data: payload,
  timestamp: Date.now(),
});
```

### 3. Update Webhook Routes

**Before (server/shopifyWebhooks.ts):**
```typescript
app.post('/api/webhooks/shopify/orders/create', async (req, res) => {
  const payload = req.body;
  const result = await handleShopifyOrderCreated(payload);
  res.json(result);
});
```

**After:**
```typescript
import { enqueueWebhook } from '../queue/processors/webhookProcessor';

app.post('/api/webhooks/shopify/orders/create', async (req, res) => {
  const payload = req.body;
  
  // Enqueue the webhook
  const job = await enqueueWebhook({
    platform: 'shopify',
    event: 'order.created',
    data: payload,
    timestamp: Date.now(),
  });
  
  // Return immediately (job will be processed asynchronously)
  res.json({ jobId: job.id, queued: true });
});
```

### 4. Error Handling

**Before:**
```typescript
try {
  await handleShopifyOrderCreated(payload);
} catch (err) {
  logger.error('Order processing failed:', err);
  res.status(500).json({ error: 'Processing failed' });
}
```

**After:**
```typescript
// Errors are handled automatically by BullMQ
// - Retried up to 5 times with exponential backoff
// - Moved to dead-letter queue if all retries fail
// - Failed jobs can be inspected via queue health endpoint

const job = await enqueueWebhook({
  platform: 'shopify',
  event: 'order.created',
  data: payload,
  timestamp: Date.now(),
});

res.json({ jobId: job.id, queued: true });
```

## Monitoring

### Check Queue Health

```typescript
// tRPC endpoint
const health = await trpc.queueHealth.getHealth.query();
console.log(health);
// {
//   redis: { connected: true, url: '...' },
//   queues: {
//     webhooks: { active: 2, waiting: 15, failed: 1, delayed: 0, paused: 0 },
//     externalApis: { active: 0, waiting: 0, failed: 0, delayed: 0, paused: 0 }
//   }
// }
```

### Get Queue Statistics

```typescript
const stats = await trpc.queueHealth.getQueueStats.query({ queueName: 'webhooks' });
console.log(stats);
// { active: 2, waiting: 15, failed: 1, delayed: 0, paused: 0, total: 18 }
```

## Platforms to Migrate

1. **Shopify** (server/shopifyWebhooks.ts)
   - order.created
   - order.updated
   - order.fulfilled
   - product.created
   - product.updated
   - inventory.level.updated

2. **Amazon** (server/ecommerceOAuth.ts)
   - order.placed
   - order.shipped
   - order.cancelled
   - inventory.updated

3. **Etsy** (server/ecommerceOAuth.ts)
   - order.created
   - order.updated
   - shop.updated

4. **TikTok** (server/ecommerceOAuth.ts)
   - order.created
   - order.updated
   - product.updated

5. **Walmart** (server/ecommerceOAuth.ts)
   - order.created
   - order.updated
   - inventory.updated

## Testing

### Test Webhook Enqueuing

```typescript
import { enqueueWebhook } from '../queue/processors/webhookProcessor';

const job = await enqueueWebhook({
  platform: 'shopify',
  event: 'order.created',
  data: {
    id: 123,
    order_number: 456,
    line_items: [],
    total_price: '99.99',
    currency: 'USD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    financial_status: 'paid',
  },
  timestamp: Date.now(),
});

console.log(`Job ${job.id} enqueued`);
```

### Test Retry Logic

Modify the webhook processor to simulate a failure:

```typescript
async function handleShopifyWebhook(job: Job<WebhookPayload>) {
  if (job.attemptsMade < 2) {
    throw new Error('Simulated failure for testing');
  }
  // Process normally on retry
  return { processed: true };
}
```

## Rollback

If you need to rollback to the old system:

1. Stop the webhook workers: `await shutdownQueues()`
2. Revert webhook routes to call handlers directly
3. Remove `enqueueWebhook` calls

## Performance Expectations

- **Throughput**: 10 concurrent webhooks per second
- **Latency**: <100ms to enqueue, processing time depends on handler complexity
- **Retry**: 2s → 4s → 8s → 16s → 32s (exponential backoff)
- **Deduplication**: Prevents duplicate processing within 10-second windows

## Troubleshooting

### Redis Connection Failed

```
[Webhook Worker] Error: AggregateError [ECONNREFUSED]:
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution:** Ensure Redis is running and `REDIS_URL` environment variable is set correctly.

### Jobs Not Processing

1. Check queue health: `trpc.queueHealth.getHealth.query()`
2. Verify workers are running: Check server logs for `[Webhook Worker] Started`
3. Check for failed jobs: `queueHealth.getQueueStats({ queueName: 'webhooks' })`

### High Memory Usage

If memory usage is high, check:
1. Number of active jobs: `queueHealth.getQueueStats()`
2. Job completion: Completed jobs are removed after 1 hour by default
3. Failed jobs: May accumulate if not cleaned up

## Next Steps

1. Migrate Shopify webhook handlers
2. Migrate Amazon webhook handlers
3. Migrate Etsy webhook handlers
4. Migrate TikTok webhook handlers
5. Migrate Walmart webhook handlers
6. Remove old scheduler-based webhook system
7. Monitor queue health in production
