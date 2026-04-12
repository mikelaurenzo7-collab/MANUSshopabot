/**
 * LinkedIn Social Adapter
 * Uses LinkedIn Marketing API v2 via axios for company posts and ads.
 * OAuth 2.0 with r_liteprofile, w_member_social, rw_ads scopes.
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
import { withRetry } from "../../utils/rateLimiter";

const LINKEDIN_BASE = "https://api.linkedin.com/v2";

export class LinkedInAdapter implements SocialPlatformAdapter {
  readonly platform = "linkedin";
  readonly platformName = "LinkedIn";

  private async fetch(path: string, credentials: SocialCredentials, options?: { method?: string; body?: any; params?: Record<string, string> }) {
    const { default: axios } = await import("axios");
    const params = options?.params ? `?${new URLSearchParams(options.params).toString()}` : "";
    return withRetry(async () => {
      try {
        const response = await axios({
          url: `${LINKEDIN_BASE}${path}${params}`,
          method: (options?.method || "GET") as any,
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": "202401",
          },
          data: options?.body,
        });
        return response.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`LinkedIn API error: ${err.response?.data?.message || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1000 });
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const data = await this.fetch("/me", credentials, {
      params: { projection: "(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))" },
    });
    return {
      platformId: data.id,
      name: `${data.localizedFirstName} ${data.localizedLastName}`,
      profileImageUrl: data.profilePicture?.["displayImage~"]?.elements?.[0]?.identifiers?.[0]?.identifier,
      accountType: "person",
    };
  }

  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    const authorId = credentials.accountId || credentials.pageId;
    if (!authorId) throw new Error("LinkedIn author ID required");

    const isOrg = credentials.metadata?.isOrganization;
    const author = isOrg ? `urn:li:organization:${authorId}` : `urn:li:person:${authorId}`;

    const body: any = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: post.content },
          shareMediaCategory: post.imageUrl ? "IMAGE" : post.link ? "ARTICLE" : "NONE",
          media: post.imageUrl ? [{
            status: "READY",
            originalUrl: post.imageUrl,
          }] : post.link ? [{
            status: "READY",
            originalUrl: post.link,
          }] : [],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const data = await this.fetch("/ugcPosts", credentials, { method: "POST", body });
    const postId = data.id || data.value?.id;

    return {
      platformId: postId,
      content: post.content,
      imageUrl: post.imageUrl,
      platform: this.platform,
      status: "published",
      publishedAt: new Date(),
      url: `https://linkedin.com/feed/update/${postId}`,
    };
  }

  async schedulePost(credentials: SocialCredentials, post: CreatePostInput, scheduledAt: Date): Promise<SocialPost> {
    // LinkedIn does not support native scheduling via API
    return {
      platformId: `linkedin_sched_${Date.now()}`,
      content: post.content,
      platform: this.platform,
      status: "scheduled",
      scheduledAt,
      metadata: { pendingSchedule: true, postData: post },
    };
  }

  async deletePost(credentials: SocialCredentials, postId: string): Promise<void> {
    await this.fetch(`/ugcPosts/${encodeURIComponent(postId)}`, credentials, { method: "DELETE" });
  }

  async getPostAnalytics(credentials: SocialCredentials, postId: string): Promise<PostMetrics> {
    const data = await this.fetch("/organizationalEntityShareStatistics", credentials, {
      params: {
        q: "organizationalEntity",
        organizationalEntity: `urn:li:organization:${credentials.pageId}`,
        shares: `List(${encodeURIComponent(postId)})`,
      },
    });
    const stats = data?.elements?.[0]?.totalShareStatistics || {};
    return {
      impressions: stats.impressionCount,
      clicks: stats.clickCount,
      likes: stats.likeCount,
      comments: stats.commentCount,
      shares: stats.shareCount,
      engagementRate: stats.engagement,
    };
  }

  async getAccountAnalytics(credentials: SocialCredentials, startDate: Date, endDate: Date): Promise<SocialAnalytics> {
    const orgId = credentials.pageId || credentials.accountId;
    if (!orgId) {
      return { period: { start: startDate, end: endDate }, impressions: 0, reach: 0 };
    }

    const data = await this.fetch("/organizationalEntityShareStatistics", credentials, {
      params: {
        q: "organizationalEntity",
        organizationalEntity: `urn:li:organization:${orgId}`,
        timeIntervals: `(timeRange:(start:${startDate.getTime()},end:${endDate.getTime()}),timeGranularityType:MONTH)`,
      },
    });

    const stats = data?.elements?.[0]?.totalShareStatistics || {};
    return {
      period: { start: startDate, end: endDate },
      impressions: stats.impressionCount || 0,
      reach: stats.uniqueImpressionsCount || 0,
      engagementRate: stats.engagement,
    };
  }

  async createAdCampaign(credentials: SocialCredentials, campaign: CreateAdCampaignInput): Promise<AdCampaign> {
    const adAccountId = credentials.adAccountId;
    if (!adAccountId) throw new Error("LinkedIn ad account ID required");

    // Step 1: Create campaign group
    const groupData = await this.fetch("/adCampaignGroupsV2", credentials, {
      method: "POST",
      body: {
        account: `urn:li:sponsoredAccount:${adAccountId}`,
        name: campaign.name,
        status: "PAUSED",
        totalBudget: { amount: String(campaign.budgetCents / 100), currencyCode: "USD" },
        runSchedule: {
          start: (campaign.startDate || new Date()).getTime(),
          end: campaign.endDate?.getTime(),
        },
      },
    });

    const groupId = groupData.id;

    // Step 2: Create campaign
    const campaignData = await this.fetch("/adCampaignsV2", credentials, {
      method: "POST",
      body: {
        account: `urn:li:sponsoredAccount:${adAccountId}`,
        campaignGroup: `urn:li:sponsoredCampaignGroup:${groupId}`,
        name: `${campaign.name} - Campaign`,
        status: "PAUSED",
        type: "SPONSORED_UPDATES",
        objectiveType: this.mapObjective(campaign.objective),
        dailyBudget: { amount: String((campaign.dailyBudgetCents || Math.floor(campaign.budgetCents / 30)) / 100), currencyCode: "USD" },
        targetingCriteria: {
          include: {
            and: [{
              or: {
                "urn:li:adTargetingFacet:locations": campaign.targeting?.locations?.map(l => `urn:li:geo:${l}`) || ["urn:li:geo:103644278"],
              },
            }],
          },
        },
        format: "STANDARD_UPDATE",
        locale: { country: "US", language: "en" },
        bidOptimizationTarget: "NONE",
      },
    });

    return {
      platformId: String(campaignData.id || groupId),
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
    const data = await this.fetch("/adAnalyticsV2", credentials, {
      params: {
        q: "analytics",
        pivot: "CAMPAIGN",
        dateRange: `(start:(year:${new Date().getFullYear()},month:1,day:1))`,
        timeGranularity: "ALL",
        campaigns: `List(urn:li:sponsoredCampaign:${campaignId})`,
        fields: "impressions,clicks,costInUsd,externalWebsiteConversions,costInLocalCurrency",
      },
    });

    const stats = data?.elements?.[0] || {};
    return {
      platformId: campaignId,
      name: "LinkedIn Campaign",
      status: "active",
      objective: "conversions",
      budgetCents: 0,
      spentCents: Math.round(parseFloat(stats.costInUsd || "0") * 100),
      impressions: stats.impressions || 0,
      clicks: stats.clicks || 0,
      conversions: stats.externalWebsiteConversions || 0,
      ctr: stats.clicks && stats.impressions ? stats.clicks / stats.impressions : 0,
    };
  }

  async listAdCampaigns(credentials: SocialCredentials): Promise<AdCampaign[]> {
    const adAccountId = credentials.adAccountId;
    if (!adAccountId) return [];
    const data = await this.fetch("/adCampaignsV2", credentials, {
      params: {
        q: "search",
        search: `(account:(values:List(urn:li:sponsoredAccount:${adAccountId})))`,
        count: "50",
      },
    });
    return (data?.elements || []).map((c: any) => ({
      platformId: String(c.id),
      name: c.name,
      status: c.status === "ACTIVE" ? "active" : "paused",
      objective: c.objectiveType || "awareness",
      budgetCents: Math.round(parseFloat(c.dailyBudget?.amount || "0") * 100),
      spentCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    }));
  }

  async pauseAdCampaign(credentials: SocialCredentials, campaignId: string): Promise<void> {
    await this.fetch(`/adCampaignsV2/${campaignId}`, credentials, {
      method: "POST",
      body: { patch: { "$set": { status: "PAUSED" } } },
    });
  }

  private mapObjective(objective: string): string {
    const map: Record<string, string> = {
      awareness: "BRAND_AWARENESS",
      traffic: "WEBSITE_VISITS",
      conversions: "WEBSITE_CONVERSIONS",
      sales: "WEBSITE_CONVERSIONS",
    };
    return map[objective] || "WEBSITE_VISITS";
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
