/**
 * Queue Initialization
 * Starts all queue workers and processors on server startup
 */

import { startWebhookWorker, stopWebhookWorker } from './processors/webhookProcessor';
import { startDeadLetterWorker, stopDeadLetterWorker } from './processors/deadLetterProcessor';
import { closeQueues } from './config';
import { logger } from '../_core/logger';

let isInitialized = false;

export async function initializeQueues() {
  if (isInitialized) {
    logger.info('queue_already_initialized');
    return;
  }

  try {
    logger.info('queue_initializing');

    await startWebhookWorker();
    await startDeadLetterWorker();

    isInitialized = true;
    logger.info('queue_initialized');
  } catch (err) {
    logger.error('queue_initialization_failed', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export async function shutdownQueues() {
  try {
    logger.info('queue_shutting_down');

    await stopWebhookWorker();
    await stopDeadLetterWorker();
    await closeQueues();

    isInitialized = false;
    logger.info('queue_shutdown_complete');
  } catch (err) {
    logger.error('queue_shutdown_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}
