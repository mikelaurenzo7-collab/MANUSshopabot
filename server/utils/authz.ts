/**
 * authz.ts — Authorization helpers for tRPC procedures.
 *
 * Centralizes ownership checks so routers can enforce "this resource
 * belongs to the active organization" without duplicating store /
 * product / order lookup logic.
 *
 * Migration to multi-tenancy: the old `assertStoreOwnership(storeId,
 * userId)` checked `store.userId === userId`, which broke once a user
 * was a member of multiple orgs (they could read/write any of THEIR
 * stores while in any org). The new `requireStoreInOrg(storeId, orgId)`
 * checks `store.orgId === orgId` instead — the canonical ownership
 * boundary.
 *
 * Legacy `assertStoreOwnership` / `assertProductOwnership` /
 * `assertOrderOwnership` remain for the test suite + any caller that
 * still has only a userId. They're soft-deprecated; new callers should
 * use the org variants below.
 */

import { TRPCError } from "@trpc/server";
import * as db from "../db";

// ─── Org-scoped helpers (preferred) ────────────────────────────────────────

/**
 * Verify the store belongs to the active org. Returns NOT_FOUND
 * (instead of FORBIDDEN) so we don't leak whether the store exists in
 * a different tenant.
 */
export async function requireStoreInOrg(storeId: number, orgId: number) {
  const store = await db.getStoreById(storeId);
  if (!store || store.orgId !== orgId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  }
  return store;
}

export async function requireProductInOrg(productId: number, orgId: number) {
  const product = await db.getProductById(productId);
  if (!product) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
  }
  await requireStoreInOrg(product.storeId, orgId);
  return product;
}

export async function requireOrderInOrg(orderId: number, orgId: number) {
  const order = await db.getOrderById(orderId);
  if (!order) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
  }
  await requireStoreInOrg(order.storeId, orgId);
  return order;
}

// ─── Legacy single-user helpers (soft-deprecated) ──────────────────────────

/**
 * @deprecated Prefer `requireStoreInOrg`. This check uses `store.userId`
 * which bypasses multi-tenancy. Retained for tests + any procedure not
 * yet migrated to `orgProcedure`.
 */
export async function assertStoreOwnership(storeId: number, userId: number) {
  const store = await db.getStoreById(storeId);
  if (!store || store.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  }
  return store;
}

/** @deprecated Prefer `requireProductInOrg`. */
export async function assertProductOwnership(productId: number, userId: number) {
  const product = await db.getProductById(productId);
  if (!product) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
  }
  await assertStoreOwnership(product.storeId, userId);
  return product;
}

/** @deprecated Prefer `requireOrderInOrg`. */
export async function assertOrderOwnership(orderId: number, userId: number) {
  const order = await db.getOrderById(orderId);
  if (!order) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
  }
  await assertStoreOwnership(order.storeId, userId);
  return order;
}
