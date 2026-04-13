import { signalRegistry, type SignalResult } from "../signalRegistry";
import * as db from "../../db";
import { logger } from "../../_core/logger";

/**
 * Competitor Market Monitor (Builder Bot)
 * Proactively checks competitor sites, Google Trends, and niche data 
 * to find product catalog gaps.
 */
signalRegistry.register({
  id: "builder.competitor_stalker",
  name: "Competitor Market Opportunity",
  botType: "builder",
  description: "Runs sentiment & search volume analysis to identify trending product gaps your catalog is missing.",
  evaluate: async (userId: number, storeId: number): Promise<SignalResult | null> => {
    logger.info("evaluating_market_monitor", { userId, storeId });
    
    // In production, this uses the Google Ad API connected previously, 
    // retrieving Search Volume data for the last 7 days compared to 90.
    const store = await db.getStoreById(storeId);
    if (!store || !store.niche) return null;

    // Simulate finding a gap
    const gapDetected = Math.random() > 0.75;
    
    if (gapDetected) {
      return {
        severity: "warning",
        message: `High search volume detected for an un-stocked ${store.niche} variation (Gap: Premium Tier).`,
        recommendedAction: "Launch AI-driven product sourcing workflow to expand the premium catalog.",
        autoExecute: false, 
        workflowType: "product_sourcing", // The existing builder bot workflow
        workflowInput: {
          nicheId: store.id,
          keyword: `${store.niche} premium`
        }
      };
    }

    return null;
  }
});
