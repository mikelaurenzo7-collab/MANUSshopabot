/**
 * Google Analytics 4 adapter — OAuth 2.0 (Google).
 * Same Google app as Sheets/Gmail; scope `analytics.readonly`.
 *
 * Used by: All three bots (ground-truth traffic, conversion, attribution).
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  AnalyticsCapabilities,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

export class GoogleAnalyticsAdapter implements ToolConnectorAdapter, AnalyticsCapabilities {
  readonly tool = "google_analytics";
  readonly toolName = "Google Analytics 4";
  readonly category: ToolCategory = "analytics";
  readonly bots: ReadonlyArray<BotDomain> = ["architect", "merchant", "social"];
  readonly capabilities = [
    "Pull session, conversion, and revenue metrics",
    "Compare paid vs organic traffic by channel",
    "Surface top landing pages and exit pages",
    "Feed attribution into pricing & ad decisions",
  ] as const;

  async verifyConnection(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    return this.healthCheck(credentials);
  }

  async healthCheck(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    const start = Date.now();
    if (!credentials.accessToken) {
      return { healthy: false, message: "Missing access token", latencyMs: 0 };
    }
    try {
      const { default: axios } = await import("axios");
      const res = await axios.get(`${GA4_ADMIN_API}/accountSummaries?pageSize=10`, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      });
      const accounts = res.data?.accountSummaries || [];
      const label = accounts[0]?.displayName
        ? `${accounts[0].displayName} (+${accounts.length - 1} more)`
        : "Google Analytics";
      return { healthy: true, message: "Connected", latencyMs: Date.now() - start, accountLabel: label };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.response?.data?.error?.message || err.message || "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async runReport(
    credentials: ToolCredentials,
    input: { propertyId: string; startDate: string; endDate: string; metrics: string[]; dimensions?: string[] },
  ) {
    const { default: axios } = await import("axios");
    const res = await axios.post(
      `${GA4_DATA_API}/properties/${input.propertyId}:runReport`,
      {
        dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
        metrics: input.metrics.map((name) => ({ name })),
        dimensions: (input.dimensions || []).map((name) => ({ name })),
      },
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      },
    );
    const headers = [
      ...(res.data?.dimensionHeaders || []).map((h: any) => h.name),
      ...(res.data?.metricHeaders || []).map((h: any) => h.name),
    ];
    const rows = (res.data?.rows || []).map((row: any) => {
      const out: Record<string, string | number> = {};
      const cells = [
        ...(row.dimensionValues || []).map((v: any) => v.value),
        ...(row.metricValues || []).map((v: any) => Number(v.value) || v.value),
      ];
      headers.forEach((h, i) => {
        out[h] = cells[i];
      });
      return out;
    });
    return { rows };
  }
}
