/**
 * Queue Initialization
 * Starts all queue workers and processors on server startup.
 * Gracefully degrades when Redis is unavailable — logs a warning
 * and continues without queue processing.
 */
import { closeQueues } from './config';
import { logger } from '../_core/logger';

let isInitialized = false;

export async function initializeQueues() {
  if (isInitialized) {
    logger.info('queue_already_initialized');
    return;
  }

  // If REDIS_URL is not set, skip queue initialization entirely.
  // The server will still function — webhook processing just won't
  // have the durable retry layer.
  if (!process.env.REDIS_URL) {
    logger.warn('queue_skipped_no_redis', {
      message: 'REDIS_URL not set — queue workers disabled. Webhooks will be processed synchronously.',
    });
    return;
  }

  try {
    logger.info('queue_initializing');
    const { startWebhookWorker } = await import('./processors/webhookProcessor');
    const { startDeadLetterWorker } = await import('./processors/deadLetterProcessor');
    await startWebhookWorker();
    await startDeadLetterWorker();
    isInitialized = true;
    logger.info('queue_initialized');
  } catch (err) {
    // Non-fatal: log and continue. The server runs fine without queues.
    logger.error('queue_initialization_failed', {
      error: err instanceof Error ? err.message : String(err),
      message: 'Queue workers could not start — falling back to synchronous processing.',
    });
  }
}

export async function shutdownQueues() {
  if (!isInitialized) return;
  try {
    logger.info('queue_shutting_down');
    const { stopWebhookWorker } = await import('./processors/webhookProcessor');
    const { stopDeadLetterWorker } = await import('./processors/deadLetterProcessor');
    await stopWebhookWorker();
    await stopDeadLetterWorker();
    await closeQueues();
    isInitialized = false;
    logger.info('queue_shutdown_complete');
  } catch (err) {
    logger.error('queue_shutdown_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}
