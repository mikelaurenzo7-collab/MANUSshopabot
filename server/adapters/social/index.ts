/**
 * Shop_a_Bot — Social Media Platform Adapter Registry
 *
 * The central factory for all social media adapters.
 * The Social Bot uses this registry to post content,
 * manage ads, and pull analytics across all 7 platforms.
 *
 * Usage:
 *   const adapter = getSocialAdapter("instagram");
 *   await adapter.createPost(credentials, { content: "...", imageUrl: "..." });
 */

export * from "./types";
export { MetaAdapter } from "./metaAdapter";
export { InstagramAdapter } from "./instagramAdapter";
export { TikTokAdapter } from "./tiktokAdapter";
export { TwitterAdapter } from "./twitterAdapter";
export { PinterestAdapter } from "./pinterestAdapter";
export { GoogleAdsAdapter } from "./googleAdsAdapter";
export { GmailAdapter } from "./gmailAdapter";
export { SnapchatAdapter } from "./snapchatAdapter";
export { OutlookAdapter } from "./outlookAdapter";
export { SlackAdapter } from "./slackAdapter";
export { YouTubeAdapter } from "./youtubeAdapter";

import type { SocialPlatformAdapter } from "./types";
import { MetaAdapter } from "./metaAdapter";
import { InstagramAdapter } from "./instagramAdapter";
import { TikTokAdapter } from "./tiktokAdapter";
import { TwitterAdapter } from "./twitterAdapter";
import { PinterestAdapter } from "./pinterestAdapter";
import { GoogleAdsAdapter } from "./googleAdsAdapter";
import { GmailAdapter } from "./gmailAdapter";
import { SnapchatAdapter } from "./snapchatAdapter";
import { OutlookAdapter } from "./outlookAdapter";
import { SlackAdapter } from "./slackAdapter";
import { YouTubeAdapter } from "./youtubeAdapter";

// Singleton instances per platform (adapters are stateless)
const adapters: Record<string, SocialPlatformAdapter> = {
  meta: new MetaAdapter(),
  facebook: new MetaAdapter(), // alias
  instagram: new InstagramAdapter(),
  tiktok: new TikTokAdapter(),
  twitter: new TwitterAdapter(),
  x: new TwitterAdapter(), // alias
  pinterest: new PinterestAdapter(),
  google_ads: new GoogleAdsAdapter(),
  gmail: new GmailAdapter(),
  snapchat: new SnapchatAdapter(),
  // Sprint 27.5 expansion — Outlook for B2B inboxes, Slack for VIP
  // community channels, YouTube for long-form + Shorts video.
  outlook: new OutlookAdapter(),
  slack: new SlackAdapter(),
  youtube: new YouTubeAdapter(),
};

/**
 * Get the social platform adapter for a given platform identifier.
 * Throws if the platform is not supported.
 */
export function getSocialAdapter(platform: string): SocialPlatformAdapter {
  const adapter = adapters[platform.toLowerCase()];
  if (!adapter) {
    throw new Error(
      `Unsupported social platform: "${platform}". ` +
      `Supported platforms: ${Object.keys(adapters).filter(k => k !== "facebook" && k !== "x").join(", ")}`
    );
  }
  return adapter;
}

/**
 * List all supported social platform identifiers (no aliases).
 */
export const SUPPORTED_SOCIAL_PLATFORMS = [
  "meta", "instagram", "tiktok", "twitter", "pinterest", "google_ads", "gmail", "snapchat",
  // Sprint 27.5 expansion
  "outlook", "slack", "youtube",
];

export function getSupportedSocialPlatforms(): string[] {
  return SUPPORTED_SOCIAL_PLATFORMS;
}

/**
 * Capability matrix for every registered social adapter. Used by the
 * Social Bot to plan platform-aware content (e.g. 9:16 video for
 * TikTok, 2:3 portrait for Pinterest, threads for Twitter).
 */
export function getSocialCapabilityMatrix(): Record<string, ReturnType<SocialPlatformAdapter["getCapabilities"]>> {
  const matrix: Record<string, ReturnType<SocialPlatformAdapter["getCapabilities"]>> = {};
  for (const id of SUPPORTED_SOCIAL_PLATFORMS) {
    const adapter = adapters[id];
    if (adapter) matrix[id] = adapter.getCapabilities();
  }
  return matrix;
}

/**
 * Build SocialCredentials from a social_accounts DB record.
 */
export function buildSocialCredentials(record: {
  platform: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  platformAccountId?: string | null;
  metadata?: any;
}) {
  const meta = typeof record.metadata === "string"
    ? JSON.parse(record.metadata)
    : record.metadata || {};

  return {
    platform: record.platform,
    accessToken: record.accessToken || "",
    refreshToken: record.refreshToken || undefined,
    accountId: record.platformAccountId || meta.accountId || undefined,
    pageId: meta.pageId || undefined,
    adAccountId: meta.adAccountId || undefined,
    metadata: meta,
  };
}
export * from "../eliteExtensions";
