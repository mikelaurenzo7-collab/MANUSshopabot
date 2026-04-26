/**
 * Postscript adapter — Bearer API key.
 * Key from Postscript dashboard → Settings → API.
 *
 * Used by: Social bot (SMS campaigns, abandoned cart texts, restock alerts).
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  MessagingCapabilities,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const POSTSCRIPT_API = "https://api.postscript.io/api/v2";

export class PostscriptAdapter implements ToolConnectorAdapter, MessagingCapabilities {
  readonly tool = "postscript";
  readonly toolName = "Postscript";
  readonly category: ToolCategory = "messaging";
  readonly bots: ReadonlyArray<BotDomain> = ["social", "merchant"];
  readonly capabilities = [
    "Send SMS broadcasts to subscriber segments",
    "Trigger abandoned-cart and back-in-stock texts",
    "Manage keywords and opt-in flows",
    "Track SMS-driven revenue alongside other channels",
  ] as const;

  private headers(credentials: ToolCredentials): Record<string, string> {
    return {
      Authorization: `Bearer ${credentials.apiKey || ""}`,
      "Content-Type": "application/json",
      Accept: "application/json",
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
      const res = await axios.get(`${POSTSCRIPT_API}/keywords?limit=1`, {
        headers: this.headers(credentials),
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      });
      const total = res.data?.pagination?.total_records ?? (res.data?.data?.length || 0);
      return {
        healthy: true,
        message: "Connected",
        latencyMs: Date.now() - start,
        accountLabel: `Postscript · ${total} keywords`,
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.response?.data?.message || err.message || "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async sendMessage(credentials: ToolCredentials, to: string, body: string) {
    const { default: axios } = await import("axios");
    const res = await axios.post(
      `${POSTSCRIPT_API}/messages`,
      { phone_number: to, body },
      { headers: this.headers(credentials), timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS },
    );
    return { id: String(res.data?.id || res.data?.data?.id || ""), status: res.data?.status || "sent" };
  }

  async listKeywords(credentials: ToolCredentials) {
    const { default: axios } = await import("axios");
    const res = await axios.get(`${POSTSCRIPT_API}/keywords?limit=50`, {
      headers: this.headers(credentials),
      timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
    });
    return (res.data?.data || []).map((k: any) => ({
      id: String(k.id),
      keyword: k.keyword || k.name,
      subscriberCount: k.subscriber_count,
    }));
  }
}
