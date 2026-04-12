import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the durable job queue engine and bot coordination engine.
 * These test the core logic without hitting the real DB — all db helpers are mocked.
 */

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
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
  getPendingBotEvents: vi.fn(),
  updateBotEvent: vi.fn(),
}));

// ─── Mock platformBridge ──────────────────────────────────────────────────────
vi.mock("../engine/platformBridge", () => ({
  publishSocialPost: vi.fn().mockResolvedValue({ success: true }),
}));

// ─── Mock retry ───────────────────────────────────────────────────────────────
vi.mock("../_core/retry", () => ({
  withResilience: (_key: string, fn: () => any) => fn(),
  withRetry: (fn: () => any) => fn(),
  withCircuitBreaker: (_key: string, fn: () => any) => fn(),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────
import * as db from "../db";
import { publishSocialPost } from "../engine/platformBridge";
import { enqueueDueScheduledPosts, processRunnableJobs } from "../engine/jobQueue";
import { processPendingBotEvents } from "../engine/botCoordination";

// Typed mock references
const mockDb = vi.mocked(db);
const mockPublishSocialPost = vi.mocked(publishSocialPost);

// ─── Test Data ────────────────────────────────────────────────────────────────
const fakePost = {
  id: 42,
  storeId: 1,
  platform: "instagram",
  content: "Check out our new product!",
  imageUrl: "https://example.com/product.jpg",
  scheduledAt: new Date("2026-04-12T10:00:00Z"),
  publishedAt: null,
  status: "scheduled",
  engagement: null,
  createdAt: new Date(),
};

const fakeStore = {
  id: 1,
  userId: 100,
  name: "Test Store",
  platform: "shopify",
  status: "active",
};

const fakeAccount = {
  id: 10,
  userId: 100,
  platform: "instagram",
  accountName: "testshop_ig",
  status: "active",
};

const fakeJob = {
  id: 1,
  jobType: "publish_scheduled_social_post",
  dedupeKey: "publish_social_post:42",
  status: "pending",
  payload: { postId: 42 },
  attempts: 0,
  maxAttempts: 4,
  runAt: new Date(),
  lastError: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeBotEvent = {
  id: 1,
  fromBot: "merchant",
  toBot: "social",
  eventType: "order_fulfilled_review_request",
  userId: 100,
  storeId: 1,
  payload: {
    orderId: 55,
    platformOrderId: "SH-1001",
    orderNumber: "#1001",
    totalAmountCents: 4999,
    currency: "USD",
    customerName: "John Doe",
  },
  status: "pending",
  error: null,
  processedAt: null,
  createdAt: new Date(),
};

// ─── Job Queue Tests ──────────────────────────────────────────────────────────
describe("jobQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enqueueDueScheduledPosts", () => {
    it("enqueues jobs for due posts", async () => {
      mockDb.getDueScheduledPosts.mockResolvedValue([fakePost]);
      mockDb.getJobByDedupeKey
        .mockResolvedValueOnce(null)       // first call: no existing job
        .mockResolvedValueOnce(fakeJob);   // second call: return newly created job
      mockDb.createJob.mockResolvedValue(undefined);

      const result = await enqueueDueScheduledPosts(new Date());
      expect(result.duePosts).toBe(1);
      expect(result.enqueued).toBe(1);
      expect(mockDb.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: "publish_scheduled_social_post",
          dedupeKey: "publish_social_post:42",
          payload: { postId: 42 },
        }),
      );
    });

    it("skips already-queued posts (deduplication)", async () => {
      mockDb.getDueScheduledPosts.mockResolvedValue([fakePost]);
      mockDb.getJobByDedupeKey.mockResolvedValue({ ...fakeJob, status: "running" });

      const result = await enqueueDueScheduledPosts(new Date());
      expect(result.duePosts).toBe(1);
      expect(result.enqueued).toBe(1);
      expect(mockDb.createJob).not.toHaveBeenCalled();
    });

    it("handles empty due posts", async () => {
      mockDb.getDueScheduledPosts.mockResolvedValue([]);

      const result = await enqueueDueScheduledPosts(new Date());
      expect(result.duePosts).toBe(0);
      expect(result.enqueued).toBe(0);
    });
  });

  describe("processRunnableJobs", () => {
    it("processes a job successfully and marks completed", async () => {
      mockDb.getRunnableJobs.mockResolvedValue([fakeJob]);
      mockDb.updateJob.mockResolvedValue(undefined);
      mockDb.getSocialPostById.mockResolvedValue(fakePost);
      mockDb.getStoreById.mockResolvedValue(fakeStore);
      mockDb.getSocialAccountsByPlatform.mockResolvedValue([fakeAccount]);
      mockDb.updateSocialPost.mockResolvedValue(undefined);
      mockDb.createAgentTask.mockResolvedValue({ id: 1 });

      const result = await processRunnableJobs(10);
      expect(result.total).toBe(1);
      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockPublishSocialPost).toHaveBeenCalledWith(
        10, // activeAccount.id
        expect.objectContaining({ content: "Check out our new product!" }),
        1, // post.storeId
      );
      expect(mockDb.updateJob).toHaveBeenCalledWith(
        fakeJob.id,
        expect.objectContaining({ status: "completed" }),
      );
    });

    it("fails a job when no social account is connected", async () => {
      mockDb.getRunnableJobs.mockResolvedValue([fakeJob]);
      mockDb.updateJob.mockResolvedValue(undefined);
      mockDb.getSocialPostById.mockResolvedValue(fakePost);
      mockDb.getStoreById.mockResolvedValue(fakeStore);
      mockDb.getSocialAccountsByPlatform.mockResolvedValue([]);
      mockDb.updateSocialPost.mockResolvedValue(undefined);
      mockDb.createNotification.mockResolvedValue({ id: 1 });
      mockDb.createAgentTask.mockResolvedValue({ id: 1 });

      const result = await processRunnableJobs(10);
      expect(result.failed).toBe(1);
    });

    it("skips already-published posts", async () => {
      const publishedPost = { ...fakePost, status: "published" };
      mockDb.getRunnableJobs.mockResolvedValue([fakeJob]);
      mockDb.updateJob.mockResolvedValue(undefined);
      mockDb.getSocialPostById.mockResolvedValue(publishedPost);

      const result = await processRunnableJobs(10);
      expect(result.processed).toBe(1);
      expect(mockPublishSocialPost).not.toHaveBeenCalled();
    });

    it("marks job as failed with unknown jobType", async () => {
      const unknownJob = { ...fakeJob, jobType: "unknown_type" };
      mockDb.getRunnableJobs.mockResolvedValue([unknownJob]);
      mockDb.updateJob.mockResolvedValue(undefined);

      const result = await processRunnableJobs(10);
      expect(result.failed).toBe(1);
      expect(mockDb.updateJob).toHaveBeenCalledWith(
        unknownJob.id,
        expect.objectContaining({
          status: "failed",
          lastError: expect.stringContaining("No handler"),
        }),
      );
    });

    it("handles exhausted retries by notifying user", async () => {
      const exhaustedJob = { ...fakeJob, attempts: 3, maxAttempts: 4 };
      mockDb.getRunnableJobs.mockResolvedValue([exhaustedJob]);
      mockDb.updateJob.mockResolvedValue(undefined);
      mockDb.getSocialPostById.mockResolvedValue(fakePost);
      mockDb.getStoreById.mockResolvedValue(fakeStore);
      mockDb.getSocialAccountsByPlatform.mockResolvedValue([fakeAccount]);
      mockPublishSocialPost.mockRejectedValueOnce(new Error("API rate limited"));
      mockDb.updateSocialPost.mockResolvedValue(undefined);
      mockDb.createNotification.mockResolvedValue({ id: 1 });
      mockDb.createAgentTask.mockResolvedValue({ id: 1 });

      const result = await processRunnableJobs(10);
      expect(result.failed).toBe(1);
      // Exhausted → marks post as failed and sends notification
      expect(mockDb.updateSocialPost).toHaveBeenCalledWith(
        fakePost.id,
        expect.objectContaining({ status: "failed" }),
      );
      expect(mockDb.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: fakeStore.userId,
          type: "error",
          title: expect.stringContaining("failed after retries"),
        }),
      );
    });

    it("returns empty result when no runnable jobs exist", async () => {
      mockDb.getRunnableJobs.mockResolvedValue([]);

      const result = await processRunnableJobs(10);
      expect(result.total).toBe(0);
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});

// ─── Bot Coordination Tests ───────────────────────────────────────────────────
describe("botCoordination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processPendingBotEvents", () => {
    it("processes order_fulfilled_review_request event", async () => {
      mockDb.getPendingBotEvents.mockResolvedValue([fakeBotEvent]);
      mockDb.getStoreById.mockResolvedValue(fakeStore);
      mockDb.createAgentTask.mockResolvedValue({ id: 1 });
      mockDb.createNotification.mockResolvedValue({ id: 1 });
      mockDb.updateBotEvent.mockResolvedValue(undefined);

      const result = await processPendingBotEvents(25);
      expect(result.total).toBe(1);
      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.ignored).toBe(0);

      expect(mockDb.createAgentTask).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "social",
          taskType: "post_purchase_engagement",
        }),
      );
      expect(mockDb.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 100,
          agentType: "social",
          title: expect.stringContaining("post-purchase growth opportunity"),
        }),
      );
      expect(mockDb.updateBotEvent).toHaveBeenCalledWith(
        fakeBotEvent.id,
        expect.objectContaining({ status: "processed" }),
      );
    });

    it("ignores unrecognized event types", async () => {
      const unknownEvent = { ...fakeBotEvent, eventType: "unknown_event_type" };
      mockDb.getPendingBotEvents.mockResolvedValue([unknownEvent]);
      mockDb.updateBotEvent.mockResolvedValue(undefined);

      const result = await processPendingBotEvents(25);
      expect(result.ignored).toBe(1);
      expect(result.processed).toBe(0);
      expect(mockDb.updateBotEvent).toHaveBeenCalledWith(
        unknownEvent.id,
        expect.objectContaining({
          status: "ignored",
          error: expect.stringContaining("No handler"),
        }),
      );
    });

    it("marks event as failed when handler throws", async () => {
      mockDb.getPendingBotEvents.mockResolvedValue([fakeBotEvent]);
      mockDb.getStoreById.mockResolvedValue(fakeStore);
      mockDb.createAgentTask.mockRejectedValueOnce(new Error("DB write failed"));
      mockDb.updateBotEvent.mockResolvedValue(undefined);

      const result = await processPendingBotEvents(25);
      expect(result.failed).toBe(1);
      expect(mockDb.updateBotEvent).toHaveBeenCalledWith(
        fakeBotEvent.id,
        expect.objectContaining({
          status: "failed",
          error: "DB write failed",
        }),
      );
    });

    it("handles empty event queue", async () => {
      mockDb.getPendingBotEvents.mockResolvedValue([]);

      const result = await processPendingBotEvents(25);
      expect(result.total).toBe(0);
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.ignored).toBe(0);
    });

    it("processes multiple events in sequence", async () => {
      const event2 = { ...fakeBotEvent, id: 2 };
      mockDb.getPendingBotEvents.mockResolvedValue([fakeBotEvent, event2]);
      mockDb.getStoreById.mockResolvedValue(fakeStore);
      mockDb.createAgentTask.mockResolvedValue({ id: 1 });
      mockDb.createNotification.mockResolvedValue({ id: 1 });
      mockDb.updateBotEvent.mockResolvedValue(undefined);

      const result = await processPendingBotEvents(25);
      expect(result.total).toBe(2);
      expect(result.processed).toBe(2);
      expect(mockDb.updateBotEvent).toHaveBeenCalledTimes(2);
    });
  });
});
