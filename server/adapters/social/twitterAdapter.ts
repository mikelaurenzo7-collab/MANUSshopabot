/**
 * Twitter/X Social Adapter
 * Uses twitter-api-v2 package for Twitter API v2 access.
 * OAuth 2.0 PKCE for user context; Bearer token for read-only.
 */

import { TwitterApi } from "twitter-api-v2";
import type {
  SocialPlatformAdapter,
  SocialCredentials,
  SocialAccountInfo,
  CreatePostInput,
  SocialPost,
  PostMetrics,
  SocialAnalytics,
  CreateAdCampaignInput,
  AdCampaign,
} from "./types";

export class TwitterAdapter implements SocialPlatformAdapter {
  readonly platform = "twitter";
  readonly platformName = "Twitter / X";

  private getClient(credentials: SocialCredentials) {
    if (credentials.accessToken) {
      return new TwitterApi(credentials.accessToken);
    }
    throw new Error("Twitter access token required");
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const client = this.getClient(credentials);
    const me = await client.v2.me({
      "user.fields": ["id", "name", "username", "profile_image_url", "public_metrics", "verified"],
    });
    const user = me.data;
    return {
      platformId: user.id,
      name: user.name,
      handle: `@${user.username}`,
      profileImageUrl: user.profile_image_url,
      followerCount: user.public_metrics?.followers_count,
      followingCount: user.public_metrics?.following_count,
      postCount: user.public_metrics?.tweet_count,
      isVerified: user.verified,
      accountType: "user",
    };
  }

  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    const client = this.getClient(credentials);
    const tweetText = this.buildTweetText(post);

    let mediaId: string | undefined;
    if (post.imageUrl) {
      // Upload media first (requires v1.1 client)
      const v1Client = client.v1;
      try {
        const mediaUpload = await v1Client.uploadMedia(post.imageUrl, { type: "image/jpeg" });
        mediaId = mediaUpload;
      } catch {
        // Media upload failed, post without image
      }
    }

    const tweet = await client.v2.tweet({
      text: tweetText,
      media: mediaId ? { media_ids: [mediaId] } : undefined,
    });

    return {
      platformId: tweet.data.id,
      content: post.content,
      imageUrl: post.imageUrl,
      platform: this.platform,
      status: "published",
      publishedAt: new Date(),
      url: `https://twitter.com/i/web/status/${tweet.data.id}`,
    };
  }

  async schedulePost(credentials: SocialCredentials, post: CreatePostInput, scheduledAt: Date): Promise<SocialPost> {
    // Twitter API v2 does not support native scheduling via API
    // Store as a scheduled task in Beast Bots' own scheduler
    return {
      platformId: `scheduled_${Date.now()}`,
      content: post.content,
      imageUrl: post.imageUrl,
      platform: this.platform,
      status: "scheduled",
      scheduledAt,
      metadata: { pendingSchedule: true, postData: post },
    };
  }

  async deletePost(credentials: SocialCredentials, postId: string): Promise<void> {
    const client = this.getClient(credentials);
    await client.v2.deleteTweet(postId);
  }

  async getPostAnalytics(credentials: SocialCredentials, postId: string): Promise<PostMetrics> {
    const client = this.getClient(credentials);
    const tweet = await client.v2.singleTweet(postId, {
      "tweet.fields": ["public_metrics", "non_public_metrics", "organic_metrics"],
    });
    const metrics = tweet.data.public_metrics;
    const organic = tweet.data.organic_metrics;
    return {
      impressions: organic?.impression_count || 0,
      likes: metrics?.like_count || 0,
      comments: metrics?.reply_count || 0,
      shares: metrics?.retweet_count || 0,
      clicks: organic?.url_link_clicks || 0,
    };
  }

  async getAccountAnalytics(credentials: SocialCredentials, startDate: Date, endDate: Date): Promise<SocialAnalytics> {
    const client = this.getClient(credentials);
    const me = await client.v2.me({ "user.fields": ["public_metrics"] });
    const metrics = me.data.public_metrics;

    return {
      period: { start: startDate, end: endDate },
      impressions: 0, // Requires Twitter Ads API for aggregate impressions
      reach: metrics?.followers_count || 0,
      followerGrowth: 0, // Would need historical data
    };
  }

  async createAdCampaign(credentials: SocialCredentials, campaign: CreateAdCampaignInput): Promise<AdCampaign> {
    // Twitter Ads API requires separate OAuth app credentials
    const { default: axios } = await import("axios");
    const accountId = credentials.adAccountId || credentials.accountId;
    if (!accountId) throw new Error("Twitter Ads account ID required");

    const response = await axios.post(
      `https://ads-api.twitter.com/12/accounts/${accountId}/campaigns`,
      {
        name: campaign.name,
        funding_instrument_id: credentials.metadata?.fundingInstrumentId,
        daily_budget_amount_local_micro: (campaign.dailyBudgetCents || Math.floor(campaign.budgetCents / 30)) * 10000,
        total_budget_amount_local_micro: campaign.budgetCents * 10000,
        entity_status: "PAUSED",
        start_time: campaign.startDate?.toISOString(),
        end_time: campaign.endDate?.toISOString(),
      },
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      platformId: response.data.data.id,
      name: campaign.name,
      status: "paused",
      objective: campaign.objective,
      budgetCents: campaign.budgetCents,
      spentCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
  }

  async getAdCampaignPerformance(credentials: SocialCredentials, campaignId: string): Promise<AdCampaign> {
    const { default: axios } = await import("axios");
    const accountId = credentials.adAccountId || credentials.accountId;
    const response = await axios.get(
      `https://ads-api.twitter.com/12/stats/accounts/${accountId}`,
      {
        params: {
          entity: "CAMPAIGN",
          entity_ids: campaignId,
          metric_groups: "ENGAGEMENT,BILLING",
          granularity: "TOTAL",
          start_time: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end_time: new Date().toISOString(),
        },
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      }
    );

    const stats = response.data.data?.[0]?.id_data?.[0]?.metrics || {};
    return {
      platformId: campaignId,
      name: "Twitter Campaign",
      status: "active",
      objective: "conversions",
      budgetCents: 0,
      spentCents: Math.round((stats.billed_charge_local_micro?.[0] || 0) / 10000),
      impressions: stats.impressions?.[0] || 0,
      clicks: stats.url_clicks?.[0] || 0,
      conversions: stats.conversions?.[0] || 0,
    };
  }

  async listAdCampaigns(credentials: SocialCredentials): Promise<AdCampaign[]> {
    const { default: axios } = await import("axios");
    const accountId = credentials.adAccountId || credentials.accountId;
    if (!accountId) return [];
    const response = await axios.get(
      `https://ads-api.twitter.com/12/accounts/${accountId}/campaigns`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );
    return (response.data.data || []).map((c: any) => ({
      platformId: c.id,
      name: c.name,
      status: c.entity_status === "ACTIVE" ? "active" : "paused",
      objective: "traffic",
      budgetCents: Math.round((c.total_budget_amount_local_micro || 0) / 10000),
      spentCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    }));
  }

  async pauseAdCampaign(credentials: SocialCredentials, campaignId: string): Promise<void> {
    const { default: axios } = await import("axios");
    const accountId = credentials.adAccountId || credentials.accountId;
    await axios.put(
      `https://ads-api.twitter.com/12/accounts/${accountId}/campaigns/${campaignId}`,
      { entity_status: "PAUSED" },
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );
  }

  private buildTweetText(post: CreatePostInput): string {
    let text = post.content;
    if (post.hashtags?.length) {
      text += "\n\n" + post.hashtags.map(h => `#${h.replace(/^#/, "")}`).join(" ");
    }
    if (post.link) text += `\n\n${post.link}`;
    return text.substring(0, 280);
  }
}
