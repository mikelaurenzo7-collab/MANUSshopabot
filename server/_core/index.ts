import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerShopifyOAuthRoutes } from "../shopifyOAuth";
import { registerSocialOAuthRoutes } from "../socialOAuth";
import { registerEcommerceOAuthRoutes } from "../ecommerceOAuth";
import { registerShopifyWebhookRoutes } from "../shopifyWebhooks";
import { generalRateLimiter, webhookRateLimiter } from "./rateLimiter";
import { correlationMiddleware, logger } from "./logger";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { agentScheduler, registerDefaultTasks } from "../scheduler";

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
  const app = express();
  const server = createServer(app);
  // Inject requestId + child logger into every request for distributed tracing
  app.use(correlationMiddleware);
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
    // Start the bot task scheduler
    registerDefaultTasks();
    agentScheduler.start();
    logger.info("scheduler_initialized", { taskCount: agentScheduler.getStatus().length });
  });
}

startServer().catch((err) => logger.error("server_fatal", { error: err?.message ?? String(err) }));
