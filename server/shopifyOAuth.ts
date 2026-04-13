import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import * as db from "./db";

/**
 * Shopify OAuth 2.0 flow for connecting user stores to ShopBot.
 * 
 * Flow:
 * 1. User clicks "Connect Shopify Store" → GET /api/shopify/install?shop=xxx.myshopify.com
 * 2. We redirect to Shopify's OAuth consent screen
 * 3. Shopify redirects back → GET /api/shopify/callback?code=xxx&shop=xxx&hmac=xxx
 * 4. We exchange code for access token and store it in our database
 * 5. User is redirected back to the Architect page with their store connected
 */

const SHOPIFY_SCOPES = [
  "read_products",
  "write_products",
  "read_orders",
  "write_orders",
  "read_fulfillments",
  "write_fulfillments",
  "read_inventory",
  "write_inventory",
  "read_customers",
  "read_analytics",
  "read_themes",
  "write_themes",
  "read_content",
  "write_content",
].join(",");

function getShopifyCredentials() {
  const clientId = ENV.shopifyPartnerClientId;
  const clientSecret = ENV.shopifyPartnerClientSecret;
  if (!clientId || !clientSecret) {
    throw new Error("Shopify Partner OAuth credentials not configured. Set SHOPIFY_PARTNER_CLIENT_ID and SHOPIFY_PARTNER_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

function verifyHmac(query: Record<string, any>, secret: string): boolean {
  const { hmac, ...rest } = query;
  if (!hmac) return false;

  // Sort params alphabetically and build the message
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("&");

  const generatedHmac = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(generatedHmac, "hex"),
    Buffer.from(hmac as string, "hex")
  );
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Legacy in-memory nonce store — kept as fallback for in-flight OAuth redirects
 * created before DB persistence was deployed. New flows write to oauthStateTokens table.
 */
const nonceStore = new Map<string, { userId: number; storeId?: number; returnTo?: string; timestamp: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [nonce, data] of Array.from(nonceStore.entries())) {
    if (now - data.timestamp > 10 * 60 * 1000) {
      nonceStore.delete(nonce);
    }
  }
}, 10 * 60 * 1000);

async function getUserFromRequest(req: Request): Promise<{ id: number; openId: string } | null> {
  try {
    const userInfo = await sdk.authenticateRequest(req);
    if (!userInfo?.openId) return null;
    const user = await db.getUserByOpenId(userInfo.openId);
    return user ? { id: user.id, openId: user.openId } : null;
  } catch {
    return null;
  }
}

export function registerShopifyOAuthRoutes(app: Express) {
  /**
   * Step 1: Initiate Shopify OAuth
   * GET /api/shopify/install?shop=store-name.myshopify.com
   */
  app.get("/api/shopify/install", async (req: Request, res: Response) => {
    try {
      const shop = req.query.shop as string;
      if (!shop || !shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
        res.status(400).json({ error: "Invalid shop domain. Must be like store-name.myshopify.com" });
        return;
      }

      const user = await getUserFromRequest(req);
      if (!user) {
        res.status(401).json({ error: "You must be logged in to connect a store" });
        return;
      }

      const { clientId } = getShopifyCredentials();
      const nonce = generateNonce();

      // Store nonce with user ID (and optional storeId) for verification in callback
      const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
      const returnTo = (req.query.returnTo as string) || undefined;

      // Determine the redirect URI based on the request origin
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const origin = `${protocol}://${host}`;
      const redirectUri = `${origin}/api/shopify/callback`;

      // Persist state in DB for durability across restarts (Manus compatibility)
      await db.createOAuthStateToken({
        state: nonce,
        flowType: "shopify",
        userId: user.id,
        platform: "shopify",
        storeId,
        origin,
        returnTo,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // Also write to legacy in-memory store for backward compatibility
      nonceStore.set(nonce, { userId: user.id, storeId, returnTo, timestamp: Date.now() });

      const installUrl = `https://${shop}/admin/oauth/authorize?` +
        `client_id=${clientId}` +
        `&scope=${SHOPIFY_SCOPES}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${nonce}`;

      res.redirect(302, installUrl);
    } catch (error) {
      console.error("[Shopify OAuth] Install error:", error);
      res.status(500).json({ error: "Failed to initiate Shopify connection" });
    }
  });

  /**
   * Step 2: Handle Shopify OAuth callback
   * GET /api/shopify/callback?code=xxx&hmac=xxx&shop=xxx&state=xxx
   */
  app.get("/api/shopify/callback", async (req: Request, res: Response) => {
    try {
      const { code, shop, state, hmac } = req.query as Record<string, string>;

      if (!code || !shop || !state || !hmac) {
        res.status(400).json({ error: "Missing required OAuth parameters" });
        return;
      }

      // Verify the nonce — try durable DB state first, then legacy in-memory fallback
      const dbState = await db.consumeOAuthStateToken(state, "shopify");
      const legacyState = dbState ? undefined : nonceStore.get(state);
      if (!dbState && !legacyState) {
        res.status(403).json({ error: "Invalid or expired state parameter" });
        return;
      }
      if (legacyState) {
        nonceStore.delete(state);
      }

      const nonceData = dbState
        ? { userId: dbState.userId, storeId: dbState.storeId ?? undefined, returnTo: dbState.returnTo ?? undefined }
        : legacyState!;

      // Verify HMAC signature
      const { clientSecret, clientId } = getShopifyCredentials();
      const isValid = verifyHmac(req.query as Record<string, any>, clientSecret);
      if (!isValid) {
        res.status(403).json({ error: "HMAC verification failed" });
        return;
      }

      // Exchange code for permanent access token
      const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("[Shopify OAuth] Token exchange failed:", errorText);
        res.status(500).json({ error: "Failed to exchange code for access token" });
        return;
      }

      const tokenData = await tokenResponse.json() as { access_token: string; scope: string };
      const accessToken = tokenData.access_token;

      // Fetch shop info to get the store name
      const shopInfoResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      let storeName = shop.replace(".myshopify.com", "");
      if (shopInfoResponse.ok) {
        const shopInfo = await shopInfoResponse.json() as { shop: { name: string; id: number } };
        storeName = shopInfo.shop.name || storeName;
      }

      // Check if this store is already connected
      const existingStores = await db.getStoresByUser(nonceData.userId);
      const existingStore = existingStores.find(
        (s: any) => s.platformDomain === shop && s.platform === "shopify"
      );

      await db.withTransaction(async (tx) => {
        if (nonceData.storeId) {
          await db.updateStore(nonceData.storeId, {
            platformDomain: shop,
            platformAccessToken: accessToken,
            platformStoreId: shop,
            name: storeName,
            status: "active",
          }, tx);
          await db.createAgentTask({
            agentType: "architect",
            taskType: "shopify_oauth_connect",
            title: `Shopify store "${storeName}" connected via OAuth`,
            description: `Successfully connected ${shop} with scopes: ${tokenData.scope}`,
            status: "completed",
            storeId: nonceData.storeId,
          }, tx);
          return;
        }

        if (existingStore) {
          await db.updateStore(existingStore.id, {
            platformAccessToken: accessToken,
            status: "active",
          }, tx);
          await db.createAgentTask({
            agentType: "architect",
            taskType: "shopify_oauth_connect",
            title: `Shopify store "${storeName}" connected via OAuth`,
            description: `Successfully connected ${shop} with scopes: ${tokenData.scope}`,
            status: "completed",
            storeId: existingStore.id,
          }, tx);
          return;
        }

        const createdStore = await db.createStore({
          userId: nonceData.userId,
          name: storeName,
          platform: "shopify",
          platformDomain: shop,
          platformAccessToken: accessToken,
          platformStoreId: shop,
          status: "active",
        }, tx);
        await db.createAgentTask({
          agentType: "architect",
          taskType: "shopify_oauth_connect",
          title: `Shopify store "${storeName}" connected via OAuth`,
          description: `Successfully connected ${shop} with scopes: ${tokenData.scope}`,
          status: "completed",
          storeId: createdStore.id,
        }, tx);
      });

      // Redirect back to the originating page (use stored origin for absolute URL)
      const storedOrigin = dbState?.origin ?? "";
      const returnPath = nonceData.returnTo || "/architect";
      const successUrl = storedOrigin
        ? `${storedOrigin}${returnPath}?connected=true`
        : `${returnPath}?connected=true`;
      res.redirect(302, successUrl);
    } catch (error) {
      console.error("[Shopify OAuth] Callback error:", error);
      // Best-effort: use the protocol/host from the incoming request for error redirect
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const fallbackOrigin = `${protocol}://${host}`;
      res.redirect(302, `${fallbackOrigin}/architect?error=connection_failed`);
    }
  });

  /**
   * Disconnect a Shopify store
   * POST /api/shopify/disconnect
   */
  app.post("/api/shopify/disconnect", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { storeId } = req.body;
      if (!storeId) {
        res.status(400).json({ error: "storeId is required" });
        return;
      }

      const store = await db.getStoreById(storeId);
      if (!store || store.userId !== user.id) {
        res.status(404).json({ error: "Store not found" });
        return;
      }

      // Revoke the access token with Shopify
      if (store.platformAccessToken && store.platformDomain) {
        try {
          await fetch(`https://${store.platformDomain}/admin/api_permissions/current.json`, {
            method: "DELETE",
            headers: {
              "X-Shopify-Access-Token": store.platformAccessToken,
            },
          });
        } catch (e) {
          console.warn("[Shopify OAuth] Token revocation failed (non-critical):", e);
        }
      }

      // Update store status
      await db.updateStore(storeId, {
        status: "archived",
        platformAccessToken: null,
      });

      await db.createAgentTask({
        agentType: "architect",
        taskType: "shopify_disconnect",
        title: `Shopify store "${store.name}" disconnected`,
        description: `Store ${store.platformDomain} has been disconnected and access token revoked`,
        status: "completed",
        storeId,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("[Shopify OAuth] Disconnect error:", error);
      res.status(500).json({ error: "Failed to disconnect store" });
    }
  });
}
