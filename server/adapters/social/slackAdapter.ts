/**
 * Slack adapter — Web API + OAuth v2 (chat:write, channels:read,
 * users:read).
 *
 * Slack is a 1:many social channel for community-of-practice merchants
 * — DTC brands with VIP customer Slack channels, B2B brands using
 * Slack as a support surface, agencies running internal #ops channels.
 * The Social bot drives Slack as a publish-and-listen surface: post
 * announcements + product drops to a channel, fetch reactions as a
 * proxy for engagement, escalate DMs into Gorgias tickets.
 *
 * Auth: OAuth v2. Bot token (`xoxb-...`) is stored as accessToken;
 * the user-level access token (`xoxe.xoxp-...`) is stored on
 * metadata.userToken when the OAuth flow asked for user_scope.
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

const SLACK_API_BASE = "https://slack.com/api";

export class SlackAdapter implements SocialPlatformAdapter {
  readonly platform = "slack";
  readonly platformName = "Slack";

  /**
   * Slack: 1:many community channel. The Social bot uses it for
   * announcements, drop pre-launches to VIP channels, and feedback
   * harvesting via reactions. No paid-distribution surface (Slack ads
   * are not a thing) — it's organic by design.
   */
  getCapabilities(): SocialPlatformCapabilities {
    return {
      image: true,
      video: false,
      shortFormVideo: false,
      carousel: false,
      stories: false,
      liveStream: false,
      maxCopyChars: 40000,
      preferredAspectRatios: [],
      maxVideoSeconds: 0,
      scheduledPosting: true,
      hashtagSupport: "ignored",
      ads: false,
      adFormats: [],
      maxAdCopyChars: 0,
      audienceTargeting: "none",
      dynamicProductAds: false,
      recommendedPostsPerDay: 3,
      rateLimitTokensPerSec: 1,
      audienceType: "engagement",
      strengths: [
        "VIP community channels — drop announcements before they hit Twitter",
        "Native scheduledMessages.* — Slack handles deferred sends",
        "Reactions API gives a clean engagement signal without comment moderation",
        "Block Kit lets the bot send rich product cards instead of plain text",
      ],
      limitations: [
        "Tier-1 rate limits: 1 message / sec / channel — bot batches with backoff",
        "No paid distribution; no algorithmic amplification — reach = workspace size",
        "Token rotation: long-running bots must refresh xoxe-* tokens or re-OAuth",
      ],
    };
  }

  private async fetch(
    path: string,
    credentials: SocialCredentials,
    options?: { method?: string; body?: any },
  ) {
    const { default: axios } = await import("axios");
    const token = credentials.accessToken || "";
    return withRetry(
      async () => {
        const res = await axios({
          url: `${SLACK_API_BASE}${path}`,
          method: (options?.method || "POST") as any,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        if (res.data && res.data.ok === false) {
          // Slack returns 200 with `ok:false` for application errors —
          // surface the error string so withRetry doesn't loop on
          // permission failures.
          throw new Error(`Slack API error: ${res.data.error || "unknown"}`);
        }
        return res.data;
      },
      { maxRetries: 3, initialDelayMs: 1000 },
    );
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const data = await this.fetch("/auth.test", credentials);
    return {
      platformId: data.user_id || data.team_id || "slack",
      name: data.team || "Slack Workspace",
      handle: data.user,
      accountType: "personal",
      followerCount: undefined,
    };
  }

  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    const channel: string = post.metadata?.channel || post.metadata?.channelId;
    if (!channel) throw new Error("Slack createPost requires metadata.channel (id or #name)");

    // Block Kit: when the caller supplies metadata.blocks we use it
    // verbatim. Otherwise, build a plain-text + optional image payload.
    const body: any = {
      channel,
      text: post.content,
    };
    if (Array.isArray(post.metadata?.blocks)) body.blocks = post.metadata.blocks;
    if (post.imageUrl && !body.blocks) {
      body.blocks = [
        { type: "section", text: { type: "mrkdwn", text: post.content } },
        { type: "image", image_url: post.imageUrl, alt_text: post.metadata?.subject || "image" },
      ];
    }

    const result = await this.fetch("/chat.postMessage", credentials, { body });
    return {
      platformId: result.ts || `slack_${Date.now()}`,
      content: post.content,
      platform: "slack",
      status: "published",
      publishedAt: new Date(),
      metadata: { channel: result.channel, ts: result.ts, threadTs: result.message?.thread_ts },
    };
  }

  async schedulePost(
    credentials: SocialCredentials,
    post: CreatePostInput,
    scheduledAt: Date,
  ): Promise<SocialPost> {
    const channel: string = post.metadata?.channel || post.metadata?.channelId;
    if (!channel) throw new Error("Slack schedulePost requires metadata.channel");

    const result = await this.fetch("/chat.scheduleMessage", credentials, {
      body: {
        channel,
        text: post.content,
        post_at: Math.floor(scheduledAt.getTime() / 1000),
      },
    });
    return {
      platformId: result.scheduled_message_id,
      content: post.content,
      platform: "slack",
      status: "scheduled",
      scheduledAt,
      metadata: { channel: result.channel },
    };
  }

  async deletePost(credentials: SocialCredentials, postId: string): Promise<void> {
    // postId here is the message timestamp `ts`. Channel is required
    // for chat.delete; bots that called createPost should have it on
    // the SocialPost.metadata.channel — when missing, this is a no-op.
    // We surface that at the engine layer so we're not swallowing it.
    throw new Error(
      "Slack deletePost requires the source channel id alongside the message ts. " +
        "Pass metadata.channel through the workflow context and use the engine's " +
        "store_action layer instead of this adapter directly.",
    );
  }

  async getPostAnalytics(_credentials: SocialCredentials, _postId: string): Promise<PostMetrics> {
    // Slack doesn't expose per-message analytics by default. Reactions
    // are queryable via reactions.get but require the message ts +
    // channel — surfaced through eliteExtensions.
    return {};
  }

  async getAccountAnalytics(
    credentials: SocialCredentials,
    startDate: Date,
    _endDate: Date,
  ): Promise<SocialAnalytics> {
    // Use conversations.list to count public + private channels the
    // bot has access to. A real engagement number would require
    // walking message history, which is throttled per channel — we
    // keep this O(1) and return channel + member counts as a proxy.
    const data = await this.fetch("/conversations.list", credentials, {
      method: "GET",
      body: { limit: 200 },
    });
    const channels = data.channels || [];
    const totalMembers = channels.reduce((sum: number, c: any) => sum + (c.num_members || 0), 0);
    return {
      period: { start: startDate, end: _endDate },
      reach: totalMembers,
      impressions: channels.length,
    };
  }

  async createAdCampaign(
    _credentials: SocialCredentials,
    _campaign: CreateAdCampaignInput,
  ): Promise<AdCampaign> {
    throw new Error("Slack does not support paid distribution.");
  }

  async getAdCampaignPerformance(
    _credentials: SocialCredentials,
    _campaignId: string,
  ): Promise<AdCampaign> {
    throw new Error("Slack does not support ad campaigns.");
  }

  async listAdCampaigns(_credentials: SocialCredentials): Promise<AdCampaign[]> {
    return [];
  }

  async pauseAdCampaign(_credentials: SocialCredentials, _campaignId: string): Promise<void> {
    throw new Error("Slack does not support ad campaigns.");
  }

  async healthCheck(
    credentials: SocialCredentials,
  ): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.verifyConnection(credentials);
      return { healthy: true, message: "Slack connection verified", latencyMs: Date.now() - start };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.message || "Slack connection failed",
        latencyMs: Date.now() - start,
      };
    }
  }
}
