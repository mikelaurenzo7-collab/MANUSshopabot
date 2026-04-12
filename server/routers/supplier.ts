/**
 * Supplier Purchase Order Router
 *
 * Phase 3: Autonomous supply chain management.
 * Allows the Merchant Bot (and users) to create, approve, submit,
 * and track purchase orders against suppliers.
 * Integrates with the supplier adapter layer for external API calls.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { generatePO } from "../adapters/supplierAdapter";

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
