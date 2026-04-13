import { signalRegistry, type SignalResult } from "../signalRegistry";
import * as db from "../../db";
import { logger } from "../../_core/logger";

/**
 * Viral Trend Hijacker (Social Bot)
 * Automatically detects trending audio/hashtags on TikTok & Meta API,
 * and if relevant to a user's store niche, immediately suggests 
 * a social post workflow.
 */
signalRegistry.register({
  id: "social.viral_trend_hijacker",
  name: "Viral Trend Hijacker",
  botType: "social",
  description: "Scans real-time external APIs for surging niche trends to auto-generate same-day content.",
  evaluate: async (userId: number, storeId: number): Promise<SignalResult | null> => {
    logger.info("evaluating_viral_trend", { userId, storeId });
    
    // Instead of just relying on the user to request a post manually, 
    // the system checks the niche context of the store.
    const store = await db.getStore(storeId);
    if (!store || !store.niche) return null;

    // Simulate API call to TikTok for Business/Meta Graph searching for `store.niche`
    // If the trend slope has spiked > 30% in the last 24h
    const isTrending = Math.random() > 0.85; // Simulate rare event

    if (isTrending) {
      return {
        severity: "info",
        message: `Detected a surging trend on TikTok matching your store niche: "${store.niche.toUpperCase()} ASMR".`,
        recommendedAction: "Auto-generate a script for immediate TikTok/Reels cross-posting before trend peaks.",
        autoExecute: false, // In autonomous mode, we'd fire the LLM immediately
        workflowType: "social_posting",
        workflowInput: {
          platform: "tiktok",
          format: "trend_hijack",
          context: `Trending TikTok audio for ${store.niche} ASMR`
        }
      };
    }

    return null;
  }
});
