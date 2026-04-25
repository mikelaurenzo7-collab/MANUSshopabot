import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerShopifyOAuthRoutes } from "../shopifyOAuth";
import { registerSocialOAuthRoutes } from "../socialOAuth";
import { registerEcommerceOAuthRoutes } from "../ecommerceOAuth";
import { registerShopifyWebhookRoutes } from "../shopifyWebhooks";
import { registerStripeWebhook } from "../stripe/webhook";
import { generalRateLimiter, webhookRateLimiter } from "./rateLimiter";
import { correlationMiddleware, logger } from "./logger";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { agentScheduler, registerDefaultTasks } from "../scheduler";
import { seedDefaultPlugins } from "../seedPlugins";
import { validateRequiredEnv } from "./env";
import { getDb } from "../db";
import { initializeQueues, shutdownQueues } from "../queue/init";

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

  // ─── Security Headers (helmet) ──────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));

  // ─── CORS ───────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
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
    const status = db ? "ok" : "degraded";

    res.status(status === "ok" ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        connected: Boolean(db),
      },
      scheduler: {
        registeredTasks: schedulerStatus.length,
        scheduledTasks,
        runningTasks,
        tasks: schedulerStatus,
      },
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
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Shopify OAuth for user store connections
  registerShopifyOAuthRoutes(app);
  // Social platform OAuth callbacks (Meta, TikTok, Twitter, Pinterest)
  registerSocialOAuthRoutes(app);
  // E-commerce platform OAuth callbacks (Etsy, Amazon, eBay, TikTok Shop)
  registerEcommerceOAuthRoutes(app);
  // Shopify webhook handlers (orders/create, orders/paid, products/update, inventory)
  registerShopifyWebhookRoutes(app);
  // Stripe webhook (subscription lifecycle: created, updated, canceled, payment_failed)
  registerStripeWebhook(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

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

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("server_shutdown_requested");
    await shutdownQueues();
    server.close(() => {
      logger.info("server_shutdown_complete");
      process.exit(0);
    });
  });
}

startServer().catch((err) => logger.error("server_fatal", { error: err?.message ?? String(err) }));
