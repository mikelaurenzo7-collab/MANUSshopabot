/**
 * TikTok Social Adapter
 * Uses TikTok for Business API for content publishing and ads.
 * OAuth 2.0 with access_token for user content; Business API for ads.
 */

import crypto from "crypto";
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

const TIKTOK_CONTENT_BASE = "https://open.tiktokapis.com/v2";
const TIKTOK_ADS_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export class TikTokAdapter implements SocialPlatformAdapter {
  readonly platform = "tiktok";
  readonly platformName = "TikTok";

  private async contentFetch(path: string, credentials: SocialCredentials, options?: { method?: string; body?: any; params?: Record<string, string> }) {
    const { default: axios } = await import("axios");
    const params = options?.params ? `?${new URLSearchParams(options.params).toString()}` : "";
    try {
      const response = await axios({
        url: `${TIKTOK_CONTENT_BASE}${path}${params}`,
        method: (options?.method || "GET") as any,
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        data: options?.body,
      });
      if (response.data.error?.code !== "ok" && response.data.error?.code !== undefined) {
        throw new Error(response.data.error.message);
      }
      return response.data.data;
    } catch (err: any) {
      throw new Error(`TikTok API error: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  private async adsFetch(path: string, credentials: SocialCredentials, options?: { method?: string; body?: any }) {
    const { default: axios } = await import("axios");
    try {
      const response = await axios({
        url: `${TIKTOK_ADS_BASE}${path}`,
        method: (options?.method || "GET") as any,
        headers: {
          "Access-Token": credentials.accessToken,
          "Content-Type": "application/json",
        },
        data: options?.body,
      });
      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }
      return response.data.data;
    } catch (err: any) {
      throw new Error(`TikTok Ads API error: ${err.response?.data?.message || err.message}`);
    }
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const data = await this.contentFetch("/user/info/", credentials, {
      params: { fields: "open_id,union_id,avatar_url,display_name,follower_count,following_count,video_count" },
    });
    const user = data?.user || {};
    return {
      platformId: user.open_id || user.union_id,
      name: user.display_name,
      profileImageUrl: user.avatar_url,
      followerCount: user.follower_count,
      followingCount: user.following_count,
      postCount: user.video_count,
      accountType: "creator",
    };
  }

  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    // TikTok requires video content; for image posts use photo mode
    if (!post.videoUrl && !post.imageUrl) {
      throw new Error("TikTok posts require a video or image URL");
    }

    // Step 1: Initialize upload
    const initData = await this.contentFetch("/post/publish/video/init/", credentials, {
      method: "POST",
      body: {
        post_info: {
          title: post.content.substring(0, 150),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: post.videoUrl || post.imageUrl,
        },
      },
    });

    return {
      platformId: initData?.publish_id || `tiktok_${Date.now()}`,
      content: post.content,
      videoUrl: post.videoUrl,
      imageUrl: post.imageUrl,
      platform: this.platform,
      status: "published",
      publishedAt: new Date(),
    };
  }

  async schedulePost(credentials: SocialCredentials, post: CreatePostInput, scheduledAt: Date): Promise<SocialPost> {
    const initData = await this.contentFetch("/post/publish/video/init/", credentials, {
      method: "POST",
      body: {
        post_info: {
          title: post.content.substring(0, 150),
          privacy_level: "PUBLIC_TO_EVERYONE",
          auto_add_music: true,
          scheduled_publish_time: Math.floor(scheduledAt.getTime() / 1000),
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: post.videoUrl || post.imageUrl,
        },
      },
    });

    return {
      platformId: initData?.publish_id || `tiktok_sched_${Date.now()}`,
      content: post.content,
      platform: this.platform,
      status: "scheduled",
      scheduledAt,
    };
  }

  async deletePost(credentials: SocialCredentials, postId: string): Promise<void> {
    // TikTok does not support deleting posts via API; only via app
    console.warn(`TikTok post deletion not supported via API for post ${postId}`);
  }

  async getPostAnalytics(credentials: SocialCredentials, postId: string): Promise<PostMetrics> {
    const data = await this.contentFetch("/video/query/", credentials, {
      method: "POST",
      body: {
        filters: { video_ids: [postId] },
        fields: ["id", "like_count", "comment_count", "share_count", "view_count", "play_count"],
      },
    });
    const video = data?.videos?.[0] || {};
    return {
      impressions: video.play_count || video.view_count,
      likes: video.like_count,
      comments: video.comment_count,
      shares: video.share_count,
    };
  }

  async getAccountAnalytics(credentials: SocialCredentials, startDate: Date, endDate: Date): Promise<SocialAnalytics> {
    const data = await this.contentFetch("/research/user/stats/", credentials, {
      method: "POST",
      body: {
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        metrics: ["profile_view", "video_view", "follower_count"],
      },
    });

    return {
      period: { start: startDate, end: endDate },
      impressions: data?.video_view || 0,
      reach: data?.profile_view || 0,
      profileViews: data?.profile_view || 0,
      followerGrowth: data?.follower_count || 0,
    };
  }

  async createAdCampaign(credentials: SocialCredentials, campaign: CreateAdCampaignInput): Promise<AdCampaign> {
    const advertiserId = credentials.adAccountId || credentials.accountId;
    if (!advertiserId) throw new Error("TikTok advertiserId required for ad campaigns");

    // Step 1: Create campaign
    const campaignData = await this.adsFetch("/campaign/create/", credentials, {
      method: "POST",
      body: {
        advertiser_id: advertiserId,
        campaign_name: campaign.name,
        objective_type: this.mapObjective(campaign.objective),
        budget_mode: "BUDGET_MODE_TOTAL",
        budget: campaign.budgetCents / 100,
        operation_status: "DISABLE",
      },
    });

    // Step 2: Create ad group
    const adGroupData = await this.adsFetch("/adgroup/create/", credentials, {
      method: "POST",
      body: {
        advertiser_id: advertiserId,
        campaign_id: campaignData.campaign_id,
        adgroup_name: `${campaign.name} - Ad Group`,
        placement_type: "PLACEMENT_TYPE_AUTOMATIC",
        budget_mode: "BUDGET_MODE_DAY",
        budget: (campaign.dailyBudgetCents || Math.floor(campaign.budgetCents / 30)) / 100,
        schedule_type: "SCHEDULE_START_END",
        schedule_start_time: (campaign.startDate || new Date()).toISOString().replace("T", " ").split(".")[0],
        schedule_end_time: campaign.endDate?.toISOString().replace("T", " ").split(".")[0],
        optimization_goal: "CLICK",
        bid_type: "BID_TYPE_NO_BID",
        targeting: {
          age: this.mapAgeRange(campaign.targeting?.ageMin, campaign.targeting?.ageMax),
          location_ids: campaign.targeting?.locations || ["6252001"], // US
          interest_category_ids: [],
        },
        operation_status: "DISABLE",
      },
    });

    // Step 3: Create ad
    await this.adsFetch("/ad/create/", credentials, {
      method: "POST",
      body: {
        advertiser_id: advertiserId,
        adgroup_id: adGroupData.adgroup_id,
        creatives: [{
          ad_name: `${campaign.name} - Ad`,
          ad_text: campaign.adCopy,
          landing_page_url: campaign.targetUrl,
          image_ids: campaign.imageUrl ? [campaign.imageUrl] : undefined,
          video_id: campaign.metadata?.videoId,
          call_to_action: "SHOP_NOW",
        }],
        operation_status: "DISABLE",
      },
    });

    return {
      platformId: campaignData.campaign_id,
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
    const advertiserId = credentials.adAccountId || credentials.accountId;
    const data = await this.adsFetch("/report/integrated/get/", credentials, {
      method: "POST",
      body: {
        advertiser_id: advertiserId,
        report_type: "BASIC",
        dimensions: ["campaign_id"],
        metrics: ["campaign_name", "spend", "impressions", "clicks", "conversions", "ctr", "cpc"],
        filters: [{ field_name: "campaign_id", filter_type: "IN", filter_value: `["${campaignId}"]` }],
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
      },
    });

    const row = data?.list?.[0]?.metrics || {};
    return {
      platformId: campaignId,
      name: row.campaign_name || "TikTok Campaign",
      status: "active",
      objective: "conversions",
      budgetCents: 0,
      spentCents: Math.round(parseFloat(row.spend || "0") * 100),
      impressions: parseInt(row.impressions || "0"),
      clicks: parseInt(row.clicks || "0"),
      conversions: parseInt(row.conversions || "0"),
      ctr: parseFloat(row.ctr || "0"),
      cpc: Math.round(parseFloat(row.cpc || "0") * 100),
    };
  }

  async listAdCampaigns(credentials: SocialCredentials): Promise<AdCampaign[]> {
    const advertiserId = credentials.adAccountId || credentials.accountId;
    if (!advertiserId) return [];
    const data = await this.adsFetch("/campaign/get/", credentials, {
      method: "GET",
      body: { advertiser_id: advertiserId, page_size: 50 },
    });
    return (data?.list || []).map((c: any) => ({
      platformId: c.campaign_id,
      name: c.campaign_name,
      status: c.operation_status === "ENABLE" ? "active" : "paused",
      objective: c.objective_type,
      budgetCents: Math.round(parseFloat(c.budget || "0") * 100),
      spentCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    }));
  }

  async pauseAdCampaign(credentials: SocialCredentials, campaignId: string): Promise<void> {
    const advertiserId = credentials.adAccountId || credentials.accountId;
    await this.adsFetch("/campaign/status/update/", credentials, {
      method: "POST",
      body: {
        advertiser_id: advertiserId,
        campaign_ids: [campaignId],
        operation_status: "DISABLE",
      },
    });
  }

  private mapObjective(objective: string): string {
    const map: Record<string, string> = {
      awareness: "REACH",
      traffic: "TRAFFIC",
      conversions: "CONVERSIONS",
      sales: "PRODUCT_SALES",
    };
    return map[objective] || "TRAFFIC";
  }

  private mapAgeRange(min?: number, max?: number): string[] {
    const ranges = ["AGE_13_17", "AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"];
    if (!min && !max) return ranges.slice(1); // 18+
    return ranges.filter(r => {
      const [lo, hi] = r.replace("AGE_", "").split("_").map(Number);
      return (!min || lo >= min) && (!max || hi <= max);
    });
  }
}
