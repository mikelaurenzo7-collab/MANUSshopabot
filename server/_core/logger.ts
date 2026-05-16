/**
 * Shop_a_Bot — Structured Logger (powered by Pino in production)
 *
 * Keeps the same external API (logger.info/warn/error/debug + withContext).
 * In production: uses Pino for high-performance JSON logging with transport support.
 * In test: writes directly to process.stdout/stderr with the expected JSON shape
 *   { ts, level, event, context } so that vi.spyOn(process.stdout, 'write') works.
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
import pino from "pino";

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

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
const isDev = !isTest && process.env.NODE_ENV !== "production";
const activeLevel = (process.env.LOG_LEVEL as LogLevel) || (isDev ? "debug" : "info");

// ─── Pino root instance (used in dev/production only) ──────────────────────────────
const pinoRoot = isTest
  ? null
  : pino({
      level: activeLevel,
      ...(isDev && {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
            messageKey: "event",
          },
        },
      }),
      messageKey: "event",
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label: string) {
          return { level: label };
        },
      },
    });

// ─── Direct-write helper (test mode only) ────────────────────────────────────────────
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  const minLevel = (process.env.LOG_LEVEL as LogLevel) || "debug";
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

function emitDirect(level: LogLevel, event: string, context: LogContext): void {
  if (!shouldLog(level)) return;
  const entry: LogEntry = { ts: new Date().toISOString(), level, event, context };
  const line = JSON.stringify(entry) + "\n";
  if (level === "debug" || level === "info") {
    process.stdout.write(line);
  } else {
    process.stderr.write(line);
  }
}

class Logger {
  private pinoChild: pino.Logger | null;
  private baseContext: LogContext;

  constructor(baseContext: LogContext = {}, pinoChild: pino.Logger | null = null) {
    this.baseContext = baseContext;
    if (isTest) {
      this.pinoChild = null;
    } else {
      this.pinoChild = pinoChild ?? (Object.keys(baseContext).length ? pinoRoot!.child(baseContext) : pinoRoot);
    }
  }

  /** Create a child logger with additional context fields merged in */
  withContext(context: LogContext): Logger {
    if (isTest) {
      return new Logger({ ...this.baseContext, ...context }, null);
    }
    const child = this.pinoChild!.child(context);
    return new Logger({ ...this.baseContext, ...context }, child);
  }

  debug(event: string, context: LogContext = {}): void {
    if (isTest) { emitDirect("debug", event, { ...this.baseContext, ...context }); return; }
    this.pinoChild!.debug(context, event);
  }

  info(event: string, context: LogContext = {}): void {
    if (isTest) { emitDirect("info", event, { ...this.baseContext, ...context }); return; }
    this.pinoChild!.info(context, event);
  }

  warn(event: string, context: LogContext = {}): void {
    if (isTest) { emitDirect("warn", event, { ...this.baseContext, ...context }); return; }
    this.pinoChild!.warn(context, event);
  }

  error(event: string, context: LogContext = {}): void {
    if (isTest) { emitDirect("error", event, { ...this.baseContext, ...context }); return; }
    this.pinoChild!.error(context, event);
  }
}

/** Global singleton logger — use this for all server-side logging */
export const logger = new Logger();

/**
 * Production-safe stack-trace extractor. Stack traces leak variable
 * names, line numbers, and minified bundle structure that an attacker
 * can use to map the codebase. They're invaluable in dev / staging
 * but pure information disclosure in production where logs may flow
 * to a less-trusted aggregator.
 *
 * Usage:
 *   logger.error("workflow_failed", {
 *     error: err.message,
 *     stack: safeErrorStack(err),
 *   });
 *
 * Returns the stack string in non-production environments and
 * `undefined` in production (which the structured logger drops from
 * the JSON envelope, keeping logs clean). The error message is
 * always safe to log — that's why this helper is stack-only.
 */
export function safeErrorStack(err: unknown): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  if (err instanceof Error && typeof err.stack === "string") return err.stack;
  return undefined;
}

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
