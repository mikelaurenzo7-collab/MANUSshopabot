/**
 * Printful adapter — Bearer API key.
 * Key from Printful → Stores → API Access (private token).
 * (Public OAuth app exists but requires Printful Developer Portal review.)
 *
 * Used by: Merchant bot (auto-fulfill print-on-demand orders, sync POD catalog).
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  FulfillmentCapabilities,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const PRINTFUL_API = "https://api.printful.com";

export class PrintfulAdapter implements ToolConnectorAdapter, FulfillmentCapabilities {
  readonly tool = "printful";
  readonly toolName = "Printful";
  readonly category: ToolCategory = "fulfillment";
  readonly bots: ReadonlyArray<BotDomain> = ["merchant"];
  readonly capabilities = [
    "Sync print-on-demand product catalog",
    "Auto-create fulfillment orders from platform sales",
    "Pull production + shipping ETAs into customer notifications",
    "Reconcile POD costs with merchant pricing",
  ] as const;

  private headers(credentials: ToolCredentials): Record<string, string> {
    return {
      Authorization: `Bearer ${credentials.apiKey || ""}`,
      "Content-Type": "application/json",
    };
  }

  async verifyConnection(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    return this.healthCheck(credentials);
  }

  async healthCheck(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    const start = Date.now();
    if (!credentials.apiKey) return { healthy: false, message: "Missing API key", latencyMs: 0 };
    try {
      const { default: axios } = await import("axios");
      const res = await axios.get(`${PRINTFUL_API}/store`, {
        headers: this.headers(credentials),
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      });
      const store = res.data?.result;
      return {
        healthy: true,
        message: "Connected",
        latencyMs: Date.now() - start,
        accountLabel: store?.name ? `Printful · ${store.name}` : "Printful",
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.response?.data?.error?.message || err.message || "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async listProducts(credentials: ToolCredentials) {
    const { default: axios } = await import("axios");
    const res = await axios.get(`${PRINTFUL_API}/store/products?limit=50`, {
      headers: this.headers(credentials),
      timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
    });
    return (res.data?.result || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      thumbnail: p.thumbnail_url,
    }));
  }

  async createOrder(
    credentials: ToolCredentials,
    input: {
      recipient: { name: string; address1: string; city: string; state: string; zip: string; country: string };
      items: Array<{ variantId: number; quantity: number }>;
    },
  ) {
    const { default: axios } = await import("axios");
    const body = {
      recipient: {
        name: input.recipient.name,
        address1: input.recipient.address1,
        city: input.recipient.city,
        state_code: input.recipient.state,
        zip: input.recipient.zip,
        country_code: input.recipient.country,
      },
      items: input.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    };
    const res = await axios.post(`${PRINTFUL_API}/orders`, body, {
      headers: this.headers(credentials),
      timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
    });
    return { id: res.data?.result?.id || 0, status: res.data?.result?.status || "draft" };
  }
}
