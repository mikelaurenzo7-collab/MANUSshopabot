/**
 * Supplier Adapter (Manus-Ready)
 *
 * Abstraction layer for external supplier API integrations with built-in
 * observability, robust resilience controls (Retries, Backoffs), and structured logging.
 *
 * V1: Observability structures applied and adapter scaffolding built for the platform.
 * V2+: Real HTTP boundaries into AliExpress, Zendrop, CJDropshipping, etc.
 */

import { logger } from "../utils/logger";
import { withRetries } from "../utils/retry";

interface POSubmission {
  poNumber: string;
  supplierId: string;
  lineItems: Array<{
    productId: number;
    quantity: number;
    unitCostCents: number;
  }>;
  totalCents: number;
}

interface SubmissionResult {
  submitted: boolean;
  externalRef?: string;
  message: string;
  adapter: string;
  errorCode?: string;
}

/**
 * Route the PO to the correct supplier adapter reliably utilizing safe exponential backoffs.
 */
export async function generatePO(po: POSubmission): Promise<SubmissionResult> {
  const adapter = resolveAdapter(po.supplierId);
  const cost = (po.totalCents / 100).toFixed(2);

  logger.info(`Routing PO submission [${po.poNumber}] to ${adapter} adapter (Total: $${cost})`, { 
    agentType: "merchant", poNumber: po.poNumber 
  });

  return withRetries(`submit_po_${po.poNumber}`, async () => {
    try {
      switch (adapter) {
        case "aliexpress":
          return await submitToAliExpress(po);
        case "zendrop":
          return await submitToZendrop(po);
        case "cjdropshipping":
          return await submitToCJDropshipping(po);
        default:
          return await submitGeneric(po);
      }
    } catch (e: any) {
      logger.error(`Adapter [${adapter}] caught network exception: ${e.message}`, { poNumber: po.poNumber });
      throw e;
    }
  }, 3, 2000); // 3 attempts, 2-sec initial backoff
}

function resolveAdapter(supplierId: string): string {
  if (!supplierId) return "generic";
  const id = supplierId.toLowerCase();
  
  if (id.includes("aliexpress") || id.startsWith("ae-")) return "aliexpress";
  if (id.includes("zendrop") || id.startsWith("zd-")) return "zendrop";
  if (id.includes("cjdrop") || id.startsWith("cj-")) return "cjdropshipping";
  return "generic";
}

// ─── Scalable Platform Sub-Adapters ─────

/**
 * The dropship-platform adapters below are scaffolded but not yet wired
 * to live HTTP endpoints (AliExpress / Zendrop / CJDropshipping each
 * require a partner-program API key + IP allowlist). Until those land,
 * we record the PO locally as a DRAFT — the merchant sees a tracked
 * record they can finalize manually and the UI doesn't surface a red
 * error on the happy path. Marketing copy reflects this state honestly
 * (see Landing.tsx + Architect.tsx).
 */

function draftResult(adapter: string, poNumber: string): SubmissionResult {
  return {
    submitted: true,
    externalRef: `DRAFT-${adapter.toUpperCase()}-${poNumber}`,
    message: `${adapter} PO saved as draft — connect a supplier API key in Settings → Integrations to auto-submit.`,
    adapter,
  };
}

async function submitToAliExpress(po: POSubmission): Promise<SubmissionResult> {
  logger.debug(`[SupplierAdapter:AliExpress] Recording draft PO`, { po: po.poNumber });
  return draftResult("aliexpress", po.poNumber);
}

async function submitToZendrop(po: POSubmission): Promise<SubmissionResult> {
  logger.debug(`[SupplierAdapter:Zendrop] Recording draft PO`, { po: po.poNumber });
  return draftResult("zendrop", po.poNumber);
}

async function submitToCJDropshipping(po: POSubmission): Promise<SubmissionResult> {
  logger.debug(`[SupplierAdapter:CJDropshipping] Recording draft PO`, { po: po.poNumber });
  return draftResult("cjdropshipping", po.poNumber);
}

async function submitGeneric(po: POSubmission): Promise<SubmissionResult> {
  logger.info(`[SupplierAdapter:Generic] Recording draft PO via catch-all adapter`, {
    po: po.poNumber,
    itemsCount: po.lineItems.length,
  });
  return draftResult("generic", po.poNumber);
}
