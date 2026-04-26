/**
 * Shop_a_Bot — Proactive Event Loop Root
 * Registers all specialized Bot Signals to the global Signal Registry.
 */

import { signalRegistry } from "./signalRegistry";
import { logger } from "../_core/logger";

// Register all Merchant Signals
import "./merchant/inventoryIntelligence";

// Register all Social Signals
import "./social/trendHijack";

// Register all Builder Signals
import "./builder/competitorStalker";

// Re-export the registry so the scheduler can run it
export { signalRegistry } from "./signalRegistry";
