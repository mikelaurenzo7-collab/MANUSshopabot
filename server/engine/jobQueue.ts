/**
 * Durable Job Queue Engine
 *
 * Handles retryable async work for external operations.
 * First use case: scheduled social post publishing.
 */

import * as db from "../db";
import { publishSocialPost } from "./platformBridge";
import { withResilience } from "../_core/retry";

type JobType = "publish_scheduled_social_post";

interface PublishScheduledSocialPostPayload {
  postId: number;
}

function calculateNextRunAt(attempts: number): Date {
  const delayMinutes = Math.min(Math.pow(2, Math.max(0, attempts - 1)) * 5, 120);
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

async function enqueueScheduledPostJob(postId: number) {
  const dedupeKey = `publish_social_post:${postId}`;
  const existing = await db.getJobByDedupeKey(dedupeKey);
  if (existing && existing.status !== "failed" && existing.status !== "completed") {
    return existing;
  }

  await db.createJob({
    jobType: "publish_scheduled_social_post",
    dedupeKey,
    status: "pending",
    payload: { postId },
    attempts: 0,
    maxAttempts: 4,
    runAt: new Date(),
  });

  return db.getJobByDedupeKey(dedupeKey);
}

export async function enqueueDueScheduledPosts(now: Date = new Date()) {
  const duePosts = await db.getDueScheduledPosts(now);
  let enqueued = 0;

  for (const post of duePosts) {
    const queued = await enqueueScheduledPostJob(post.id);
    if (queued) {
      enqueued++;
    }
  }

  return { enqueued, duePosts: duePosts.length };
}

async function handlePublishScheduledSocialPost(job: any) {
  const payload = (job.payload ?? {}) as PublishScheduledSocialPostPayload;
  const postId = payload.postId;
  if (!postId) throw new Error("Scheduled post job missing postId");

  const post = await db.getSocialPostById(postId);
  if (!post) {
    throw new Error(`Scheduled post ${postId} not found`);
  }

  if (post.status === "published") {
    return { skipped: true, reason: "already_published" };
  }

  const store = await db.getStoreById(post.storeId);
  if (!store) {
    throw new Error(`Store ${post.storeId} not found for scheduled post ${postId}`);
  }

  const platformMap: Record<string, string> = {
    facebook: "meta",
    meta: "meta",
    instagram: "instagram",
    tiktok: "tiktok",
    twitter: "twitter",
    pinterest: "pinterest",
    google_ads: "google_ads",
  };
  const socialPlatform = platformMap[post.platform] || post.platform;
  const accounts = await db.getSocialAccountsByPlatform(store.userId, socialPlatform);
  const activeAccount = accounts.find((account: any) => account.status === "active");

  if (!activeAccount) {
    await db.updateSocialPost(post.id, { status: "failed" });
    await db.createNotification({
      userId: store.userId,
      agentType: "social",
      type: "warning",
      title: `Scheduled post failed: no active ${post.platform} account`,
      message: `Post #${post.id} could not be published. Connect a ${post.platform} account in Integrations.`,
      actionUrl: "/integrations",
    });
    await db.createAgentTask({
      agentType: "social",
      taskType: "scheduled_post",
      title: `Failed: no active ${post.platform} account`,
      description: `Post #${post.id} — no connected ${post.platform} account for user #${store.userId}`,
      status: "failed",
      storeId: post.storeId,
    });
    throw new Error(`No active ${post.platform} account connected`);
  }

  const postInput = {
    content: post.content || "",
    imageUrl: post.imageUrl || undefined,
    metadata: typeof post.engagement === "object" && post.engagement !== null
      ? (post.engagement as Record<string, any>)
      : undefined,
  };

  await withResilience(`social_publish_${socialPlatform}`, () =>
    publishSocialPost(activeAccount.id, postInput, post.storeId)
  );

  await db.updateSocialPost(post.id, {
    status: "published",
    publishedAt: new Date(),
  });

  await db.createAgentTask({
    agentType: "social",
    taskType: "scheduled_post",
    title: `Published scheduled ${post.platform} post`,
    description: `Post #${post.id} published via ${activeAccount.accountName || activeAccount.platform} account`,
    status: "completed",
    storeId: post.storeId,
  });

  return { published: true, platform: post.platform, postId: post.id };
}

async function handleJobExhausted(job: any, errorMessage: string) {
  if (job.jobType !== "publish_scheduled_social_post") return;

  const payload = (job.payload ?? {}) as PublishScheduledSocialPostPayload;
  if (!payload.postId) return;

  const post = await db.getSocialPostById(payload.postId);
  if (!post) return;

  await db.updateSocialPost(post.id, { status: "failed" });

  const store = await db.getStoreById(post.storeId);
  if (!store) return;

  await db.createNotification({
    userId: store.userId,
    agentType: "social",
    type: "error",
    title: `Scheduled post failed after retries: ${post.platform}`,
    message: `Post #${post.id} could not be published after multiple attempts. Last error: ${errorMessage}`,
    actionUrl: "/social",
  });

  await db.createAgentTask({
    agentType: "social",
    taskType: "scheduled_post",
    title: `Scheduled ${post.platform} post exhausted retries`,
    description: `Post #${post.id} failed after ${job.maxAttempts} attempts. Last error: ${errorMessage}`,
    status: "failed",
    storeId: post.storeId,
  });
}

const handlers: Record<JobType, (job: any) => Promise<any>> = {
  publish_scheduled_social_post: handlePublishScheduledSocialPost,
};

export async function processRunnableJobs(limit = 10) {
  const jobs = await db.getRunnableJobs(limit);
  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const handler = handlers[job.jobType as JobType];
    if (!handler) {
      await db.updateJob(job.id, {
        status: "failed",
        attempts: job.attempts + 1,
        lastError: `No handler registered for ${job.jobType}`,
      });
      failed++;
      continue;
    }

    await db.updateJob(job.id, {
      status: "running",
      attempts: job.attempts + 1,
      lastError: null,
    });

    try {
      await handler(job);
      await db.updateJob(job.id, {
        status: "completed",
        completedAt: new Date(),
      });
      processed++;
    } catch (err: any) {
      const nextAttempts = job.attempts + 1;
      const exhausted = nextAttempts >= job.maxAttempts;
      if (exhausted) {
        await handleJobExhausted(job, err.message || String(err));
      }
      await db.updateJob(job.id, {
        status: exhausted ? "failed" : "pending",
        lastError: err.message || String(err),
        runAt: exhausted ? job.runAt : calculateNextRunAt(nextAttempts),
        completedAt: exhausted ? new Date() : null,
      });
      failed++;
    }
  }

  return { total: jobs.length, processed, failed };
}