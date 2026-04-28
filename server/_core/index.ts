import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerShopifyOAuthRoutes } from "../shopifyOAuth";
import { registerSocialOAuthRoutes } from "../socialOAuth";
import { registerEcommerceOAuthRoutes } from "../ecommerceOAuth";
import { registerToolOAuthRoutes } from "../toolOAuth";
import { registerShopifyWebhookRoutes } from "../shopifyWebhooks";
import { registerPlatformWebhookRoutes } from "../platformWebhooks";
import { registerStripeWebhook } from "../stripe/webhook";
import { registerSendGridWebhookRoutes } from "../sendgridWebhooks";
import { generalRateLimiter, webhookRateLimiter, workflowRateLimiter } from "./rateLimiter";
import { correlationMiddleware, logger } from "./logger";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { agentScheduler, registerDefaultTasks } from "../scheduler";
import { seedDefaultPlugins } from "../seedPlugins";
import { validateRequiredEnv } from "./env";
import { getDb } from "../db";
import { initializeQueues, shutdownQueues } from "../queue/init";
import { getQueueHealth } from "../queue/config";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // ─── Fail-fast: validate required environment variables ────────────────
  validateRequiredEnv();

  const app = express();
  const server = createServer(app);

  // ─── Hardening basics ───────────────────────────────────────────────────
  // Hide framework fingerprint and trust the upstream proxy/load balancer so
  // `req.ip` reflects the real client (used by the rate limiter).
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  // ─── Security Headers (helmet) ──────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));

  // ─── CORS ───────────────────────────────────────────────────────────────
  // Production must declare ALLOWED_ORIGINS explicitly. Falling back to
  // localhost in prod is a footgun: production traffic gets rejected,
  // and a localhost-running attacker would trivially get CORS access.
  // Fail loud at boot — Manus surfaces the missing env var immediately
  // instead of users hitting CORS errors after deploy.
  const rawOrigins = process.env.ALLOWED_ORIGINS;
  if (process.env.NODE_ENV === "production" && !rawOrigins) {
    throw new Error(
      "[CORS] NODE_ENV=production but ALLOWED_ORIGINS is not set. " +
      "Set ALLOWED_ORIGINS to a comma-separated list of production origins " +
      "(e.g. https://app.shopabot.com) in your Manus secrets store.",
    );
  }
  const allowedOrigins = rawOrigins
    ? rawOrigins.split(",").map(o => o.trim()).filter(Boolean)
    : ["http://localhost:3000", "http://localhost:5173"];
  app.use(cors({
    origin: process.env.NODE_ENV === "production"
      ? allowedOrigins
      : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }));

  app.get("/api/health", async (_req, res) => {
    const db = await getDb();
    const schedulerStatus = agentScheduler.getStatus();
    const runningTasks = schedulerStatus.filter(task => task.isRunning).length;
    const scheduledTasks = schedulerStatus.filter(task => task.isScheduled).length;

    // Queue health is best-effort: if Redis is down we still want to return a
    // health response (degraded), not hang. Cap the probe at 1.5s.
    type QueueHealth =
      | Awaited<ReturnType<typeof getQueueHealth>>
      | { redis: { connected: false; error: string }; queues: null };
    let queueHealth: QueueHealth = {
      redis: { connected: false, error: "not_probed" },
      queues: null,
    };
    try {
      queueHealth = await Promise.race<QueueHealth>([
        getQueueHealth(),
        new Promise<QueueHealth>((resolve) =>
          setTimeout(
            () => resolve({ redis: { connected: false, error: "probe_timeout" }, queues: null }),
            1500,
          ),
        ),
      ]);
    } catch (err) {
      queueHealth = {
        redis: { connected: false, error: err instanceof Error ? err.message : String(err) },
        queues: null,
      };
    }

    const dbOk = Boolean(db);
    const status = dbOk ? "ok" : "degraded";

    res.status(status === "ok" ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        connected: dbOk,
      },
      scheduler: {
        registeredTasks: schedulerStatus.length,
        scheduledTasks,
        runningTasks,
        tasks: schedulerStatus,
      },
      queue: queueHealth,
    });
  });

  // Lightweight liveness probe at /health and /healthz — doesn't touch
  // the DB or queue, so it stays fast and stays UP when those layers
  // hiccup. Manus's load balancer probes one of these by convention;
  // /api/health (above) is the deep readiness endpoint.
  app.get(["/health", "/healthz"], (_req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // Inject requestId + child logger into every request for distributed tracing
  app.use(correlationMiddleware);
  // Stripe webhook MUST receive raw body for signature verification — register BEFORE express.json()
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), (req: any, _res: any, next: any) => {
    req.rawBody = req.body;
    next();
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Rate limiting — protect API and webhook endpoints
  app.use("/api/trpc", generalRateLimiter);
  app.use("/api/webhooks", webhookRateLimiter);
  app.use("/api/trpc/workflows", workflowRateLimiter); // stricter: 10 launches/min per user
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Shopify OAuth for user store connections
  registerShopifyOAuthRoutes(app);
  // Social platform OAuth callbacks (Meta, TikTok, Twitter, Pinterest)
  registerSocialOAuthRoutes(app);
  // E-commerce platform OAuth callbacks (Etsy, Amazon, eBay, TikTok Shop)
  registerEcommerceOAuthRoutes(app);
  // Tool connector OAuth callbacks (Google Sheets, GA4)
  registerToolOAuthRoutes(app);
  // Shopify webhook handlers (orders/create, orders/paid, products/update, inventory)
  registerShopifyWebhookRoutes(app);
  // Etsy + TikTok Shop webhook handlers (orders, products, inventory)
  registerPlatformWebhookRoutes(app);
  // Stripe webhook (subscription lifecycle: created, updated, canceled, payment_failed)
  registerStripeWebhook(app);
  // SendGrid Event Webhook — delivered/open/click/bounce/dropped/etc.
  registerSendGridWebhookRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ─── Unknown /api/* routes → JSON 404 (do not fall through to the SPA) ──
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next();
    res.status(404).json({ error: "not_found", path: req.originalUrl });
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ─── Global error handler (must be the last middleware) ─────────────────
  // Catches sync + async errors thrown from any route or middleware. Returns
  // JSON for /api/* paths and a generic 500 elsewhere; logs structured.
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const log = (req as any).log ?? logger;
    log.error("request_error", {
      path: req.originalUrl,
      method: req.method,
      error: err?.message ?? String(err),
      stack: err?.stack,
    });
    if (res.headersSent) {
      return;
    }
    const status = typeof err?.status === "number" ? err.status : 500;
    if (req.originalUrl.startsWith("/api/")) {
      res.status(status).json({ error: "internal_server_error" });
    } else {
      res.status(status).type("text/plain").send("Internal Server Error");
    }
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logger.warn("server_port_fallback", { preferredPort, actualPort: port });
  }

  server.listen(port, () => {
    logger.info("server_started", { port, url: `http://localhost:${port}/` });
    // Initialize BullMQ queues for webhook processing
    initializeQueues().catch((err) => {
      logger.error("queue_initialization_failed", { error: err?.message ?? String(err) });
    });
    // Start the bot task scheduler
    registerDefaultTasks();
    agentScheduler.start();
    logger.info("scheduler_initialized", { taskCount: agentScheduler.getStatus().length });
    // Seed default plugins (idempotent — skips if already populated)
    seedDefaultPlugins().then((r) => {
      if (r.seeded) logger.info("plugins_seeded", { count: r.count });
    });
  });

  // ─── Graceful shutdown ──────────────────────────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("server_shutdown_requested", { signal });
    // Stop pulling new work first.
    try {
      agentScheduler.stop();
    } catch (err) {
      logger.error("scheduler_shutdown_failed", { error: err instanceof Error ? err.message : String(err) });
    }
    // Drain queues, then close HTTP server.
    try {
      await shutdownQueues();
    } catch (err) {
      logger.error("queue_shutdown_failed", { error: err instanceof Error ? err.message : String(err) });
    }
    server.close(() => {
      logger.info("server_shutdown_complete", { signal });
      process.exit(0);
    });
    // Hard-exit safety net so a hung connection cannot block redeploy. We
    // exit non-zero here because reaching this branch means the graceful
    // shutdown sequence (queues + HTTP server close) did NOT complete in
    // time — process supervisors should treat that as an unclean exit.
    setTimeout(() => {
      logger.error("server_shutdown_forced", { signal });
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.on("SIGINT", () => { void shutdown("SIGINT"); });

  // Surface async errors that escape every other handler instead of dying
  // silently. We log structured and keep running — the orchestrator/scheduler
  // is resilient to individual job failures.
  process.on("unhandledRejection", (reason: unknown) => {
    logger.error("unhandled_rejection", {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
  process.on("uncaughtException", (err: Error) => {
    logger.error("uncaught_exception", { error: err.message, stack: err.stack });
  });
}

startServer().catch((err) => {
  logger.error("server_fatal", { error: err?.message ?? String(err), stack: err?.stack });
  process.exit(1);
});
