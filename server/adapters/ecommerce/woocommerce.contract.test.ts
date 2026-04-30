/**
 * WooCommerce adapter — contract test against recorded fixtures.
 *
 * The adapter uses `@woocommerce/woocommerce-rest-api`. We mock that
 * SDK so that `new WooCommerceRestApi(...)` returns a fake client whose
 * `.get` / `.post` / `.put` / `.delete` methods return canned responses.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { WooCommerceAdapter } from "./woocommerceAdapter";
import type { AdapterCredentials } from "./types";

type WooMethod = "get" | "post" | "put" | "delete";
const fakeClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};
const constructorSpy = vi.fn();

vi.mock("@woocommerce/woocommerce-rest-api", () => {
  return {
    default: vi.fn().mockImplementation((opts: any) => {
      constructorSpy(opts);
      return fakeClient;
    }),
  };
});

const credentials: AdapterCredentials = {
  storeUrl: "shop.example.com",
  apiKey: "ck_test",
  apiSecret: "cs_test",
};

describe("WooCommerceAdapter contract", () => {
  let adapter: WooCommerceAdapter;

  beforeEach(() => {
    adapter = new WooCommerceAdapter();
    for (const k of Object.keys(fakeClient) as WooMethod[]) fakeClient[k].mockReset();
    constructorSpy.mockReset();
  });

  it("verifyConnection maps system_status into StoreInfo", async () => {
    fakeClient.get.mockResolvedValueOnce({
      data: {
        environment: { site_url: "https://shop.example.com" },
        settings: {
          blog_name: "Demo WooStore",
          currency: "EUR",
          timezone: "Europe/Berlin",
        },
      },
    });

    const info = await adapter.verifyConnection(credentials);
    expect(info).toMatchObject({
      platformId: "https://shop.example.com",
      name: "Demo WooStore",
      currency: "EUR",
      timezone: "Europe/Berlin",
      status: "active",
    });

    // Constructor receives normalised URL and credentials.
    expect(constructorSpy).toHaveBeenCalled();
    const opts = constructorSpy.mock.calls[0][0];
    expect(opts.url).toBe("https://shop.example.com");
    expect(opts.consumerKey).toBe("ck_test");
    expect(opts.consumerSecret).toBe("cs_test");
    expect(opts.version).toBe("wc/v3");
  });

  it("listProducts maps a real-shape Woo /products payload", async () => {
    fakeClient.get.mockResolvedValueOnce({
      data: [
        {
          id: 42,
          name: "Wooden Widget",
          description: "A widget",
          regular_price: "19.99",
          sale_price: "14.50",
          sku: "WW-1",
          images: [{ src: "https://shop.example.com/widget.jpg" }],
          categories: [{ name: "Widgets" }],
          stock_quantity: 100,
          status: "publish",
        },
        {
          id: 43,
          name: "Trashed item",
          regular_price: "5.00",
          status: "trash",
        },
      ],
    });

    const products = await adapter.listProducts(credentials, { limit: 100 });
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      platformId: "42",
      title: "Wooden Widget",
      priceCents: 1999,
      comparePriceCents: 1450,
      sku: "WW-1",
      imageUrl: "https://shop.example.com/widget.jpg",
      category: "Widgets",
      stockLevel: 100,
      status: "active",
    });
    expect(products[1].status).toBe("archived");

    expect(fakeClient.get).toHaveBeenCalledWith("products", {
      per_page: 100,
      page: 1,
      status: "publish",
    });
  });

  it("listOrders maps Woo /orders fixture into PlatformOrder[]", async () => {
    fakeClient.get.mockResolvedValueOnce({
      data: [
        {
          id: 8001,
          number: "8001",
          status: "completed",
          total: "59.99",
          currency: "EUR",
          billing: {
            first_name: "Bob",
            last_name: "Buyer",
            email: "bob@example.com",
          },
          shipping: {
            first_name: "Bob",
            last_name: "Buyer",
            address_1: "1 Buyer Lane",
            city: "Berlin",
            state: "BE",
            postcode: "10115",
            country: "DE",
          },
          line_items: [
            {
              product_id: 42,
              name: "Wooden Widget",
              quantity: 3,
              price: "19.99",
              sku: "WW-1",
            },
          ],
          date_created: "2025-03-01T08:00:00",
        },
      ],
    });

    const orders = await adapter.listOrders(credentials);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      platformId: "8001",
      orderNumber: "8001",
      customerName: "Bob Buyer",
      customerEmail: "bob@example.com",
      totalCents: 5999,
      currency: "EUR",
      status: "fulfilled", // completed → fulfilled
      fulfillmentStatus: "fulfilled",
    });
    expect(orders[0].lineItems[0]).toMatchObject({
      productId: "42",
      quantity: 3,
      priceCents: 1999,
      sku: "WW-1",
    });
    expect(orders[0].shippingAddress?.country).toBe("DE");
  });

  it("normalises bare host to https:// in the SDK constructor", async () => {
    fakeClient.get.mockResolvedValueOnce({ data: { environment: {}, settings: {} } });
    await adapter.verifyConnection({ ...credentials, storeUrl: "naked.example.com" });
    expect(constructorSpy.mock.calls[0][0].url).toBe("https://naked.example.com");
  });
});
