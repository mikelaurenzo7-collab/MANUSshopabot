/**
 * Klaviyo adapter — Private API key auth.
 * Key lives in Klaviyo dashboard → Settings → API Keys (read/write).
 * OAuth exists but requires public-app review; API key is the standard
 * self-serve path and what every Shopify store owner already uses.
 *
 * Used by: Merchant bot (segment churn risk users) + Social bot
 * (campaign send orchestration).
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  MarketingCapabilities,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const KLAVIYO_API = "https://a.klaviyo.com/api";
const KLAVIYO_REVISION = "2024-10-15";

export class KlaviyoAdapter implements ToolConnectorAdapter, MarketingCapabilities {
  readonly tool = "klaviyo";
  readonly toolName = "Klaviyo";
  readonly category: ToolCategory = "marketing";
  readonly bots: ReadonlyArray<BotDomain> = ["merchant", "social"];
  readonly capabilities = [
    "Sync customer segments built from order data",
    "Trigger abandoned cart, win-back, and post-purchase flows",
    "Upsert profiles with merchant-bot insights",
    "Send transactional and broadcast email/SMS",
  ] as const;

  private headers(credentials: ToolCredentials): Record<string, string> {
    return {
      Authorization: `Klaviyo-API-Key ${credentials.apiKey || ""}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      revision: KLAVIYO_REVISION,
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
      const res = await axios.get(`${KLAVIYO_API}/accounts`, {
        headers: this.headers(credentials),
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      });
      const account = res.data?.data?.[0]?.attributes;
      return {
        healthy: true,
        message: "Connected",
        latencyMs: Date.now() - start,
        accountLabel: account?.contact_information?.organization_name || account?.test_account ? "Klaviyo (test)" : "Klaviyo",
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.response?.data?.errors?.[0]?.detail || err.message || "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async listLists(credentials: ToolCredentials) {
    const { default: axios } = await import("axios");
    const res = await axios.get(`${KLAVIYO_API}/lists?page[size]=50`, {
      headers: this.headers(credentials),
      timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
    });
    return (res.data?.data || []).map((l: any) => ({
      id: l.id,
      name: l.attributes?.name || "Untitled list",
      memberCount: l.attributes?.profile_count,
    }));
  }

  async upsertProfile(
    credentials: ToolCredentials,
    profile: { email: string; firstName?: string; lastName?: string; properties?: Record<string, any> },
  ) {
    const { default: axios } = await import("axios");
    const body = {
      data: {
        type: "profile",
        attributes: {
          email: profile.email,
          first_name: profile.firstName,
          last_name: profile.lastName,
          properties: profile.properties || {},
        },
      },
    };
    const res = await axios.post(`${KLAVIYO_API}/profiles`, body, {
      headers: this.headers(credentials),
      timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      validateStatus: (s) => s < 500,
    });
    // 409 means profile exists — extract existing id
    if (res.status === 409) {
      const existingId = res.data?.errors?.[0]?.meta?.duplicate_profile_id;
      if (existingId) return { id: existingId };
    }
    return { id: res.data?.data?.id || "" };
  }

  async addToList(credentials: ToolCredentials, listId: string, emails: string[]) {
    const { default: axios } = await import("axios");
    let added = 0;
    for (const email of emails) {
      const profile = await this.upsertProfile(credentials, { email });
      if (!profile.id) continue;
      await axios.post(
        `${KLAVIYO_API}/lists/${listId}/relationships/profiles`,
        { data: [{ type: "profile", id: profile.id }] },
        { headers: this.headers(credentials), timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS, validateStatus: (s) => s < 500 },
      );
      added++;
    }
    return { added };
  }
}
