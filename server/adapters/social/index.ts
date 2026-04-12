/**
 * BeastBots — Social Media Platform Adapter Registry
 *
 * The central factory for all social media adapters.
 * The Social Bot uses this registry to post content,
 * manage ads, and pull analytics across all 6 platforms.
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

import type { SocialPlatformAdapter } from "./types";
import { MetaAdapter } from "./metaAdapter";
import { InstagramAdapter } from "./instagramAdapter";
import { TikTokAdapter } from "./tiktokAdapter";
import { TwitterAdapter } from "./twitterAdapter";
import { PinterestAdapter } from "./pinterestAdapter";
import { GoogleAdsAdapter } from "./googleAdsAdapter";

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
export const SUPPORTED_SOCIAL_PLATFORMS = ["meta", "instagram", "tiktok", "twitter", "pinterest", "google_ads"];

export function getSupportedSocialPlatforms(): string[] {
  return SUPPORTED_SOCIAL_PLATFORMS;
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
