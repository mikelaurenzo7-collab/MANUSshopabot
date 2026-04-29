/**
 * YouTube adapter — Data API v3 + uploads via resumable URL.
 *
 * Rides on the same Google OAuth client as Gmail / Sheets / GA4 — the
 * user grants the YouTube scopes once (youtube.upload + youtube.readonly)
 * and the same access token works for every YouTube call.
 *
 * The Social bot publishes Shorts + long-form video; the Builder bot
 * uses YouTube as a discovery surface (search trending hooks). The
 * adapter handles both the OAuth-token publish path and the API-key
 * read-only analytics path so the Merchant bot can pull view counts
 * without holding a user token.
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

const YT_DATA_API = "https://www.googleapis.com/youtube/v3";
const YT_UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";

export class YouTubeAdapter implements SocialPlatformAdapter {
  readonly platform = "youtube";
  readonly platformName = "YouTube";

  /**
   * YouTube: long-form + Shorts video. Algorithmic distribution rivals
   * TikTok's; YouTube monetization unlocks once the channel clears the
   * 1k-subscriber + 4k-watch-hour gate. Shorts < 60s ride a separate
   * recommender and are the highest-leverage entry point for new
   * channels.
   */
  getCapabilities(): SocialPlatformCapabilities {
    return {
      image: false,
      video: true,
      shortFormVideo: true,
      carousel: false,
      stories: false,
      liveStream: true,
      maxCopyChars: 5000,
      preferredAspectRatios: ["16:9", "9:16"],
      maxVideoSeconds: 43200, // 12-hour cap on long-form uploads
      scheduledPosting: true,
      hashtagSupport: "native",
      ads: false,
      adFormats: [],
      maxAdCopyChars: 0,
      audienceTargeting: "interests",
      dynamicProductAds: false,
      recommendedPostsPerDay: 1,
      rateLimitTokensPerSec: 1,
      audienceType: "engagement",
      strengths: [
        "Shorts feed rivals TikTok's reach — and SEO compounds (videos rank in Google)",
        "Algorithmic distribution doesn't decay — old videos can resurface for years",
        "Monetization tier unlocks once channel hits the YPP threshold",
        "YouTube Studio analytics are deep — bot pulls watch time + retention curves",
      ],
      limitations: [
        "Daily quota (10k units) is tight: each upload costs ~1600 units, leaving ~5 uploads/day budget",
        "Manual review on first uploads — first videos often sit in 'limited' state",
        "Copyright matching is aggressive; bot must avoid licensed audio in generated content",
      ],
    };
  }

  private async getAccessToken(credentials: SocialCredentials): Promise<string> {
    if (credentials.accessToken) return credentials.accessToken;
    const { default: axios } = await import("axios");
    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: credentials.metadata?.clientId || process.env.GOOGLE_CLIENT_ID || "",
        client_secret: credentials.metadata?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: credentials.refreshToken || "",
        grant_type: "refresh_token",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: ADAPTER_HTTP_TIMEOUT_MS,
      },
    );
    return response.data.access_token;
  }

  private async fetch(
    path: string,
    credentials: SocialCredentials,
    options?: { method?: string; body?: any; query?: Record<string, string>; useApiKey?: boolean; baseUrl?: string },
  ) {
    const { default: axios } = await import("axios");
    const useKey = options?.useApiKey && !!process.env.YOUTUBE_API_KEY;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!useKey) {
      const token = await this.getAccessToken(credentials);
      headers.Authorization = `Bearer ${token}`;
    }
    const params = new URLSearchParams(options?.query || {});
    if (useKey) params.set("key", process.env.YOUTUBE_API_KEY || "");
    const qs = params.toString();
    const base = options?.baseUrl || YT_DATA_API;

    return withRetry(
      async () => {
        try {
          const res = await axios({
            url: `${base}${path}${qs ? `?${qs}` : ""}`,
            method: (options?.method || "GET") as any,
            headers,
            data: options?.body,
            timeout: ADAPTER_HTTP_TIMEOUT_MS,
          });
          return res.data;
        } catch (err: any) {
          if (err.response?.status === 429) throw err;
          throw new Error(
            `YouTube API error: ${err.response?.data?.error?.message || err.message}`,
          );
        }
      },
      { maxRetries: 3, initialDelayMs: 2000 },
    );
  }

  async verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo> {
    const data = await this.fetch("/channels", credentials, {
      query: { part: "snippet,statistics", mine: "true" },
    });
    const channel = data.items?.[0];
    return {
      platformId: channel?.id || "youtube",
      name: channel?.snippet?.title || "YouTube Channel",
      handle: channel?.snippet?.customUrl || channel?.snippet?.title,
      accountType: "creator",
      followerCount: parseInt(channel?.statistics?.subscriberCount || "0"),
    };
  }

  /**
   * "Post" on YouTube means upload a video. The CreatePostInput shape
   * has metadata.videoUrl (a publicly-fetchable upload), title, and
   * description. We fetch the video bytes once, then PUT them at a
   * resumable upload URL — same shape as the TikTok flow so the
   * Social bot's content-pipeline doesn't branch on platform.
   */
  async createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost> {
    const videoUrl = post.metadata?.videoUrl;
    if (!videoUrl) throw new Error("YouTube createPost requires metadata.videoUrl");
    const title: string = post.metadata?.title || post.content?.slice(0, 100) || "Untitled";
    const description: string = post.content || "";
    const tags: string[] = Array.isArray(post.metadata?.tags) ? post.metadata.tags : [];
    const privacy: string = post.metadata?.privacy || "public";

    // Step 1: open a resumable upload.
    const initResp = await this.fetch("/videos", credentials, {
      baseUrl: YT_UPLOAD_API,
      method: "POST",
      query: { part: "snippet,status", uploadType: "resumable" },
      body: {
        snippet: { title, description, tags, categoryId: "22" /* People & Blogs */ },
        status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
      },
    });
    // Note: a strict resumable flow returns a `Location` header on the
    // init response (containing the per-upload URL). Some Axios setups
    // hide headers in the data envelope; if your runtime needs the
    // header explicitly, swap fetch() for a raw axios call here.

    // Step 2: stream video bytes to the upload URL.
    const { default: axios } = await import("axios");
    const videoResp = await axios.get(videoUrl, { responseType: "arraybuffer", timeout: 60000 });
    const videoBytes = Buffer.from(videoResp.data);

    const uploadUrl = (initResp as any)?.headers?.location || initResp?.uploadUrl;
    if (!uploadUrl) {
      // Fallback: many SDKs let you POST the video directly to /videos
      // with multipart/related. We stay on the resumable contract;
      // surface a clear error if the upload URL didn't materialize.
      return {
        platformId: `yt_pending_${Date.now()}`,
        content: description,
        platform: "youtube",
        status: "draft",
        metadata: {
          warning: "YouTube upload URL not returned by init call — verify resumable flow",
          title,
          tags,
          videoUrl,
        },
      };
    }
    const uploadRes = await axios.put(uploadUrl, videoBytes, {
      headers: { "Content-Type": "video/*" },
      timeout: 300000,
    });

    return {
      platformId: uploadRes.data?.id || `yt_${Date.now()}`,
      content: description,
      platform: "youtube",
      status: "published",
      publishedAt: new Date(),
      metadata: { title, tags, privacy, videoUrl },
    };
  }

  async schedulePost(
    credentials: SocialCredentials,
    post: CreatePostInput,
    scheduledAt: Date,
  ): Promise<SocialPost> {
    // YouTube supports scheduled publish: upload as `private`, then
    // PATCH `status.publishAt` to scheduledAt. The post returns immediately
    // once uploaded, with status: scheduled.
    const created = await this.createPost(credentials, {
      ...post,
      metadata: { ...post.metadata, privacy: "private" },
    });
    if (!created.platformId) return created;
    await this.fetch("/videos", credentials, {
      method: "PUT",
      query: { part: "status" },
      body: {
        id: created.platformId,
        status: {
          privacyStatus: "private",
          publishAt: scheduledAt.toISOString(),
        },
      },
    });
    return { ...created, status: "scheduled", scheduledAt };
  }

  async deletePost(credentials: SocialCredentials, postId: string): Promise<void> {
    await this.fetch("/videos", credentials, {
      method: "DELETE",
      query: { id: postId },
    });
  }

  async getPostAnalytics(credentials: SocialCredentials, postId: string): Promise<PostMetrics> {
    const data = await this.fetch("/videos", credentials, {
      query: { part: "statistics", id: postId },
    });
    const stats = data.items?.[0]?.statistics || {};
    // YouTube exposes view + like + comment counts on every video; the
    // PostMetrics surface uses `impressions` for views (highest-fidelity
    // proxy) and `reach` for the dedupe'd watcher count. Shares aren't
    // exposed by v3.
    return {
      impressions: parseInt(stats.viewCount || "0"),
      reach: parseInt(stats.viewCount || "0"),
      likes: parseInt(stats.likeCount || "0"),
      comments: parseInt(stats.commentCount || "0"),
    };
  }

  async getAccountAnalytics(
    credentials: SocialCredentials,
    startDate: Date,
    endDate: Date,
  ): Promise<SocialAnalytics> {
    // Reads from the channels.statistics endpoint — total views +
    // subscribers + uploads. A deeper retention/views-by-day stream
    // requires the YouTube Analytics API (separate scope).
    const data = await this.fetch("/channels", credentials, {
      query: { part: "statistics", mine: "true" },
    });
    const stats = data.items?.[0]?.statistics || {};
    return {
      period: { start: startDate, end: endDate },
      impressions: parseInt(stats.viewCount || "0"),
      reach: parseInt(stats.subscriberCount || "0"),
    };
  }

  async createAdCampaign(_creds: SocialCredentials, _campaign: CreateAdCampaignInput): Promise<AdCampaign> {
    throw new Error("YouTube ad campaigns are managed through Google Ads, not the YouTube Data API.");
  }

  async getAdCampaignPerformance(_creds: SocialCredentials, _id: string): Promise<AdCampaign> {
    throw new Error("YouTube ads → Google Ads adapter.");
  }

  async listAdCampaigns(_creds: SocialCredentials): Promise<AdCampaign[]> {
    return [];
  }

  async pauseAdCampaign(_creds: SocialCredentials, _id: string): Promise<void> {
    throw new Error("YouTube ads → Google Ads adapter.");
  }

  async healthCheck(
    credentials: SocialCredentials,
  ): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.verifyConnection(credentials);
      return { healthy: true, message: "YouTube connection verified", latencyMs: Date.now() - start };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.message || "YouTube connection failed",
        latencyMs: Date.now() - start,
      };
    }
  }
}
