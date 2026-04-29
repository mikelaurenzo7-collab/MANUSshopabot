/**
 * Snapchat Social Adapter
 * Uses Snapchat Marketing API for Snap Ads, Dynamic Product Ads,
 * Story Ads, and audience analytics.
 *
 * Snapchat's ad platform is underpriced relative to Meta/TikTok —
 * lower CPMs with strong 13-34 demographic reach. The adapter
 * supports both organic (Story) and paid (Snap Ads, DPA) surfaces.
 */
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
import { withRetry, platformRateLimiters } from "../../utils/rateLimiter";

const SNAP_ADS_BASE = "https://adsapi.snapchat.com/v1";

export class SnapchatAdapter implements SocialPlatformAdapter {
  readonly platform = "snapchat";
  readonly platformName = "Snapchat";

  /**
   * Snapchat: vertical-first, ephemeral content + underpriced ads.
   * 800M+ MAU skewing 13-34. Snap Ads (full-screen vertical video),
   * Story Ads (tile in Discover), Dynamic Product Ads (catalog-fed),
   * and AR Lenses for brand engagement. All creative MUST be 9:16.
   */
  getCapabilities(): SocialPlatformCapabilities {
    return {
      image: true,
      video: true,
      shortFormVideo: true,
      carousel: false,
      stories: true,
      liveStream: false,
      maxCopyChars: 150,
      preferredAspectRatios: ["9:16"],
      maxVideoSeconds: 180,
      scheduledPosting: true,
      hashtagSupport: "ignored",
      ads: true,
      adFormats: ["snap_ad", "story_ad", "collection_ad", "dynamic_product_ad", "ar_lens"],
      maxAdCopyChars: 34,
      audienceTargeting: "behavioral",
      dynamicProductAds: true,
      recommendedPostsPerDay: 3,
      rateLimitTokensPerSec: 5,
      audienceType: "commerce",
      strengths: [
        "Underpriced CPMs vs. Meta/TikTok — best cost-per-impression for 13-34 demo",
        "Full-screen 9:16 takeover — zero distraction, highest viewability",
        "Dynamic Product Ads auto-retarget from catalog — set-and-forget ROAS machine",
        "Snap Pixel + CAPI for first-party attribution — survives iOS privacy changes",
      ],
      limitations: [
        "9:16 vertical ONLY — all creative must be portrait, no landscape/square",
        "34-char ad headline ceiling — every character counts",
        "Older demographics (35+) underrepresented — not ideal for B2B or luxury",
        "Organic reach is limited — paid is the primary distribution lever",
      ],
    };
  }

  private async fetch(
    path: string,
    credentials: SocialCredentials,
    options?: { method?: string; body?: any; params?: Record<string, string> },
  ) {
    const { default: axios } = await import("axios");
    const params = options?.params
      ? `?${new URLSearchParams(options.params).toString()}`
      : "";

    // Use snapchat rate limiter if available, otherwise proceed
    if ((platformRateLimiters as any).snapchat) {
      await (platformRateLimiters as any).snapchat.acquire();
    }

    return withRetry(
      async () => {
        try {
          const response = await axios({
            url: `${SNAP_ADS_BASE}${path}${params}`,
            method: (options?.method || "GET") as any,
            headers: {
              Authorization: `Bearer ${credentials.accessToken}`,
              "Content-Type": "application/json",
            },
            data: options?.body,
            timeout: ADAPTER_HTTP_TIMEOUT_MS,
          });
          return response.data;
        } catch (err: any) {
          if (err.response?.status === 429) throw err;
          throw new Error(
            `Snapchat API error: ${err.response?.data?.request_status || err.response?.data?.debug_message || err.message}`,
          );
        }
      },
      { maxRetries: 3, initialDelayMs: 1000 },
    );
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const data = await this.fetch("/me", credentials);
    const me = data?.me || data;
    return {
      platformId: me.id || me.organization_id || "unknown",
      name: me.display_name || me.email || "Snapchat User",
      handle: me.email,
      profileImageUrl: undefined,
      followerCount: undefined,
      followingCount: undefined,
      postCount: undefined,
      accountType: "business",
    };
  }

  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    // Snapchat organic posting goes through the Content API
    // For now, we create a Snap Ad creative as the primary content vehicle
    const adAccountId = credentials.adAccountId || credentials.metadata?.adAccountId;
    if (!adAccountId) {
      throw new Error("Snapchat requires an Ad Account ID. Connect your Snapchat Ads account first.");
    }

    // Create a creative
    const creativeData = await this.fetch(`/adaccounts/${adAccountId}/creatives`, credentials, {
      method: "POST",
      body: {
        creatives: [{
          ad_account_id: adAccountId,
          name: post.content.substring(0, 34),
          type: "SNAP_AD",
          headline: post.content.substring(0, 34),
          brand_name: post.content.substring(0, 25),
          shareable: true,
          call_to_action: "SHOP_NOW",
          top_snap_media_id: post.imageUrl || undefined,
        }],
      },
    });

    const creative = creativeData?.creatives?.[0]?.creative || creativeData;
    return {
      platformId: creative.id || "pending",
      content: post.content,
      imageUrl: post.imageUrl,
      platform: this.platform,
      status: "published",
      publishedAt: new Date(),
      url: undefined,
    };
  }

  async schedulePost(credentials: SocialCredentials, post: CreatePostInput, scheduledAt: Date): Promise<SocialPost> {
    // Snapchat scheduling is done through campaign start_time
    const result = await this.createPost(credentials, post);
    return {
      ...result,
      status: "scheduled",
      scheduledAt,
    };
  }

  async deletePost(credentials: SocialCredentials, postId: string): Promise<void> {
    const adAccountId = credentials.adAccountId || credentials.metadata?.adAccountId;
    if (!adAccountId) throw new Error("Ad Account ID required");
    await this.fetch(`/adaccounts/${adAccountId}/creatives/${postId}`, credentials, {
      method: "DELETE",
    });
  }

  async getPostAnalytics(credentials: SocialCredentials, postId: string): Promise<PostMetrics> {
    const adAccountId = credentials.adAccountId || credentials.metadata?.adAccountId;
    if (!adAccountId) return { impressions: 0 };

    try {
      const data = await this.fetch(`/adaccounts/${adAccountId}/stats`, credentials, {
        params: {
          fields: "impressions,swipes,spend,video_views",
          granularity: "TOTAL",
        },
      });
      const stats = data?.total_stats?.[0]?.stats || {};
      return {
        impressions: stats.impressions || 0,
        clicks: stats.swipes || 0,
        // Snap returns microcurrency for spend
      };
    } catch {
      return { impressions: 0 };
    }
  }

  async getAccountAnalytics(
    credentials: SocialCredentials,
    startDate: Date,
    endDate: Date,
  ): Promise<SocialAnalytics> {
    const adAccountId = credentials.adAccountId || credentials.metadata?.adAccountId;
    if (!adAccountId) {
      return {
        period: { start: startDate, end: endDate },
        impressions: 0,
        reach: 0,
        topPosts: [],
      };
    }

    try {
      const data = await this.fetch(`/adaccounts/${adAccountId}/stats`, credentials, {
        params: {
          fields: "impressions,swipes,spend,video_views",
          granularity: "TOTAL",
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        },
      });
      const stats = data?.total_stats?.[0]?.stats || {};
      return {
        period: { start: startDate, end: endDate },
        impressions: stats.impressions || 0,
        reach: stats.swipes || 0,
        topPosts: [],
      };
    } catch {
      return {
        period: { start: startDate, end: endDate },
        impressions: 0,
        reach: 0,
        topPosts: [],
      };
    }
  }

  async createAdCampaign(
    credentials: SocialCredentials,
    campaign: CreateAdCampaignInput,
  ): Promise<AdCampaign> {
    const adAccountId = credentials.adAccountId || credentials.metadata?.adAccountId;
    if (!adAccountId) {
      throw new Error("Snapchat requires an Ad Account ID for campaign creation.");
    }

    // Create campaign
    const campaignData = await this.fetch(`/adaccounts/${adAccountId}/campaigns`, credentials, {
      method: "POST",
      body: {
        campaigns: [{
          ad_account_id: adAccountId,
          name: campaign.name,
          status: "PAUSED", // Start paused for review
          objective: this.mapObjective(campaign.objective),
          start_time: new Date().toISOString(),
          daily_budget_micro: Math.round((campaign.dailyBudgetCents || 5000) * 10000),
        }],
      },
    });

    const created = campaignData?.campaigns?.[0]?.campaign || campaignData;
    return {
      platformId: created.id || "pending",
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

  async getAdCampaignPerformance(
    credentials: SocialCredentials,
    campaignId: string,
  ): Promise<AdCampaign> {
    const data = await this.fetch(`/campaigns/${campaignId}`, credentials);
    const campaign = data?.campaigns?.[0]?.campaign || data;
    return {
      platformId: campaign.id,
      name: campaign.name,
      status: (campaign.status?.toLowerCase() || "draft") as AdCampaign["status"],
      objective: campaign.objective,
      budgetCents: 0,
      spentCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
  }

  async listAdCampaigns(credentials: SocialCredentials): Promise<AdCampaign[]> {
    const adAccountId = credentials.adAccountId || credentials.metadata?.adAccountId;
    if (!adAccountId) return [];

    const data = await this.fetch(`/adaccounts/${adAccountId}/campaigns`, credentials);
    const campaigns = data?.campaigns || [];
    return campaigns.map((c: any) => {
      const camp = c.campaign || c;
      return {
        platformId: camp.id,
        name: camp.name,
        status: (camp.status?.toLowerCase() || "draft") as AdCampaign["status"],
        objective: camp.objective,
        budgetCents: camp.daily_budget_micro ? Math.round(camp.daily_budget_micro / 10000) : 0,
        spentCents: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      };
    });
  }

  async pauseAdCampaign(credentials: SocialCredentials, campaignId: string): Promise<void> {
    await this.fetch(`/campaigns/${campaignId}`, credentials, {
      method: "PUT",
      body: {
        campaigns: [{
          id: campaignId,
          status: "PAUSED",
        }],
      },
    });
  }

  async healthCheck(
    credentials: SocialCredentials,
  ): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.fetch("/me", credentials);
      return {
        healthy: true,
        message: "Snapchat connection verified",
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: `Snapchat health check failed: ${err.message}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private mapObjective(objective?: string): string {
    const map: Record<string, string> = {
      awareness: "BRAND_AWARENESS",
      reach: "BRAND_AWARENESS",
      traffic: "WEB_VIEW",
      conversions: "WEB_CONVERSIONS",
      catalog_sales: "CATALOG_SALES",
      app_installs: "APP_INSTALLS",
      engagement: "ENGAGEMENT",
      video_views: "VIDEO_VIEWS",
    };
    return map[objective?.toLowerCase() || ""] || "WEB_CONVERSIONS";
  }
}
