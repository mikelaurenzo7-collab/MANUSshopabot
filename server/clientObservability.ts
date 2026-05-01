/**
 * Client observability — minimal self-hosted error + Core Web Vitals
 * ingestion. Two POST endpoints, both gated behind a tight rate limiter
 * because they accept unauthenticated input from every page load.
 *
 *   POST /api/client-errors  → ErrorBoundary + global error handlers
 *   POST /api/web-vitals     → LCP / CLS / INP / TTFB / FCP samples
 *
 * Why self-host instead of pulling in @sentry/react?
 *   - No external SaaS dep / DSN secret required.
 *   - No bundle weight from the SDK (Sentry's react SDK is ~50KB gz).
 *   - Stays inside the Manus-friendly "minimal external deps" envelope.
 *
 * Payloads are sanitized + truncated server-side as a defense in depth:
 * the client lib also caps lengths, but never trust the wire. Logs go
 * through the structured `logger` so Manus's log pipeline can surface
 * them under the existing `correlationId` tracing.
 */

import type { Express, Request, Response } from "express";
import { logger } from "./_core/logger";

// ── Field length caps ───────────────────────────────────────────────────────
// Generous enough to retain useful debugging signal; tight enough to
// stop a malicious / runaway client from filling the log pipeline.
const MAX_MESSAGE = 2_000;
const MAX_STACK = 8_000;
const MAX_COMPONENT_STACK = 4_000;
const MAX_URL = 2_000;
const MAX_USER_AGENT = 512;
const MAX_LABEL = 80;
const MAX_NAME = 32;
const MAX_NAV_TYPE = 32;
const MAX_RATING = 16;

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length === 0) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

function clipNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

// ── In-memory rate limiter (per IP) ─────────────────────────────────────────
// Independent from the general API limiter because these endpoints fire
// once per page load (vitals) or once per render error (errors), so we
// want a separate window. A 5-minute window with a per-IP cap keeps
// honest operators well under the limit while choking off floods.
interface Bucket {
  count: number;
  windowStart: number;
}

const errorBucket = new Map<string, Bucket>();
const vitalsBucket = new Map<string, Bucket>();

const ERROR_WINDOW_MS = 5 * 60 * 1000;
const ERROR_MAX = 60;
const VITALS_WINDOW_MS = 5 * 60 * 1000;
const VITALS_MAX = 240;

function cleanupExpired(bucket: Map<string, Bucket>, windowMs: number): void {
  const now = Date.now();
  for (const [key, entry] of Array.from(bucket.entries())) {
    if (now - entry.windowStart > windowMs * 2) bucket.delete(key);
  }
}

setInterval(() => {
  cleanupExpired(errorBucket, ERROR_WINDOW_MS);
  cleanupExpired(vitalsBucket, VITALS_WINDOW_MS);
}, 5 * 60 * 1000).unref?.();

function rateLimit(
  bucket: Map<string, Bucket>,
  key: string,
  windowMs: number,
  max: number,
): boolean {
  const now = Date.now();
  const entry = bucket.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    bucket.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

function clientKey(req: Request): string {
  return `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
}

export function registerClientObservabilityRoutes(app: Express): void {
  // ── /api/client-errors ───────────────────────────────────────────────────
  // Body: { message, stack?, componentStack?, url?, userAgent?, label? }
  // The server only logs — it does not persist to DB. A future migration
  // can move this to a `client_errors` table once the schema settles.
  app.post("/api/client-errors", (req: Request, res: Response) => {
    const key = clientKey(req);
    if (!rateLimit(errorBucket, key, ERROR_WINDOW_MS, ERROR_MAX)) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const message = clip(body.message, MAX_MESSAGE);
    if (!message) {
      res.status(400).json({ error: "message_required" });
      return;
    }

    const sanitized = {
      message,
      stack: clip(body.stack, MAX_STACK),
      componentStack: clip(body.componentStack, MAX_COMPONENT_STACK),
      url: clip(body.url, MAX_URL),
      userAgent: clip(body.userAgent, MAX_USER_AGENT),
      label: clip(body.label, MAX_LABEL),
      ip: key,
    };

    const log = (req as any).log ?? logger;
    log.error("client_error_reported", sanitized);

    res.status(204).end();
  });

  // ── /api/web-vitals ──────────────────────────────────────────────────────
  // Body: { name, value, id?, delta?, rating?, navigationType?, url? }
  app.post("/api/web-vitals", (req: Request, res: Response) => {
    const key = clientKey(req);
    if (!rateLimit(vitalsBucket, key, VITALS_WINDOW_MS, VITALS_MAX)) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = clip(body.name, MAX_NAME);
    const value = clipNumber(body.value);
    if (!name || value === undefined) {
      res.status(400).json({ error: "name_and_value_required" });
      return;
    }

    const sanitized = {
      name,
      value,
      delta: clipNumber(body.delta),
      rating: clip(body.rating, MAX_RATING),
      navigationType: clip(body.navigationType, MAX_NAV_TYPE),
      url: clip(body.url, MAX_URL),
      ip: key,
    };

    const log = (req as any).log ?? logger;
    log.info("web_vital_reported", sanitized);

    res.status(204).end();
  });
}

// Exported for tests so they can reset state between runs.
export const __testInternals = {
  errorBucket,
  vitalsBucket,
  ERROR_MAX,
  VITALS_MAX,
  ERROR_WINDOW_MS,
  VITALS_WINDOW_MS,
};
