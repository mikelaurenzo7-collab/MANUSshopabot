/**
 * Google Ads tool adapter — OAuth-backed marketing surface for the
 * Architect (keyword research) and Merchant (PMax + Shopping campaign)
 * bots. Sits in the tools registry rather than the social registry
 * because Google Ads is a paid distribution surface — there's no
 * organic posting concept here, so it doesn't behave like Meta /
 * TikTok / Pinterest in the Social bot's planning.
 *
 * Heavy campaign-management work (Performance Max optimization, Spark
 * Ads boosting, etc.) lives in the legacy social GoogleAdsAdapter so
 * the elite-extension factory can still resolve it. This adapter just
 * verifies the token and surfaces the capability metadata to the UI.
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

export class GoogleAdsAdapter implements ToolConnectorAdapter {
  readonly tool = "google_ads";
  readonly toolName = "Google Ads";
  readonly category: ToolCategory = "marketing";
  readonly bots: ReadonlyArray<BotDomain> = ["architect", "merchant"];
  readonly capabilities = [
    "Keyword research for niche validation",
    "Performance Max campaign launches with product feed",
    "Bid optimization and spend monitoring",
    "Shopping ads driven by the connected store catalog",
  ] as const;

  async verifyConnection(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    return this.healthCheck(credentials);
  }

  async healthCheck(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    const start = Date.now();
    if (!credentials.accessToken && !credentials.refreshToken) {
      return { healthy: false, message: "Missing access token", latencyMs: 0 };
    }
    try {
      // listAccessibleCustomers is the cheapest endpoint that proves the
      // token is good and the developer token is whitelisted.
      const { default: axios } = await import("axios");
      const res = await axios.get(
        "https://googleads.googleapis.com/v17/customers:listAccessibleCustomers",
        {
          headers: {
            Authorization: `Bearer ${credentials.accessToken || ""}`,
            "developer-token":
              credentials.metadata?.developerToken ||
              process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
              "",
          },
          timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
          validateStatus: (s) => s < 500,
        },
      );
      if (res.status >= 400) {
        return {
          healthy: false,
          message: res.data?.error?.message || `HTTP ${res.status}`,
          latencyMs: Date.now() - start,
        };
      }
      const customers = res.data?.resourceNames || [];
      return {
        healthy: true,
        message: "Connected",
        latencyMs: Date.now() - start,
        accountLabel: customers.length
          ? `Google Ads · ${customers.length} customer${customers.length === 1 ? "" : "s"}`
          : "Google Ads",
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.response?.data?.error?.message || err.message || "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }
}
