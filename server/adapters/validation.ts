/**
 * Zod Validation Schemas for All Adapters
 * Runtime validation for webhook payloads and API responses
 */

import { z } from 'zod';

// ─── Webhook Event Schemas ────────────────────────────────────────────

export const ShopifyOrderSchema = z.object({
  id: z.number(),
  order_number: z.number(),
  email: z.string().email().optional(),
  customer: z.object({
    id: z.number(),
    email: z.string().email().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }).optional(),
  line_items: z.array(z.object({
    id: z.number(),
    title: z.string(),
    quantity: z.number().int().positive(),
    price: z.string(),
    sku: z.string().optional(),
    product_id: z.number(),
    variant_id: z.number(),
  })),
  total_price: z.string(),
  currency: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  financial_status: z.enum(['authorized', 'pending', 'paid', 'refunded', 'voided']),
  fulfillment_status: z.enum(['fulfilled', 'partial', 'unfullfilled', 'restocked', 'canceled']).optional(),
});

export const AmazonOrderSchema = z.object({
  AmazonOrderId: z.string(),
  PurchaseDate: z.string().datetime(),
  OrderStatus: z.enum(['Pending', 'Unshipped', 'PartiallyShipped', 'Shipped', 'Canceled', 'Unfulfillable']),
  FulfillmentChannel: z.enum(['MFN', 'AFN']),
  SalesChannel: z.string(),
  OrderChannel: z.string(),
  ShipServiceLevel: z.string(),
  OrderTotal: z.object({
    CurrencyCode: z.string(),
    Amount: z.string(),
  }),
  NumberOfItemsShipped: z.number().int().nonnegative(),
  NumberOfItemsUnshipped: z.number().int().nonnegative(),
  PaymentExecutionDetail: z.object({
    PaymentExecutionStatus: z.string(),
  }).optional(),
  IsBusinessOrder: z.boolean().optional(),
  IsPrime: z.boolean().optional(),
  ReplacedOrderId: z.string().optional(),
  IsReplacementOrder: z.boolean().optional(),
});

export const EtsyOrderSchema = z.object({
  order_id: z.number(),
  receipt_id: z.number(),
  seller_user_id: z.number(),
  buyer_user_id: z.number(),
  status: z.enum(['open', 'completed', 'escalated', 'resolved', 'relist', 'inactive']),
  created_timestamp: z.number().int(),
  updated_timestamp: z.number().int(),
  is_paid: z.boolean(),
  is_shipped: z.boolean(),
  total_price: z.object({
    amount: z.number(),
    divisor: z.number(),
    currency_code: z.string(),
  }),
  buyer_email: z.string().email().optional(),
  shipments: z.array(z.object({
    shipment_id: z.number(),
    carrier_name: z.string(),
    tracking_code: z.string().optional(),
    creation_tsz: z.number().int(),
  })).optional(),
});

export const TikTokOrderSchema = z.object({
  order_id: z.string(),
  order_status: z.enum(['UNPAID', 'ON_HOLD', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDING', 'REFUNDED']),
  create_time: z.number().int(),
  update_time: z.number().int(),
  buyer_id: z.string(),
  seller_id: z.string(),
  order_amount: z.object({
    amount: z.string(),
    currency: z.string(),
  }),
  line_items: z.array(z.object({
    sku_id: z.string(),
    product_id: z.string(),
    quantity: z.number().int().positive(),
    price: z.object({
      amount: z.string(),
      currency: z.string(),
    }),
  })),
  shipping_address: z.object({
    name: z.string(),
    phone_number: z.string().optional(),
    address: z.string(),
    city: z.string(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string(),
  }).optional(),
});

export const WalmartOrderSchema = z.object({
  purchaseOrderNumber: z.string(),
  customerOrderId: z.string(),
  orderDate: z.number().int(),
  status: z.enum(['Received', 'Acknowledged', 'Cancelled', 'Shipped', 'Delivered', 'Returned']),
  orderLines: z.array(z.object({
    lineNumber: z.string(),
    sku: z.string(),
    quantity: z.object({
      amount: z.number().int().positive(),
      uom: z.string(),
    }),
    unitPrice: z.number(),
    totalPrice: z.number(),
  })),
  shippingInfo: z.object({
    phone: z.string().optional(),
    postalAddress: z.object({
      name: z.string(),
      address1: z.string(),
      address2: z.string().optional(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string(),
      country: z.string(),
    }),
  }).optional(),
});

// ─── API Response Schemas ────────────────────────────────────────────

export const ProductSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  price: z.number().positive(),
  currency: z.string(),
  sku: z.string().optional(),
  images: z.array(z.object({
    url: z.string().url(),
    alt: z.string().optional(),
  })).optional(),
  inventory: z.number().int().nonnegative().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const InventorySchema = z.object({
  sku: z.string(),
  quantity: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative().optional(),
  available: z.number().int().nonnegative().optional(),
  last_updated: z.string().datetime(),
});

// ─── Validation Helper ────────────────────────────────────────────────

export function validateWebhookPayload(
  platform: string,
  event: string,
  payload: unknown
): { valid: boolean; error?: string; data?: unknown } {
  try {
    let schema;

    if (platform === 'shopify' && event === 'order.created') {
      schema = ShopifyOrderSchema;
    } else if (platform === 'amazon' && event === 'order.placed') {
      schema = AmazonOrderSchema;
    } else if (platform === 'etsy' && event === 'order.created') {
      schema = EtsyOrderSchema;
    } else if (platform === 'tiktok' && event === 'order.created') {
      schema = TikTokOrderSchema;
    } else if (platform === 'walmart' && event === 'order.created') {
      schema = WalmartOrderSchema;
    } else {
      return { valid: false, error: `No schema for ${platform}:${event}` };
    }

    const result = schema.safeParse(payload);

    if (!result.success) {
      return {
        valid: false,
        error: result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; '),
      };
    }

    return { valid: true, data: result.data };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Unknown validation error',
    };
  }
}

export function validateProduct(data: unknown) {
  return ProductSchema.safeParse(data);
}

export function validateInventory(data: unknown) {
  return InventorySchema.safeParse(data);
}
