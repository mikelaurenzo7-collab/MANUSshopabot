/**
 * E-Commerce OAuth Callback Handler
 * Handles the redirect from Etsy, Amazon, eBay, and TikTok Shop
 * after the user authorizes our app. Exchanges the authorization code for an access
 * token and stores the platform credential in the database.
 */

import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { platformCredentials } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "./_core/env";
import { ecomOAuthStateStore, pkceStore } from "./routers/connectors";

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

// ─── Main Callback Handler ─────────────────────────────────────────────────

async function handleEcommerceOAuthCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  // Parse state to extract origin (encoded during authorization URL generation)
  let stateOrigin = "";
  try {
    const decoded = Buffer.from(state || "", "base64url").toString("utf-8");
    const payload = JSON.parse(decoded);
    if (payload.o) stateOrigin = payload.o;
  } catch { /* ignore */ }
  const origin = stateOrigin || req.headers.origin as string || "";

  if (error) {
    console.error(`[EcomOAuth] OAuth error: ${error} — ${error_description}`);
    return res.redirect(`${origin}/integrations?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${origin}/integrations?error=missing_code_or_state`);
  }

  // Verify state from our store
  const stateData = ecomOAuthStateStore.get(state);
  if (!stateData) {
    return res.redirect(`${origin}/integrations?error=invalid_or_expired_state`);
  }
  ecomOAuthStateStore.delete(state);

  const { userId, storeId, platform } = stateData;
  const redirectUri = `${origin}/api/ecommerce/oauth/callback`;

  try {
    let tokenData: TokenResponse;

    switch (platform) {
      case "etsy": {
        const pkceData = pkceStore.get(state);
        if (!pkceData) {
          return res.redirect(`${origin}/integrations?error=pkce_verifier_missing`);
        }
        pkceStore.delete(state);
        tokenData = await exchangeEtsyCode(code, redirectUri, pkceData.codeVerifier);
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
      default:
        return res.redirect(`${origin}/integrations?error=unsupported_platform`);
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
        await db.insert(platformCredentials).values({
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
    };

    console.log(`[EcomOAuth] Connected ${platform} for user ${userId}`);
    return res.redirect(`${origin}/integrations?connected=${platform}&name=${encodeURIComponent(platformNames[platform] || platform)}`);

  } catch (err: any) {
    console.error(`[EcomOAuth] Token exchange failed for ${platform}:`, err.response?.data || err.message);
    return res.redirect(`${origin}/integrations?error=${encodeURIComponent(`Failed to connect ${platform}: ${err.message}`)}`);
  }
}

// ─── Route Registration ────────────────────────────────────────────────────

export function registerEcommerceOAuthRoutes(app: Express) {
  app.get("/api/ecommerce/oauth/callback", handleEcommerceOAuthCallback);
  console.log("[EcomOAuth] Callback route registered: GET /api/ecommerce/oauth/callback");
}
