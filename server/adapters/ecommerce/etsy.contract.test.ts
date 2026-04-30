/**
 * Etsy adapter — contract test against recorded fixtures.
 *
 * Mocks `axios` so we exercise URL construction, header injection, and the
 * Etsy Open API v3 mapping (price.amount/divisor, listings, receipts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EtsyAdapter } from "./etsyAdapter";
import type { AdapterCredentials } from "./types";

vi.mock("axios", () => {
  const fn: any = vi.fn();
  fn.post = vi.fn();
  fn.get = vi.fn();
  return { default: fn };
});

const credentials: AdapterCredentials = {
  accessToken: "etsy_oauth_token",
  apiKey: "etsy_api_key",
  metadata: { shopId: "12345" },
};

describe("EtsyAdapter contract", () => {
  let adapter: EtsyAdapter;
  let axios: any;

  beforeEach(async () => {
    adapter = new EtsyAdapter();
    axios = (await import("axios")).default;
    axios.mockReset();
  });

  it("verifyConnection pings + fetches the shop and maps StoreInfo", async () => {
    // First call: ping
    axios.mockResolvedValueOnce({ data: { ping: "pong" } });
    // Second call: shop
    axios.mockResolvedValueOnce({
      data: {
        shop_id: 12345,
        shop_name: "HandmadeShop",
        currency_code: "USD",
        is_vacation: false,
      },
    });

    const info = await adapter.verifyConnection(credentials);
    expect(info).toEqual({
      platformId: "12345",
      name: "HandmadeShop",
      domain: "etsy.com/shop/HandmadeShop",
      currency: "USD",
      status: "active",
    });

    const pingCall = axios.mock.calls[0][0];
    expect(pingCall.url).toBe("https://openapi.etsy.com/v3/application/openapi-ping");
    expect(pingCall.headers.Authorization).toBe("Bearer etsy_oauth_token");
    expect(pingCall.headers["x-api-key"]).toBe("etsy_api_key");
  });

  it("listProducts maps Etsy listing fixtures (price as amount/divisor)", async () => {
    axios.mockResolvedValueOnce({
      data: {
        results: [
          {
            listing_id: 998877,
            title: "Hand-knit scarf",
            description: "Cozy + warm",
            price: { amount: 4500, divisor: 100, currency_code: "USD" },
            sku: ["SCARF-1"],
            images: [{ url_fullxfull: "https://i.etsy.com/scarf.jpg" }],
            taxonomy_path: ["Accessories"],
            quantity: 7,
            state: "active",
            url: "https://etsy.com/listing/998877",
          },
          {
            listing_id: 998878,
            title: "Sold out item",
            price: { amount: 1000, divisor: 100 },
            quantity: 0,
            state: "sold_out",
          },
        ],
      },
    });

    const products = await adapter.listProducts(credentials);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      platformId: "998877",
      title: "Hand-knit scarf",
      // 4500 / 100 = 45 → 4500 cents
      priceCents: 4500,
      sku: "SCARF-1",
      imageUrl: "https://i.etsy.com/scarf.jpg",
      category: "Accessories",
      stockLevel: 7,
      status: "active",
      url: "https://etsy.com/listing/998877",
    });
    expect(products[1].status).toBe("archived"); // sold_out → archived
  });

  it("listProducts throws when shopId is missing from credentials", async () => {
    await expect(
      adapter.listProducts({ accessToken: "x", apiKey: "y" })
    ).rejects.toThrow(/shopId required/);
  });

  it("listOrders maps Etsy receipts including transactions", async () => {
    axios.mockResolvedValueOnce({
      data: {
        results: [
          {
            receipt_id: 555,
            name: "John Doe",
            buyer_email: "j@example.com",
            grandtotal: { amount: 10000, divisor: 100, currency_code: "USD" },
            status: "completed",
            is_shipped: true,
            transactions: [
              {
                listing_id: 998877,
                title: "Hand-knit scarf",
                quantity: 1,
                price: { amount: 4500, divisor: 100 },
              },
            ],
            formatted_address: "...",
            first_line: "1 Crafty Lane",
            city: "Brooklyn",
            state: "NY",
            zip: "11201",
            country_iso: "US",
            create_timestamp: 1700000000,
          },
        ],
      },
    });

    const orders = await adapter.listOrders(credentials);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      platformId: "555",
      orderNumber: "555",
      customerName: "John Doe",
      customerEmail: "j@example.com",
      totalCents: 10000,
      currency: "USD",
      status: "fulfilled", // completed → fulfilled
      fulfillmentStatus: "fulfilled",
    });
    expect(orders[0].lineItems[0]).toMatchObject({
      productId: "998877",
      title: "Hand-knit scarf",
      quantity: 1,
      priceCents: 4500,
    });
    expect(orders[0].shippingAddress?.country).toBe("US");
  });

  it("fulfillOrder rejects malformed tracking numbers before hitting the API", async () => {
    await expect(
      adapter.fulfillOrder(credentials, "555", { trackingNumber: "abc" })
    ).rejects.toThrow(/Must be 6-40/);

    await expect(
      adapter.fulfillOrder(credentials, "555", {
        trackingNumber: "TRACK!@#$",
      })
    ).rejects.toThrow(/alphanumeric/);

    expect(axios).not.toHaveBeenCalled();
  });
});
