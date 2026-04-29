/**
 * Outlook adapter — Microsoft Graph v1.0 (Mail + Calendar).
 *
 * Outlook is the Microsoft-side counterpart to Gmail: a 1:1 email
 * channel the Social Bot uses for transactional + customer-support
 * sends. Same shape as the Gmail adapter so the workflow engine
 * doesn't care which inbox a customer comes from.
 *
 * The same Microsoft Graph token also unlocks Calendars.* — so when
 * the operator-facing surface needs to schedule a meeting with a
 * customer (RMA call, B2B review), the Merchant bot can drop an event
 * straight onto the user's calendar without a second OAuth dance. We
 * surface that as a separate `createCalendarEvent` extension method
 * so the standard SocialPlatformAdapter stays uniform.
 *
 * Auth: Azure App Registration → Microsoft Graph delegated permissions:
 *   Mail.Read · Mail.Send · Calendars.Read · Calendars.ReadWrite ·
 *   User.Read · offline_access (for refresh tokens)
 */

import { withRetry } from "../../utils/rateLimiter";
import type {
  SocialPlatformAdapter,
  SocialCredentials,
  SocialPlatformCapabilities,
  SocialAccountInfo,
  CreatePostInput,
  SocialPost,
  PostMetrics,
  SocialAnalytics,
  CreateAdCampaignInput,
  AdCampaign,
} from "./types";
import { ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

export class OutlookAdapter implements SocialPlatformAdapter {
  readonly platform = "outlook";
  readonly platformName = "Outlook";

  /**
   * Outlook: 1:1 channel for transactional + B2B + support flows. Same
   * profile as Gmail — high trust, no algorithm filter, no paid-
   * distribution surface. The Microsoft side dominates B2B inboxes
   * (Office 365 + Outlook.com), so this matters for any merchant
   * doing wholesale or service-business comms.
   */
  getCapabilities(): SocialPlatformCapabilities {
    return {
      image: true,
      video: false,
      shortFormVideo: false,
      carousel: false,
      stories: false,
      liveStream: false,
      maxCopyChars: 0,
      preferredAspectRatios: [],
      maxVideoSeconds: 0,
      scheduledPosting: true,
      hashtagSupport: "ignored",
      ads: false,
      adFormats: [],
      maxAdCopyChars: 0,
      audienceTargeting: "none",
      dynamicProductAds: false,
      recommendedPostsPerDay: 50,
      rateLimitTokensPerSec: 4,
      audienceType: "engagement",
      strengths: [
        "Office 365 dominance — strongest reach into B2B + corporate inboxes",
        "Native send-later via Graph (deferDeliveryDateTime) — no app-level scheduler needed",
        "Calendar API piggy-backs on the same token — bot can schedule meetings inline",
      ],
      limitations: [
        "Throttling tier varies by tenant (250 messages / 15 min on shared inboxes)",
        "Personal Outlook.com accounts cap at ~250 messages / day",
        "No paid-distribution surface — Outlook is organic-only",
      ],
    };
  }

  private async getAccessToken(credentials: SocialCredentials): Promise<string> {
    if (credentials.accessToken) return credentials.accessToken;
    const { default: axios } = await import("axios");
    const tenant = credentials.metadata?.tenantId || process.env.AZURE_TENANT_ID || "common";
    const response = await axios.post(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: credentials.metadata?.clientId || process.env.AZURE_CLIENT_ID || "",
        client_secret: credentials.metadata?.clientSecret || process.env.AZURE_CLIENT_SECRET || "",
        refresh_token: credentials.refreshToken || "",
        grant_type: "refresh_token",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: ADAPTER_HTTP_TIMEOUT_MS,
      },
    );
    return response.data.access_token;
  }

  private async fetch(
    path: string,
    credentials: SocialCredentials,
    options?: { method?: string; body?: any; raw?: boolean },
  ) {
    const { default: axios } = await import("axios");
    const token = await this.getAccessToken(credentials);
    return withRetry(
      async () => {
        try {
          const res = await axios({
            url: `${GRAPH_API_BASE}${path}`,
            method: (options?.method || "GET") as any,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": options?.raw ? "text/plain" : "application/json",
              Accept: "application/json",
            },
            data: options?.body,
            timeout: ADAPTER_HTTP_TIMEOUT_MS,
          });
          return res.data;
        } catch (err: any) {
          if (err.response?.status === 429) throw err;
          const msg =
            err.response?.data?.error?.message ||
            err.response?.data?.message ||
            err.message;
          throw new Error(`Microsoft Graph error: ${msg}`);
        }
      },
      { maxRetries: 3, initialDelayMs: 1000 },
    );
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const me = await this.fetch("/me", credentials);
    return {
      platformId: me.id || me.userPrincipalName || me.mail || "outlook",
      name: me.displayName || me.userPrincipalName || "Outlook Account",
      handle: me.userPrincipalName || me.mail,
      accountType: "email",
    };
  }

  /**
   * "Post" on Outlook = send an email. metadata.to is required;
   * metadata.subject is the message subject; content is the HTML body.
   */
  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    const to: string = post.metadata?.to || post.metadata?.recipient;
    const subject: string = post.metadata?.subject || "Message from Shop_a_Bot";
    if (!to) throw new Error("Outlook createPost requires metadata.to (recipient email)");

    const recipients = (Array.isArray(to) ? to : [to]).map((addr) => ({
      emailAddress: { address: addr },
    }));

    const result = await this.fetch("/me/sendMail", credentials, {
      method: "POST",
      body: {
        message: {
          subject,
          body: { contentType: "HTML", content: post.content },
          toRecipients: recipients,
          // Optional: ccRecipients / bccRecipients via metadata
          ccRecipients: (post.metadata?.cc || []).map((a: string) => ({ emailAddress: { address: a } })),
        },
        saveToSentItems: true,
      },
    });

    return {
      platformId: `outlook_${Date.now()}`,
      content: post.content,
      platform: "outlook",
      status: "published",
      publishedAt: new Date(),
      metadata: { to, subject, response: result },
    };
  }

  async schedulePost(
    credentials: SocialCredentials,
    post: CreatePostInput,
    scheduledAt: Date,
  ): Promise<SocialPost> {
    // Microsoft Graph: create a draft, then PATCH `singleValueExtendedProperties`
    // so the message defers until scheduledAt. We use the simpler approach
    // — set `deferredDeliveryDateTime` on the draft (corresponds to
    // PR_DEFERRED_DELIVERY_TIME 0x3FEF MAPI property).
    const to: string = post.metadata?.to || post.metadata?.recipient;
    const subject: string = post.metadata?.subject || "Message from Shop_a_Bot";
    if (!to) throw new Error("Outlook schedulePost requires metadata.to");

    const draft = await this.fetch("/me/messages", credentials, {
      method: "POST",
      body: {
        subject,
        body: { contentType: "HTML", content: post.content },
        toRecipients: [{ emailAddress: { address: to } }],
        singleValueExtendedProperties: [
          {
            id: "SystemTime 0x3FEF",
            value: scheduledAt.toISOString(),
          },
        ],
      },
    });

    await this.fetch(`/me/messages/${draft.id}/send`, credentials, { method: "POST" });

    return {
      platformId: draft.id,
      content: post.content,
      platform: "outlook",
      status: "scheduled",
      scheduledAt,
      metadata: { to, subject },
    };
  }

  async deletePost(credentials: SocialCredentials, postId: string): Promise<void> {
    // Move to deleted-items rather than permanent delete.
    await this.fetch(`/me/messages/${postId}/move`, credentials, {
      method: "POST",
      body: { destinationId: "deleteditems" },
    });
  }

  async getPostAnalytics(_credentials: SocialCredentials, _postId: string): Promise<PostMetrics> {
    // Outlook doesn't expose per-message engagement metrics through
    // Graph (no native open / click rates). Email tracking would need
    // a tracking pixel injected at the app level.
    return {};
  }

  async getAccountAnalytics(
    credentials: SocialCredentials,
    startDate: Date,
    endDate: Date,
  ): Promise<SocialAnalytics> {
    // Count messages sent in the window via the SentItems folder.
    const filter = `sentDateTime ge ${startDate.toISOString()} and sentDateTime le ${endDate.toISOString()}`;
    const data = await this.fetch(
      `/me/mailFolders/sentitems/messages?$count=true&$top=1&$filter=${encodeURIComponent(filter)}`,
      credentials,
    );
    const totalSent = data["@odata.count"] || 0;
    return {
      period: { start: startDate, end: endDate },
      impressions: totalSent,
      reach: totalSent,
    };
  }

  async createAdCampaign(
    _credentials: SocialCredentials,
    _campaign: CreateAdCampaignInput,
  ): Promise<AdCampaign> {
    throw new Error("Outlook does not support ad campaigns — use the Social Bot's email campaign feature instead.");
  }

  async getAdCampaignPerformance(
    _credentials: SocialCredentials,
    _campaignId: string,
  ): Promise<AdCampaign> {
    throw new Error("Outlook does not support ad campaigns.");
  }

  async listAdCampaigns(_credentials: SocialCredentials): Promise<AdCampaign[]> {
    return [];
  }

  async pauseAdCampaign(_credentials: SocialCredentials, _campaignId: string): Promise<void> {
    throw new Error("Outlook does not support ad campaigns.");
  }

  async healthCheck(
    credentials: SocialCredentials,
  ): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.verifyConnection(credentials);
      return { healthy: true, message: "Outlook (Microsoft Graph) connection verified", latencyMs: Date.now() - start };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.message || "Outlook connection failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  // ─── Calendar bonus: not part of the SocialPlatformAdapter contract,
  //    but the same token unlocks it. eliteExtensions.ts surfaces this
  //    through getOutlookEliteExtensions(). ──────────────────────────────
  async createCalendarEvent(
    credentials: SocialCredentials,
    event: {
      subject: string;
      bodyHtml?: string;
      attendees?: string[];
      startIso: string;
      endIso: string;
      location?: string;
    },
  ): Promise<{ id: string; webLink?: string }> {
    const result = await this.fetch("/me/events", credentials, {
      method: "POST",
      body: {
        subject: event.subject,
        body: { contentType: "HTML", content: event.bodyHtml || "" },
        start: { dateTime: event.startIso, timeZone: "UTC" },
        end: { dateTime: event.endIso, timeZone: "UTC" },
        location: event.location ? { displayName: event.location } : undefined,
        attendees: (event.attendees || []).map((email) => ({
          emailAddress: { address: email },
          type: "required",
        })),
      },
    });
    return { id: result.id, webLink: result.webLink };
  }
}
