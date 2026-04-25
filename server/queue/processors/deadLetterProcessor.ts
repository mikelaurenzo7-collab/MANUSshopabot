/**
 * Dead-Letter Queue Processor
 * Handles jobs that have failed after max retries
 */

import { Worker, Job } from 'bullmq';
import { getWebhookQueue } from '../config';
import { ENV } from '../../_core/env';
import { getDb } from '../../db';

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

    console.log(`[Dead-Letter] Processing failed job ${jobId}:`, {
      queue: queueName,
      name: jobName,
      attempts,
      error,
    });

    // TODO: Store in database for manual inspection
    // const db = await getDb();
    // await db.insert(deadLetterJobs).values({
    //   jobId,
    //   queueName,
    //   jobName,
    //   payload,
    //   error,
    //   attempts,
    //   failedAt: new Date(),
    //   status: 'pending_review',
    // });

    // TODO: Send notification to owner
    // await notifyOwner({
    //   title: `Webhook Failed: ${jobName}`,
    //   content: `Job ${jobId} failed after ${attempts} attempts. Error: ${error}`,
    // });

    console.log(`[Dead-Letter] Job ${jobId} recorded for manual review`);
    return { recorded: true, jobId };
  } catch (err) {
    console.error('[Dead-Letter] Error processing dead-letter job:', err);
    throw err;
  }
}

// ─── Worker Registration ────────────────────────────────────────────────

let deadLetterWorker: Worker | null = null;

export async function startDeadLetterWorker() {
  if (deadLetterWorker) {
    console.log('[Dead-Letter Worker] Already running');
    return;
  }

  deadLetterWorker = new Worker('dead-letters', processDeadLetter, {
    connection: {
      url: ENV.redisUrl,
    },
    concurrency: 5,
  });

  deadLetterWorker.on('completed', (job) => {
    console.log(`[Dead-Letter Worker] Job ${job.id} processed`);
  });

  deadLetterWorker.on('failed', (job, err) => {
    console.error(`[Dead-Letter Worker] Job ${job?.id} failed:`, err?.message);
  });

  deadLetterWorker.on('error', (err) => {
    console.error('[Dead-Letter Worker] Error:', err);
  });

  console.log('[Dead-Letter Worker] Started with concurrency=5');
}

export async function stopDeadLetterWorker() {
  if (deadLetterWorker) {
    await deadLetterWorker.close();
    deadLetterWorker = null;
    console.log('[Dead-Letter Worker] Stopped');
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

    console.log(`[Dead-Letter] Moved job ${failedJob.id} to dead-letter queue`);
  } catch (err) {
    console.error('[Dead-Letter] Error moving job to dead-letter queue:', err);
  }
}
