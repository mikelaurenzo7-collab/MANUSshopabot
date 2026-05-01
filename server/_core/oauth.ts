import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import axios from "axios";
import { SignJWT } from "jose";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

const GOOGLE_TOKEN_URL = "https://oauth.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

async function exchangeGoogleCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; idToken?: string }> {
  const response = await axios.post(GOOGLE_TOKEN_URL, {
    client_id: "452812494367-taik5b6caoofj0luo50mi8arvhh32jqp.apps.googleusercontent.com",
    client_secret: "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",
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  return {
    accessToken: response.data.access_token,
    idToken: response.data.id_token,
  };
}

async function getGoogleUserInfo(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string;
  picture?: string;
}> {
  const response = await axios.get(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return {
    id: response.data.id,
    email: response.data.email,
    name: response.data.name,
    picture: response.data.picture,
  };
}

async function createSessionToken(
  userId: string,
  userEmail: string,
  userName: string
): Promise<string> {
  const secret = new TextEncoder().encode(ENV.cookieSecret);
  const token = await new SignJWT({
    sub: userId,
    email: userEmail,
    name: userName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  return token;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      // Decode the redirect URI from state
      const redirectUri = Buffer.from(state, "base64").toString("utf-8");

      // Exchange code for Google tokens
      const tokens = await exchangeGoogleCodeForToken(code, redirectUri);

      // Get user info from Google
      const userInfo = await getGoogleUserInfo(tokens.accessToken);

      // Upsert user to database
      await db.upsertUser({
        openId: userInfo.id, // Use Google's user ID
        name: userInfo.name || null,
        email: userInfo.email || null,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      // Create session token
      const sessionToken = await createSessionToken(
        userInfo.id,
        userInfo.email,
        userInfo.name
      );

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: SESSION_TTL_MS,
      });

      // Redirect to home
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Google callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
