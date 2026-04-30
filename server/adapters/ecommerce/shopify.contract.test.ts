/**
 * Shopify adapter — contract test against recorded fixtures.
 *
 * The adapter goes through `axios` for every API call. We mock `axios` at
 * module level and feed it a captured Shopify Admin REST response so the
 * test exercises the real adapter code path (URL construction, header
 * building, response mapping) without any live HTTP. Fixtures are trimmed
 * versions of real Shopify responses.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShopifyAdapter } from "./shopifyAdapter";
import type { AdapterCredentials } from "./types";

vi.mock("axios", () => {
  const fn: any = vi.fn();
  fn.post = vi.fn();
  fn.get = vi.fn();
  return { default: fn };
});

const credentials: AdapterCredentials = {
  accessToken: "shpat_test_token",
  shopDomain: "demo-shop.myshopify.com",
};

describe("ShopifyAdapter contract", () => {
  let adapter: ShopifyAdapter;
  let axios: any;

  beforeEach(async () => {
    adapter = new ShopifyAdapter();
    axios = (await import("axios")).default;
    axios.mockReset();
  });

  it("verifyConnection maps /shop.json into StoreInfo", async () => {
    axios.mockResolvedValueOnce({
      data: {
        shop: {
          id: 8675309,
          name: "Demo Shop",
          domain: "demo-shop.myshopify.com",
          currency: "USD",
          timezone: "(GMT-05:00) Eastern Time (US & Canada)",
          plan_name: "shopify_plus",
        },
      },
    });

    const info = await adapter.verifyConnection(credentials);

    expect(info).toEqual({
      platformId: "8675309",
      name: "Demo Shop",
      domain: "demo-shop.myshopify.com",
      currency: "USD",
      timezone: "(GMT-05:00) Eastern Time (US & Canada)",
      plan: "shopify_plus",
      status: "active",
    });

    const call = axios.mock.calls[0][0];
    expect(call.url).toBe(
      "https://demo-shop.myshopify.com/admin/api/2024-01/shop.json"
    );
    expect(call.method).toBe("GET");
    expect(call.headers["X-Shopify-Access-Token"]).toBe("shpat_test_token");
  });

  it("listProducts maps the products payload through mapProduct", async () => {
    axios.mockResolvedValueOnce({
      data: {
        products: [
          {
            id: 1001,
            title: "Test Tee",
            body_html: "<p>Soft cotton</p>",
            handle: "test-tee",
            status: "active",
            product_type: "Apparel",
            images: [{ src: "https://cdn.shopify.com/s/test-tee.jpg" }],
            variants: [
              {
                price: "19.99",
                compare_at_price: "29.99",
                sku: "TEE-001",
                inventory_quantity: 42,
              },
            ],
          },
          {
            id: 1002,
            title: "Archived Mug",
            status: "archived",
            variants: [{ price: "9.50", sku: "MUG-001", inventory_quantity: 0 }],
          },
        ],
      },
    });

    const products = await adapter.listProducts(credentials, { limit: 50 });

    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      platformId: "1001",
      title: "Test Tee",
      description: "<p>Soft cotton</p>",
      priceCents: 1999,
      comparePriceCents: 2999,
      sku: "TEE-001",
      imageUrl: "https://cdn.shopify.com/s/test-tee.jpg",
      category: "Apparel",
      stockLevel: 42,
      status: "active",
      url: "https://test-tee.myshopify.com/products/test-tee",
    });
    expect(products[1].status).toBe("archived");
    expect(products[1].comparePriceCents).toBeUndefined();
  });

  it("getProduct maps a single product fixture", async () => {
    axios.mockResolvedValueOnce({
      data: {
        product: {
          id: 7777,
          title: "Single Product",
          status: "draft",
          variants: [{ price: "5.00", sku: "P-7777", inventory_quantity: 3 }],
        },
      },
    });

    const product = await adapter.getProduct(credentials, "7777");
    expect(product.platformId).toBe("7777");
    expect(product.priceCents).toBe(500);
    expect(product.status).toBe("draft");
  });

  it("listOrders maps orders + line items + shipping address + status", async () => {
    axios.mockResolvedValueOnce({
      data: {
        orders: [
          {
            id: 5001,
            order_number: 1001,
            email: "buyer@example.com",
            customer: { first_name: "Ada", last_name: "Lovelace" },
            total_price: "120.00",
            currency: "USD",
            financial_status: "paid",
            fulfillment_status: "fulfilled",
            created_at: "2025-01-15T12:00:00Z",
            line_items: [
              {
                product_id: 1001,
                title: "Test Tee",
                quantity: 2,
                price: "19.99",
                sku: "TEE-001",
              },
            ],
            shipping_address: {
              name: "Ada Lovelace",
              address1: "1 Analytical Engine St",
              city: "London",
              province: "Greater London",
              zip: "EC1A 1AA",
              country_code: "GB",
            },
            fulfillments: [
              {
                tracking_number: "TRACK123",
                tracking_url: "https://carrier.example.com/TRACK123",
              },
            ],
          },
        ],
      },
    });

    const orders = await adapter.listOrders(credentials);
    expect(orders).toHaveLength(1);
    const order = orders[0];
    expect(order.platformId).toBe("5001");
    expect(order.orderNumber).toBe("1001");
    expect(order.customerName).toBe("Ada Lovelace");
    expect(order.customerEmail).toBe("buyer@example.com");
    expect(order.totalCents).toBe(12000);
    expect(order.status).toBe("processing"); // financial_status=paid → processing
    expect(order.fulfillmentStatus).toBe("fulfilled");
    expect(order.lineItems).toHaveLength(1);
    expect(order.lineItems[0]).toMatchObject({
      productId: "1001",
      quantity: 2,
      priceCents: 1999,
      sku: "TEE-001",
    });
    expect(order.shippingAddress).toMatchObject({
      name: "Ada Lovelace",
      address1: "1 Analytical Engine St",
      city: "London",
      state: "Greater London",
      zip: "EC1A 1AA",
      country: "GB",
    });
    expect(order.trackingNumber).toBe("TRACK123");
    expect(order.createdAt).toBeInstanceOf(Date);
  });

  it("createProduct posts a draft product and returns the mapped result", async () => {
    axios.mockResolvedValueOnce({
      data: {
        product: {
          id: 9001,
          title: "Brand New",
          status: "draft",
          variants: [{ price: "12.34", sku: "NEW-1", inventory_quantity: 5 }],
        },
      },
    });

    const result = await adapter.createProduct(credentials, {
      title: "Brand New",
      priceCents: 1234,
      sku: "NEW-1",
      stockLevel: 5,
    });

    expect(result.platformId).toBe("9001");
    expect(result.priceCents).toBe(1234);

    const call = axios.mock.calls[0][0];
    expect(call.method).toBe("POST");
    expect(call.url).toBe(
      "https://demo-shop.myshopify.com/admin/api/2024-01/products.json"
    );
    expect(call.data.product.title).toBe("Brand New");
    expect(call.data.product.variants[0].price).toBe("12.34");
    expect(call.data.product.status).toBe("draft");
  });
});
