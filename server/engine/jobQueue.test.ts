/**
 * Job Queue Engine — Comprehensive Tests
 *
 * Covers all 7 job handlers, priority ordering, concurrency limits,
 * retry/exhaustion paths, and invalid payload handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("../db", () => ({
  getDueScheduledPosts: vi.fn(),
  getJobByDedupeKey: vi.fn(),
  createJob: vi.fn(),
  getRunnableJobs: vi.fn(),
  updateJob: vi.fn(),
  getSocialPostById: vi.fn(),
  getStoreById: vi.fn(),
  getSocialAccountsByPlatform: vi.fn(),
  updateSocialPost: vi.fn(),
  createNotification: vi.fn(),
  createAgentTask: vi.fn(),
  updateProduct: vi.fn(),
}));

// ─── Mock platformBridge ──────────────────────────────────────────────────────
vi.mock("../engine/platformBridge", () => ({
  publishSocialPost: vi.fn().mockResolvedValue({ success: true }),
  fulfillOrderOnPlatform: vi.fn().mockResolvedValue({ success: true }),
}));

// ─── Mock retry ───────────────────────────────────────────────────────────────
vi.mock("../_core/retry", () => ({
  withResilience: (_key: string, fn: () => any) => fn(),
  withRetry: (fn: () => any) => fn(),
  withCircuitBreaker: (_key: string, fn: () => any) => fn(),
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────
vi.mock("../_core/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────
import * as db from "../db";
import { publishSocialPost, fulfillOrderOnPlatform } from "../engine/platformBridge";
import {
  processRunnableJobs,
  enqueueDueScheduledPosts,
  enqueueFulfillOrderJob,
  enqueuePricingUpdateJob,
  enqueueEmailCampaignJob,
  enqueueReportGenerationJob,
  enqueueWebhookDeliveryJob,
  enqueueNicheResearchJob,
  CONCURRENCY_LIMITS,
  JOB_PRIORITY,
} from "../engine/jobQueue";

const mockDb = vi.mocked(db);
const mockPublishSocialPost = vi.mocked(publishSocialPost);
const mockFulfillOrder = vi.mocked(fulfillOrderOnPlatform);

// ─── Test Data ────────────────────────────────────────────────────────────────
const fakeStore = { id: 1, userId: 100, name: "Test Store", platform: "shopify" };
const fakePost = {
  id: 42, storeId: 1, platform: "instagram", status: "scheduled",
  content: "Test post content", imageUrl: null, engagement: null,
};
const fakeAccount = { id: 10, platform: "instagram", accountName: "test_account", status: "active" };

function makeJob(jobType: string, payload: any, overrides: any = {}) {
  return {
    id: Math.floor(Math.random() * 1000),
    jobType,
    payload,
    attempts: 0,
    maxAttempts: 4,
    status: "pending",
    runAt: new Date(),
    ...overrides,
  };
}

// ─── CONCURRENCY_LIMITS & JOB_PRIORITY ───────────────────────────────────────
describe("Job Queue Configuration", () => {
  it("CONCURRENCY_LIMITS defines limits for all 7 job types", () => {
    const types = [
      "publish_scheduled_social_post", "fulfill_order", "pricing_update",
      "email_campaign", "report_generation", "webhook_delivery", "niche_research",
    ];
    for (const t of types) {
      expect(CONCURRENCY_LIMITS[t as keyof typeof CONCURRENCY_LIMITS]).toBeGreaterThan(0);
    }
  });

  it("JOB_PRIORITY assigns fulfill_order the highest priority (lowest number)", () => {
    expect(JOB_PRIORITY.fulfill_order).toBeLessThan(JOB_PRIORITY.publish_scheduled_social_post);
    expect(JOB_PRIORITY.fulfill_order).toBeLessThan(JOB_PRIORITY.report_generation);
    expect(JOB_PRIORITY.fulfill_order).toBeLessThan(JOB_PRIORITY.niche_research);
  });

  it("report_generation has lower priority than fulfillment and social posts", () => {
    expect(JOB_PRIORITY.report_generation).toBeGreaterThan(JOB_PRIORITY.fulfill_order);
    expect(JOB_PRIORITY.report_generation).toBeGreaterThan(JOB_PRIORITY.publish_scheduled_social_post);
  });

  it("niche_research has the lowest priority", () => {
    const allPriorities = Object.values(JOB_PRIORITY);
    expect(JOB_PRIORITY.niche_research).toBe(Math.max(...allPriorities));
  });
});

// ─── Priority Ordering ────────────────────────────────────────────────────────
describe("processRunnableJobs — Priority Ordering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("processes fulfill_order before niche_research when both are runnable", async () => {
    const fulfillJob = makeJob("fulfill_order", { orderId: 1, storeId: 1 }, { id: 1 });
    const nicheJob = makeJob("niche_research", { userId: 100, keyword: "test" }, { id: 2 });

    // Return jobs in reverse priority order to test sorting
    mockDb.getRunnableJobs.mockResolvedValue([nicheJob, fulfillJob]);
    mockDb.getStoreById.mockResolvedValue(fakeStore);
    mockDb.updateJob.mockResolvedValue(undefined);
    mockDb.createAgentTask.mockResolvedValue({ id: 1 });

    const processedOrder: number[] = [];
    mockDb.updateJob.mockImplementation(async (id: number, data: any) => {
      if (data.status === "running") processedOrder.push(id);
    });

    await processRunnableJobs(10);

    // fulfill_order (id=1) should be processed before niche_research (id=2)
    const runningCalls = processedOrder;
    expect(runningCalls[0]).toBe(1); // fulfill_order first
    expect(runningCalls[1]).toBe(2); // niche_research second
  });
});

// ─── Concurrency Limits ───────────────────────────────────────────────────────
describe("processRunnableJobs — Concurrency Limits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not process more report_generation jobs than CONCURRENCY_LIMITS allows", async () => {
    // report_generation limit is 1
    const jobs = [
      makeJob("report_generation", { userId: 1, weekStart: "2026-01-01" }, { id: 1 }),
      makeJob("report_generation", { userId: 2, weekStart: "2026-01-01" }, { id: 2 }),
      makeJob("report_generation", { userId: 3, weekStart: "2026-01-01" }, { id: 3 }),
    ];

    mockDb.getRunnableJobs.mockResolvedValue(jobs);
    mockDb.updateJob.mockResolvedValue(undefined);
    mockDb.createAgentTask.mockResolvedValue({ id: 1 });

    const result = await processRunnableJobs(10);

    // Only 1 report job should be processed (concurrency limit = 1)
    expect(result.processed).toBe(1);
    expect(result.total).toBe(3);
  });

  it("processes up to CONCURRENCY_LIMITS.pricing_update jobs in parallel", async () => {
    const limit = CONCURRENCY_LIMITS.pricing_update; // 10
    const jobs = Array.from({ length: 12 }, (_, i) =>
      makeJob("pricing_update", { productId: i + 1, storeId: 1, newPriceCents: 999, reason: "test" }, { id: i + 1 })
    );

    mockDb.getRunnableJobs.mockResolvedValue(jobs);
    mockDb.updateJob.mockResolvedValue(undefined);
    mockDb.updateProduct.mockResolvedValue(undefined);
    mockDb.createAgentTask.mockResolvedValue({ id: 1 });

    const result = await processRunnableJobs(20);

    // Should process exactly 10 (the limit), not all 12
    expect(result.processed).toBe(limit);
    expect(result.total).toBe(12);
  });
});

// ─── Handler: publish_scheduled_social_post ───────────────────────────────────
describe("processRunnableJobs — publish_scheduled_social_post handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishes a scheduled social post successfully", async () => {
    const job = makeJob("publish_scheduled_social_post", { postId: 42 });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.getSocialPostById.mockResolvedValue(fakePost);
    mockDb.getStoreById.mockResolvedValue(fakeStore);
    mockDb.getSocialAccountsByPlatform.mockResolvedValue([fakeAccount]);
    mockDb.updateSocialPost.mockResolvedValue(undefined);
    mockDb.createAgentTask.mockResolvedValue({ id: 1 });
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockPublishSocialPost).toHaveBeenCalled();
    expect(mockDb.updateSocialPost).toHaveBeenCalledWith(42, expect.objectContaining({ status: "published" }));
  });

  it("skips already-published posts", async () => {
    const job = makeJob("publish_scheduled_social_post", { postId: 42 });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.getSocialPostById.mockResolvedValue({ ...fakePost, status: "published" });
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.processed).toBe(1);
    expect(mockPublishSocialPost).not.toHaveBeenCalled();
  });

  it("fails gracefully when no active social account is connected", async () => {
    const job = makeJob("publish_scheduled_social_post", { postId: 42 });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.getSocialPostById.mockResolvedValue(fakePost);
    mockDb.getStoreById.mockResolvedValue(fakeStore);
    mockDb.getSocialAccountsByPlatform.mockResolvedValue([]); // No accounts
    mockDb.updateSocialPost.mockResolvedValue(undefined);
    mockDb.createNotification.mockResolvedValue({ id: 1 });
    mockDb.createAgentTask.mockResolvedValue({ id: 1 });
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
    expect(mockDb.updateSocialPost).toHaveBeenCalledWith(42, { status: "failed" });
    expect(mockDb.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning", userId: 100 })
    );
  });

  it("throws when postId is missing from payload", async () => {
    // maxAttempts=1 so the job is immediately exhausted (no retry)
    const job = makeJob("publish_scheduled_social_post", {}, { maxAttempts: 1 });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    // getSocialPostById(undefined) returns null → handler throws 'not found'
    mockDb.getSocialPostById.mockResolvedValue(null);
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
    // updateJob is called twice: once to set status=running, once to set status=failed
    const calls = mockDb.updateJob.mock.calls;
    const failureCall = calls.find((c: any[]) => c[1]?.status === "failed");
    expect(failureCall).toBeDefined();
    expect(failureCall![1]).toMatchObject({ status: "failed", lastError: expect.stringContaining("postId") });
  });
});

// ─── Handler: fulfill_order ───────────────────────────────────────────────────
describe("processRunnableJobs — fulfill_order handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fulfills an order successfully", async () => {
    const job = makeJob("fulfill_order", { orderId: 101, storeId: 1 });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.getStoreById.mockResolvedValue(fakeStore);
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.processed).toBe(1);
    expect(mockFulfillOrder).toHaveBeenCalledWith(1, 101, undefined, undefined);
  });

  it("fails when orderId is missing", async () => {
    const job = makeJob("fulfill_order", { storeId: 1 });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
    expect(mockDb.updateJob).toHaveBeenCalledWith(
      job.id,
      expect.objectContaining({ lastError: expect.stringContaining("missing orderId") })
    );
  });

  it("notifies owner when fulfillment exhausts retries", async () => {
    const job = makeJob("fulfill_order", { orderId: 101, storeId: 1 }, { attempts: 2, maxAttempts: 3 });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.getStoreById.mockResolvedValue(fakeStore);
    mockDb.updateJob.mockResolvedValue(undefined);
    mockDb.createNotification.mockResolvedValue({ id: 1 });
    mockFulfillOrder.mockRejectedValueOnce(new Error("Platform API timeout"));

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
    expect(mockDb.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", userId: 100, actionUrl: "/orders" })
    );
  });
});

// ─── Handler: pricing_update ──────────────────────────────────────────────────
describe("processRunnableJobs — pricing_update handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates product price and creates agent task", async () => {
    const job = makeJob("pricing_update", { productId: 5, storeId: 1, newPriceCents: 2999, reason: "competitor drop" });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.updateProduct.mockResolvedValue(undefined);
    mockDb.createAgentTask.mockResolvedValue({ id: 1 });
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.processed).toBe(1);
    expect(mockDb.updateProduct).toHaveBeenCalledWith(5, { price: 2999 });
    expect(mockDb.createAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: "merchant", taskType: "pricing_update", status: "completed" })
    );
  });

  it("fails when required fields are missing", async () => {
    const job = makeJob("pricing_update", { productId: 5 }); // missing storeId and newPriceCents
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
  });
});

// ─── Handler: email_campaign ──────────────────────────────────────────────────
describe("processRunnableJobs — email_campaign handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches email campaign and creates notification", async () => {
    const job = makeJob("email_campaign", { storeId: 1, userId: 100, campaignType: "abandoned_cart" });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.createNotification.mockResolvedValue({ id: 1 });
    mockDb.createAgentTask.mockResolvedValue({ id: 1 });
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.processed).toBe(1);
    expect(mockDb.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 100, type: "info", actionUrl: "/marketing" })
    );
  });

  it("fails when storeId is missing", async () => {
    const job = makeJob("email_campaign", { userId: 100, campaignType: "welcome" });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
  });
});

// ─── Handler: report_generation ───────────────────────────────────────────────
describe("processRunnableJobs — report_generation handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates a report and creates agent task", async () => {
    const job = makeJob("report_generation", { userId: 100, weekStart: "2026-04-06" });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.createAgentTask.mockResolvedValue({ id: 1 });
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.processed).toBe(1);
    expect(mockDb.createAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: "merchant", taskType: "report_generation", status: "completed" })
    );
  });

  it("fails when weekStart is missing", async () => {
    const job = makeJob("report_generation", { userId: 100 });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
  });
});

// ─── Handler: webhook_delivery ────────────────────────────────────────────────
describe("processRunnableJobs — webhook_delivery handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delivers webhook successfully", async () => {
    const job = makeJob("webhook_delivery", {
      url: "https://example.com/webhook",
      payload: { event: "order.created", orderId: 1 },
      eventType: "order.created",
    });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.updateJob.mockResolvedValue(undefined);

    // Mock fetch globally
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await processRunnableJobs(1);
    expect(result.processed).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("fails when webhook endpoint returns non-2xx", async () => {
    const job = makeJob("webhook_delivery", {
      url: "https://example.com/webhook",
      payload: { event: "test" },
      eventType: "test",
    });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.updateJob.mockResolvedValue(undefined);

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
    expect(mockDb.updateJob).toHaveBeenCalledWith(
      job.id,
      expect.objectContaining({ lastError: expect.stringContaining("HTTP 503") })
    );
  });

  it("fails when url is missing", async () => {
    const job = makeJob("webhook_delivery", { payload: { event: "test" }, eventType: "test" });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
  });
});

// ─── Handler: niche_research ──────────────────────────────────────────────────
describe("processRunnableJobs — niche_research handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queues niche research as agent task", async () => {
    const job = makeJob("niche_research", { userId: 100, keyword: "minimalist home decor" });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.createAgentTask.mockResolvedValue({ id: 1 });
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.processed).toBe(1);
    expect(mockDb.createAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: "architect",
        taskType: "niche_research",
        title: expect.stringContaining("minimalist home decor"),
      })
    );
  });

  it("fails when keyword is missing", async () => {
    const job = makeJob("niche_research", { userId: 100 });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
  });
});

// ─── Unknown Job Type ─────────────────────────────────────────────────────────
describe("processRunnableJobs — unknown job type", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks unknown job types as failed with descriptive error", async () => {
    const job = makeJob("unknown_future_job_type", { data: "test" });
    mockDb.getRunnableJobs.mockResolvedValue([job]);
    mockDb.updateJob.mockResolvedValue(undefined);

    const result = await processRunnableJobs(1);
    expect(result.failed).toBe(1);
    expect(mockDb.updateJob).toHaveBeenCalledWith(
      job.id,
      expect.objectContaining({
        status: "failed",
        lastError: expect.stringContaining("No handler registered"),
      })
    );
  });
});

// ─── Enqueue Helpers ──────────────────────────────────────────────────────────
describe("Enqueue Helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enqueueFulfillOrderJob creates job with correct type and dedupeKey", async () => {
    mockDb.getJobByDedupeKey.mockResolvedValue(null);
    mockDb.createJob.mockResolvedValue(undefined);
    mockDb.getJobByDedupeKey.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1, jobType: "fulfill_order" });

    await enqueueFulfillOrderJob(101, 1, "TRACK123", "https://track.example.com");
    expect(mockDb.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: "fulfill_order", dedupeKey: "fulfill_order:101" })
    );
  });

  it("enqueuePricingUpdateJob creates job with correct dedupeKey", async () => {
    mockDb.getJobByDedupeKey.mockResolvedValue(null);
    mockDb.createJob.mockResolvedValue(undefined);

    await enqueuePricingUpdateJob(5, 1, 2999, "competitor drop");
    expect(mockDb.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: "pricing_update", dedupeKey: "pricing_update:5:2999" })
    );
  });

  it("enqueueReportGenerationJob creates job with correct dedupeKey", async () => {
    mockDb.getJobByDedupeKey.mockResolvedValue(null);
    mockDb.createJob.mockResolvedValue(undefined);

    await enqueueReportGenerationJob(100, "2026-04-06");
    expect(mockDb.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: "report_generation", dedupeKey: "report:100:2026-04-06" })
    );
  });

  it("enqueueNicheResearchJob creates job with correct dedupeKey", async () => {
    mockDb.getJobByDedupeKey.mockResolvedValue(null);
    mockDb.createJob.mockResolvedValue(undefined);

    await enqueueNicheResearchJob(100, "minimalist home decor");
    expect(mockDb.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: "niche_research", dedupeKey: "niche:100:minimalist home decor" })
    );
  });

  it("does not create duplicate jobs for same dedupeKey", async () => {
    const existingJob = { id: 1, jobType: "fulfill_order", status: "pending" };
    mockDb.getJobByDedupeKey.mockResolvedValue(existingJob);

    const result = await enqueueFulfillOrderJob(101, 1);
    expect(mockDb.createJob).not.toHaveBeenCalled();
    expect(result).toEqual(existingJob);
  });

  it("re-enqueues failed jobs (allows retry)", async () => {
    const failedJob = { id: 1, jobType: "fulfill_order", status: "failed" };
    mockDb.getJobByDedupeKey.mockResolvedValueOnce(failedJob).mockResolvedValueOnce({ id: 2, jobType: "fulfill_order" });
    mockDb.createJob.mockResolvedValue(undefined);

    await enqueueFulfillOrderJob(101, 1);
    expect(mockDb.createJob).toHaveBeenCalled(); // Should re-create for failed jobs
  });
});

// ─── enqueueDueScheduledPosts ─────────────────────────────────────────────────
describe("enqueueDueScheduledPosts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enqueues all due scheduled posts", async () => {
    mockDb.getDueScheduledPosts.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    mockDb.getJobByDedupeKey.mockResolvedValue(null);
    mockDb.createJob.mockResolvedValue(undefined);

    const result = await enqueueDueScheduledPosts();
    expect(result.duePosts).toBe(3);
    expect(mockDb.createJob).toHaveBeenCalledTimes(3);
  });

  it("returns zero when no posts are due", async () => {
    mockDb.getDueScheduledPosts.mockResolvedValue([]);

    const result = await enqueueDueScheduledPosts();
    expect(result.duePosts).toBe(0);
    expect(result.enqueued).toBe(0);
    expect(mockDb.createJob).not.toHaveBeenCalled();
  });
});
