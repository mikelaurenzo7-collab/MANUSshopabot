/**
 * Pinterest Social Adapter
 * Uses Pinterest API v5 via axios for pins, boards, and ads.
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

const PINTEREST_BASE = "https://api.pinterest.com/v5";

export class PinterestAdapter implements SocialPlatformAdapter {
  readonly platform = "pinterest";
  readonly platformName = "Pinterest";

  private async fetch(path: string, credentials: SocialCredentials, options?: { method?: string; body?: any; params?: Record<string, string> }) {
    const { default: axios } = await import("axios");
    const params = options?.params ? `?${new URLSearchParams(options.params).toString()}` : "";
    try {
      const response = await axios({
        url: `${PINTEREST_BASE}${path}${params}`,
        method: (options?.method || "GET") as any,
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        data: options?.body,
      });
      return response.data;
    } catch (err: any) {
      throw new Error(`Pinterest API error: ${err.response?.data?.message || err.message}`);
    }
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const data = await this.fetch("/user_account", credentials);
    return {
      platformId: data.username,
      name: data.business_name || data.username,
      handle: data.username,
      profileImageUrl: data.profile_image,
      followerCount: data.follower_count,
      followingCount: data.following_count,
      postCount: data.pin_count,
      accountType: data.account_type || "personal",
    };
  }

  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    // Get or create a board
    const boardId = credentials.metadata?.defaultBoardId || await this.getDefaultBoardId(credentials);

    const data = await this.fetch("/pins", credentials, {
      method: "POST",
      body: {
        board_id: boardId,
        title: post.content.substring(0, 100),
        description: post.content,
        link: post.link,
        media_source: post.imageUrl
          ? { source_type: "image_url", url: post.imageUrl }
          : undefined,
      },
    });

    return {
      platformId: data.id,
      content: post.content,
      imageUrl: post.imageUrl,
      platform: this.platform,
      status: "published",
      publishedAt: new Date(),
      url: `https://pinterest.com/pin/${data.id}`,
    };
  }

  async schedulePost(credentials: SocialCredentials, post: CreatePostInput, scheduledAt: Date): Promise<SocialPost> {
    const boardId = credentials.metadata?.defaultBoardId || await this.getDefaultBoardId(credentials);
    const data = await this.fetch("/pins", credentials, {
      method: "POST",
      body: {
        board_id: boardId,
        title: post.content.substring(0, 100),
        description: post.content,
        link: post.link,
        media_source: post.imageUrl ? { source_type: "image_url", url: post.imageUrl } : undefined,
        publish_date: scheduledAt.toISOString(),
      },
    });

    return {
      platformId: data.id,
      content: post.content,
      platform: this.platform,
      status: "scheduled",
      scheduledAt,
    };
  }

  async deletePost(credentials: SocialCredentials, postId: string): Promise<void> {
    await this.fetch(`/pins/${postId}`, credentials, { method: "DELETE" });
  }

  async getPostAnalytics(credentials: SocialCredentials, postId: string): Promise<PostMetrics> {
    const data = await this.fetch(`/pins/${postId}/analytics`, credentials, {
      params: {
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
        metric_types: "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK",
      },
    });
    const metrics = data?.all?.daily_metrics?.reduce((acc: any, d: any) => {
      acc.impressions = (acc.impressions || 0) + (d.data?.IMPRESSION || 0);
      acc.saves = (acc.saves || 0) + (d.data?.SAVE || 0);
      acc.clicks = (acc.clicks || 0) + (d.data?.PIN_CLICK || 0);
      return acc;
    }, {}) || {};

    return {
      impressions: metrics.impressions,
      saves: metrics.saves,
      clicks: metrics.clicks,
    };
  }

  async getAccountAnalytics(credentials: SocialCredentials, startDate: Date, endDate: Date): Promise<SocialAnalytics> {
    const data = await this.fetch("/user_account/analytics", credentials, {
      params: {
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        metric_types: "IMPRESSION,SAVE,PIN_CLICK,PROFILE_VISIT,FOLLOWER",
      },
    });

    const totals = data?.all?.daily_metrics?.reduce((acc: any, d: any) => {
      acc.impressions = (acc.impressions || 0) + (d.data?.IMPRESSION || 0);
      acc.saves = (acc.saves || 0) + (d.data?.SAVE || 0);
      acc.profileViews = (acc.profileViews || 0) + (d.data?.PROFILE_VISIT || 0);
      return acc;
    }, {}) || {};

    return {
      period: { start: startDate, end: endDate },
      impressions: totals.impressions || 0,
      reach: totals.impressions || 0,
      profileViews: totals.profileViews,
    };
  }

  async createAdCampaign(credentials: SocialCredentials, campaign: CreateAdCampaignInput): Promise<AdCampaign> {
    const adAccountId = credentials.adAccountId;
    if (!adAccountId) throw new Error("Pinterest ad account ID required");

    const data = await this.fetch(`/ad_accounts/${adAccountId}/campaigns`, credentials, {
      method: "POST",
      body: [{
        name: campaign.name,
        objective_type: this.mapObjective(campaign.objective),
        status: "PAUSED",
        lifetime_spend_cap: campaign.budgetCents * 1000, // Pinterest uses micro-currency
        daily_spend_cap: (campaign.dailyBudgetCents || Math.floor(campaign.budgetCents / 30)) * 1000,
        start_time: Math.floor((campaign.startDate || new Date()).getTime() / 1000),
        end_time: campaign.endDate ? Math.floor(campaign.endDate.getTime() / 1000) : undefined,
      }],
    });

    return {
      platformId: data?.[0]?.id || `pinterest_${Date.now()}`,
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
    const adAccountId = credentials.adAccountId;
    const data = await this.fetch(`/ad_accounts/${adAccountId}/campaigns/analytics`, credentials, {
      params: {
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
        campaign_ids: campaignId,
        columns: "SPEND_IN_MICRO_DOLLAR,IMPRESSION_1,CLICK_1,TOTAL_CONVERSIONS",
        granularity: "TOTAL",
      },
    });

    const row = data?.[0] || {};
    return {
      platformId: campaignId,
      name: "Pinterest Campaign",
      status: "active",
      objective: "conversions",
      budgetCents: 0,
      spentCents: Math.round((row.SPEND_IN_MICRO_DOLLAR || 0) / 1000),
      impressions: row.IMPRESSION_1 || 0,
      clicks: row.CLICK_1 || 0,
      conversions: row.TOTAL_CONVERSIONS || 0,
    };
  }

  async listAdCampaigns(credentials: SocialCredentials): Promise<AdCampaign[]> {
    const adAccountId = credentials.adAccountId;
    if (!adAccountId) return [];
    const data = await this.fetch(`/ad_accounts/${adAccountId}/campaigns`, credentials);
    return (data?.items || []).map((c: any) => ({
      platformId: c.id,
      name: c.name,
      status: c.status === "ACTIVE" ? "active" : "paused",
      objective: c.objective_type,
      budgetCents: Math.round((c.lifetime_spend_cap || 0) / 1000),
      spentCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    }));
  }

  async pauseAdCampaign(credentials: SocialCredentials, campaignId: string): Promise<void> {
    const adAccountId = credentials.adAccountId;
    await this.fetch(`/ad_accounts/${adAccountId}/campaigns`, credentials, {
      method: "PATCH",
      body: [{ id: campaignId, status: "PAUSED" }],
    });
  }

  private async getDefaultBoardId(credentials: SocialCredentials): Promise<string> {
    const data = await this.fetch("/boards", credentials, { params: { page_size: "1" } });
    const board = data?.items?.[0];
    if (!board) throw new Error("No Pinterest boards found. Create a board first.");
    return board.id;
  }

  private mapObjective(objective: string): string {
    const map: Record<string, string> = {
      awareness: "BRAND_AWARENESS",
      traffic: "CONSIDERATION",
      conversions: "CATALOG_SALES",
      sales: "CATALOG_SALES",
    };
    return map[objective] || "CONSIDERATION";
  }
}
