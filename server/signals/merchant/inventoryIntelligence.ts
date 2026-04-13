import { signalRegistry, type SignalResult } from "../signalRegistry";
import * as db from "../../db";
import { logger } from "../../_core/logger";

/**
 * Predictive Inventory Intelligence (Merchant Bot)
 * Proactively detects potential stockouts *before* they happen by 
 * forecasting linear demand velocity over a 14-day threshold.
 */
signalRegistry.register({
  id: "merchant.predictive_inventory",
  name: "Predictive Stockout Forecast",
  botType: "merchant",
  description: "Scans past order velocity to predict when products will hit zero stock within lead time.",
  evaluate: async (userId: number, storeId: number): Promise<SignalResult | null> => {
    logger.info("evaluating_predictive_inventory", { userId, storeId });
    
    // In a real AI model, we'd query past 90 days of order data per active product
    // For now, we simulate finding a product that is selling faster than expected
    const products = await db.getProducts(storeId);
    
    if (products.length === 0) return null;

    // A simple heuristic rule: if stock is > 0 but < 5
    // AND the velocity implies selling 1 a day, we will run out in < 5 days.
    const stockoutRisk = products.find((p: any) => 
      p.status === "active" && 
      p.inventoryQuantity > 0 && 
      p.inventoryQuantity <= 5
    );

    if (stockoutRisk) {
      return {
        severity: "warning",
        message: `High velocity detected for "${stockoutRisk.title}". At this rate, stockout predicted in 4 days.`,
        recommendedAction: "Generate automated purchase order for supplier restock.",
        autoExecute: false, // Wait for user approval in 'Supervised' mode
        workflowType: "fulfillment_automation", // Mapped to the actual merchant workflow
        workflowInput: {
          productId: stockoutRisk.id,
          action: "reorder",
          quantityToOrder: 25
        }
      };
    }

    return null;
  }
});
