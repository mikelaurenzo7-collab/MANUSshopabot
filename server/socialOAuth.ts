/**
 * Social OAuth Callback Handler
 * Handles the redirect from Meta, TikTok, Twitter, Pinterest, Google Ads, LinkedIn
 * after the user authorizes our app. Exchanges the authorization code for an access
 * token and stores the social account in the database.
 */

import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { socialAccounts } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "./_core/env";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface UserProfile {
  accountId: string;
  accountName: string;
  profileUrl?: string;
  profileImageUrl?: string;
  followerCount?: number;
}

// ─── Token Exchange Functions ──────────────────────────────────────────────

async function exchangeMetaCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const clientId = ENV.metaClientId || ENV.metaAppId;
  const clientSecret = ENV.metaClientSecret || ENV.metaAppSecret;
  const res = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
    params: { client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code },
  });
  return res.data;
}

async function fetchMetaProfile(accessToken: string): Promise<UserProfile> {
  const { default: axios } = await import("axios");
  const base = ENV.metaGraphApiBase || "https://graph.facebook.com/v19.0";
  const res = await axios.get(`${base}/me`, {
    params: { fields: "id,name,picture", access_token: accessToken },
  });
  return {
    accountId: res.data.id,
    accountName: res.data.name,
    profileImageUrl: res.data.picture?.data?.url,
  };
}

async function exchangeTikTokCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post("https://open.tiktokapis.com/v2/oauth/token/", new URLSearchParams({
    client_key: ENV.tiktokClientKey,
    client_secret: ENV.tiktokClientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
    expires_in: res.data.expires_in,
    scope: res.data.scope,
  };
}

async function fetchTikTokProfile(accessToken: string): Promise<UserProfile> {
  const { default: axios } = await import("axios");
  const res = await axios.get("https://open.tiktokapis.com/v2/user/info/", {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { fields: "open_id,display_name,avatar_url,follower_count" },
  });
  const user = res.data?.data?.user;
  return {
    accountId: user?.open_id || "",
    accountName: user?.display_name || "TikTok Account",
    profileImageUrl: user?.avatar_url,
    followerCount: user?.follower_count,
  };
}

async function exchangeTwitterCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const credentials = Buffer.from(`${ENV.twitterClientId}:${ENV.twitterClientSecret}`).toString("base64");
  const params: Record<string, string> = {
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: "challenge",
  };
  const res = await axios.post("https://api.twitter.com/2/oauth2/token", new URLSearchParams(params).toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
  });
  return res.data;
}

async function fetchTwitterProfile(accessToken: string): Promise<UserProfile> {
  const { default: axios } = await import("axios");
  const res = await axios.get("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { "user.fields": "name,username,profile_image_url,public_metrics" },
  });
  const user = res.data?.data;
  return {
    accountId: user?.id || "",
    accountName: user?.name || user?.username || "Twitter Account",
    profileUrl: `https://twitter.com/${user?.username}`,
    profileImageUrl: user?.profile_image_url,
    followerCount: user?.public_metrics?.followers_count,
  };
}

async function exchangePinterestCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const appId = ENV.pinterestAppId;
  const appSecret = ENV.pinterestAppSecret;
  const credentials = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const res = await axios.post("https://api.pinterest.com/v5/oauth/token", new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  }).toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
  });
  return res.data;
}

async function fetchPinterestProfile(accessToken: string): Promise<UserProfile> {
  const { default: axios } = await import("axios");
  const res = await axios.get("https://api.pinterest.com/v5/user_account", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return {
    accountId: res.data?.username || "",
    accountName: res.data?.username || "Pinterest Account",
    profileImageUrl: res.data?.profile_image,
    followerCount: res.data?.follower_count,
  };
}

// ─── State Parsing ──────────────────────────────────────────────────────

interface ParsedState {
  userId: number;
  platform: string;
  origin: string;
}

function parseState(state: string): ParsedState | null {
  try {
    // Try base64url-encoded JSON state first (new format)
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const payload = JSON.parse(decoded);
    if (payload.u && payload.p && payload.o) {
      return { userId: payload.u, platform: payload.p, origin: payload.o };
    }
  } catch {
    // Fall through to legacy format
  }

  try {
    // Legacy format: "<random>_<userId>_<platform>"
    const parts = state.split("_");
    if (parts.length >= 3) {
      const platform = parts[parts.length - 1];
      const userId = parseInt(parts[parts.length - 2], 10);
      if (!isNaN(userId) && platform) {
        return { userId, platform, origin: "" };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// ─── Main Callback Handler ─────────────────────────────────────────────────

async function handleSocialOAuthCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  const parsed = parseState(state || "");
  const origin = parsed?.origin || req.headers.origin as string || "";

  if (error) {
    console.error(`[SocialOAuth] OAuth error: ${error} - ${error_description}`);
    return res.redirect(`${origin}/integrations?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${origin}/integrations?error=missing_code_or_state`);
  }

  if (!parsed) {
    return res.redirect(`${origin}/integrations?error=invalid_state`);
  }

  const { userId, platform } = parsed;
  const redirectUri = `${origin}/api/social/oauth/callback`;

  try {
    let tokenData: TokenResponse;
    let profile: UserProfile;

    switch (platform) {
      case "meta":
      case "instagram":
        tokenData = await exchangeMetaCode(code, redirectUri);
        profile = await fetchMetaProfile(tokenData.access_token);
        break;
      case "tiktok":
        tokenData = await exchangeTikTokCode(code, redirectUri);
        profile = await fetchTikTokProfile(tokenData.access_token);
        break;
      case "twitter":
        tokenData = await exchangeTwitterCode(code, redirectUri);
        profile = await fetchTwitterProfile(tokenData.access_token);
        break;
      case "pinterest":
        tokenData = await exchangePinterestCode(code, redirectUri);
        profile = await fetchPinterestProfile(tokenData.access_token);
        break;
      default:
        return res.redirect(`${origin}/integrations?error=unsupported_platform`);
    }

    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined;

    const db = await getDb();
    if (db) {
      const existing = await db.select()
        .from(socialAccounts)
        .where(and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.platform, platform as any),
          eq(socialAccounts.accountId, profile.accountId),
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(socialAccounts)
          .set({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || null,
            tokenExpiresAt: tokenExpiresAt || null,
            scopes: tokenData.scope || null,
            accountName: profile.accountName,
            profileUrl: profile.profileUrl || null,
            profileImageUrl: profile.profileImageUrl || null,
            followerCount: profile.followerCount || null,
            status: "active",
            lastRefreshedAt: new Date(),
          })
          .where(eq(socialAccounts.id, existing[0].id));
      } else {
        await db.insert(socialAccounts).values({
          userId,
          platform: platform as any,
          accountId: profile.accountId,
          accountName: profile.accountName,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: tokenExpiresAt || null,
          scopes: tokenData.scope || null,
          profileUrl: profile.profileUrl || null,
          profileImageUrl: profile.profileImageUrl || null,
          followerCount: profile.followerCount || null,
          status: "active",
          lastRefreshedAt: new Date(),
        });
      }
    }

    console.log(`[SocialOAuth] Connected ${platform} account "${profile.accountName}" for user ${userId}`);
    return res.redirect(`${origin}/integrations?connected=${platform}&account=${encodeURIComponent(profile.accountName)}`);

  } catch (err: any) {
    console.error(`[SocialOAuth] Token exchange failed for ${platform}:`, err.response?.data || err.message);
    return res.redirect(`${origin}/integrations?error=${encodeURIComponent(`Failed to connect ${platform}: ${err.message}`)}`);
  }
}

// ─── Route Registration ────────────────────────────────────────────────────

export function registerSocialOAuthRoutes(app: Express) {
  app.get("/api/social/oauth/callback", handleSocialOAuthCallback);
  console.log("[SocialOAuth] Callback route registered: GET /api/social/oauth/callback");
}
