/**
 * Google Ads Adapter
 * Uses Google Ads API v17 via REST (googleapis) for campaign management.
 * OAuth 2.0 with refresh token for access.
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

const GOOGLE_ADS_BASE = "https://googleads.googleapis.com/v17";

export class GoogleAdsAdapter implements SocialPlatformAdapter {
  readonly platform = "google_ads";
  readonly platformName = "Google Ads";

  /**
   * Google Ads: search + Display + YouTube + Shopping under one API.
   * Performance Max campaigns auto-optimize across surfaces. Search Ads
   * intent is the highest-converting traffic source for most niches.
   * Smart Bidding handles bid strategy automatically. The "ads" channel
   * here covers paid distribution only — no organic posting concept.
   */
  getCapabilities(): SocialPlatformCapabilities {
    return {
      image: true,
      video: true,
      shortFormVideo: true,
      carousel: false,
      stories: false,
      liveStream: false,
      maxCopyChars: 0,
      preferredAspectRatios: ["1:1", "16:9", "9:16", "2:3"],
      maxVideoSeconds: 360,
      scheduledPosting: false,
      hashtagSupport: "ignored",
      ads: true,
      adFormats: ["search", "display", "video_youtube", "shopping", "performance_max", "demand_gen"],
      maxAdCopyChars: 90,
      audienceTargeting: "behavioral",
      dynamicProductAds: true,
      recommendedPostsPerDay: 0,
      rateLimitTokensPerSec: 5,
      audienceType: "commerce",
      strengths: [
        "Search ads — purchase-intent traffic, highest conversion of any channel",
        "Performance Max blends Search + Display + YouTube + Shopping in one campaign",
        "Shopping feed driven by product catalog — Builder feeds in, Google serves",
        "Smart Bidding handles bid strategy — Social Bot only picks the budget",
      ],
      limitations: [
        "Ad copy: 30-char headlines + 90-char descriptions, repeated 15x per ad — highly constrained",
        "Quality Score gates CPC — landing page + relevance matter as much as bid",
        "No organic posting — ad budget is the entry ticket",
      ],
    };
  }

  private async getAccessToken(credentials: SocialCredentials): Promise<string> {
    if (credentials.accessToken) return credentials.accessToken;
    const { default: axios } = await import("axios");
    const response = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: credentials.metadata?.clientId || process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: credentials.metadata?.clientSecret || process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }, { timeout: ADAPTER_HTTP_TIMEOUT_MS });
    return response.data.access_token;
  }

  private async fetch(path: string, credentials: SocialCredentials, options?: { method?: string; body?: any }) {
    const { default: axios } = await import("axios");
    const token = await this.getAccessToken(credentials);
    const customerId = credentials.adAccountId || credentials.accountId || "";
    const devToken = credentials.metadata?.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";

    return withRetry(async () => {
      try {
        const response = await axios({
          url: `${GOOGLE_ADS_BASE}${path}`,
          method: (options?.method || "GET") as any,
          headers: {
            Authorization: `Bearer ${token}`,
            "developer-token": devToken,
            "login-customer-id": customerId,
            "Content-Type": "application/json",
          },
          data: options?.body,
          timeout: ADAPTER_HTTP_TIMEOUT_MS,
        });
        return response.data;
      } catch (err: any) {
        if (err.response?.status === 429) throw err;
        throw new Error(`Google Ads API error: ${err.response?.data?.error?.message || err.message}`);
      }
    }, { maxRetries: 3, initialDelayMs: 1000 });
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const customerId = credentials.adAccountId || credentials.accountId || "";
    const data = await this.fetch(`/customers/${customerId}`, credentials);
    return {
      platformId: customerId,
      name: data.descriptiveName || "Google Ads Account",
      accountType: "advertiser",
    };
  }

  async createPost(_credentials: SocialCredentials, _post: CreatePostInput): Promise<SocialPost> {
    // Google Ads doesn't have organic social posts
    throw new Error("Google Ads does not support organic posts. Use createAdCampaign instead.");
  }

  async schedulePost(_credentials: SocialCredentials, _post: CreatePostInput, _scheduledAt: Date): Promise<SocialPost> {
    throw new Error("Google Ads does not support organic posts. Use createAdCampaign instead.");
  }

  async deletePost(_credentials: SocialCredentials, _postId: string): Promise<void> {
    throw new Error("Google Ads does not support organic posts.");
  }

  async getPostAnalytics(_credentials: SocialCredentials, _postId: string): Promise<PostMetrics> {
    return {};
  }

  async getAccountAnalytics(credentials: SocialCredentials, startDate: Date, endDate: Date): Promise<SocialAnalytics> {
    const customerId = credentials.adAccountId || credentials.accountId || "";
    const query = `
      SELECT
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM customer
      WHERE segments.date BETWEEN '${startDate.toISOString().split("T")[0]}' AND '${endDate.toISOString().split("T")[0]}'
    `;

    const data = await this.fetch(`/customers/${customerId}/googleAds:search`, credentials, {
      method: "POST",
      body: { query },
    });

    const row = data?.results?.[0]?.metrics || {};
    return {
      period: { start: startDate, end: endDate },
      impressions: parseInt(row.impressions || "0"),
      reach: parseInt(row.impressions || "0"),
    };
  }

  async createAdCampaign(credentials: SocialCredentials, campaign: CreateAdCampaignInput): Promise<AdCampaign> {
    const customerId = credentials.adAccountId || credentials.accountId || "";

    // Step 1: Create budget
    const budgetResponse = await this.fetch(`/customers/${customerId}/campaignBudgets:mutate`, credentials, {
      method: "POST",
      body: {
        operations: [{
          create: {
            name: `${campaign.name} Budget`,
            amountMicros: (campaign.dailyBudgetCents || Math.floor(campaign.budgetCents / 30)) * 10000,
            deliveryMethod: "STANDARD",
          },
        }],
      },
    });
    const budgetResourceName = budgetResponse.results?.[0]?.resourceName;

    // Step 2: Create campaign
    const campaignResponse = await this.fetch(`/customers/${customerId}/campaigns:mutate`, credentials, {
      method: "POST",
      body: {
        operations: [{
          create: {
            name: campaign.name,
            advertisingChannelType: "SEARCH",
            status: "PAUSED",
            campaignBudget: budgetResourceName,
            biddingStrategyType: "TARGET_CPA",
            startDate: (campaign.startDate || new Date()).toISOString().split("T")[0].replace(/-/g, ""),
            endDate: campaign.endDate?.toISOString().split("T")[0].replace(/-/g, ""),
          },
        }],
      },
    });

    const campaignResourceName = campaignResponse.results?.[0]?.resourceName;
    const campaignId = campaignResourceName?.split("/").pop() || `google_${Date.now()}`;

    // Step 3: Create ad group
    const adGroupResponse = await this.fetch(`/customers/${customerId}/adGroups:mutate`, credentials, {
      method: "POST",
      body: {
        operations: [{
          create: {
            name: `${campaign.name} - Ad Group`,
            campaign: campaignResourceName,
            status: "ENABLED",
            type: "SEARCH_STANDARD",
          },
        }],
      },
    });

    const adGroupResourceName = adGroupResponse.results?.[0]?.resourceName;

    // Step 4: Create responsive search ad
    await this.fetch(`/customers/${customerId}/ads:mutate`, credentials, {
      method: "POST",
      body: {
        operations: [{
          create: {
            adGroup: adGroupResourceName,
            status: "ENABLED",
            ad: {
              finalUrls: [campaign.targetUrl],
              responsiveSearchAd: {
                headlines: [
                  { text: campaign.name.substring(0, 30) },
                  { text: campaign.adCopy.substring(0, 30) },
                  { text: "Shop Now" },
                ],
                descriptions: [
                  { text: campaign.adCopy.substring(0, 90) },
                  { text: "Free shipping on orders over $50" },
                ],
              },
            },
          },
        }],
      },
    });

    return {
      platformId: campaignId,
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
    const customerId = credentials.adAccountId || credentials.accountId || "";
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM campaign
      WHERE campaign.id = ${campaignId}
        AND segments.date DURING LAST_30_DAYS
    `;

    const data = await this.fetch(`/customers/${customerId}/googleAds:search`, credentials, {
      method: "POST",
      body: { query },
    });

    const row = data?.results?.[0] || {};
    const metrics = row.metrics || {};
    const camp = row.campaign || {};

    return {
      platformId: campaignId,
      name: camp.name || "Google Ads Campaign",
      status: camp.status === "ENABLED" ? "active" : "paused",
      objective: "conversions",
      budgetCents: 0,
      spentCents: Math.round((parseInt(metrics.costMicros || "0")) / 10000),
      impressions: parseInt(metrics.impressions || "0"),
      clicks: parseInt(metrics.clicks || "0"),
      conversions: parseFloat(metrics.conversions || "0"),
      ctr: parseFloat(metrics.ctr || "0"),
      cpc: Math.round(parseInt(metrics.averageCpc || "0") / 10000),
    };
  }

  async listAdCampaigns(credentials: SocialCredentials): Promise<AdCampaign[]> {
    const customerId = credentials.adAccountId || credentials.accountId || "";
    if (!customerId) return [];
    const query = `
      SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      LIMIT 50
    `;

    const data = await this.fetch(`/customers/${customerId}/googleAds:search`, credentials, {
      method: "POST",
      body: { query },
    });

    return (data?.results || []).map((r: any) => ({
      platformId: r.campaign.id,
      name: r.campaign.name,
      status: r.campaign.status === "ENABLED" ? "active" : "paused",
      objective: "conversions",
      budgetCents: Math.round((parseInt(r.campaignBudget?.amountMicros || "0")) / 10000),
      spentCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    }));
  }

  async pauseAdCampaign(credentials: SocialCredentials, campaignId: string): Promise<void> {
    const customerId = credentials.adAccountId || credentials.accountId || "";
    await this.fetch(`/customers/${customerId}/campaigns:mutate`, credentials, {
      method: "POST",
      body: {
        operations: [{
          update: {
            resourceName: `customers/${customerId}/campaigns/${campaignId}`,
            status: "PAUSED",
          },
          updateMask: "status",
        }],
      },
    });
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
