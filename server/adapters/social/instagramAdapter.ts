/**
 * Instagram Social Adapter
 * Uses Instagram Graph API v19.0 via axios.
 * Requires Instagram Business/Creator account connected to a Facebook Page.
 * Handles feed posts, reels, stories, and shopping tags.
 */

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
import { withRetry, platformRateLimiters } from "../../utils/rateLimiter";
import { ENV } from "../../_core/env";

const IG_BASE = ENV.metaGraphApiBase || "https://graph.facebook.com/v19.0";

export class InstagramAdapter implements SocialPlatformAdapter {
  readonly platform = "instagram";
  readonly platformName = "Instagram";

  private getBase(): string {
    return ENV.metaGraphApiBase || IG_BASE;
  }

  private async fetch(path: string, credentials: SocialCredentials, options?: { method?: string; body?: any; params?: Record<string, string> }) {
    const { default: axios } = await import("axios");
    const base = this.getBase();
    const params = new URLSearchParams({
      access_token: credentials.accessToken,
      ...options?.params,
    });
    await platformRateLimiters.meta.acquire();
    return withRetry(async () => {
      try {
        const response = await axios({
          url: `${base}${path}?${params.toString()}`,
          method: (options?.method || "GET") as any,
          data: options?.body,
          headers: { "Content-Type": "application/json" },
        });
        return response.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`Instagram API error: ${err.response?.data?.error?.message || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1000 });
  }

  private getIgUserId(credentials: SocialCredentials): string {
    const id = credentials.accountId || credentials.metadata?.igUserId;
    if (!id) throw new Error("Instagram user ID required in credentials");
    return id;
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const igUserId = this.getIgUserId(credentials);
    const data = await this.fetch(`/${igUserId}`, credentials, {
      params: { fields: "id,name,username,profile_picture_url,followers_count,follows_count,media_count,biography" },
    });
    return {
      platformId: data.id,
      name: data.name,
      handle: `@${data.username}`,
      profileImageUrl: data.profile_picture_url,
      followerCount: data.followers_count,
      followingCount: data.follows_count,
      postCount: data.media_count,
      accountType: "business",
    };
  }

  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    const igUserId = this.getIgUserId(credentials);

    if (!post.imageUrl && !post.videoUrl) {
      throw new Error("Instagram posts require an image or video URL");
    }

    // Step 1: Create media container
    const containerBody: any = {
      caption: this.buildCaption(post),
    };

    if (post.videoUrl) {
      containerBody.media_type = "REELS";
      containerBody.video_url = post.videoUrl;
    } else {
      containerBody.image_url = post.imageUrl;
    }

    const container = await this.fetch(`/${igUserId}/media`, credentials, {
      method: "POST",
      body: containerBody,
    });

    // Step 2: Publish the container
    const published = await this.fetch(`/${igUserId}/media_publish`, credentials, {
      method: "POST",
      body: { creation_id: container.id },
    });

    return {
      platformId: published.id,
      content: post.content,
      imageUrl: post.imageUrl,
      videoUrl: post.videoUrl,
      platform: this.platform,
      status: "published",
      publishedAt: new Date(),
      url: `https://instagram.com/p/${published.id}`,
    };
  }

  async schedulePost(credentials: SocialCredentials, post: CreatePostInput, scheduledAt: Date): Promise<SocialPost> {
    const igUserId = this.getIgUserId(credentials);

    const containerBody: any = {
      caption: this.buildCaption(post),
      published: false,
      scheduled_publish_time: Math.floor(scheduledAt.getTime() / 1000),
    };

    if (post.videoUrl) {
      containerBody.media_type = "REELS";
      containerBody.video_url = post.videoUrl;
    } else {
      containerBody.image_url = post.imageUrl;
    }

    const container = await this.fetch(`/${igUserId}/media`, credentials, {
      method: "POST",
      body: containerBody,
    });

    return {
      platformId: container.id,
      content: post.content,
      platform: this.platform,
      status: "scheduled",
      scheduledAt,
    };
  }

  async deletePost(credentials: SocialCredentials, postId: string): Promise<void> {
    await this.fetch(`/${postId}`, credentials, { method: "DELETE" });
  }

  async getPostAnalytics(credentials: SocialCredentials, postId: string): Promise<PostMetrics> {
    const data = await this.fetch(`/${postId}/insights`, credentials, {
      params: { metric: "impressions,reach,likes,comments,shares,saved,total_interactions" },
    });
    const metrics: PostMetrics = {};
    for (const item of data.data || []) {
      switch (item.name) {
        case "impressions": metrics.impressions = item.values?.[0]?.value || item.value; break;
        case "reach": metrics.reach = item.values?.[0]?.value || item.value; break;
        case "likes": metrics.likes = item.values?.[0]?.value || item.value; break;
        case "comments": metrics.comments = item.values?.[0]?.value || item.value; break;
        case "shares": metrics.shares = item.values?.[0]?.value || item.value; break;
        case "saved": metrics.saves = item.values?.[0]?.value || item.value; break;
      }
    }
    return metrics;
  }

  async getAccountAnalytics(credentials: SocialCredentials, startDate: Date, endDate: Date): Promise<SocialAnalytics> {
    const igUserId = this.getIgUserId(credentials);
    const data = await this.fetch(`/${igUserId}/insights`, credentials, {
      params: {
        metric: "impressions,reach,profile_views,follower_count",
        period: "day",
        since: Math.floor(startDate.getTime() / 1000).toString(),
        until: Math.floor(endDate.getTime() / 1000).toString(),
      },
    });

    const analytics: SocialAnalytics = { period: { start: startDate, end: endDate }, impressions: 0, reach: 0 };
    for (const item of data.data || []) {
      const total = (item.values || []).reduce((sum: number, v: any) => sum + (v.value || 0), 0);
      switch (item.name) {
        case "impressions": analytics.impressions = total; break;
        case "reach": analytics.reach = total; break;
        case "profile_views": analytics.profileViews = total; break;
        case "follower_count": analytics.followerGrowth = (item.values?.slice(-1)?.[0]?.value || 0) - (item.values?.[0]?.value || 0); break;
      }
    }
    return analytics;
  }

  async createAdCampaign(credentials: SocialCredentials, campaign: CreateAdCampaignInput): Promise<AdCampaign> {
    // Instagram ads are managed through Meta Ads API
    // Delegate to Meta adapter with Instagram placement
    const { MetaAdapter } = await import("./metaAdapter");
    const metaAdapter = new MetaAdapter();
    const metaCredentials = { ...credentials };
    return metaAdapter.createAdCampaign(metaCredentials, {
      ...campaign,
      metadata: { ...campaign.metadata, placement: "instagram" },
    });
  }

  async getAdCampaignPerformance(credentials: SocialCredentials, campaignId: string): Promise<AdCampaign> {
    const { MetaAdapter } = await import("./metaAdapter");
    const metaAdapter = new MetaAdapter();
    return metaAdapter.getAdCampaignPerformance(credentials, campaignId);
  }

  async listAdCampaigns(credentials: SocialCredentials): Promise<AdCampaign[]> {
    const { MetaAdapter } = await import("./metaAdapter");
    const metaAdapter = new MetaAdapter();
    return metaAdapter.listAdCampaigns(credentials);
  }

  async pauseAdCampaign(credentials: SocialCredentials, campaignId: string): Promise<void> {
    const { MetaAdapter } = await import("./metaAdapter");
    const metaAdapter = new MetaAdapter();
    return metaAdapter.pauseAdCampaign(credentials, campaignId);
  }

  private buildCaption(post: CreatePostInput): string {
    let caption = post.content;
    if (post.hashtags?.length) {
      caption += "\n\n" + post.hashtags.map(h => `#${h.replace(/^#/, "")}`).join(" ");
    }
    return caption.substring(0, 2200);
  }

  async healthCheck(credentials: SocialCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.verifyConnection(credentials);
      return { healthy: true, message: "Connection verified", latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, message: err.message || "Connection failed", latencyMs: Date.now() - start };
    }
  }
}
