/**
 * Shop_a_Bot — Tool Connector Adapter Interface
 *
 * Tool connectors are utility integrations the three bots (Architect,
 * Merchant, Social) use alongside e-commerce platforms and social
 * accounts. Where ecom adapters answer "where do I sell?" and social
 * adapters answer "where do I publish?", tool connectors answer
 * "what cross-cutting capability do I plug in?" — spreadsheets,
 * email/SMS marketing, fulfillment, reviews, support, analytics.
 *
 * Every tool adapter implements this contract so bots can resolve
 * credentials → call typed methods → receive normalized results,
 * exactly the same workflow used by ecommerce/social registries.
 */

/** Per-request HTTP timeout for tool adapter calls. */
export const TOOL_ADAPTER_HTTP_TIMEOUT_MS = 20_000;

/** Bot domains that consume a given tool. */
export type BotDomain = "architect" | "merchant" | "social";

/** Functional category — drives UI grouping on the Integrations page. */
export type ToolCategory =
  | "data"          // Sheets, Airtable, GA4
  | "marketing"     // Klaviyo, Mailchimp
  | "messaging"     // Postscript, Twilio
  | "logistics"     // ShipStation, EasyPost
  | "fulfillment"   // Printful, Printify
  | "reviews"       // Judge.me, Yotpo
  | "support"       // Gorgias, Zendesk
  | "analytics"     // GA4, Triple Whale
  | "research";     // Firecrawl, Tavily — gives the agent web data

export interface ToolCredentials {
  /** Tool identifier — must match the registry key. */
  tool: string;
  /** OAuth bearer (Google Sheets, GA4). */
  accessToken?: string;
  /** OAuth refresh token. */
  refreshToken?: string;
  /** API key — for keyed tools (Klaviyo, Printful, Postscript, Judge.me, Gorgias). */
  apiKey?: string;
  /** Secondary secret (ShipStation: API secret; Judge.me: shop_domain). */
  apiSecret?: string;
  /** Tool-specific subdomain or account host (Gorgias: subdomain.gorgias.com, Judge.me: shop.myshopify.com, GA4: propertyId). */
  accountHost?: string;
  /** Free-form metadata bag (list IDs, property IDs, defaults). */
  metadata?: Record<string, any>;
}

export interface ToolHealthCheck {
  healthy: boolean;
  message: string;
  latencyMs: number;
  /** Optional account label surfaced in the UI ("My Klaviyo · acme@store.com"). */
  accountLabel?: string;
}

/**
 * Base contract all tool adapters honor.
 * Specialized capabilities live on per-tool subinterfaces.
 */
export interface ToolConnectorAdapter {
  readonly tool: string;
  readonly toolName: string;
  readonly category: ToolCategory;
  /** Which bots can invoke this tool's capabilities. */
  readonly bots: ReadonlyArray<BotDomain>;
  /** Plain-English capabilities surfaced to the user. */
  readonly capabilities: ReadonlyArray<string>;

  /** Verify the credential and return a friendly account label. */
  verifyConnection(credentials: ToolCredentials): Promise<ToolHealthCheck>;

  /** Lightweight health check used by scheduled credential audits. */
  healthCheck(credentials: ToolCredentials): Promise<ToolHealthCheck>;
}

// ─── Specialized capability shapes (typed per category) ───────────────────

/** Spreadsheet (Google Sheets) capabilities used by the Architect bot. */
export interface SpreadsheetCapabilities {
  listSheets(credentials: ToolCredentials, spreadsheetId: string): Promise<Array<{ id: number; title: string }>>;
  readRange(credentials: ToolCredentials, spreadsheetId: string, range: string): Promise<string[][]>;
  appendRows(credentials: ToolCredentials, spreadsheetId: string, range: string, values: string[][]): Promise<{ updatedRange: string }>;
}

/** Email/SMS marketing (Klaviyo) — used by Merchant + Social bots. */
export interface MarketingCapabilities {
  listLists(credentials: ToolCredentials): Promise<Array<{ id: string; name: string; memberCount?: number }>>;
  upsertProfile(credentials: ToolCredentials, profile: { email: string; firstName?: string; lastName?: string; properties?: Record<string, any> }): Promise<{ id: string }>;
  addToList(credentials: ToolCredentials, listId: string, emails: string[]): Promise<{ added: number }>;
}

/** SMS (Postscript) — used by Social bot. */
export interface MessagingCapabilities {
  sendMessage(credentials: ToolCredentials, to: string, body: string): Promise<{ id: string; status: string }>;
  listKeywords(credentials: ToolCredentials): Promise<Array<{ id: string; keyword: string; subscriberCount?: number }>>;
}

/** Shipping (ShipStation) — used by Merchant bot. */
export interface LogisticsCapabilities {
  listOrders(credentials: ToolCredentials, params?: { limit?: number; status?: string }): Promise<Array<{ orderId: string; orderNumber: string; status: string }>>;
  getRates(credentials: ToolCredentials, input: { fromZip: string; toZip: string; weightOz: number; carrier?: string }): Promise<Array<{ carrier: string; service: string; cost: number }>>;
  createLabel(credentials: ToolCredentials, orderId: string, options: { carrier: string; service: string }): Promise<{ trackingNumber: string; labelUrl: string }>;
}

/** Print-on-demand (Printful) — used by Merchant bot. */
export interface FulfillmentCapabilities {
  listProducts(credentials: ToolCredentials): Promise<Array<{ id: number; name: string; thumbnail?: string }>>;
  createOrder(credentials: ToolCredentials, input: { recipient: { name: string; address1: string; city: string; state: string; zip: string; country: string }; items: Array<{ variantId: number; quantity: number }> }): Promise<{ id: number; status: string }>;
}

/** Reviews (Judge.me) — used by Merchant + Social bots. */
export interface ReviewsCapabilities {
  listReviews(credentials: ToolCredentials, params?: { limit?: number; minRating?: number }): Promise<Array<{ id: number; rating: number; body: string; reviewerName?: string; productId?: string }>>;
  replyToReview(credentials: ToolCredentials, reviewId: number, body: string): Promise<{ id: number }>;
}

/** Help desk (Gorgias) — used by Merchant bot. */
export interface SupportCapabilities {
  listTickets(credentials: ToolCredentials, params?: { limit?: number; status?: string }): Promise<Array<{ id: number; subject: string; status: string; customerEmail?: string }>>;
  replyToTicket(credentials: ToolCredentials, ticketId: number, body: string): Promise<{ id: number }>;
}

/** Analytics (GA4) — used by all three bots. */
export interface AnalyticsCapabilities {
  runReport(credentials: ToolCredentials, input: { propertyId: string; startDate: string; endDate: string; metrics: string[]; dimensions?: string[] }): Promise<{ rows: Array<Record<string, string | number>> }>;
}

/** Web scraping (Firecrawl) — used by all three bots to ground LLM
 *  reasoning in real page content. */
export interface ScrapeResult {
  /** The URL the user asked to scrape (after schema normalisation). */
  url: string;
  /** LLM-ready markdown, trimmed to the adapter's max-bytes budget. */
  markdown: string;
  /** True when the scrape was longer than the budget and got cut. */
  truncated: boolean;
  title: string | null;
  description: string | null;
  /** HTTP status the scraper observed for the underlying fetch. */
  statusCode: number | null;
  /** Vendor-reported source URL after redirects (often differs from
   *  the input on sites that 302 to a canonical product page). */
  sourceUrl: string;
}

export interface ScrapeCapabilities {
  scrapeUrl(
    credentials: ToolCredentials,
    url: string,
    options?: { onlyMainContent?: boolean; formats?: Array<"markdown" | "html"> },
  ): Promise<ScrapeResult>;
}
