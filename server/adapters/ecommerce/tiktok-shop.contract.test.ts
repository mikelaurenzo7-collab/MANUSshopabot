/**
 * TikTok Shop adapter — contract test against recorded fixtures.
 *
 * The TikTok Shop API wraps every payload in `{ code, message, data }`
 * and requires HMAC-SHA256 signing. We mock axios so we can verify the
 * mapping (product/order shapes) and that error responses with a non-zero
 * `code` are surfaced as adapter errors.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TikTokShopAdapter } from "./tiktokShopAdapter";
import type { AdapterCredentials } from "./types";

vi.mock("axios", () => {
  const fn: any = vi.fn();
  fn.post = vi.fn();
  fn.get = vi.fn();
  return { default: fn };
});

const credentials: AdapterCredentials = {
  apiKey: "tt_app_key",
  apiSecret: "tt_app_secret",
  accessToken: "tt_access_token",
  metadata: { shopCipher: "CIPHER123" },
};

describe("TikTokShopAdapter contract", () => {
  let adapter: TikTokShopAdapter;
  let axios: any;

  beforeEach(async () => {
    adapter = new TikTokShopAdapter();
    axios = (await import("axios")).default;
    axios.mockReset();
  });

  it("verifyConnection unwraps the { code: 0, data } envelope into StoreInfo", async () => {
    axios.mockResolvedValueOnce({
      data: {
        code: 0,
        message: "OK",
        data: {
          shop_list: [
            {
              shop_id: "SHOP-1",
              shop_name: "Trendy Shop",
              region: "US",
            },
          ],
        },
      },
    });

    const info = await adapter.verifyConnection(credentials);
    expect(info).toMatchObject({
      platformId: "SHOP-1",
      name: "Trendy Shop",
      domain: "shop.tiktok.com",
      status: "active",
    });

    const call = axios.mock.calls[0][0];
    expect(call.url).toContain("/api/shop/get_authorized_shop");
    expect(call.url).toContain("app_key=tt_app_key");
    expect(call.url).toContain("access_token=tt_access_token");
    expect(call.url).toMatch(/sign=[a-f0-9]{64}/);
  });

  it("listProducts maps the products array with sku/price/status mapping", async () => {
    axios.mockResolvedValueOnce({
      data: {
        code: 0,
        data: {
          products: [
            {
              product_id: "P1",
              product_name: "Viral Lipstick",
              description: "Trending",
              status: "ACTIVATE",
              images: [{ url: "https://cdn.tiktok.com/lipstick.jpg" }],
              skus: [
                {
                  seller_sku: "LIP-RED",
                  price: { original_price: "12.50" },
                  stock_infos: [{ available_stock: 200 }],
                },
              ],
            },
            {
              product_id: "P2",
              product_name: "Pending review",
              status: "REVIEWING",
              skus: [
                {
                  seller_sku: "PEND-1",
                  price: { original_price: "9.99" },
                  stock_infos: [{ available_stock: 0 }],
                },
              ],
            },
          ],
        },
      },
    });

    const products = await adapter.listProducts(credentials);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      platformId: "P1",
      title: "Viral Lipstick",
      priceCents: 1250,
      sku: "LIP-RED",
      imageUrl: "https://cdn.tiktok.com/lipstick.jpg",
      stockLevel: 200,
      status: "active",
    });
    expect(products[1].status).toBe("draft"); // REVIEWING is not ACTIVATE
  });

  it("listOrders maps order_list, line items and recipient address", async () => {
    axios.mockResolvedValueOnce({
      data: {
        code: 0,
        data: {
          order_list: [
            {
              order_id: "ORD-1",
              order_status: "AWAITING_SHIPMENT",
              fulfillment_type: "SELLER",
              currency: "USD",
              payment: { total_amount: "25.00" },
              create_time: 1700000000,
              recipient_address: {
                name: "Jane",
                address_line1: "123 Main",
                city: "LA",
                state: "CA",
                zipcode: "90001",
                region_code: "US",
              },
              item_list: [
                {
                  product_id: "P1",
                  product_name: "Viral Lipstick",
                  quantity: 1,
                  sale_price: "25.00",
                  seller_sku: "LIP-RED",
                },
              ],
            },
          ],
        },
      },
    });

    const orders = await adapter.listOrders(credentials);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      platformId: "ORD-1",
      orderNumber: "ORD-1",
      customerName: "Jane",
      totalCents: 2500,
      currency: "USD",
      status: "processing", // AWAITING_SHIPMENT → processing
      fulfillmentStatus: "unfulfilled",
    });
    expect(orders[0].lineItems[0]).toMatchObject({
      productId: "P1",
      quantity: 1,
      priceCents: 2500,
      sku: "LIP-RED",
    });
    expect(orders[0].shippingAddress?.country).toBe("US");
  });

  it("surfaces non-zero `code` envelopes as adapter errors", async () => {
    axios.mockResolvedValue({
      data: { code: 12001, message: "invalid signature" },
    });

    await expect(adapter.verifyConnection(credentials)).rejects.toThrow(
      /invalid signature/
    );
  });
});
