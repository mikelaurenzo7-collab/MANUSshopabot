/**
 * SHOPaBOT / ShopBOTS — Proactive Signal Registry
 * 
 * This is the core "Proactiveness Engine" that transitions our bots 
 * from reactive tools (waiting for a click) to autonomous operators.
 * Signals are evaluated on a cron schedule, and if threshold conditions 
 * are met, they emit events to the bot coordination bus or directly trigger workflows.
 */

import { logger } from "../_core/logger";
import * as db from "../db";

export interface SignalResult {
  severity: "info" | "warning" | "critical";
  message: string;
  recommendedAction: string;
  autoExecute: boolean; // true = bot acts immediately; false = queues for approval
  workflowType?: string;
  workflowInput?: Record<string, unknown>;
}

export interface Signal {
  id: string;
  name: string;
  botType: "builder" | "merchant" | "social";
  description: string;
  evaluate: (userId: number, storeId: number) => Promise<SignalResult | null>;
}

class SignalRegistry {
  private signals: Map<string, Signal> = new Map();

  register(signal: Signal) {
    this.signals.set(signal.id, signal);
    logger.info("signal_registered", { signalId: signal.id, botType: signal.botType });
  }

  getSignalsByBot(botType: string) {
    return Array.from(this.signals.values()).filter(s => s.botType === botType);
  }

  getAllSignals() {
    return Array.from(this.signals.values());
  }

  /**
   * Run all signals for a given user/store. 
   * Usually triggered by the scheduler.
   */
  async executeAllForStore(userId: number, storeId: number) {
    logger.info("executing_signals_for_store", { userId, storeId });
    const results: Array<{ signalId: string; result: SignalResult }> = [];

    for (const signal of Array.from(this.signals.values())) {
      try {
        const result = await signal.evaluate(userId, storeId);
        if (result) {
          results.push({ signalId: signal.id, result });
          
          // If a signal fires, we create a bot event / notification for the UI command center.
          // This bridges the "background intelligence" to the user's dashboard.
          await db.createNotification({
            userId,
            agentType: (signal.botType === "builder" ? "architect" : signal.botType) as "architect" | "merchant" | "social",
            type: (result.severity === "critical" ? "error" : result.severity) as "info" | "warning" | "error" | "success" | "approval_needed",
            title: `Proactive Intelligence: ${signal.name}`,
            message: result.message + " | Recommendation: " + result.recommendedAction,
            actionUrl: result.workflowType ? `/workflows/new?type=${result.workflowType}` : undefined
          });

          logger.info("signal_fired", { signalId: signal.id, severity: result.severity });
        }
      } catch (err) {
        logger.error("signal_evaluation_failed", { 
          signalId: signal.id, 
          error: (err as Error).message 
        });
      }
    }
    return results;
  }
}

export const signalRegistry = new SignalRegistry();
