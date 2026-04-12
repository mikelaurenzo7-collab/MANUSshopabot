/**
 * Rate Limiting Middleware
 * In-memory sliding window rate limiter to protect API endpoints.
 * Prevents LLM cost blowouts and API abuse.
 *
 * Limits:
 *   - General tRPC: 120 req/min per user
 *   - Workflow launch (LLM-heavy): 10 req/min per user
 *   - Webhook endpoints: 500 req/min per IP (Shopify sends many)
 */

import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory store: key → { count, windowStart }
const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(store.entries())) {
    if (now - entry.windowStart > 120000) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  /** Window size in milliseconds */
  windowMs: number;
  /** Max requests per window */
  max: number;
  /** Key extractor function */
  keyFn?: (req: Request) => string;
  /** Message to return when rate limited */
  message?: string;
}

function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = "Too many requests. Please slow down." } = options;
  const keyFn = options.keyFn || ((req: Request) => {
    // Use user ID if authenticated, otherwise IP
    const userId = (req as any).user?.id;
    return userId ? `user:${userId}` : `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      // New window
      store.set(key, { count: 1, windowStart: now });
      return next();
    }

    entry.count++;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", Math.ceil((entry.windowStart + windowMs) / 1000));
      return res.status(429).json({ error: message, retryAfter });
    }

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", max - entry.count);
    return next();
  };
}

/**
 * General API rate limiter — 120 req/min per user/IP
 * Applied to all /api/trpc routes.
 */
export const generalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many API requests. Please wait a moment.",
});

/**
 * Workflow launch rate limiter — 10 req/min per user
 * Applied to workflow.launch mutations to prevent LLM cost blowouts.
 */
export const workflowRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyFn: (req: Request) => {
    // Extract user ID from tRPC context if available
    const userId = (req as any).user?.id || "anonymous";
    return `workflow:${userId}`;
  },
  message: "Workflow launch rate limit exceeded. Maximum 10 workflows per minute.",
});

/**
 * Webhook rate limiter — 500 req/min per IP
 * Shopify can send bursts of webhooks, so this is generous.
 */
export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 500,
  keyFn: (req: Request) => `webhook:${req.ip || "unknown"}`,
  message: "Webhook rate limit exceeded.",
});
