/**
 * authz.ts — Authorization helpers for tRPC procedures.
 *
 * Centralizes ownership checks so that tRPC routers can enforce
 * "this resource belongs to the authenticated user" without
 * duplicating store/product/order lookup logic.
 */

import { TRPCError } from "@trpc/server";
import * as db from "../db";

/**
 * Verify that the given store belongs to the user. Throws FORBIDDEN otherwise.
 * Returns the store row on success.
 */
export async function assertStoreOwnership(storeId: number, userId: number) {
  const store = await db.getStoreById(storeId);
  if (!store || store.userId !== userId) {
    // Use NOT_FOUND to avoid leaking whether the store exists
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  }
  return store;
}

/**
 * Verify that the given product belongs to a store owned by the user.
 * Returns the product row on success.
 */
export async function assertProductOwnership(productId: number, userId: number) {
  const product = await db.getProductById(productId);
  if (!product) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
  }
  await assertStoreOwnership(product.storeId, userId);
  return product;
}

/**
 * Verify that the given order belongs to a store owned by the user.
 * Returns the order row on success.
 */
export async function assertOrderOwnership(orderId: number, userId: number) {
  const order = await db.getOrderById(orderId);
  if (!order) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
  }
  await assertStoreOwnership(order.storeId, userId);
  return order;
}
