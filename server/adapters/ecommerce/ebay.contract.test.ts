/**
 * eBay adapter — contract test against recorded fixtures.
 *
 * Mocks the `ebay-api` default export. The adapter calls
 * `client.sell.inventory.*` and `client.sell.fulfillment.*`, so the mock
 * exposes those nested methods.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EbayAdapter } from "./ebayAdapter";
import type { AdapterCredentials } from "./types";

const inventory = {
  getInventoryItems: vi.fn(),
  getInventoryItem: vi.fn(),
  createOrReplaceInventoryItem: vi.fn(),
  deleteInventoryItem: vi.fn(),
};
const fulfillment = {
  getOrders: vi.fn(),
  getOrder: vi.fn(),
  createShippingFulfillment: vi.fn(),
};
const account = { getPrivileges: vi.fn() };
const oauth2 = { setCredentials: vi.fn() };

const fakeClient = {
  sell: { inventory, fulfillment, account },
  OAuth2: oauth2,
};
const EbayCtor = vi.fn().mockImplementation(() => fakeClient);

vi.mock("ebay-api", () => ({ default: EbayCtor }));

const credentials: AdapterCredentials = {
  apiKey: "ebay_app_id",
  apiSecret: "ebay_cert_id",
  accessToken: "v^1.1#i^1#...",
  refreshToken: "v^1.1#i^1#...",
  metadata: { devId: "dev-id" },
  platformAccountId: "ebay-seller-1",
};

function resetAll() {
  for (const m of [inventory.getInventoryItems, inventory.getInventoryItem,
    inventory.createOrReplaceInventoryItem, inventory.deleteInventoryItem,
    fulfillment.getOrders, fulfillment.getOrder, fulfillment.createShippingFulfillment,
    account.getPrivileges, oauth2.setCredentials, EbayCtor]) {
    (m as any).mockReset();
  }
  EbayCtor.mockImplementation(() => fakeClient);
}

describe("EbayAdapter contract", () => {
  let adapter: EbayAdapter;

  beforeEach(() => {
    adapter = new EbayAdapter();
    resetAll();
  });

  it("verifyConnection calls account.getPrivileges and maps StoreInfo", async () => {
    account.getPrivileges.mockResolvedValueOnce({
      sellingLimit: { quantity: 1000, amount: { value: "25000.00", currency: "USD" } },
    });

    const info = await adapter.verifyConnection(credentials);
    expect(info).toMatchObject({
      platformId: "ebay-seller-1",
      name: "eBay Seller Account",
      domain: "ebay.com",
      currency: "USD",
      status: "active",
    });

    // Access token should have been forwarded to the OAuth client.
    expect(oauth2.setCredentials).toHaveBeenCalled();
    const oauthArgs = oauth2.setCredentials.mock.calls[0][0];
    expect(oauthArgs.access_token).toBe("v^1.1#i^1#...");
  });

  it("listProducts maps inventoryItems through mapProduct", async () => {
    inventory.getInventoryItems.mockResolvedValueOnce({
      inventoryItems: [
        {
          sku: "EBAY-1",
          product: {
            title: "Vintage Camera",
            description: "Working condition",
            imageUrls: ["https://i.ebayimg.com/cam.jpg"],
            aspects: { Category: ["Cameras"] },
          },
          availability: { shipToLocationAvailability: { quantity: 1 } },
        },
        {
          sku: "EBAY-2",
          product: { title: "Other" },
          availability: { shipToLocationAvailability: { quantity: 0 } },
        },
      ],
    });

    const products = await adapter.listProducts(credentials, { limit: 100 });
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      platformId: "EBAY-1",
      title: "Vintage Camera",
      description: "Working condition",
      sku: "EBAY-1",
      imageUrl: "https://i.ebayimg.com/cam.jpg",
      category: "Cameras",
      stockLevel: 1,
      status: "active",
    });

    expect(inventory.getInventoryItems).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
    });
  });

  it("listOrders maps a fulfillment.getOrders fixture", async () => {
    fulfillment.getOrders.mockResolvedValueOnce({
      orders: [
        {
          orderId: "23-12345-67890",
          orderFulfillmentStatus: "FULFILLED",
          buyer: { username: "ebay-buyer" },
          pricingSummary: {
            total: { value: "150.00", currency: "USD" },
          },
          creationDate: "2025-04-01T12:00:00Z",
          lineItems: [
            {
              lineItemId: "li-1",
              sku: "EBAY-1",
              title: "Vintage Camera",
              quantity: 1,
              lineItemCost: { value: "150.00" },
            },
          ],
          fulfillmentStartInstructions: [
            {
              shippingStep: {
                shipTo: {
                  fullName: "eBay Buyer",
                  contactAddress: {
                    addressLine1: "1 Auction Way",
                    city: "San Jose",
                    stateOrProvince: "CA",
                    postalCode: "95113",
                    countryCode: "US",
                  },
                },
              },
            },
          ],
        },
      ],
    });

    const orders = await adapter.listOrders(credentials);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      platformId: "23-12345-67890",
      orderNumber: "23-12345-67890",
      customerName: "ebay-buyer",
      totalCents: 15000,
      currency: "USD",
      status: "fulfilled",
      fulfillmentStatus: "fulfilled",
    });
    expect(orders[0].lineItems[0]).toMatchObject({
      productId: "EBAY-1",
      title: "Vintage Camera",
      quantity: 1,
      priceCents: 15000,
      sku: "EBAY-1",
    });
    expect(orders[0].shippingAddress?.country).toBe("US");
  });

  it("getInventory reads shipToLocationAvailability", async () => {
    inventory.getInventoryItem.mockResolvedValueOnce({
      sku: "EBAY-1",
      availability: { shipToLocationAvailability: { quantity: 7 } },
    });
    const inv = await adapter.getInventory(credentials, "EBAY-1");
    expect(inv).toEqual({ productId: "EBAY-1", sku: "EBAY-1", available: 7 });
  });
});
