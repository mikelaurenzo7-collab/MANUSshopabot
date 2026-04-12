/**
 * ShopBOTS — Structured Logger
 *
 * A production-grade structured logger that emits JSON log lines with:
 * - ISO timestamps
 * - Log level (debug, info, warn, error)
 * - Correlation IDs (requestId, userId, storeId, agentType, traceId)
 * - Structured context fields for easy log aggregation
 *
 * Usage:
 *   import { logger } from "./_core/logger";
 *   logger.info("order_fulfilled", { orderId: 123, platform: "shopify" });
 *   logger.error("api_call_failed", { platform: "meta", error: err.message });
 *
 * With correlation context:
 *   const log = logger.withContext({ requestId: "abc123", userId: 42 });
 *   log.info("request_received", { path: "/api/trpc" });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  userId?: number;
  storeId?: number;
  agentType?: string;
  traceId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  context: LogContext;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const ACTIVE_LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[ACTIVE_LOG_LEVEL];
}

function emit(level: LogLevel, event: string, context: LogContext): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    event,
    context,
  };

  const line = JSON.stringify(entry);

  switch (level) {
    case "debug":
    case "info":
      process.stdout.write(line + "\n");
      break;
    case "warn":
      process.stderr.write(line + "\n");
      break;
    case "error":
      process.stderr.write(line + "\n");
      break;
  }
}

class Logger {
  private baseContext: LogContext;

  constructor(baseContext: LogContext = {}) {
    this.baseContext = baseContext;
  }

  /** Create a child logger with additional context fields merged in */
  withContext(context: LogContext): Logger {
    return new Logger({ ...this.baseContext, ...context });
  }

  debug(event: string, context: LogContext = {}): void {
    emit("debug", event, { ...this.baseContext, ...context });
  }

  info(event: string, context: LogContext = {}): void {
    emit("info", event, { ...this.baseContext, ...context });
  }

  warn(event: string, context: LogContext = {}): void {
    emit("warn", event, { ...this.baseContext, ...context });
  }

  error(event: string, context: LogContext = {}): void {
    emit("error", event, { ...this.baseContext, ...context });
  }
}

/** Global singleton logger — use this for all server-side logging */
export const logger = new Logger();

// ─── Request Correlation Middleware ──────────────────────────────────────────
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      log?: Logger;
    }
  }
}

/**
 * Express middleware that injects a unique requestId into every request
 * and attaches a child logger with the requestId pre-bound.
 *
 * Usage in server bootstrap:
 *   app.use(correlationMiddleware);
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string) || randomBytes(8).toString("hex");
  req.requestId = requestId;
  req.log = logger.withContext({ requestId });
  res.setHeader("x-request-id", requestId);
  next();
}
