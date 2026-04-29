/**
 * E-Commerce OAuth Callback Handler
 * Handles the redirect from Etsy, Amazon, eBay, and TikTok Shop
 * after the user authorizes our app. Exchanges the authorization code for an access
 * token and stores the platform credential in the database.
 */

import type { Express, Request, Response } from "express";
import {
  consumeOAuthStateToken,
  ensurePersonalOrg,
  getDb,
  getOAuthStateToken,
  getStoreById,
  getUserById,
} from "./db";
import * as dbHelpers from "./db";
import { platformCredentials } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "./_core/env";
import { ecomOAuthStateStore, pkceStore } from "./routers/connectors";
import { logAgentAction } from "./telemetry";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

// ─── Token Exchange Functions ──────────────────────────────────────────────

async function exchangeEtsyCode(code: string, redirectUri: string, codeVerifier: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post("https://api.etsy.com/v3/public/oauth/token", new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ENV.etsyApiKey,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data;
}

async function exchangeAmazonCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post("https://api.amazon.com/auth/o2/token", new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ENV.amazonSpClientId,
    client_secret: ENV.amazonSpClientSecret,
    code,
    redirect_uri: redirectUri,
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data;
}

async function exchangeEbayCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const credentials = Buffer.from(`${ENV.ebayAppId}:${ENV.ebayCertId}`).toString("base64");
  const res = await axios.post("https://api.ebay.com/identity/v1/oauth2/token", new URLSearchParams({
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

async function exchangeTikTokShopCode(code: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const appKey = ENV.tiktokAppId || ENV.tiktokClientKey;
  const appSecret = ENV.tiktokClientSecret;
  const res = await axios.get("https://auth.tiktok-shops.com/api/v2/token/get", {
    params: {
      app_key: appKey,
      app_secret: appSecret,
      auth_code: code,
      grant_type: "authorized_code",
    },
  });
  // TikTok Shop returns data in a nested structure
  const data = res.data?.data || res.data;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.access_token_expire_in,
  };
}


async function exchangeSquareCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post("https://connect.squareup.com/oauth2/token", {
    client_id: ENV.squareClientId,
    client_secret: ENV.squareClientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }, {
    headers: { "Content-Type": "application/json" },
  });
  return res.data;
}

async function exchangeFaireCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post("https://www.faire.com/api/external-api-oauth2/token", new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ENV.faireClientId,
    client_secret: ENV.faireClientSecret,
    code,
    redirect_uri: redirectUri,
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data;
}

async function exchangeBigCommerceCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post("https://login.bigcommerce.com/oauth2/token", new URLSearchParams({
    client_id: ENV.bigcommerceClientId,
    client_secret: ENV.bigcommerceClientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: "store_v2_products store_v2_orders store_v2_content",
    context: "stores/{store_hash}",
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data;
}

async function exchangeDepopCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post("https://api.depop.com/oauth2/token", new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ENV.depopAppId,
    client_secret: ENV.depopAppSecret,
    code,
    redirect_uri: redirectUri,
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data;
}

async function exchangeStockXCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post("https://accounts.stockx.com/oauth/token", new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ENV.stockxClientId,
    client_secret: ENV.stockxClientSecret,
    code,
    redirect_uri: redirectUri,
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data;
}

async function exchangeReverbCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post("https://api.reverb.com/oauth/token", new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ENV.reverbClientId,
    client_secret: ENV.reverbClientSecret,
    code,
    redirect_uri: redirectUri,
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data;
}
// ─── Main Callback Handler ─────────────────────────────────────────────────

async function handleEcommerceOAuthCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  const persistedState = state ? await getOAuthStateToken(state, "ecommerce") : undefined;

  // Legacy state parsing fallback for in-flight OAuth redirects created before DB persistence.
  let stateOrigin = "";
  try {
    const decoded = Buffer.from(state || "", "base64url").toString("utf-8");
    const payload = JSON.parse(decoded);
    if (payload.o) stateOrigin = payload.o;
  } catch { /* ignore */ }
  const origin = stateOrigin || req.headers.origin as string || "";
  const resolvedOrigin = persistedState?.origin || origin;

  if (error) {
    console.error(`[EcomOAuth] OAuth error: ${error} — ${error_description}`);
    if (state) {
      await consumeOAuthStateToken(state, "ecommerce");
    }
    return res.redirect(`${resolvedOrigin}/integrations?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${resolvedOrigin}/integrations?error=missing_code_or_state`);
  }

  // Verify state from durable storage first, then fall back to legacy in-memory state.
  const stateData = await consumeOAuthStateToken(state, "ecommerce");
  const legacyStateData = stateData ? undefined : ecomOAuthStateStore.get(state);
  if (!stateData) {
    if (!legacyStateData) {
      return res.redirect(`${resolvedOrigin}/integrations?error=invalid_or_expired_state`);
    }
  }
  if (legacyStateData) {
    ecomOAuthStateStore.delete(state);
  }

  const effectiveState = stateData ?? legacyStateData;
  if (!effectiveState) {
    return res.redirect(`${resolvedOrigin}/integrations?error=invalid_or_expired_state`);
  }
  const userId = effectiveState.userId;
  const storeId = effectiveState.storeId;
  const platform = effectiveState.platform;
  const callbackOrigin = stateData?.origin || resolvedOrigin;
  const redirectUri = `${callbackOrigin}/api/ecommerce/oauth/callback`;

  try {
    let tokenData: TokenResponse;

    switch (platform) {
      case "etsy": {
        const codeVerifier = stateData?.codeVerifier || pkceStore.get(state)?.codeVerifier;
        if (!codeVerifier) {
          return res.redirect(`${callbackOrigin}/integrations?error=pkce_verifier_missing`);
        }
        pkceStore.delete(state);
        tokenData = await exchangeEtsyCode(code, redirectUri, codeVerifier);
        break;
      }
      case "amazon":
        tokenData = await exchangeAmazonCode(code, redirectUri);
        break;
      case "ebay":
        tokenData = await exchangeEbayCode(code, redirectUri);
        break;
      case "tiktok_shop":
        tokenData = await exchangeTikTokShopCode(code);
        break;
      case "square":
        tokenData = await exchangeSquareCode(code, redirectUri);
        break;
      case "faire":
        tokenData = await exchangeFaireCode(code, redirectUri);
        break;
      case "bigcommerce":
        tokenData = await exchangeBigCommerceCode(code, redirectUri);
        break;
      case "depop":
        tokenData = await exchangeDepopCode(code, redirectUri);
        break;
      case "stockx":
        tokenData = await exchangeStockXCode(code, redirectUri);
        break;
      case "reverb":
        tokenData = await exchangeReverbCode(code, redirectUri);
        break;
      default:
        return res.redirect(`${callbackOrigin}/integrations?error=unsupported_platform`);
    }

    // Calculate token expiry
    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined;

    // Upsert the platform credential
    const db = await getDb();
    if (db) {
      // Check if credential already exists for this user + platform
      const existing = await db.select()
        .from(platformCredentials)
        .where(and(
          eq(platformCredentials.userId, userId),
          eq(platformCredentials.platform, platform),
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(platformCredentials)
          .set({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || null,
            tokenExpiresAt: tokenExpiresAt || null,
            status: "active",
            lastHealthCheck: new Date(),
          })
          .where(eq(platformCredentials.id, existing[0].id));
      } else {
        // Resolve orgId from the store (preferred) or the user's
        // active org. Either path keeps the credential scoped to the
        // tenant that initiated the OAuth flow.
        let orgId: number | null = null;
        if (storeId) {
          const storeRow = await dbHelpers.getStoreById(storeId);
          orgId = storeRow?.orgId ?? null;
        }
        if (orgId == null) {
          const personalOrg = await dbHelpers.ensurePersonalOrg(userId);
          const userRow = await dbHelpers.getUserById(userId);
          orgId = userRow?.currentOrgId ?? personalOrg.id;
        }

        await db.insert(platformCredentials).values({
          orgId,
          userId,
          storeId: storeId || null,
          platform,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: tokenExpiresAt || null,
          status: "active",
          lastHealthCheck: new Date(),
        });
      }

      // If linked to a store, update store status
      if (storeId) {
        const { stores } = await import("../drizzle/schema");
        await db.update(stores)
          .set({ status: "active" })
          .where(eq(stores.id, storeId));
      }
    }

    const platformNames: Record<string, string> = {
      etsy: "Etsy",
      amazon: "Amazon Seller",
      ebay: "eBay",
      tiktok_shop: "TikTok Shop",
      square: "Square",
      faire: "Faire",
      bigcommerce: "BigCommerce",
      depop: "Depop",
      stockx: "StockX",
      reverb: "Reverb",
    };

    console.log(`[EcomOAuth] Connected ${platform} for user ${userId}`);
    logAgentAction({
      agentType: "architect",
      actionType: "oauth_connect",
      storeId: storeId || undefined,
      triggerSource: "manual",
      input: { platform, storeId, userId },
      output: { status: "connected", hasRefreshToken: !!tokenData.refresh_token },
      success: true,
    }).catch(err => console.error("[EcomOAuth] Telemetry error:", err.message));
    return res.redirect(`${callbackOrigin}/integrations?connected=${platform}&name=${encodeURIComponent(platformNames[platform] || platform)}`);

  } catch (err: any) {
    console.error(`[EcomOAuth] Token exchange failed for ${platform}:`, err.response?.data || err.message);
    logAgentAction({
      agentType: "architect",
      actionType: "oauth_connect",
      storeId: storeId || undefined,
      triggerSource: "manual",
      input: { platform, storeId, userId },
      output: { error: err.message },
      success: false,
      errorMessage: err.message,
    }).catch(telErr => console.error("[EcomOAuth] Telemetry error:", telErr.message));
    return res.redirect(`${callbackOrigin}/integrations?error=${encodeURIComponent(`Failed to connect ${platform}: ${err.message}`)}`);
  }
}

// ─── Token Refresh Exchangers ──────────────────────────────────────────────
// Called by the Architect scheduler to proactively refresh expiring tokens
// before they go stale. Each platform has its own refresh grant flow.

export async function refreshPlatformToken(
  platform: string,
  refreshToken: string,
): Promise<TokenResponse | null> {
  const { default: axios } = await import("axios");

  switch (platform) {
    case "etsy": {
      const res = await axios.post("https://api.etsy.com/v3/public/oauth/token", new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ENV.etsyApiKey,
        refresh_token: refreshToken,
      }).toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      return res.data;
    }
    case "amazon": {
      const res = await axios.post("https://api.amazon.com/auth/o2/token", new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ENV.amazonSpClientId,
        client_secret: ENV.amazonSpClientSecret,
        refresh_token: refreshToken,
      }).toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      return res.data;
    }
    case "ebay": {
      const credentials = Buffer.from(`${ENV.ebayAppId}:${ENV.ebayCertId}`).toString("base64");
      const res = await axios.post("https://api.ebay.com/identity/v1/oauth2/token", new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
      });
      return res.data;
    }
    case "tiktok_shop": {
      const appKey = ENV.tiktokAppId || ENV.tiktokClientKey;
      const appSecret = ENV.tiktokClientSecret;
      const res = await axios.get("https://auth.tiktok-shops.com/api/v2/token/refresh", {
        params: {
          app_key: appKey,
          app_secret: appSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        },
      });
      const data = res.data?.data || res.data;
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.access_token_expire_in,
      };
    }
    case "square": {
      const res = await axios.post("https://connect.squareup.com/oauth2/token", {
        client_id: ENV.squareClientId,
        client_secret: ENV.squareClientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }, {
        headers: { "Content-Type": "application/json" },
      });
      return res.data;
    }
    case "faire": {
      const res = await axios.post("https://www.faire.com/api/external-api-oauth2/token", new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ENV.faireClientId,
        client_secret: ENV.faireClientSecret,
        refresh_token: refreshToken,
      }).toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      return res.data;
    }
    case "bigcommerce": {
      const res = await axios.post("https://login.bigcommerce.com/oauth2/token", new URLSearchParams({
        client_id: ENV.bigcommerceClientId,
        client_secret: ENV.bigcommerceClientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      return res.data;
    }
    default:
      return null;
  }
}

// ─── Route Registration ────────────────────────────────────────────────────

export function registerEcommerceOAuthRoutes(app: Express) {
  app.get("/api/ecommerce/oauth/callback", handleEcommerceOAuthCallback);
  console.log("[EcomOAuth] Callback route registered: GET /api/ecommerce/oauth/callback");
}
