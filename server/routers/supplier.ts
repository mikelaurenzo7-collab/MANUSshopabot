/**
 * Supplier Purchase Order Router
 *
 * Phase 3: Autonomous supply chain management.
 * Allows the Merchant Bot (and users) to create, approve, submit,
 * and track purchase orders against suppliers.
 * Integrates with the supplier adapter layer for external API calls.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { generatePO } from "../adapters/supplierAdapter";
import {
  uploadFile,
  visionQuery,
  deleteFile,
  isFilesApiAvailable,
} from "../_core/claudeFiles";

export const supplierRouter = router({
  /**
   * List all POs for a store.
   */
  listPOs: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      return db.getPurchaseOrdersByStore(input.storeId);
    }),

  /**
   * Get a single PO with line items.
   */
  getPO: protectedProcedure
    .input(z.object({ poId: z.number() }))
    .query(async ({ input }) => {
      const po = await db.getPurchaseOrderById(input.poId);
      if (!po) return null;
      const lineItems = await db.getPoLineItems(input.poId);
      return { ...po, lineItems };
    }),

  /**
   * Parse a supplier receipt / PO confirmation document via Claude
   * vision. Caller uploads bytes (PDF or image), the adapter routes
   * through the Files API → vision query → strict-JSON line-item
   * extraction. Returns ready-to-confirm PO draft data.
   *
   * Activation: requires ANTHROPIC_API_KEY. When unset, throws
   * PRECONDITION_FAILED with a hint to set the key — the Forge
   * proxy doesn't support arbitrary file uploads, so there's no
   * graceful fallback. The UI should hide / disable the parse-receipt
   * button when isFilesApiAvailable() is false.
   *
   * The uploaded file is deleted after extraction — supplier
   * receipts are sensitive. For longer-lived references (a brand
   * style guide reused across many workflows), don't auto-delete.
   */
  parseReceiptDocument: protectedProcedure
    .input(z.object({
      filename: z.string().min(1).max(255),
      // base64 bytes — frontend converts file → base64 before submit
      bytesBase64: z.string().min(1),
      mimeType: z.enum([
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
      ]),
    }))
    .mutation(async ({ input }) => {
      if (!isFilesApiAvailable()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Receipt parsing requires Claude vision via the Files API. Set ANTHROPIC_API_KEY in Manus secrets to enable.",
        });
      }

      const bytes = Buffer.from(input.bytesBase64, "base64");
      // Bound the upload to a reasonable size to avoid bot-side OOM
      // and runaway cost. Anthropic's Files API accepts up to 500MB,
      // but a supplier receipt should be ≤8MB in practice.
      if (bytes.length > 8 * 1024 * 1024) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "Receipt exceeds 8MB limit. Compress or split before re-uploading.",
        });
      }

      const uploaded = await uploadFile({
        filename: input.filename,
        bytes,
        mimeType: input.mimeType,
      });

      try {
        const result = await visionQuery({
          fileId: uploaded.id,
          mimeType: input.mimeType,
          prompt: `Extract every line item from this supplier receipt or PO confirmation. For each item, return:
- description (string, the human-readable product name)
- sku (string or null — only the supplier's SKU/part number, not your internal one)
- quantity (integer)
- unitCostCents (integer; convert dollars to cents — $12.34 → 1234)

Also extract document-level fields:
- supplierName (string or null)
- documentNumber (string or null — invoice / PO / receipt number)
- documentDate (ISO-8601 YYYY-MM-DD string or null)
- subtotalCents (integer or null)
- taxCents (integer or null)
- shippingCents (integer or null)
- totalCents (integer or null)

If the document is unreadable or appears not to be a receipt/PO, return an empty lineItems array and set supplierName to null.`,
          maxTokens: 4000,
          jsonSchema: {
            name: "supplier_receipt",
            schema: {
              type: "object",
              properties: {
                supplierName: { type: ["string", "null"] },
                documentNumber: { type: ["string", "null"] },
                documentDate: { type: ["string", "null"] },
                subtotalCents: { type: ["integer", "null"] },
                taxCents: { type: ["integer", "null"] },
                shippingCents: { type: ["integer", "null"] },
                totalCents: { type: ["integer", "null"] },
                lineItems: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      description: { type: "string" },
                      sku: { type: ["string", "null"] },
                      quantity: { type: "integer" },
                      unitCostCents: { type: "integer" },
                    },
                    required: ["description", "quantity", "unitCostCents"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["lineItems"],
              additionalProperties: false,
            },
          },
        });

        return {
          parsed: result.json ?? null,
          rawText: result.text,
          cacheReadInputTokens: result.cacheReadInputTokens,
        };
      } finally {
        // Always clean up — receipts are sensitive and we paid for
        // the extraction, no need to keep the file around.
        try {
          await deleteFile(uploaded.id);
        } catch {
          // Cleanup-failure is non-fatal; the file ages out.
        }
      }
    }),

  /**
   * Create a draft PO (manually by user or auto-triggered by Merchant Bot).
   */
  createDraft: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      supplierId: z.string().optional(),
      notes: z.string().optional(),
      lineItems: z.array(z.object({
        productId: z.number(),
        quantity: z.number().min(1),
        unitCostCents: z.number().min(0),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const totalCents = input.lineItems.reduce((sum, li) => sum + li.quantity * li.unitCostCents, 0);
      const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

      const poId = await db.createPurchaseOrder({
        storeId: input.storeId,
        supplierId: input.supplierId,
        poNumber,
        totalCents,
        status: "draft",
        notes: input.notes,
      });

      if (poId) {
        for (const li of input.lineItems) {
          await db.createPoLineItem({ poId, ...li });
        }
      }

      // Notify user about the new PO draft
      await db.createNotification({
        userId: ctx.user.id,
        agentType: "merchant",
        type: "info",
        title: `Purchase Order ${poNumber} drafted`,
        message: `A draft PO for $${(totalCents / 100).toFixed(2)} with ${input.lineItems.length} line item(s) is ready for review.`,
        actionUrl: "/supplier",
        metadata: { poId, poNumber },
      });

      return { poId, poNumber };
    }),

  /**
   * Approve a draft PO — transitions to "approved" status.
   */
  approve: protectedProcedure
    .input(z.object({ poId: z.number() }))
    .mutation(async ({ input }) => {
      const po = await db.getPurchaseOrderById(input.poId);
      if (!po || po.status !== "draft") throw new Error("PO is not in draft status");
      await db.updatePurchaseOrderStatus(input.poId, "approved");
      return { success: true };
    }),

  /**
   * Submit an approved PO to the supplier via the adapter layer.
   * In V1, this logs the submission and transitions status.
   * When real supplier APIs are configured, it calls the external endpoint.
   */
  submit: protectedProcedure
    .input(z.object({ poId: z.number() }))
    .mutation(async ({ input }) => {
      const po = await db.getPurchaseOrderById(input.poId);
      if (!po || po.status !== "approved") throw new Error("PO must be approved before submission");

      const lineItems = await db.getPoLineItems(input.poId);

      // Attempt external submission via adapter
      const result = await generatePO({
        poNumber: po.poNumber,
        supplierId: po.supplierId || "unknown",
        lineItems: lineItems.map((li: any) => ({
          productId: li.productId,
          quantity: li.quantity,
          unitCostCents: li.unitCostCents,
        })),
        totalCents: po.totalCents,
      });

      await db.updatePurchaseOrderStatus(input.poId, result.submitted ? "submitted" : "approved");
      return result;
    }),

  /**
   * Mark a PO as fulfilled (goods received).
   */
  markFulfilled: protectedProcedure
    .input(z.object({
      poId: z.number(),
      lineItemReceipts: z.array(z.object({
        lineItemId: z.number(),
        receivedQty: z.number().min(0),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.lineItemReceipts) {
        for (const receipt of input.lineItemReceipts) {
          await db.updatePoLineItemReceived(receipt.lineItemId, receipt.receivedQty);
        }
      }
      await db.updatePurchaseOrderStatus(input.poId, "fulfilled");
      return { success: true };
    }),

  /**
   * Auto-generate a PO from the Merchant Bot's low-stock detection.
   * This is the entry point the orchestrator calls when inventory dips.
   */
  autoGeneratePO: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      lowStockProducts: z.array(z.object({
        productId: z.number(),
        currentQty: z.number(),
        reorderQty: z.number().min(1),
        unitCostCents: z.number().min(0),
        supplierId: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Group by supplier
      const bySupplier: Record<string, typeof input.lowStockProducts> = {};
      for (const item of input.lowStockProducts) {
        const key = item.supplierId || "default";
        if (!bySupplier[key]) bySupplier[key] = [];
        bySupplier[key].push(item);
      }

      const results = [];
      for (const [supplierId, items] of Object.entries(bySupplier)) {
        const totalCents = items.reduce((sum, i) => sum + i.reorderQty * i.unitCostCents, 0);
        const poNumber = `AUTO-${Date.now().toString(36).toUpperCase()}-${supplierId.slice(0, 4)}`;

        const poId = await db.createPurchaseOrder({
          storeId: input.storeId,
          supplierId: supplierId === "default" ? null : supplierId,
          poNumber,
          totalCents,
          status: "draft",
          notes: "Auto-generated by Merchant Bot low-stock detection",
        });

        if (poId) {
          for (const item of items) {
            await db.createPoLineItem({
              poId,
              productId: item.productId,
              quantity: item.reorderQty,
              unitCostCents: item.unitCostCents,
            });
          }
        }

        await db.createNotification({
          userId: ctx.user.id,
          agentType: "merchant",
          type: "warning",
          title: `Auto PO ${poNumber} — Low Stock Alert`,
          message: `Merchant Bot drafted a $${(totalCents / 100).toFixed(2)} PO for ${items.length} product(s) running low. Review and approve.`,
          actionUrl: "/supplier",
          metadata: { poId, poNumber, autoGenerated: true },
        });

        results.push({ poId, poNumber, totalCents, itemCount: items.length });
      }

      return results;
    }),
});
