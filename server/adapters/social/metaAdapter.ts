/**
 * Meta (Facebook + Instagram) Social Adapter
 * Uses facebook-nodejs-business-sdk for Graph API access.
 * Handles page posts, Instagram posts, and Meta Ads campaigns.
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

import { ENV } from "../../_core/env";

const GRAPH_BASE = ENV.metaGraphApiBase || "https://graph.facebook.com/v19.0";

export class MetaAdapter implements SocialPlatformAdapter {
  readonly platform = "meta";
  readonly platformName = "Meta (Facebook)";

  private getGraphBase(): string {
    return ENV.metaGraphApiBase || GRAPH_BASE;
  }

  private async graphFetch(path: string, credentials: SocialCredentials, options?: { method?: string; body?: any; params?: Record<string, string> }) {
    const { default: axios } = await import("axios");
    const graphBase = this.getGraphBase();
    const params = new URLSearchParams({
      access_token: credentials.accessToken,
      ...options?.params,
    });
    try {
      const response = await axios({
        url: `${graphBase}${path}?${params.toString()}`,
        method: (options?.method || "GET") as any,
        data: options?.body,
        headers: { "Content-Type": "application/json" },
      });
      return response.data;
    } catch (err: any) {
      throw new Error(`Meta API error: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const data = await this.graphFetch("/me", credentials, {
      params: { fields: "id,name,picture,fan_count" },
    });
    return {
      platformId: data.id,
      name: data.name,
      profileImageUrl: data.picture?.data?.url,
      followerCount: data.fan_count,
      accountType: "page",
    };
  }

  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    const pageId = credentials.pageId || credentials.accountId;
    if (!pageId) throw new Error("Meta pageId required in credentials");

    const body: any = { message: post.content };
    if (post.link) body.link = post.link;

    let endpoint = `/${pageId}/feed`;

    if (post.imageUrl) {
      endpoint = `/${pageId}/photos`;
      body.url = post.imageUrl;
      body.caption = post.content;
      delete body.message;
    }

    const data = await this.graphFetch(endpoint, credentials, {
      method: "POST",
      body,
    });

    return {
      platformId: data.id || data.post_id,
      content: post.content,
      imageUrl: post.imageUrl,
      platform: this.platform,
      status: "published",
      publishedAt: new Date(),
    };
  }

  async schedulePost(credentials: SocialCredentials, post: CreatePostInput, scheduledAt: Date): Promise<SocialPost> {
    const pageId = credentials.pageId || credentials.accountId;
    if (!pageId) throw new Error("Meta pageId required");

    const data = await this.graphFetch(`/${pageId}/feed`, credentials, {
      method: "POST",
      body: {
        message: post.content,
        link: post.link,
        scheduled_publish_time: Math.floor(scheduledAt.getTime() / 1000),
        published: false,
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
    await this.graphFetch(`/${postId}`, credentials, { method: "DELETE" });
  }

  async getPostAnalytics(credentials: SocialCredentials, postId: string): Promise<PostMetrics> {
    const data = await this.graphFetch(`/${postId}/insights`, credentials, {
      params: { metric: "post_impressions,post_reach,post_reactions_by_type_total,post_clicks" },
    });
    const metrics: PostMetrics = {};
    for (const item of data.data || []) {
      switch (item.name) {
        case "post_impressions": metrics.impressions = item.values?.[0]?.value; break;
        case "post_reach": metrics.reach = item.values?.[0]?.value; break;
        case "post_clicks": metrics.clicks = item.values?.[0]?.value; break;
      }
    }
    return metrics;
  }

  async getAccountAnalytics(credentials: SocialCredentials, startDate: Date, endDate: Date): Promise<SocialAnalytics> {
    const pageId = credentials.pageId || credentials.accountId;
    const data = await this.graphFetch(`/${pageId}/insights`, credentials, {
      params: {
        metric: "page_impressions,page_reach,page_views_total,page_fan_adds",
        since: Math.floor(startDate.getTime() / 1000).toString(),
        until: Math.floor(endDate.getTime() / 1000).toString(),
        period: "total_over_range",
      },
    });

    const analytics: SocialAnalytics = { period: { start: startDate, end: endDate }, impressions: 0, reach: 0 };
    for (const item of data.data || []) {
      switch (item.name) {
        case "page_impressions": analytics.impressions = item.values?.[0]?.value || 0; break;
        case "page_reach": analytics.reach = item.values?.[0]?.value || 0; break;
        case "page_views_total": analytics.profileViews = item.values?.[0]?.value || 0; break;
        case "page_fan_adds": analytics.followerGrowth = item.values?.[0]?.value || 0; break;
      }
    }
    return analytics;
  }

  async createAdCampaign(credentials: SocialCredentials, campaign: CreateAdCampaignInput): Promise<AdCampaign> {
    const adAccountId = credentials.adAccountId;
    if (!adAccountId) throw new Error("Meta adAccountId required for ad campaigns");

    // Step 1: Create campaign
    const campaignData = await this.graphFetch(`/act_${adAccountId}/campaigns`, credentials, {
      method: "POST",
      body: {
        name: campaign.name,
        objective: this.mapObjective(campaign.objective),
        status: "PAUSED",
        special_ad_categories: [],
      },
    });

    // Step 2: Create ad set
    const adSetData = await this.graphFetch(`/act_${adAccountId}/adsets`, credentials, {
      method: "POST",
      body: {
        name: `${campaign.name} - Ad Set`,
        campaign_id: campaignData.id,
        daily_budget: campaign.dailyBudgetCents || Math.floor(campaign.budgetCents / 30),
        billing_event: "IMPRESSIONS",
        optimization_goal: "LINK_CLICKS",
        targeting: {
          age_min: campaign.targeting?.ageMin || 18,
          age_max: campaign.targeting?.ageMax || 65,
          geo_locations: { countries: campaign.targeting?.locations || ["US"] },
          interests: campaign.targeting?.interests?.map(i => ({ name: i })) || [],
        },
        status: "PAUSED",
        start_time: campaign.startDate?.toISOString() || new Date().toISOString(),
        end_time: campaign.endDate?.toISOString(),
      },
    });

    // Step 3: Create ad creative
    const creativeData = await this.graphFetch(`/act_${adAccountId}/adcreatives`, credentials, {
      method: "POST",
      body: {
        name: `${campaign.name} - Creative`,
        object_story_spec: {
          page_id: credentials.pageId,
          link_data: {
            message: campaign.adCopy,
            link: campaign.targetUrl,
            image_url: campaign.imageUrl,
          },
        },
      },
    });

    // Step 4: Create ad
    await this.graphFetch(`/act_${adAccountId}/ads`, credentials, {
      method: "POST",
      body: {
        name: `${campaign.name} - Ad`,
        adset_id: adSetData.id,
        creative: { creative_id: creativeData.id },
        status: "PAUSED",
      },
    });

    return {
      platformId: campaignData.id,
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
    const data = await this.graphFetch(`/${campaignId}/insights`, credentials, {
      params: { fields: "campaign_name,impressions,clicks,spend,actions,ctr,cpc" },
    });
    const insight = data.data?.[0] || {};
    const conversions = (insight.actions || []).find((a: any) => a.action_type === "purchase")?.value || 0;

    return {
      platformId: campaignId,
      name: insight.campaign_name || "Meta Campaign",
      status: "active",
      objective: "conversions",
      budgetCents: 0,
      spentCents: Math.round(parseFloat(insight.spend || "0") * 100),
      impressions: parseInt(insight.impressions || "0"),
      clicks: parseInt(insight.clicks || "0"),
      conversions: parseInt(conversions),
      ctr: parseFloat(insight.ctr || "0"),
      cpc: Math.round(parseFloat(insight.cpc || "0") * 100),
    };
  }

  async listAdCampaigns(credentials: SocialCredentials): Promise<AdCampaign[]> {
    const adAccountId = credentials.adAccountId;
    if (!adAccountId) return [];
    const data = await this.graphFetch(`/act_${adAccountId}/campaigns`, credentials, {
      params: { fields: "id,name,status,objective,daily_budget,lifetime_budget" },
    });
    return (data.data || []).map((c: any) => ({
      platformId: c.id,
      name: c.name,
      status: c.status === "ACTIVE" ? "active" : c.status === "PAUSED" ? "paused" : "draft",
      objective: c.objective,
      budgetCents: parseInt(c.daily_budget || c.lifetime_budget || "0"),
      spentCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    }));
  }

  async pauseAdCampaign(credentials: SocialCredentials, campaignId: string): Promise<void> {
    await this.graphFetch(`/${campaignId}`, credentials, {
      method: "POST",
      body: { status: "PAUSED" },
    });
  }

  private mapObjective(objective: string): string {
    const map: Record<string, string> = {
      awareness: "BRAND_AWARENESS",
      traffic: "LINK_CLICKS",
      conversions: "CONVERSIONS",
      sales: "PRODUCT_CATALOG_SALES",
    };
    return map[objective] || "LINK_CLICKS";
  }
}
