/**
 * authz.test.ts — Tests for ownership-check helpers.
 *
 * These guard against authorization bypass regressions in tRPC routers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("../db", () => ({
  getStoreById: vi.fn(),
  getProductById: vi.fn(),
  getOrderById: vi.fn(),
}));

import * as db from "../db";
import {
  assertStoreOwnership,
  assertProductOwnership,
  assertOrderOwnership,
} from "./authz";

const mockedGetStoreById = vi.mocked(db.getStoreById);
const mockedGetProductById = vi.mocked(db.getProductById);
const mockedGetOrderById = vi.mocked(db.getOrderById);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertStoreOwnership", () => {
  it("returns the store when it belongs to the user", async () => {
    const store = { id: 7, userId: 42, name: "Mine" };
    mockedGetStoreById.mockResolvedValueOnce(store as any);

    const result = await assertStoreOwnership(7, 42);
    expect(result).toEqual(store);
  });

  it("throws NOT_FOUND when the store does not exist", async () => {
    mockedGetStoreById.mockResolvedValueOnce(undefined as any);

    await expect(assertStoreOwnership(7, 42)).rejects.toThrow(TRPCError);
  });

  it("throws NOT_FOUND when the store belongs to another user", async () => {
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, userId: 99 } as any);

    await expect(assertStoreOwnership(7, 42)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("assertProductOwnership", () => {
  it("returns the product when it belongs to a store the user owns", async () => {
    const product = { id: 11, storeId: 7, title: "Widget" };
    mockedGetProductById.mockResolvedValueOnce(product as any);
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, userId: 42 } as any);

    const result = await assertProductOwnership(11, 42);
    expect(result).toEqual(product);
  });

  it("throws NOT_FOUND when the product does not exist", async () => {
    mockedGetProductById.mockResolvedValueOnce(null as any);

    await expect(assertProductOwnership(11, 42)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws NOT_FOUND when the product's store belongs to another user", async () => {
    mockedGetProductById.mockResolvedValueOnce({ id: 11, storeId: 7 } as any);
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, userId: 99 } as any);

    await expect(assertProductOwnership(11, 42)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("assertOrderOwnership", () => {
  it("returns the order when it belongs to a store the user owns", async () => {
    const order = { id: 31, storeId: 7, status: "pending" };
    mockedGetOrderById.mockResolvedValueOnce(order as any);
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, userId: 42 } as any);

    const result = await assertOrderOwnership(31, 42);
    expect(result).toEqual(order);
  });

  it("throws NOT_FOUND when the order belongs to another user's store", async () => {
    mockedGetOrderById.mockResolvedValueOnce({ id: 31, storeId: 7 } as any);
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, userId: 99 } as any);

    await expect(assertOrderOwnership(31, 42)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
