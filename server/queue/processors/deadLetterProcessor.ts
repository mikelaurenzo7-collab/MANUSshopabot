/**
 * Dead-Letter Queue Processor
 * Handles jobs that have failed after max retries
 */

import { Worker, Job } from 'bullmq';
import { getWebhookQueue } from '../config';
import { ENV } from '../../_core/env';
import { logger } from '../../_core/logger';

// ─── Dead-Letter Job Record ────────────────────────────────────────────

interface DeadLetterJob {
  jobId: string;
  queueName: string;
  jobName: string;
  payload: Record<string, any>;
  error: string;
  attempts: number;
  failedAt: Date;
  status: 'pending_review' | 'resolved' | 'ignored';
  resolvedAt?: Date;
  resolution?: string;
}

// ─── Dead-Letter Processor ────────────────────────────────────────────

async function processDeadLetter(job: Job) {
  try {
    const { jobId, queueName, jobName, payload, error, attempts } = job.data;

    logger.error('dead_letter_received', {
      originalJobId: jobId,
      queue: queueName,
      name: jobName,
      attempts,
      error,
    });

    // Best-effort owner notification. We import dynamically to avoid a hard
    // dependency cycle and we never let a notification failure crash the
    // dead-letter pipeline — the structured log above is the source of truth.
    try {
      const { notifyOwner } = await import('../../_core/notification');
      await notifyOwner({
        title: `⚠️ Webhook Dead-Lettered: ${jobName}`,
        content: `Job ${jobId} on queue "${queueName}" failed after ${attempts} attempts. Error: ${error}. Inspect via the queue health admin tools.`,
      });
    } catch (notifyErr) {
      logger.warn('dead_letter_notify_failed', {
        originalJobId: jobId,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

    return { recorded: true, jobId };
  } catch (err) {
    logger.error('dead_letter_processing_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─── Worker Registration ────────────────────────────────────────────────

let deadLetterWorker: Worker | null = null;

export async function startDeadLetterWorker() {
  if (deadLetterWorker) {
    logger.info('dead_letter_worker_already_running');
    return;
  }

  deadLetterWorker = new Worker('dead-letters', processDeadLetter, {
    connection: {
      url: ENV.redisUrl,
    },
    concurrency: 5,
  });

  deadLetterWorker.on('completed', (job) => {
    logger.info('dead_letter_worker_job_completed', { jobId: job.id });
  });

  deadLetterWorker.on('failed', (job, err) => {
    logger.error('dead_letter_worker_job_failed', { jobId: job?.id, error: err?.message });
  });

  deadLetterWorker.on('error', (err) => {
    logger.error('dead_letter_worker_error', { error: err?.message ?? String(err) });
  });

  logger.info('dead_letter_worker_started', { concurrency: 5 });
}

export async function stopDeadLetterWorker() {
  if (deadLetterWorker) {
    await deadLetterWorker.close();
    deadLetterWorker = null;
    logger.info('dead_letter_worker_stopped');
  }
}

// ─── Move Failed Job to Dead-Letter Queue ────────────────────────────

export async function moveToDeadLetter(
  failedJob: Job,
  error: Error
) {
  try {
    const deadLetterQueue = await getWebhookQueue(); // Use same Redis connection

    await deadLetterQueue.add(
      `dead-letter:${failedJob.name}`,
      {
        jobId: failedJob.id,
        queueName: failedJob.queueName,
        jobName: failedJob.name,
        payload: failedJob.data,
        error: error.message,
        attempts: failedJob.attemptsMade,
        failedAt: new Date(),
      },
      {
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    logger.warn('dead_letter_moved', { jobId: failedJob.id, error: error.message });
  } catch (err) {
    logger.error('dead_letter_move_failed', {
      jobId: failedJob.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
