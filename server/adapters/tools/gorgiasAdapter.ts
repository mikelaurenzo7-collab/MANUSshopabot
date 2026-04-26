/**
 * Gorgias adapter — HTTP Basic auth (email + personal API key).
 * Credentials from Gorgias → Settings → REST API.
 * (OAuth exists but is gated to listed integration partners; the
 * personal API key path is what every self-serve user gets.)
 *
 * Used by: Merchant bot (ticket triage, refund/return automation,
 * order-status responses).
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  SupportCapabilities,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

export class GorgiasAdapter implements ToolConnectorAdapter, SupportCapabilities {
  readonly tool = "gorgias";
  readonly toolName = "Gorgias";
  readonly category: ToolCategory = "support";
  readonly bots: ReadonlyArray<BotDomain> = ["merchant"];
  readonly capabilities = [
    "Triage support tickets by intent and sentiment",
    "Auto-reply to order-status and shipping questions",
    "Surface refund/return tickets to the merchant bot",
    "Bridge ticket context with order data for richer replies",
  ] as const;

  private baseUrl(credentials: ToolCredentials): string {
    const sub = credentials.accountHost || credentials.metadata?.subdomain || "";
    return `https://${sub}.gorgias.com/api`;
  }

  private headers(credentials: ToolCredentials): Record<string, string> {
    const email = credentials.metadata?.email || "";
    const token = Buffer.from(`${email}:${credentials.apiKey || ""}`).toString("base64");
    return {
      Authorization: `Basic ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  async verifyConnection(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    return this.healthCheck(credentials);
  }

  async healthCheck(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    const start = Date.now();
    if (!credentials.apiKey || !credentials.metadata?.email || !(credentials.accountHost || credentials.metadata?.subdomain)) {
      return { healthy: false, message: "Missing email, API key, or subdomain", latencyMs: 0 };
    }
    try {
      const { default: axios } = await import("axios");
      const res = await axios.get(`${this.baseUrl(credentials)}/account`, {
        headers: this.headers(credentials),
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      });
      return {
        healthy: true,
        message: "Connected",
        latencyMs: Date.now() - start,
        accountLabel: res.data?.name ? `Gorgias · ${res.data.name}` : "Gorgias",
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.response?.data?.error || err.message || "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async listTickets(credentials: ToolCredentials, params?: { limit?: number; status?: string }) {
    const { default: axios } = await import("axios");
    const res = await axios.get(`${this.baseUrl(credentials)}/tickets`, {
      headers: this.headers(credentials),
      params: { limit: params?.limit || 30, "filters[status]": params?.status },
      timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
    });
    return (res.data?.data || []).map((t: any) => ({
      id: t.id,
      subject: t.subject || "",
      status: t.status,
      customerEmail: t.customer?.email,
    }));
  }

  async replyToTicket(credentials: ToolCredentials, ticketId: number, body: string) {
    const { default: axios } = await import("axios");
    const res = await axios.post(
      `${this.baseUrl(credentials)}/tickets/${ticketId}/messages`,
      { body_html: body, channel: "email", from_agent: true, sender: { type: "agent" } },
      { headers: this.headers(credentials), timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS },
    );
    return { id: res.data?.id || ticketId };
  }
}
