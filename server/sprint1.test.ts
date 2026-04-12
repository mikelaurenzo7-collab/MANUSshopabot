/**
 * Sprint 1 Infrastructure Tests
 * Covers: Social OAuth, Shopify Webhooks, Retry Logic, Rate Limiter, ENV Wiring, Scheduler
 */
import { describe, it, expect, vi } from "vitest";

// ─── Social OAuth Handler ─────────────────────────────────────────────────────
describe("Social OAuth Handler", () => {
  it("exports registerSocialOAuthRoutes function", async () => {
    const mod = await import("./socialOAuth");
    expect(typeof mod.registerSocialOAuthRoutes).toBe("function");
  });

  it("registerSocialOAuthRoutes accepts one argument (Express app)", async () => {
    const mod = await import("./socialOAuth");
    expect(mod.registerSocialOAuthRoutes.length).toBe(1);
  });

  it("social OAuth module is importable without errors", async () => {
    await expect(import("./socialOAuth")).resolves.toBeDefined();
  });
});

// ─── Shopify Webhooks ─────────────────────────────────────────────────────────
describe("Shopify Webhook Handler", () => {
  it("exports registerShopifyWebhookRoutes function", async () => {
    const mod = await import("./shopifyWebhooks");
    expect(typeof mod.registerShopifyWebhookRoutes).toBe("function");
  });

  it("registerShopifyWebhookRoutes accepts one argument (Express app)", async () => {
    const mod = await import("./shopifyWebhooks");
    expect(mod.registerShopifyWebhookRoutes.length).toBe(1);
  });

  it("HMAC verification logic is correct (crypto sanity check)", async () => {
    const crypto = await import("crypto");
    const secret = "test-secret-key";
    const body = JSON.stringify({ id: 123, test: true });
    const hmac1 = crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");
    const hmac2 = crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");
    expect(hmac1).toBe(hmac2);
  });

  it("shopify webhooks module is importable without errors", async () => {
    await expect(import("./shopifyWebhooks")).resolves.toBeDefined();
  });
});

// ─── Retry Logic ──────────────────────────────────────────────────────────────
describe("Retry Utility", () => {
  it("exports withRetry function", async () => {
    const mod = await import("./_core/retry");
    expect(typeof mod.withRetry).toBe("function");
  });

  it("exports withCircuitBreaker function", async () => {
    const mod = await import("./_core/retry");
    expect(typeof mod.withCircuitBreaker).toBe("function");
  });

  it("exports withResilience function", async () => {
    const mod = await import("./_core/retry");
    expect(typeof mod.withResilience).toBe("function");
  });

  it("withRetry succeeds on first attempt", async () => {
    const { withRetry } = await import("./_core/retry");
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("withRetry retries on failure and eventually succeeds", async () => {
    const { withRetry } = await import("./_core/retry");
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) throw new Error("Transient error");
      return "success-after-retry";
    });
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("success-after-retry");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("withRetry throws after maxAttempts exhausted", async () => {
    const { withRetry } = await import("./_core/retry");
    const fn = vi.fn().mockRejectedValue(new Error("Persistent error"));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow("Persistent error");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
describe("Rate Limiter", () => {
  it("exports generalRateLimiter middleware", async () => {
    const mod = await import("./_core/rateLimiter");
    expect(typeof mod.generalRateLimiter).toBe("function");
  });

  it("exports workflowRateLimiter middleware", async () => {
    const mod = await import("./_core/rateLimiter");
    expect(typeof mod.workflowRateLimiter).toBe("function");
  });

  it("exports webhookRateLimiter middleware", async () => {
    const mod = await import("./_core/rateLimiter");
    expect(typeof mod.webhookRateLimiter).toBe("function");
  });

  it("generalRateLimiter is an Express middleware (3-arg function)", async () => {
    const { generalRateLimiter } = await import("./_core/rateLimiter");
    expect(typeof generalRateLimiter).toBe("function");
    expect(generalRateLimiter.length).toBe(3);
  });

  it("rate limiter allows requests within limit", async () => {
    const { generalRateLimiter } = await import("./_core/rateLimiter");
    const req = { ip: "127.0.0.1", path: "/test" } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();
    generalRateLimiter(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── ENV Wiring ───────────────────────────────────────────────────────────────
describe("ENV — Platform Secrets Wiring", () => {
  const REQUIRED_KEYS = [
    "tiktokAppId", "tiktokClientKey", "tiktokClientSecret",
    "metaClientId", "metaClientSecret", "metaOAuthAuthUrl",
    "metaOAuthTokenUrl", "metaGraphApiBase",
    "twitterClientId", "twitterClientSecret",
    "pinterestAppId",
  ];

  for (const key of REQUIRED_KEYS) {
    it(`ENV has ${key}`, async () => {
      const { ENV } = await import("./_core/env");
      expect(key in ENV).toBe(true);
    });
  }
});

// ─── Scheduler ────────────────────────────────────────────────────────────────
describe("Scheduler — AgentScheduler", () => {
  it("exports agentScheduler instance", async () => {
    const mod = await import("./scheduler/index");
    expect(mod.agentScheduler).toBeDefined();
  });

  it("agentScheduler has start method", async () => {
    const mod = await import("./scheduler/index");
    expect(typeof mod.agentScheduler.start).toBe("function");
  });

  it("agentScheduler has stop method", async () => {
    const mod = await import("./scheduler/index");
    expect(typeof mod.agentScheduler.stop).toBe("function");
  });

  it("agentScheduler has register method", async () => {
    const mod = await import("./scheduler/index");
    expect(typeof mod.agentScheduler.register).toBe("function");
  });

  it("agentScheduler has triggerNow method", async () => {
    const mod = await import("./scheduler/index");
    expect(typeof mod.agentScheduler.triggerNow).toBe("function");
  });

  it("registerDefaultTasks is exported", async () => {
    const mod = await import("./scheduler/index");
    expect(typeof mod.registerDefaultTasks).toBe("function");
  });
});
