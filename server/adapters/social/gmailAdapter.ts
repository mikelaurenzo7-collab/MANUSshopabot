/**
 * Gmail Adapter
 * Uses Gmail API v1 via REST for email marketing and customer communication.
 * OAuth 2.0 with refresh token for access.
 * Gmail is treated as a "social" channel for the Social Bot to send
 * promotional emails, abandoned cart recovery, and newsletter campaigns.
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

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

export class GmailAdapter implements SocialPlatformAdapter {
  readonly platform = "gmail";
  readonly platformName = "Gmail";

  /**
   * Gmail: 1:1 email channel for transactional + customer-support flows.
   * No social-style audience features — Social Bot uses this for
   * order-confirmation auto-replies, abandoned-cart sequences, and
   * support triage rather than broadcast. No ads concept on Gmail's
   * sender side. Daily send limits cap volume.
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
        "Direct 1:1 reach — no algorithm filter between bot and customer",
        "Native template + signature + scheduled-send — Social Bot drafts, sends on cadence",
        "Highest-trust channel for transactional + support flows",
      ],
      limitations: [
        "Daily send caps (~500/day on free Gmail, 2k/day on Workspace)",
        "Spam-folder risk if bot misuses for broadcast (use SendGrid for that)",
        "No paid-distribution surface — Gmail-as-channel is organic-only",
      ],
    };
  }

  private async getAccessToken(credentials: SocialCredentials): Promise<string> {
    if (credentials.accessToken) return credentials.accessToken;
    const { default: axios } = await import("axios");
    const response = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: credentials.metadata?.clientId || process.env.GOOGLE_CLIENT_ID,
      client_secret: credentials.metadata?.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }, { timeout: ADAPTER_HTTP_TIMEOUT_MS });
    return response.data.access_token;
  }

  private async fetch(path: string, credentials: SocialCredentials, options?: { method?: string; body?: any }) {
    const { default: axios } = await import("axios");
    const token = await this.getAccessToken(credentials);

    return withRetry(async () => {
      try {
        const response = await axios({
          url: `${GMAIL_API_BASE}${path}`,
          method: (options?.method || "GET") as any,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return response.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`Gmail API error: ${err.response?.data?.error?.message || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1000 });
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const profile = await this.fetch("/users/me/profile", credentials);
    return {
      platformId: profile.emailAddress || "unknown",
      name: profile.emailAddress || "Gmail Account",
      handle: profile.emailAddress,
      accountType: "email",
    };
  }

  /**
   * "Post" in Gmail context = send an email.
   * content = email body (HTML supported)
   * metadata.to = recipient email
   * metadata.subject = email subject
   */
  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    const to = post.metadata?.to || post.metadata?.recipient;
    const subject = post.metadata?.subject || "Message from Shop_a_Bot";
    const htmlBody = post.content;

    if (!to) {
      throw new Error("Gmail createPost requires metadata.to (recipient email address)");
    }

    // Build RFC 2822 MIME message
    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      htmlBody,
    ];
    const rawMessage = messageParts.join("\r\n");
    const encodedMessage = Buffer.from(rawMessage).toString("base64url");

    const result = await this.fetch("/users/me/messages/send", credentials, {
      method: "POST",
      body: { raw: encodedMessage },
    });

    return {
      platformId: result.id || `gmail_${Date.now()}`,
      content: post.content,
      platform: "gmail",
      status: "published",
      publishedAt: new Date(),
      metadata: { to, subject, threadId: result.threadId },
    };
  }

  async schedulePost(_credentials: SocialCredentials, _post: CreatePostInput, _scheduledAt: Date): Promise<SocialPost> {
    // Gmail doesn't natively support scheduled sends via API (only Gmail UI does)
    // We handle scheduling at the application level via the job queue
    throw new Error("Gmail scheduled sends are handled by the Shop_a_Bot job queue, not the Gmail API directly.");
  }

  async deletePost(credentials: SocialCredentials, postId: string): Promise<void> {
    // Move to trash instead of permanent delete for safety
    await this.fetch(`/users/me/messages/${postId}/trash`, credentials, { method: "POST" });
  }

  async getPostAnalytics(_credentials: SocialCredentials, _postId: string): Promise<PostMetrics> {
    // Gmail doesn't provide per-message analytics (open rates, etc.)
    // Email tracking would need to be implemented via tracking pixels at the app level
    return {};
  }

  async getAccountAnalytics(credentials: SocialCredentials, startDate: Date, endDate: Date): Promise<SocialAnalytics> {
    // Query sent messages in the date range
    const afterEpoch = Math.floor(startDate.getTime() / 1000);
    const beforeEpoch = Math.floor(endDate.getTime() / 1000);
    const query = `in:sent after:${afterEpoch} before:${beforeEpoch}`;

    const data = await this.fetch(`/users/me/messages?q=${encodeURIComponent(query)}&maxResults=1`, credentials);
    const totalSent = data.resultSizeEstimate || 0;

    return {
      period: { start: startDate, end: endDate },
      impressions: totalSent, // emails sent = "impressions" equivalent
      reach: totalSent,
    };
  }

  async createAdCampaign(_credentials: SocialCredentials, _campaign: CreateAdCampaignInput): Promise<AdCampaign> {
    // Gmail doesn't have native ad campaigns — email campaigns are managed at the app level
    throw new Error("Gmail does not support ad campaigns. Use the Social Bot email campaign feature instead.");
  }

  async getAdCampaignPerformance(_credentials: SocialCredentials, _campaignId: string): Promise<AdCampaign> {
    throw new Error("Gmail does not support ad campaigns.");
  }

  async listAdCampaigns(_credentials: SocialCredentials): Promise<AdCampaign[]> {
    return []; // No native ad campaigns in Gmail
  }

  async pauseAdCampaign(_credentials: SocialCredentials, _campaignId: string): Promise<void> {
    throw new Error("Gmail does not support ad campaigns.");
  }

  async healthCheck(credentials: SocialCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.verifyConnection(credentials);
      return { healthy: true, message: "Gmail connection verified", latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, message: err.message || "Gmail connection failed", latencyMs: Date.now() - start };
    }
  }
}
