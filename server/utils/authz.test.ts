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
  getSeoKeywordById: vi.fn(),
  getEmailCampaignById: vi.fn(),
  getAdCampaignById: vi.fn(),
  getSocialAccountById: vi.fn(),
}));

import * as db from "../db";
import {
  assertStoreOwnership,
  assertProductOwnership,
  assertOrderOwnership,
  requireSeoKeywordInOrg,
  requireEmailCampaignInOrg,
  requireAdCampaignInOrg,
  requireSocialAccountInOrg,
} from "./authz";

const mockedGetStoreById = vi.mocked(db.getStoreById);
const mockedGetProductById = vi.mocked(db.getProductById);
const mockedGetOrderById = vi.mocked(db.getOrderById);
const mockedGetSeoKeywordById = vi.mocked(db.getSeoKeywordById);
const mockedGetEmailCampaignById = vi.mocked(db.getEmailCampaignById);
const mockedGetAdCampaignById = vi.mocked(db.getAdCampaignById);
const mockedGetSocialAccountById = vi.mocked(db.getSocialAccountById);

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

describe("requireSeoKeywordInOrg", () => {
  it("returns the keyword when its store belongs to the org", async () => {
    const keyword = { id: 5, storeId: 7, keyword: "hat" };
    mockedGetSeoKeywordById.mockResolvedValueOnce(keyword as any);
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, orgId: 10 } as any);

    const result = await requireSeoKeywordInOrg(5, 10);
    expect(result).toEqual(keyword);
  });

  it("throws NOT_FOUND when the keyword does not exist", async () => {
    mockedGetSeoKeywordById.mockResolvedValueOnce(undefined as any);

    await expect(requireSeoKeywordInOrg(5, 10)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws NOT_FOUND when the keyword's store belongs to a different org", async () => {
    mockedGetSeoKeywordById.mockResolvedValueOnce({ id: 5, storeId: 7 } as any);
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, orgId: 99 } as any);

    await expect(requireSeoKeywordInOrg(5, 10)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("requireEmailCampaignInOrg", () => {
  it("returns the campaign when its store belongs to the org", async () => {
    const campaign = { id: 3, storeId: 7, name: "Welcome" };
    mockedGetEmailCampaignById.mockResolvedValueOnce(campaign as any);
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, orgId: 10 } as any);

    const result = await requireEmailCampaignInOrg(3, 10);
    expect(result).toEqual(campaign);
  });

  it("throws NOT_FOUND when the campaign does not exist", async () => {
    mockedGetEmailCampaignById.mockResolvedValueOnce(undefined as any);

    await expect(requireEmailCampaignInOrg(3, 10)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws NOT_FOUND when the campaign belongs to a different org", async () => {
    mockedGetEmailCampaignById.mockResolvedValueOnce({ id: 3, storeId: 7 } as any);
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, orgId: 99 } as any);

    await expect(requireEmailCampaignInOrg(3, 10)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("requireAdCampaignInOrg", () => {
  it("returns the campaign when its store belongs to the org", async () => {
    const campaign = { id: 8, storeId: 7, name: "Black Friday" };
    mockedGetAdCampaignById.mockResolvedValueOnce(campaign as any);
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, orgId: 10 } as any);

    const result = await requireAdCampaignInOrg(8, 10);
    expect(result).toEqual(campaign);
  });

  it("throws NOT_FOUND when the ad campaign does not exist", async () => {
    mockedGetAdCampaignById.mockResolvedValueOnce(undefined as any);

    await expect(requireAdCampaignInOrg(8, 10)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws NOT_FOUND when the ad campaign belongs to a different org", async () => {
    mockedGetAdCampaignById.mockResolvedValueOnce({ id: 8, storeId: 7 } as any);
    mockedGetStoreById.mockResolvedValueOnce({ id: 7, orgId: 99 } as any);

    await expect(requireAdCampaignInOrg(8, 10)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("requireSocialAccountInOrg", () => {
  it("returns the account when it belongs to the org", async () => {
    const account = { id: 2, orgId: 10, platform: "meta" };
    mockedGetSocialAccountById.mockResolvedValueOnce(account as any);

    const result = await requireSocialAccountInOrg(2, 10);
    expect(result).toEqual(account);
  });

  it("throws NOT_FOUND when the account does not exist", async () => {
    mockedGetSocialAccountById.mockResolvedValueOnce(undefined as any);

    await expect(requireSocialAccountInOrg(2, 10)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws NOT_FOUND when the account belongs to a different org", async () => {
    mockedGetSocialAccountById.mockResolvedValueOnce({ id: 2, orgId: 99 } as any);

    await expect(requireSocialAccountInOrg(2, 10)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
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
