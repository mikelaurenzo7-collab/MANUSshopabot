/**
 * Sprint 16 Tests — Token Bucket Rate Limiter + Scheduler Refactor + BeastBots Brand
 */
import { describe, it, expect, vi } from "vitest";

// ─── Token Bucket Rate Limiter Tests ──────────────────────────────────────

describe("TokenBucket", () => {
  it("exports TokenBucket class and platformBuckets", async () => {
    const mod = await import("./utils/tokenBucket");
    expect(mod.TokenBucket).toBeDefined();
    expect(mod.platformBuckets).toBeDefined();
    expect(mod.getBucket).toBeDefined();
    expect(mod.getAllBucketMetrics).toBeDefined();
  });

  it("creates a bucket with correct capacity and refill rate", async () => {
    const { TokenBucket } = await import("./utils/tokenBucket");
    const bucket = new TokenBucket({
      capacity: 10,
      refillRate: 2,
      refillIntervalMs: 1000,
      platformName: "test",
    });
    expect(bucket.capacity).toBe(10);
    expect(bucket.refillRate).toBe(2);
    expect(bucket.refillIntervalMs).toBe(1000);
    expect(bucket.platformName).toBe("test");
  });

  it("starts full and allows consuming tokens", async () => {
    const { TokenBucket } = await import("./utils/tokenBucket");
    const bucket = new TokenBucket({
      capacity: 5,
      refillRate: 1,
      refillIntervalMs: 1000,
      platformName: "test",
    });
    expect(bucket.available).toBe(5);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.available).toBe(4);
  });

  it("rejects when tokens are exhausted", async () => {
    const { TokenBucket } = await import("./utils/tokenBucket");
    const bucket = new TokenBucket({
      capacity: 2,
      refillRate: 1,
      refillIntervalMs: 100000, // Very slow refill
      platformName: "test",
    });
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false); // Exhausted
  });

  it("tryConsume with count > 1 works correctly", async () => {
    const { TokenBucket } = await import("./utils/tokenBucket");
    const bucket = new TokenBucket({
      capacity: 10,
      refillRate: 1,
      refillIntervalMs: 100000,
      platformName: "test",
    });
    expect(bucket.tryConsume(5)).toBe(true);
    expect(bucket.available).toBe(5);
    expect(bucket.tryConsume(6)).toBe(false); // Not enough
    expect(bucket.tryConsume(5)).toBe(true);
    expect(bucket.available).toBe(0);
  });

  it("tracks metrics correctly", async () => {
    const { TokenBucket } = await import("./utils/tokenBucket");
    const bucket = new TokenBucket({
      capacity: 3,
      refillRate: 1,
      refillIntervalMs: 100000,
      platformName: "metrics-test",
    });
    bucket.tryConsume(); // success
    bucket.tryConsume(); // success
    bucket.tryConsume(); // success
    bucket.tryConsume(); // fail — throttled

    const metrics = bucket.metrics;
    expect(metrics.platform).toBe("metrics-test");
    expect(metrics.totalRequests).toBe(4);
    expect(metrics.totalThrottled).toBe(1);
    expect(metrics.throttleRate).toBeCloseTo(0.25);
  });

  it("resetMetrics clears counters", async () => {
    const { TokenBucket } = await import("./utils/tokenBucket");
    const bucket = new TokenBucket({
      capacity: 2,
      refillRate: 1,
      refillIntervalMs: 100000,
      platformName: "reset-test",
    });
    bucket.tryConsume();
    bucket.tryConsume();
    bucket.tryConsume(); // throttled
    expect(bucket.metrics.totalRequests).toBe(3);

    bucket.resetMetrics();
    expect(bucket.metrics.totalRequests).toBe(0);
    expect(bucket.metrics.totalThrottled).toBe(0);
    expect(bucket.metrics.totalWaitMs).toBe(0);
  });

  it("has pre-configured buckets for all major platforms", async () => {
    const { platformBuckets } = await import("./utils/tokenBucket");
    const expectedPlatforms = [
      "shopify", "woocommerce", "amazon", "ebay", "etsy",
      "tiktok_shop", "walmart", "meta", "instagram", "tiktok",
      "twitter", "pinterest", "google_ads", "youtube",
    ];
    for (const p of expectedPlatforms) {
      expect(platformBuckets[p]).toBeDefined();
      expect(platformBuckets[p].capacity).toBeGreaterThan(0);
      expect(platformBuckets[p].refillRate).toBeGreaterThan(0);
    }
  });

  it("getBucket returns configured bucket or creates a default", async () => {
    const { getBucket, platformBuckets } = await import("./utils/tokenBucket");
    // Known platform
    expect(getBucket("shopify")).toBe(platformBuckets.shopify);
    // Unknown platform — creates a default
    const unknown = getBucket("some_new_platform");
    expect(unknown).toBeDefined();
    expect(unknown.capacity).toBe(10); // default capacity
  });

  it("getAllBucketMetrics returns metrics for all platforms", async () => {
    const { getAllBucketMetrics } = await import("./utils/tokenBucket");
    const metrics = getAllBucketMetrics();
    expect(metrics.length).toBeGreaterThan(10);
    for (const m of metrics) {
      expect(m.platform).toBeDefined();
      expect(m.capacity).toBeGreaterThan(0);
    }
  });

  it("waitForToken resolves immediately when tokens available", async () => {
    const { TokenBucket } = await import("./utils/tokenBucket");
    const bucket = new TokenBucket({
      capacity: 5,
      refillRate: 1,
      refillIntervalMs: 1000,
      platformName: "wait-test",
    });
    const waited = await bucket.waitForToken();
    expect(waited).toBe(0);
    expect(bucket.available).toBe(4);
  });

  it("waitForToken throws when max wait exceeded", async () => {
    const { TokenBucket } = await import("./utils/tokenBucket");
    const bucket = new TokenBucket({
      capacity: 1,
      refillRate: 1,
      refillIntervalMs: 60000, // 1 token per 60 seconds
      platformName: "timeout-test",
    });
    bucket.tryConsume(); // Exhaust the single token

    await expect(bucket.waitForToken(100)).rejects.toThrow("Rate limit exceeded");
  });
});

// ─── Scheduler Task Module Tests ──────────────────────────────────────────

describe("Scheduler Task Modules", () => {
  it("merchant module exports all expected handlers", async () => {
    const mod = await import("./scheduler/tasks/merchant");
    expect(mod.handleInventoryCheck).toBeInstanceOf(Function);
    expect(mod.handleOrderFulfillment).toBeInstanceOf(Function);
    expect(mod.handleProductSync).toBeInstanceOf(Function);
  });

  it("social module exports all expected handlers", async () => {
    const mod = await import("./scheduler/tasks/social");
    expect(mod.handleAdMonitoring).toBeInstanceOf(Function);
    expect(mod.handleScheduledPosts).toBeInstanceOf(Function);
    expect(mod.handleSeoAudit).toBeInstanceOf(Function);
    expect(mod.handleEmailRecovery).toBeInstanceOf(Function);
    expect(mod.handleBotCoordination).toBeInstanceOf(Function);
  });

  it("architect module exports all expected handlers", async () => {
    const mod = await import("./scheduler/tasks/architect");
    expect(mod.handleStoreHealthCheck).toBeInstanceOf(Function);
    expect(mod.handleTokenRefresh).toBeInstanceOf(Function);
    expect(mod.handleCompetitorScan).toBeInstanceOf(Function);
  });

  it("system module exports all expected handlers", async () => {
    const mod = await import("./scheduler/tasks/system");
    expect(mod.handleJobQueue).toBeInstanceOf(Function);
    expect(mod.handleOAuthStateCleanup).toBeInstanceOf(Function);
    expect(mod.handleInventoryAwareAdPause).toBeInstanceOf(Function);
    expect(mod.handleDynamicPricing).toBeInstanceOf(Function);
    expect(mod.handleCreativeVelocity).toBeInstanceOf(Function);
    expect(mod.handleAnomalyDetection).toBeInstanceOf(Function);
    expect(mod.handleDLQProcessor).toBeInstanceOf(Function);
  });

  it("barrel index re-exports all handlers", async () => {
    const mod = await import("./scheduler/tasks/index");
    // Merchant
    expect(mod.handleInventoryCheck).toBeInstanceOf(Function);
    expect(mod.handleOrderFulfillment).toBeInstanceOf(Function);
    expect(mod.handleProductSync).toBeInstanceOf(Function);
    // Social
    expect(mod.handleAdMonitoring).toBeInstanceOf(Function);
    expect(mod.handleScheduledPosts).toBeInstanceOf(Function);
    expect(mod.handleSeoAudit).toBeInstanceOf(Function);
    expect(mod.handleEmailRecovery).toBeInstanceOf(Function);
    expect(mod.handleBotCoordination).toBeInstanceOf(Function);
    // Architect
    expect(mod.handleStoreHealthCheck).toBeInstanceOf(Function);
    expect(mod.handleTokenRefresh).toBeInstanceOf(Function);
    expect(mod.handleCompetitorScan).toBeInstanceOf(Function);
    // System
    expect(mod.handleJobQueue).toBeInstanceOf(Function);
    expect(mod.handleOAuthStateCleanup).toBeInstanceOf(Function);
    expect(mod.handleInventoryAwareAdPause).toBeInstanceOf(Function);
    expect(mod.handleDynamicPricing).toBeInstanceOf(Function);
    expect(mod.handleCreativeVelocity).toBeInstanceOf(Function);
    expect(mod.handleAnomalyDetection).toBeInstanceOf(Function);
    expect(mod.handleDLQProcessor).toBeInstanceOf(Function);
  });
});

// ─── Scheduler Index Tests ────────────────────────────────────────────────

describe("Scheduler Index (refactored)", () => {
  it("exports agentScheduler singleton and registerDefaultTasks", async () => {
    const mod = await import("./scheduler/index");
    expect(mod.agentScheduler).toBeDefined();
    expect(mod.registerDefaultTasks).toBeInstanceOf(Function);
  });

  it("registerDefaultTasks registers all 18 tasks", async () => {
    const { agentScheduler, registerDefaultTasks } = await import("./scheduler/index");
    registerDefaultTasks();
    const status = agentScheduler.getStatus();
    expect(status.length).toBeGreaterThanOrEqual(18);

    // Verify key tasks exist
    const taskIds = status.map(s => s.id);
    expect(taskIds).toContain("merchant:inventory-check");
    expect(taskIds).toContain("merchant:order-fulfillment");
    expect(taskIds).toContain("merchant:product-sync");
    expect(taskIds).toContain("social:scheduled-posts");
    expect(taskIds).toContain("social:ad-performance");
    expect(taskIds).toContain("social:seo-audit");
    expect(taskIds).toContain("social:email-recovery");
    expect(taskIds).toContain("architect:store-health");
    expect(taskIds).toContain("architect:token-refresh");
    expect(taskIds).toContain("architect:competitor-scan");
    expect(taskIds).toContain("merchant:inventory-aware-ad-pause");
    expect(taskIds).toContain("merchant:dynamic-pricing");
    expect(taskIds).toContain("social:creative-velocity");
    expect(taskIds).toContain("system:anomaly-detection");
    expect(taskIds).toContain("system:dlq-processor");
    expect(taskIds).toContain("system:bot-coordination");
    expect(taskIds).toContain("system:job-queue");
    expect(taskIds).toContain("system:oauth-state-cleanup");
  });

  it("all registered tasks have valid cron expressions", async () => {
    const cron = await import("node-cron");
    const { agentScheduler, registerDefaultTasks } = await import("./scheduler/index");
    registerDefaultTasks();
    const status = agentScheduler.getStatus();
    for (const task of status) {
      expect(cron.validate(task.cronExpression)).toBe(true);
    }
  });
});

// ─── Platform Bridge Token Bucket Integration Tests ───────────────────────

describe("Platform Bridge + Token Bucket Integration", () => {
  it("platformBridge imports getBucket from tokenBucket", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/engine/platformBridge.ts", "utf-8")
    );
    expect(src).toContain('import { getBucket } from "../utils/tokenBucket"');
    expect(src).toContain("getBucket(");
  });

  it("platformBridge calls waitForToken before every external API call", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/engine/platformBridge.ts", "utf-8")
    );
    // Count waitForToken calls — should match withResilience calls
    const waitCalls = (src.match(/getBucket\([^)]+\)\.waitForToken\(\)/g) || []).length;
    const resilienceCalls = (src.match(/withResilience\(/g) || []).length;
    expect(waitCalls).toBe(resilienceCalls);
  });
});

// ─── BeastBots Brand Consistency Tests ────────────────────────────────────

describe("BeastBots Brand Consistency", () => {
  it("index.html uses BeastBots in title and meta tags", async () => {
    const fs = await import("fs");
    const html = fs.readFileSync("client/index.html", "utf-8");
    expect(html).toContain("BeastBots");
    expect(html).not.toContain("Beast Bots");
    expect(html).not.toContain("ShopBOTS");
    expect(html).not.toContain("ShopBots");
  });

  it("Landing.tsx uses BeastBots brand", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/Landing.tsx", "utf-8");
    expect(src).toContain("BeastBots");
    expect(src).not.toContain("Beast Bots");
  });

  it("DashboardLayout.tsx fallback uses BeastBots", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/components/DashboardLayout.tsx", "utf-8");
    expect(src).toContain('"BeastBots"');
    expect(src).not.toContain('"Beast Bots"');
  });

  it("scheduler/index.ts header uses BeastBots", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/scheduler/index.ts", "utf-8");
    expect(src).toContain("BeastBots");
  });
});
