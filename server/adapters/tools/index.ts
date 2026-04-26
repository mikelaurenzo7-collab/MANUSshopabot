/**
 * Shop_a_Bot — Tool Connector Registry
 *
 * Central factory returning the right adapter for any tool id.
 * Architect, Merchant, and Social bots resolve credentials from the
 * `platformCredentials` table and call adapters through this registry.
 */

export * from "./types";
export { GoogleSheetsAdapter } from "./googleSheetsAdapter";
export { GoogleAnalyticsAdapter } from "./googleAnalyticsAdapter";
export { KlaviyoAdapter } from "./klaviyoAdapter";
export { ShipStationAdapter } from "./shipstationAdapter";
export { PostscriptAdapter } from "./postscriptAdapter";
export { PrintfulAdapter } from "./printfulAdapter";
export { JudgeMeAdapter } from "./judgemeAdapter";
export { GorgiasAdapter } from "./gorgiasAdapter";

import type { ToolConnectorAdapter, ToolCredentials } from "./types";
import { GoogleSheetsAdapter } from "./googleSheetsAdapter";
import { GoogleAnalyticsAdapter } from "./googleAnalyticsAdapter";
import { KlaviyoAdapter } from "./klaviyoAdapter";
import { ShipStationAdapter } from "./shipstationAdapter";
import { PostscriptAdapter } from "./postscriptAdapter";
import { PrintfulAdapter } from "./printfulAdapter";
import { JudgeMeAdapter } from "./judgemeAdapter";
import { GorgiasAdapter } from "./gorgiasAdapter";

const adapters: Record<string, ToolConnectorAdapter> = {
  google_sheets: new GoogleSheetsAdapter(),
  google_analytics: new GoogleAnalyticsAdapter(),
  klaviyo: new KlaviyoAdapter(),
  shipstation: new ShipStationAdapter(),
  postscript: new PostscriptAdapter(),
  printful: new PrintfulAdapter(),
  judgeme: new JudgeMeAdapter(),
  gorgias: new GorgiasAdapter(),
};

export function getToolAdapter(tool: string): ToolConnectorAdapter {
  const adapter = adapters[tool.toLowerCase()];
  if (!adapter) {
    throw new Error(
      `Unsupported tool connector: "${tool}". ` +
        `Supported tools: ${Object.keys(adapters).join(", ")}`,
    );
  }
  return adapter;
}

export const SUPPORTED_TOOL_CONNECTORS = Object.keys(adapters);

/** Build ToolCredentials from a platform_credentials DB record. */
export function buildToolCredentials(record: {
  platform: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  metadata?: any;
}): ToolCredentials {
  const meta = typeof record.metadata === "string" ? JSON.parse(record.metadata) : record.metadata || {};
  return {
    tool: record.platform,
    accessToken: record.accessToken || undefined,
    refreshToken: record.refreshToken || undefined,
    apiKey: meta.apiKey || meta.token || undefined,
    apiSecret: meta.apiSecret || undefined,
    accountHost: meta.accountHost || meta.subdomain || meta.shopDomain || undefined,
    metadata: meta,
  };
}
