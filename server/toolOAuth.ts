/**
 * Tool Connectors OAuth Callback Handler
 *
 * Handles the redirect from Google after the user authorizes our app
 * for Sheets / GA4 access. Exchanges the authorization code for a
 * Google access + refresh token, then stores the credential in the
 * `platform_credentials` table under the tool id (e.g. "google_sheets").
 *
 * Mirrors the shape of `ecommerceOAuth.ts` and `socialOAuth.ts` but
 * stays scoped to the tools domain so the dispatcher logic is small.
 */

import type { Express, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { consumeOAuthStateToken, getDb } from "./db";
import { platformCredentials } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { logAgentAction } from "./telemetry";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  const { default: axios } = await import("axios");
  const res = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  return res.data;
}

async function handleToolOAuthCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  const stateData = state ? await consumeOAuthStateToken(state, "tool") : undefined;
  const origin = stateData?.origin || (req.headers.origin as string) || "";

  if (error) {
    console.error(`[ToolOAuth] OAuth error: ${error} — ${error_description}`);
    return res.redirect(`${origin}/integrations?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !state || !stateData) {
    return res.redirect(`${origin}/integrations?error=invalid_or_expired_state`);
  }

  const userId = stateData.userId;
  const tool = stateData.platform;
  const callbackOrigin = stateData.origin;
  const redirectUri = `${callbackOrigin}/api/tools/oauth/callback`;

  try {
    // Today only Google-backed tools use OAuth (Sheets, GA4). Add other
    // OAuth providers by branching here on `tool`.
    const tokenData = await exchangeGoogleCode(code, redirectUri);
    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined;

    const db = await getDb();
    if (db) {
      const existing = await db
        .select()
        .from(platformCredentials)
        .where(and(eq(platformCredentials.userId, userId), eq(platformCredentials.platform, tool)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(platformCredentials)
          .set({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || existing[0].refreshToken || null,
            tokenExpiresAt: tokenExpiresAt || null,
            status: "active",
            lastHealthCheck: new Date(),
          })
          .where(eq(platformCredentials.id, existing[0].id));
      } else {
        await db.insert(platformCredentials).values({
          userId,
          platform: tool,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: tokenExpiresAt || null,
          status: "active",
          lastHealthCheck: new Date(),
          metadata: { scope: tokenData.scope },
        });
      }
    }

    console.log(`[ToolOAuth] Connected ${tool} for user ${userId}`);
    logAgentAction({
      agentType: "architect",
      actionType: "oauth_connect",
      triggerSource: "manual",
      input: { tool, userId },
      output: { status: "connected", hasRefreshToken: !!tokenData.refresh_token },
      success: true,
    }).catch((err) => console.error("[ToolOAuth] Telemetry error:", err.message));

    return res.redirect(`${callbackOrigin}/integrations?connected=${tool}&tab=tools`);
  } catch (err: any) {
    console.error(`[ToolOAuth] Token exchange failed for ${tool}:`, err.response?.data || err.message);
    logAgentAction({
      agentType: "architect",
      actionType: "oauth_connect",
      triggerSource: "manual",
      input: { tool, userId },
      output: { error: err.message },
      success: false,
      errorMessage: err.message,
    }).catch((telErr) => console.error("[ToolOAuth] Telemetry error:", telErr.message));
    return res.redirect(
      `${callbackOrigin}/integrations?error=${encodeURIComponent(`Failed to connect ${tool}: ${err.message}`)}`,
    );
  }
}

export function registerToolOAuthRoutes(app: Express) {
  app.get("/api/tools/oauth/callback", handleToolOAuthCallback);
  console.log("[ToolOAuth] Callback route registered: GET /api/tools/oauth/callback");
}
