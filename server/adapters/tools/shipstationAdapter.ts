/**
 * ShipStation adapter — API key + secret (HTTP Basic).
 * Credentials from Account → API Settings.
 *
 * Used by: Merchant bot (real shipping rates, label creation, tracking).
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  LogisticsCapabilities,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const SHIPSTATION_API = "https://ssapi.shipstation.com";

export class ShipStationAdapter implements ToolConnectorAdapter, LogisticsCapabilities {
  readonly tool = "shipstation";
  readonly toolName = "ShipStation";
  readonly category: ToolCategory = "logistics";
  readonly bots: ReadonlyArray<BotDomain> = ["merchant"];
  readonly capabilities = [
    "Compare live shipping rates across carriers",
    "Generate shipping labels and tracking numbers",
    "Sync fulfillment status back to the platform of sale",
    "Pull cost-of-shipping into margin calculations",
  ] as const;

  private headers(credentials: ToolCredentials): Record<string, string> {
    const token = Buffer.from(`${credentials.apiKey || ""}:${credentials.apiSecret || ""}`).toString("base64");
    return {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    };
  }

  async verifyConnection(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    return this.healthCheck(credentials);
  }

  async healthCheck(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    const start = Date.now();
    if (!credentials.apiKey || !credentials.apiSecret) {
      return { healthy: false, message: "Missing API key or secret", latencyMs: 0 };
    }
    try {
      const { default: axios } = await import("axios");
      const res = await axios.get(`${SHIPSTATION_API}/accounts/listtags`, {
        headers: this.headers(credentials),
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      });
      return {
        healthy: true,
        message: "Connected",
        latencyMs: Date.now() - start,
        accountLabel: `ShipStation · ${(res.data || []).length} tags`,
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.response?.data?.Message || err.message || "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async listOrders(credentials: ToolCredentials, params?: { limit?: number; status?: string }) {
    const { default: axios } = await import("axios");
    const res = await axios.get(`${SHIPSTATION_API}/orders`, {
      headers: this.headers(credentials),
      params: { pageSize: params?.limit || 50, orderStatus: params?.status },
      timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
    });
    return (res.data?.orders || []).map((o: any) => ({
      orderId: String(o.orderId),
      orderNumber: o.orderNumber,
      status: o.orderStatus,
    }));
  }

  async getRates(
    credentials: ToolCredentials,
    input: { fromZip: string; toZip: string; weightOz: number; carrier?: string },
  ) {
    const { default: axios } = await import("axios");
    const res = await axios.post(
      `${SHIPSTATION_API}/shipments/getrates`,
      {
        carrierCode: input.carrier || "stamps_com",
        fromPostalCode: input.fromZip,
        toPostalCode: input.toZip,
        toCountry: "US",
        weight: { value: input.weightOz, units: "ounces" },
      },
      { headers: this.headers(credentials), timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS },
    );
    return (res.data || []).map((r: any) => ({
      carrier: r.carrierCode || input.carrier || "unknown",
      service: r.serviceName || r.serviceCode,
      cost: Number(r.shipmentCost || 0) + Number(r.otherCost || 0),
    }));
  }

  async createLabel(credentials: ToolCredentials, orderId: string, options: { carrier: string; service: string }) {
    const { default: axios } = await import("axios");
    const res = await axios.post(
      `${SHIPSTATION_API}/orders/createlabelfororder`,
      { orderId: Number(orderId), carrierCode: options.carrier, serviceCode: options.service, testLabel: false },
      { headers: this.headers(credentials), timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS },
    );
    return {
      trackingNumber: res.data?.trackingNumber || "",
      labelUrl: res.data?.labelData ? `data:application/pdf;base64,${res.data.labelData}` : "",
    };
  }
}
