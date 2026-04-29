/**
 * Amazon SP-API adapter — contract test against recorded fixtures.
 *
 * Mocks `amazon-sp-api`'s default export so `client.callAPI({...})` returns
 * canned responses. We exercise the catalog, orders, and inventory paths.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AmazonAdapter } from "./amazonAdapter";
import type { AdapterCredentials } from "./types";

const callAPI = vi.fn();
const SellingPartnerCtor = vi.fn().mockImplementation(() => ({ callAPI }));

vi.mock("amazon-sp-api", () => ({
  default: SellingPartnerCtor,
}));

const credentials: AdapterCredentials = {
  refreshToken: "Atzr|...",
  apiKey: "spapi_client_id",
  apiSecret: "spapi_client_secret",
  marketplaceId: "ATVPDKIKX0DER",
  sellerId: "A1SELLER",
};

describe("AmazonAdapter contract", () => {
  let adapter: AmazonAdapter;

  beforeEach(() => {
    adapter = new AmazonAdapter();
    callAPI.mockReset();
    SellingPartnerCtor.mockClear();
  });

  it("verifyConnection calls getMarketplaceParticipations and maps StoreInfo", async () => {
    callAPI.mockResolvedValueOnce([
      {
        seller: { sellerId: "A1SELLER" },
        marketplace: { id: "ATVPDKIKX0DER" },
      },
    ]);

    const info = await adapter.verifyConnection(credentials);
    expect(info).toMatchObject({
      platformId: "A1SELLER",
      name: "Amazon Seller Account",
      domain: "sellercentral.amazon.com",
      currency: "USD",
      status: "active",
    });

    expect(callAPI).toHaveBeenCalledWith({
      operation: "getMarketplaceParticipations",
      endpoint: "sellers",
    });
  });

  it("listProducts maps catalog items via summaries[0]", async () => {
    callAPI.mockResolvedValueOnce({
      items: [
        {
          asin: "B00TEST01",
          summaries: [
            {
              itemName: "Widget Pro",
              productType: "TOYS_AND_GAMES",
              mainImage: { link: "https://m.media-amazon.com/widget.jpg" },
            },
          ],
          attributes: {
            product_description: [{ value: "A pro widget." }],
          },
        },
        {
          asin: "B00TEST02",
          summaries: [{ itemName: "Other Item" }],
        },
      ],
    });

    const products = await adapter.listProducts(credentials, { limit: 10 });
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      platformId: "B00TEST01",
      title: "Widget Pro",
      description: "A pro widget.",
      imageUrl: "https://m.media-amazon.com/widget.jpg",
      category: "TOYS_AND_GAMES",
      status: "active",
      // SP-API catalog items don't carry price/stock — adapter zeros them.
      priceCents: 0,
      stockLevel: 0,
    });
    expect(products[1].title).toBe("Other Item");

    const args = callAPI.mock.calls[0][0];
    expect(args.operation).toBe("searchCatalogItems");
    expect(args.query.marketplaceIds).toEqual(["ATVPDKIKX0DER"]);
  });

  it("listOrders maps the orders.Orders array including status mapping", async () => {
    callAPI.mockResolvedValueOnce({
      Orders: [
        {
          AmazonOrderId: "111-2222222-3333333",
          OrderStatus: "Shipped",
          OrderTotal: { Amount: "49.99", CurrencyCode: "USD" },
          PurchaseDate: "2025-03-15T10:30:00Z",
          BuyerInfo: {
            BuyerName: "Pat Buyer",
            BuyerEmail: "p@example.com",
          },
          ShippingAddress: {
            Name: "Pat Buyer",
            AddressLine1: "1 Prime Way",
            City: "Seattle",
            StateOrRegion: "WA",
            PostalCode: "98101",
            CountryCode: "US",
          },
        },
      ],
    });

    const orders = await adapter.listOrders(credentials);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      platformId: "111-2222222-3333333",
      orderNumber: "111-2222222-3333333",
      customerName: "Pat Buyer",
      customerEmail: "p@example.com",
      totalCents: 4999,
      currency: "USD",
      status: "shipped",
      fulfillmentStatus: "fulfilled",
    });
    expect(orders[0].shippingAddress?.country).toBe("US");
  });

  it("getInventory maps inventorySummaries fixture", async () => {
    callAPI.mockResolvedValueOnce({
      inventorySummaries: [
        {
          sellerSku: "SKU-1",
          inventoryDetails: {
            fulfillableQuantity: 50,
            reservedQuantity: { totalReservedQuantity: 5 },
            inboundWorkingQuantity: 10,
          },
        },
      ],
    });

    const inv = await adapter.getInventory(credentials, "SKU-1");
    expect(inv).toEqual({
      productId: "SKU-1",
      sku: "SKU-1",
      available: 50,
      committed: 5,
      incoming: 10,
    });
  });

  it("updateInventory rejects with a guidance message (FBA-only)", async () => {
    await expect(
      adapter.updateInventory(credentials, "SKU-1", 99)
    ).rejects.toThrow(/Seller Central or FBA inbound shipments/);
  });
});
