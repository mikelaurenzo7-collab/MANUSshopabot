/**
 * Social OAuth Callback Handler
 * Handles the redirect from Meta, TikTok, Twitter, Pinterest, Google Ads, LinkedIn
 * after the user authorizes our app. Exchanges the authorization code for an access
 * token and stores the social account in the database.
 */

import type { Express, Request, Response } from "express";
import {
  consumeOAuthStateToken,
  ensurePersonalOrg,
  getDb,
  getOAuthStateToken,
  getUserById,
} from "./db";
import { socialAccounts } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "./_core/env";
import { logAgentAction } from "./telemetry";
import { logger } from "./utils/logger";

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

// ─── Google / Gmail ──────────────────────────────────────────────────────
async function exchangeGmailCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    client_id: ENV.googleClientId,
    client_secret: ENV.googleClientSecret,
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
async function fetchGmailProfile(accessToken: string): Promise<UserProfile> {
  const { default: axios } = await import("axios");
  const res = await axios.get("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return {
    accountId: res.data.emailAddress,
    accountName: res.data.emailAddress,
  };
}

// ─── Outlook / Microsoft Graph ──────────────────────────────────────────
// Same OAuth dance as Google, just at login.microsoftonline.com. The
// tenant is pulled from AZURE_TENANT_ID; "common" supports both work
// and personal accounts. Refresh tokens come back when the auth URL
// included offline_access — see SOCIAL_PLATFORMS.outlook in
// server/routers/connectors.ts.
async function exchangeOutlookCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const tenant = ENV.azureTenantId || "common";
  const res = await axios.post(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: ENV.azureClientId,
      client_secret: ENV.azureClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      // Asking for offline_access here too is harmless — token endpoint
      // mirrors whatever scopes the authorize URL requested.
      scope: "Mail.Read Mail.Send Calendars.Read Calendars.ReadWrite User.Read offline_access",
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  return {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
    expires_in: res.data.expires_in,
    scope: res.data.scope,
    token_type: res.data.token_type,
  };
}

async function fetchOutlookProfile(accessToken: string): Promise<UserProfile> {
  const { default: axios } = await import("axios");
  const res = await axios.get("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return {
    accountId: res.data.id || res.data.userPrincipalName || res.data.mail,
    accountName: res.data.displayName || res.data.userPrincipalName || res.data.mail,
    profileUrl: res.data.userPrincipalName ? `mailto:${res.data.userPrincipalName}` : undefined,
  };
}

// ─── Slack ──────────────────────────────────────────────────────────────
// Slack OAuth v2 returns both a bot token and a user token. We persist
// the bot token as access_token (chat.postMessage needs it) and stash
// the user token + team id on metadata via the social-account record.
async function exchangeSlackCode(
  code: string,
  redirectUri: string,
): Promise<TokenResponse & { team?: { id: string; name: string }; bot_user_id?: string; authed_user?: { id: string; access_token?: string } }> {
  const { default: axios } = await import("axios");
  const res = await axios.post(
    "https://slack.com/api/oauth.v2.access",
    new URLSearchParams({
      client_id: ENV.slackClientId,
      client_secret: ENV.slackClientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  if (res.data?.ok === false) {
    throw new Error(`Slack OAuth error: ${res.data.error}`);
  }
  return {
    access_token: res.data.access_token, // bot token (xoxb-…)
    refresh_token: res.data.refresh_token,
    expires_in: res.data.expires_in,
    scope: res.data.scope,
    team: res.data.team,
    bot_user_id: res.data.bot_user_id,
    authed_user: res.data.authed_user,
  };
}

async function fetchSlackProfile(accessToken: string): Promise<UserProfile> {
  const { default: axios } = await import("axios");
  // auth.test echoes the team + bot user info — we don't even need a
  // separate `users.info` call to populate the account.
  const res = await axios.post(
    "https://slack.com/api/auth.test",
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.data?.ok === false) {
    throw new Error(`Slack auth.test failed: ${res.data.error}`);
  }
  return {
    accountId: res.data.team_id || res.data.user_id,
    accountName: res.data.team || res.data.user || "Slack Workspace",
    profileUrl: res.data.url,
  };
}

// ─── YouTube ────────────────────────────────────────────────────────────
// Rides on the same Google OAuth client as Gmail. The only difference
// is the scopes — set on the authorize URL, mirrored back here so the
// token-exchange request is explicit about what was granted.
async function exchangeYouTubeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  return {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
    expires_in: res.data.expires_in,
    scope: res.data.scope,
  };
}

async function fetchYouTubeProfile(accessToken: string): Promise<UserProfile> {
  const { default: axios } = await import("axios");
  const res = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { part: "snippet,statistics", mine: "true" },
  });
  const channel = res.data?.items?.[0];
  return {
    accountId: channel?.id || "youtube",
    accountName: channel?.snippet?.title || "YouTube Channel",
    profileImageUrl: channel?.snippet?.thumbnails?.default?.url,
    followerCount: parseInt(channel?.statistics?.subscriberCount || "0"),
  };
}

// ─── Snapchat ──────────────────────────────────────────────────────────
async function exchangeSnapchatCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const credentials = Buffer.from(`${ENV.snapchatClientId}:${ENV.snapchatClientSecret}`).toString("base64");
  const res = await axios.post("https://accounts.snapchat.com/login/oauth2/access_token", new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  }).toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
  });
  return res.data;
}

async function fetchSnapchatProfile(accessToken: string): Promise<UserProfile> {
  const { default: axios } = await import("axios");
  const res = await axios.get("https://adsapi.snapchat.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const me = res.data?.me || res.data;
  return {
    accountId: me.id || me.organization_id || "unknown",
    accountName: me.display_name || me.email || "Snapchat User",
    profileUrl: undefined,
    profileImageUrl: undefined,
  };
}

// ─── State Parsing ──────────────────────────────────────────────────────

interface ParsedState {
  userId: number;
  platform: string;
  origin: string;
  returnTo?: string;
}

function parseState(state: string): ParsedState | null {
  try {
    // Try base64url-encoded JSON state first (new format)
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const payload = JSON.parse(decoded);
    if (payload.u && payload.p && payload.o) {
      return { userId: payload.u, platform: payload.p, origin: payload.o, returnTo: payload.r };
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

  const persistedState = state ? await getOAuthStateToken(state, "social") : undefined;
  const parsed = parseState(state || "");
  const origin = persistedState?.origin || parsed?.origin || req.headers.origin as string || "";

  if (error) {
    logger.error("social_oauth_provider_error", {
      module: "socialOAuth",
      error,
      description: error_description,
    });
    if (state) {
      await consumeOAuthStateToken(state, "social");
    }
    return res.redirect(`${origin}/integrations?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${origin}/integrations?error=missing_code_or_state`);
  }

  const consumedState = await consumeOAuthStateToken(state, "social");
  const effectiveState = consumedState
    ? {
        userId: consumedState.userId,
        platform: consumedState.platform,
        origin: consumedState.origin,
        returnTo: consumedState.returnTo ?? undefined,
      }
    : parsed;

  if (!effectiveState) {
    return res.redirect(`${origin}/integrations?error=invalid_state`);
  }

  const { userId, platform } = effectiveState;
  const callbackOrigin = effectiveState.origin || origin;
  const redirectUri = `${callbackOrigin}/api/social/oauth/callback`;

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
      case "gmail":
        tokenData = await exchangeGmailCode(code, redirectUri);
        profile = await fetchGmailProfile(tokenData.access_token);
        break;
      case "snapchat":
        tokenData = await exchangeSnapchatCode(code, redirectUri);
        profile = await fetchSnapchatProfile(tokenData.access_token);
        break;
      // Sprint 27.5 expansion ────────────────────────────────────────────
      case "outlook":
        tokenData = await exchangeOutlookCode(code, redirectUri);
        profile = await fetchOutlookProfile(tokenData.access_token);
        break;
      case "slack":
        tokenData = await exchangeSlackCode(code, redirectUri);
        profile = await fetchSlackProfile(tokenData.access_token);
        break;
      case "youtube":
        tokenData = await exchangeYouTubeCode(code, redirectUri);
        profile = await fetchYouTubeProfile(tokenData.access_token);
        break;
      default:
        return res.redirect(`${callbackOrigin}/integrations?error=unsupported_platform`);
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
        // Resolve the user's active org so the new social account is
        // scoped correctly and visible only inside that tenant.
        const personalOrg = await ensurePersonalOrg(userId);
        const userRow = await getUserById(userId);
        const orgId = userRow?.currentOrgId ?? personalOrg.id;

        await db.insert(socialAccounts).values({
          orgId,
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

    logger.info("social_oauth_connected", {
      module: "socialOAuth",
      platform,
      userId,
      accountName: profile.accountName,
    });
    logAgentAction({
      agentType: "social",
      actionType: "social_oauth_connect",
      triggerSource: "manual",
      input: { platform, userId },
      output: { accountId: profile.accountId, accountName: profile.accountName, hasRefreshToken: !!tokenData.refresh_token },
      success: true,
    }).catch((err) =>
      logger.error("social_oauth_telemetry_failed", { module: "socialOAuth", platform, error: err.message }),
    );
    const redirectPath = effectiveState.returnTo || "/integrations";
    const connectedParam = effectiveState.returnTo ? `social_connected=${platform}` : `connected=${platform}&account=${encodeURIComponent(profile.accountName)}`;
    return res.redirect(`${callbackOrigin}${redirectPath}?${connectedParam}`);

  } catch (err: any) {
    logger.error("social_oauth_token_exchange_failed", {
      module: "socialOAuth",
      platform,
      error: err.response?.data ?? err.message,
    });
    logAgentAction({
      agentType: "social",
      actionType: "social_oauth_connect",
      triggerSource: "manual",
      input: { platform, userId },
      output: { error: err.message },
      success: false,
      errorMessage: err.message,
    }).catch((telErr) =>
      logger.error("social_oauth_telemetry_failed", { module: "socialOAuth", platform, error: telErr.message }),
    );
    const redirectPath = effectiveState?.returnTo || "/integrations";
    return res.redirect(`${callbackOrigin}${redirectPath}?error=${encodeURIComponent(`Failed to connect ${platform}: ${err.message}`)}`);
  }
}

// ─── Route Registration ────────────────────────────────────────────────────

export function registerSocialOAuthRoutes(app: Express) {
  app.get("/api/social/oauth/callback", handleSocialOAuthCallback);
  logger.info("social_oauth_route_registered", {
    module: "socialOAuth",
    route: "GET /api/social/oauth/callback",
  });
}
