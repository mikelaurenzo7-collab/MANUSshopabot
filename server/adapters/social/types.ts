/**
 * Shop_a_Bot — Unified Social Media Platform Adapter Interface
 *
 * Every social media platform adapter implements this interface so that
 * The Social Bot Bot can post content, manage ads, and pull analytics
 * across Meta, Instagram, TikTok, Twitter/X, Pinterest, Google Ads,
 * and LinkedIn through a single, consistent contract.
 */

/**
 * Per-request HTTP timeout for social adapter calls. See the e-commerce
 * adapters/types.ts for the rationale — same value, same intent.
 */
export const ADAPTER_HTTP_TIMEOUT_MS = 30_000;

// ─── Shared Types ──────────────────────────────────────────────────────────

export interface SocialPost {
  platformId: string;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  url?: string;
  platform: string;
  status: "published" | "scheduled" | "draft" | "failed";
  publishedAt?: Date;
  scheduledAt?: Date;
  metrics?: PostMetrics;
  metadata?: Record<string, any>;
}

export interface CreatePostInput {
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  link?: string;
  hashtags?: string[];
  scheduledAt?: Date;
  metadata?: Record<string, any>;
}

export interface PostMetrics {
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  saves?: number;
  engagementRate?: number;
}

export interface AdCampaign {
  platformId: string;
  name: string;
  status: "active" | "paused" | "completed" | "draft";
  objective: string;
  budgetCents: number;
  spentCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr?: number; // click-through rate
  cpc?: number; // cost per click in cents
  roas?: number; // return on ad spend
  startDate?: Date;
  endDate?: Date;
  metadata?: Record<string, any>;
}

export interface CreateAdCampaignInput {
  name: string;
  objective: "awareness" | "traffic" | "conversions" | "sales";
  budgetCents: number;
  dailyBudgetCents?: number;
  adCopy: string;
  imageUrl?: string;
  videoUrl?: string;
  targetUrl: string;
  targeting?: AdTargeting;
  startDate?: Date;
  endDate?: Date;
  metadata?: Record<string, any>;
}

export interface AdTargeting {
  ageMin?: number;
  ageMax?: number;
  genders?: ("male" | "female" | "all")[];
  locations?: string[];
  interests?: string[];
  customAudiences?: string[];
}

export interface SocialAccountInfo {
  platformId: string;
  name: string;
  handle?: string;
  profileUrl?: string;
  profileImageUrl?: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  isVerified?: boolean;
  accountType?: string;
}

export interface SocialAnalytics {
  period: { start: Date; end: Date };
  impressions: number;
  reach: number;
  profileViews?: number;
  followerGrowth?: number;
  engagementRate?: number;
  topPosts?: SocialPost[];
}

export interface SocialCredentials {
  platform: string;
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  pageId?: string;
  adAccountId?: string;
  metadata?: Record<string, any>;
}

// ─── Per-Platform Social Capability Matrix ────────────────────────────────
//
// Mirror of the e-commerce PlatformCapabilities idea. Bots branch on these
// rather than hardcoding "if platform === 'tiktok' use 9:16 video" — moves
// per-integration knowledge into a structured shape the LLM can reason
// over at planning time.
export interface SocialPlatformCapabilities {
  // ── Post formats supported natively ──────────────────────────────────
  /** Image post / carousel */
  image: boolean;
  /** Square or landscape video */
  video: boolean;
  /** Vertical short-form (Reels / TikTok / Shorts / Stories) */
  shortFormVideo: boolean;
  /** Multi-image carousel */
  carousel: boolean;
  /** Stories / 24h ephemeral content */
  stories: boolean;
  /** Live streaming */
  liveStream: boolean;

  // ── Media constraints ────────────────────────────────────────────────
  /** Maximum characters in the caption / body. 0 = unlimited */
  maxCopyChars: number;
  /** Recommended aspect ratios — bots feed into image gen prompts. */
  preferredAspectRatios: string[];
  /** Maximum video length in seconds. 0 = unlimited / not applicable. */
  maxVideoSeconds: number;

  // ── Scheduling + automation ──────────────────────────────────────────
  /** Native scheduled-post primitive (vs. bot-side cron) */
  scheduledPosting: boolean;
  /** Hashtag handling: native search, recommended, or hostile */
  hashtagSupport: "native" | "recommended" | "ignored";

  // ── Ads ──────────────────────────────────────────────────────────────
  /** Whether the platform has a self-serve ads API the bot can use */
  ads: boolean;
  /** Ad creative formats this platform serves */
  adFormats: string[];
  /** Maximum characters in ad primary text */
  maxAdCopyChars: number;
  /** Audience-targeting depth. "interests" = OK, "behavioral" = strong,
   *  "lookalike" = best-in-class, "none" = no API targeting. */
  audienceTargeting: "none" | "interests" | "behavioral" | "lookalike";
  /** Dynamic Product Ads — feed catalog into ad creative automatically */
  dynamicProductAds: boolean;

  // ── Performance hints ────────────────────────────────────────────────
  /** Recommended posting cadence per day. The Social Bot uses this to
   *  rate-limit content generation and avoid platform shadowbans. */
  recommendedPostsPerDay: number;
  /** Sustained API rate the bot should target. */
  rateLimitTokensPerSec: number;

  // ── Discovery ────────────────────────────────────────────────────────
  /** Best-fit content category. Influences which workflows the Social
   *  Bot routes here ("commerce" gets shopping ads, "engagement" gets
   *  conversational posts). */
  audienceType: "commerce" | "engagement" | "broadcast" | "professional";

  // ── Bot-readable summary ─────────────────────────────────────────────
  strengths: string[];
  limitations: string[];
}

// ─── Core Social Adapter Interface ────────────────────────────────────────

export interface SocialPlatformAdapter {
  readonly platform: string;
  readonly platformName: string;

  /** Per-integration capability + performance matrix. Bots branch on this
   *  rather than hardcoding per-platform behavior. */
  getCapabilities(): SocialPlatformCapabilities;

  /** Verify credentials and return account info */
  verifyConnection(credentials: SocialCredentials): Promise<SocialAccountInfo>;

  /** Create and publish a post immediately */
  createPost(credentials: SocialCredentials, post: CreatePostInput): Promise<SocialPost>;

  /** Schedule a post for future publishing */
  schedulePost(credentials: SocialCredentials, post: CreatePostInput, scheduledAt: Date): Promise<SocialPost>;

  /** Delete a published post */
  deletePost(credentials: SocialCredentials, postId: string): Promise<void>;

  /** Get analytics for a specific post */
  getPostAnalytics(credentials: SocialCredentials, postId: string): Promise<PostMetrics>;

  /** Get account-level analytics for a date range */
  getAccountAnalytics(credentials: SocialCredentials, startDate: Date, endDate: Date): Promise<SocialAnalytics>;

  /** Create an ad campaign */
  createAdCampaign(credentials: SocialCredentials, campaign: CreateAdCampaignInput): Promise<AdCampaign>;

  /** Get ad campaign performance */
  getAdCampaignPerformance(credentials: SocialCredentials, campaignId: string): Promise<AdCampaign>;

  /** List all ad campaigns */
  listAdCampaigns(credentials: SocialCredentials): Promise<AdCampaign[]>;

  /** Pause an active ad campaign */
  pauseAdCampaign(credentials: SocialCredentials, campaignId: string): Promise<void>;

  /** Health check — verify credentials are still valid without heavy API calls */
  healthCheck(credentials: SocialCredentials): Promise<{ healthy: boolean; message: string; latencyMs: number }>;
}
