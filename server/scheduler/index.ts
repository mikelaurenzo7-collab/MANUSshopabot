/**
 * SHOPaBOT — Bot Task Scheduler
 *
 * Uses node-cron to run recurring agent tasks with real platform adapter calls:
 * - Merchant: inventory checks, order fulfillment, pricing optimization
 * - Social Bot: scheduled social posts, ad performance monitoring
 * - Architect: store health checks, product catalog refresh, token refresh
 * - System: job queue, DLQ, anomaly detection, bot coordination
 *
 * Task handlers are organized into separate modules under ./tasks/
 * for maintainability and testability.
 */

import cron from "node-cron";
import { logger } from "../_core/logger";

// ─── Task Module Imports ──────────────────────────────────────────────────
import {
  handleInventoryCheck,
  handleOrderFulfillment,
  handleProductSync,
} from "./tasks/merchant";

import {
  handleAdMonitoring,
  handleScheduledPosts,
  handleSeoAudit,
  handleEmailRecovery,
  handleBotCoordination,
} from "./tasks/social";

import {
  handleStoreHealthCheck,
  handleTokenRefresh,
  handleCompetitorScan,
} from "./tasks/architect";

import {
  handleJobQueue,
  handleOAuthStateCleanup,
  handleInventoryAwareAdPause,
  handleDynamicPricing,
  handleCreativeVelocity,
  handleAnomalyDetection,
  handleDLQProcessor,
} from "./tasks/system";

import { signalRegistry } from "../signals"; // <-- THE PROACTIVENESS ENGINE

// ─── Types ────────────────────────────────────────────────────────────────

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  agentType: "architect" | "merchant" | "social";
  taskType: string;
  handler: () => Promise<void>;
  enabled: boolean;
}

// ─── AgentScheduler Class ─────────────────────────────────────────────────

class AgentScheduler {
  private tasks: Map<string, ReturnType<typeof cron.schedule>> = new Map();
  private taskConfigs: Map<string, ScheduledTask> = new Map();
  private runningTasks: Set<string> = new Set();
  private isRunning = false;

  register(config: ScheduledTask): void {
    this.taskConfigs.set(config.id, config);
    if (this.isRunning && config.enabled) {
      this.startTask(config);
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info("scheduler_starting", { message: "Starting agent task scheduler" });

    Array.from(this.taskConfigs.values()).forEach(config => {
      if (config.enabled) {
        this.startTask(config);
      }
    });

    logger.info("scheduler_started", { taskCount: this.tasks.size });
  }

  stop(): void {
    logger.info("scheduler_stopping", { message: "Stopping all scheduled tasks" });
    Array.from(this.tasks.entries()).forEach(([, task]) => {
      task.stop();
    });
    this.tasks.clear();
    this.isRunning = false;
  }

  setEnabled(taskId: string, enabled: boolean): void {
    const config = this.taskConfigs.get(taskId);
    if (!config) return;
    config.enabled = enabled;

    if (enabled && this.isRunning) {
      this.startTask(config);
    } else if (!enabled) {
      const existing = this.tasks.get(taskId);
      if (existing) {
        existing.stop();
        this.tasks.delete(taskId);
      }
    }
  }

  getStatus(): Array<{
    id: string;
    name: string;
    agentType: string;
    taskType: string;
    cronExpression: string;
    enabled: boolean;
    isScheduled: boolean;
    isRunning: boolean;
  }> {
    return Array.from(this.taskConfigs.values()).map(config => ({
      id: config.id,
      name: config.name,
      agentType: config.agentType,
      taskType: config.taskType,
      cronExpression: config.cronExpression,
      enabled: config.enabled,
      isScheduled: this.tasks.has(config.id),
      isRunning: this.runningTasks.has(config.id),
    }));
  }

  async triggerNow(taskId: string): Promise<void> {
    const config = this.taskConfigs.get(taskId);
    if (!config) throw new Error(`Task ${taskId} not found`);
    logger.info("scheduler_manual_trigger", { taskId, taskName: config.name });
    await this.runTask(config, "manual");
  }

  private async runTask(config: ScheduledTask, trigger: "cron" | "manual"): Promise<void> {
    if (this.runningTasks.has(config.id)) {
      logger.warn("scheduler_task_overlap_skipped", {
        taskId: config.id,
        taskName: config.name,
        trigger,
      });
      return;
    }

    this.runningTasks.add(config.id);
    logger.info("scheduler_task_start", { taskId: config.id, taskName: config.name, trigger });

    try {
      await config.handler();
      logger.info("scheduler_task_complete", { taskId: config.id, taskName: config.name, trigger });
    } catch (err) {
      logger.error("scheduler_task_failed", {
        taskId: config.id,
        taskName: config.name,
        trigger,
        error: (err as any)?.message ?? String(err),
      });
    } finally {
      this.runningTasks.delete(config.id);
    }
  }

  private startTask(config: ScheduledTask): void {
    const existing = this.tasks.get(config.id);
    if (existing) existing.stop();

    if (!cron.validate(config.cronExpression)) {
      logger.error("scheduler_invalid_cron", { taskId: config.id, cronExpression: config.cronExpression });
      return;
    }

    const task = cron.schedule(config.cronExpression, async () => {
      await this.runTask(config, "cron");
    });

    this.tasks.set(config.id, task);
    logger.info("scheduler_task_registered", { taskId: config.id, taskName: config.name, cron: config.cronExpression });
  }
}

// Singleton scheduler instance
export const agentScheduler = new AgentScheduler();

// ─── Register Default Tasks ─────────────────────────────────────────────

export function registerDefaultTasks(): void {
  // ─── PROACTIVE EVENT LOOP (The Brain) ──────────────────
  agentScheduler.register({
    id: "system:proactive-signal-loop",
    name: "Bot Proactiveness Signal Evaluator",
    // Run frequently, scanning environment for thresholds
    cronExpression: "*/30 * * * *", 
    agentType: "system" as any,
    taskType: "signal_evaluator",
    handler: async () => {
      const stores = await require("../db").getActiveStores();
      for (const store of stores) {
        await signalRegistry.executeAllForStore(store.userId, store.id);
      }
    },
    enabled: true
  });

  // ─── Merchant Bot Tasks ────────────────────────────────────────
  agentScheduler.register({
    id: "merchant:inventory-check",
    name: "Inventory Level Monitor",
    cronExpression: "0 */2 * * *",
    agentType: "merchant",
    taskType: "inventory_check",
    enabled: true,
    handler: handleInventoryCheck,
  });

  agentScheduler.register({
    id: "merchant:order-fulfillment",
    name: "Auto-Fulfillment Processor",
    cronExpression: "*/15 * * * *",
    agentType: "merchant",
    taskType: "order_fulfillment",
    enabled: true,
    handler: handleOrderFulfillment,
  });

  agentScheduler.register({
    id: "merchant:product-sync",
    name: "Product Catalog Sync",
    cronExpression: "0 */4 * * *",
    agentType: "merchant",
    taskType: "catalog_refresh",
    enabled: true,
    handler: handleProductSync,
  });

  // ─── Social Bot Tasks ─────────────────────────────────────────
  agentScheduler.register({
    id: "social:scheduled-posts",
    name: "Scheduled Post Queue Enqueuer",
    cronExpression: "*/5 * * * *",
    agentType: "social",
    taskType: "scheduled_posts",
    enabled: true,
    handler: handleScheduledPosts,
  });

  agentScheduler.register({
    id: "system:job-queue",
    name: "Durable Job Queue Processor",
    cronExpression: "*/2 * * * *",
    agentType: "social",
    taskType: "job_queue",
    enabled: true,
    handler: handleJobQueue,
  });

  agentScheduler.register({
    id: "system:oauth-state-cleanup",
    name: "OAuth State Cleanup",
    cronExpression: "0 * * * *",
    agentType: "architect",
    taskType: "oauth_state_cleanup",
    enabled: true,
    handler: handleOAuthStateCleanup,
  });

  agentScheduler.register({
    id: "social:ad-performance",
    name: "Ad Performance Monitor",
    cronExpression: "0 */4 * * *",
    agentType: "social",
    taskType: "ad_monitoring",
    enabled: true,
    handler: handleAdMonitoring,
  });

  agentScheduler.register({
    id: "social:seo-audit",
    name: "SEO Health Audit",
    cronExpression: "0 3 * * 1",
    agentType: "social",
    taskType: "seo_audit",
    enabled: true,
    handler: handleSeoAudit,
  });

  agentScheduler.register({
    id: "social:email-recovery",
    name: "Abandoned Cart Email Recovery",
    cronExpression: "0 */1 * * *",
    agentType: "social",
    taskType: "email_recovery",
    enabled: true,
    handler: handleEmailRecovery,
  });

  // ─── Architect Bot Tasks ───────────────────────────────────────
  agentScheduler.register({
    id: "architect:store-health",
    name: "Store Health Monitor",
    cronExpression: "0 */6 * * *",
    agentType: "architect",
    taskType: "store_health",
    enabled: true,
    handler: handleStoreHealthCheck,
  });

  agentScheduler.register({
    id: "architect:token-refresh",
    name: "OAuth Token Refresh",
    cronExpression: "0 */1 * * *",
    agentType: "architect",
    taskType: "token_refresh",
    enabled: true,
    handler: handleTokenRefresh,
  });

  agentScheduler.register({
    id: "architect:competitor-scan",
    name: "Competitor Intelligence Scan",
    cronExpression: "0 4 * * 3,6",
    agentType: "architect",
    taskType: "competitor_scan",
    enabled: true,
    handler: handleCompetitorScan,
  });

  // ─── Elite Orchestrator Tasks ──────────────────────────────────
  agentScheduler.register({
    id: "merchant:inventory-aware-ad-pause",
    name: "Inventory-Aware Ad Pausing",
    cronExpression: "*/30 * * * *",
    agentType: "merchant",
    taskType: "inventory_ad_pause",
    enabled: true,
    handler: handleInventoryAwareAdPause,
  });

  agentScheduler.register({
    id: "merchant:dynamic-pricing",
    name: "Dynamic Pricing Engine",
    cronExpression: "0 */6 * * *",
    agentType: "merchant",
    taskType: "dynamic_pricing",
    enabled: true,
    handler: handleDynamicPricing,
  });

  agentScheduler.register({
    id: "social:creative-velocity",
    name: "Creative Velocity A/B Optimizer",
    cronExpression: "0 */4 * * *",
    agentType: "social",
    taskType: "creative_velocity",
    enabled: true,
    handler: handleCreativeVelocity,
  });

  agentScheduler.register({
    id: "system:anomaly-detection",
    name: "Anomaly Detection Engine",
    cronExpression: "0 */1 * * *",
    agentType: "merchant",
    taskType: "anomaly_detection",
    enabled: true,
    handler: handleAnomalyDetection,
  });

  agentScheduler.register({
    id: "system:dlq-processor",
    name: "Dead-Letter Queue Processor",
    cronExpression: "*/10 * * * *",
    agentType: "merchant",
    taskType: "dlq_retry",
    enabled: true,
    handler: handleDLQProcessor,
  });

  agentScheduler.register({
    id: "system:bot-coordination",
    name: "Bot Coordination Engine",
    cronExpression: "*/5 * * * *",
    agentType: "social",
    taskType: "bot_coordination",
    enabled: true,
    handler: handleBotCoordination,
  });
}


// ─── Dynamic Schedule Loading ─────────────────────────────────────────────

/**
 * Load user-defined bot schedules from database and register them with the scheduler.
 * Called during server startup and can be called periodically to refresh schedules.
 */
export async function loadUserBotSchedules(): Promise<void> {
  try {
    const db = await import("../db");
    const { getBotSchedules, getBotProfile } = db;
    
    // Get all users (simplified — in production, iterate over active users)
    // For now, this is a placeholder that can be called per-user
    logger.info("scheduler_loading_user_schedules", { message: "Loading user-defined bot schedules" });
    
    // This function would typically be called with a userId:
    // const schedules = await getBotSchedules(botProfileId);
    // For each schedule, register it with agentScheduler
  } catch (err) {
    logger.error("scheduler_load_user_schedules_failed", {
      error: (err as any)?.message ?? String(err),
    });
  }
}

/**
 * Register a user-defined bot schedule with the scheduler.
 * Called when a user creates or updates a schedule via the UI.
 */
export async function registerUserBotSchedule(
  botProfileId: number,
  scheduleId: number,
  agentType: "architect" | "merchant" | "social",
  taskType: string,
  cronExpression: string,
  taskInput: Record<string, any>
): Promise<void> {
  try {
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const taskId = `user:bot_schedule:${botProfileId}:${scheduleId}`;
    
    agentScheduler.register({
      id: taskId,
      name: `User Bot Schedule: ${taskType}`,
      cronExpression,
      agentType,
      taskType,
      handler: async () => {
        // Execute the user's scheduled workflow
        logger.info("scheduler_user_schedule_executing", {
          taskId,
          botProfileId,
          scheduleId,
          taskType,
        });
        // TODO: Implement actual workflow execution based on taskType
      },
      enabled: true,
    });

    logger.info("scheduler_user_schedule_registered", {
      taskId,
      botProfileId,
      scheduleId,
      cronExpression,
    });
  } catch (err) {
    logger.error("scheduler_register_user_schedule_failed", {
      botProfileId,
      scheduleId,
      error: (err as any)?.message ?? String(err),
    });
  }
}
