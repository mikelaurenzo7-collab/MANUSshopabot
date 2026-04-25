/**
 * Queue Initialization
 * Starts all queue workers and processors on server startup
 */

import { startWebhookWorker, stopWebhookWorker } from './processors/webhookProcessor';
import { startDeadLetterWorker, stopDeadLetterWorker } from './processors/deadLetterProcessor';
import { closeQueues } from './config';

let isInitialized = false;

export async function initializeQueues() {
  if (isInitialized) {
    console.log('[Queue] Already initialized');
    return;
  }

  try {
    console.log('[Queue] Initializing...');

    // Start all workers
    await startWebhookWorker();
    await startDeadLetterWorker();

    isInitialized = true;
    console.log('[Queue] Initialization complete');
  } catch (err) {
    console.error('[Queue] Initialization failed:', err);
    throw err;
  }
}

export async function shutdownQueues() {
  try {
    console.log('[Queue] Shutting down...');

    await stopWebhookWorker();
    await stopDeadLetterWorker();
    await closeQueues();

    isInitialized = false;
    console.log('[Queue] Shutdown complete');
  } catch (err) {
    console.error('[Queue] Shutdown failed:', err);
  }
}
