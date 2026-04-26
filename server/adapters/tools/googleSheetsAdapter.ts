/**
 * Google Sheets adapter — OAuth 2.0 (Google).
 * Reuses the existing GOOGLE_CLIENT_ID/SECRET app; we only need the
 * `spreadsheets` scope added at the OAuth start step.
 *
 * Used by: Architect bot (catalog sync, P&L dumps, supplier sheets).
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  SpreadsheetCapabilities,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const USERINFO_API = "https://www.googleapis.com/oauth2/v2/userinfo";

export class GoogleSheetsAdapter implements ToolConnectorAdapter, SpreadsheetCapabilities {
  readonly tool = "google_sheets";
  readonly toolName = "Google Sheets";
  readonly category: ToolCategory = "data";
  readonly bots: ReadonlyArray<BotDomain> = ["architect", "merchant", "social"];
  readonly capabilities = [
    "Read product catalogs from a sheet",
    "Append orders/events to a log tab",
    "Sync supplier price lists",
    "Export merchant insights on a schedule",
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
      const res = await axios.get(USERINFO_API, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      });
      return {
        healthy: true,
        message: "Connected",
        latencyMs: Date.now() - start,
        accountLabel: res.data?.email || res.data?.name || "Google account",
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.response?.data?.error?.message || err.message || "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async listSheets(credentials: ToolCredentials, spreadsheetId: string) {
    const { default: axios } = await import("axios");
    const res = await axios.get(`${SHEETS_API}/${spreadsheetId}?fields=sheets(properties(sheetId,title))`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
    });
    return (res.data?.sheets || []).map((s: any) => ({
      id: s.properties?.sheetId ?? 0,
      title: s.properties?.title || "",
    }));
  }

  async readRange(credentials: ToolCredentials, spreadsheetId: string, range: string): Promise<string[][]> {
    const { default: axios } = await import("axios");
    const res = await axios.get(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
    });
    return res.data?.values || [];
  }

  async appendRows(credentials: ToolCredentials, spreadsheetId: string, range: string, values: string[][]) {
    const { default: axios } = await import("axios");
    const res = await axios.post(
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { values },
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      },
    );
    return { updatedRange: res.data?.updates?.updatedRange || range };
  }
}
