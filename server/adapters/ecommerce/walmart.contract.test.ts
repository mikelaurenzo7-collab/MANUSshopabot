/**
 * Walmart adapter — contract test against recorded fixtures.
 *
 * Walmart is a two-step adapter: it grabs an OAuth access token via
 * `axios.post(.../v3/token, ...)`, then calls the Marketplace API via
 * `axios({...})`. The mock supports both shapes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalmartAdapter } from "./walmartAdapter";
import type { AdapterCredentials } from "./types";

vi.mock("axios", () => {
  const fn: any = vi.fn();
  fn.post = vi.fn();
  fn.get = vi.fn();
  return { default: fn };
});

const credentials: AdapterCredentials = {
  apiKey: "client-id",
  apiSecret: "client-secret",
  accessToken: "preset-token", // skips the OAuth round-trip
};

describe("WalmartAdapter contract", () => {
  let adapter: WalmartAdapter;
  let axios: any;

  beforeEach(async () => {
    adapter = new WalmartAdapter();
    axios = (await import("axios")).default;
    axios.mockReset();
    axios.post.mockReset();
  });

  it("verifyConnection hits /feeds and returns a StoreInfo", async () => {
    axios.mockResolvedValueOnce({ data: { totalResults: 0, results: [] } });

    const info = await adapter.verifyConnection(credentials);
    expect(info).toMatchObject({
      name: "Walmart Marketplace Account",
      domain: "walmart.com",
      currency: "USD",
      status: "active",
    });

    const call = axios.mock.calls[0][0];
    expect(call.url).toBe(
      "https://marketplace.walmartapis.com/v3/feeds?feedType=ITEM&limit=1"
    );
    expect(call.headers.Authorization).toBe("Bearer preset-token");
  });

  it("uses axios.post to fetch an OAuth token when accessToken is missing", async () => {
    axios.post.mockResolvedValueOnce({
      data: { access_token: "fresh-token", expires_in: 900 },
    });
    axios.mockResolvedValueOnce({ data: { ItemResponse: [] } });

    const noToken: AdapterCredentials = {
      apiKey: "client-id",
      apiSecret: "client-secret",
    };
    await adapter.listProducts(noToken);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const tokenCall = axios.post.mock.calls[0];
    expect(tokenCall[0]).toBe(
      "https://marketplace.walmartapis.com/v3/token"
    );
    expect(tokenCall[1]).toBe("grant_type=client_credentials");
    expect(tokenCall[2].headers.Authorization).toMatch(/^Basic /);

    const apiCall = axios.mock.calls[0][0];
    expect(apiCall.headers.Authorization).toBe("Bearer fresh-token");
  });

  it("listProducts maps the ItemResponse fixture", async () => {
    axios.mockResolvedValueOnce({
      data: {
        ItemResponse: [
          {
            sku: "WM-SKU-1",
            productName: "Test Widget",
            shortDescription: "A widget",
            price: { amount: "29.95", currency: "USD" },
            images: [{ url: "https://i.walmart.com/widget.jpg" }],
            productCategory: "Home",
            inventoryCount: 12,
            publishedStatus: "PUBLISHED",
          },
          {
            sku: "WM-SKU-2",
            productName: "Pending widget",
            price: { amount: "10.00" },
            publishedStatus: "STAGE",
          },
        ],
      },
    });

    const products = await adapter.listProducts(credentials);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      platformId: "WM-SKU-1",
      title: "Test Widget",
      priceCents: 2995,
      sku: "WM-SKU-1",
      imageUrl: "https://i.walmart.com/widget.jpg",
      category: "Home",
      stockLevel: 12,
      status: "active",
    });
    expect(products[1].status).toBe("draft");
  });

  it("listOrders maps the nested orderLines/postalAddress fixture", async () => {
    axios.mockResolvedValueOnce({
      data: {
        list: {
          elements: {
            order: [
              {
                purchaseOrderId: "PO-1",
                customerOrderId: "CO-1",
                customerEmailId: "buyer@walmart.example",
                orderDate: "2025-02-01T00:00:00Z",
                orderTotal: { amount: "75.00", currency: "USD" },
                shippingInfo: {
                  estimatedDeliveryDate: "2025-02-05",
                  postalAddress: {
                    name: "Sam Buyer",
                    address1: "1 Walmart Way",
                    city: "Bentonville",
                    state: "AR",
                    postalCode: "72712",
                    country: "US",
                  },
                },
                orderLines: {
                  orderLine: [
                    {
                      lineNumber: "1",
                      item: { sku: "WM-SKU-1", productName: "Test Widget" },
                      orderLineQuantity: { amount: "2" },
                      charges: {
                        charge: [
                          { chargeAmount: { amount: "37.50" } },
                        ],
                      },
                      orderLineStatuses: {
                        orderLineStatus: [{ status: "Acknowledged" }],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });

    const orders = await adapter.listOrders(credentials);
    expect(orders).toHaveLength(1);
    const order = orders[0];
    expect(order).toMatchObject({
      platformId: "PO-1",
      orderNumber: "CO-1",
      customerEmail: "buyer@walmart.example",
      totalCents: 7500,
      currency: "USD",
      status: "processing", // Acknowledged → processing
      fulfillmentStatus: "fulfilled", // estimatedDeliveryDate present
    });
    expect(order.lineItems).toHaveLength(1);
    expect(order.lineItems[0]).toMatchObject({
      productId: "WM-SKU-1",
      title: "Test Widget",
      quantity: 2,
      priceCents: 3750,
      sku: "WM-SKU-1",
    });
    expect(order.shippingAddress?.zip).toBe("72712");
  });

  it("surfaces Walmart API error payloads with a descriptive message", async () => {
    axios.mockRejectedValue({
      response: {
        status: 400,
        data: { errors: [{ message: "Bad request" }] },
      },
    });
    await expect(adapter.verifyConnection(credentials)).rejects.toThrow(
      /Walmart API error: Bad request/
    );
  });
});
