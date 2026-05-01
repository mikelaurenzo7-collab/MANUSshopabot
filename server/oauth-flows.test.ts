import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUserContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "test-oauth-user",
    email: "test@beastbots.com",
    name: "Test OAuth User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    // OAuth url generation now sits on `orgProcedure` so the test
    // context must populate `activeOrg` (the org-procedure middleware
    // throws FORBIDDEN otherwise). Mirrors the pattern used in
    // server/connectors.test.ts and server/adapters.test.ts.
    activeOrg: { id: 1, role: "owner" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("Social OAuth URL Generation", () => {
  it("generates a real OAuth URL for Meta when META_CLIENT_ID is set", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateSocialOAuthUrl({
      platform: "meta",
      origin: "https://beastbots.test",
    });

    const metaClientId = process.env.META_CLIENT_ID || process.env.META_APP_ID;
    if (metaClientId) {
      expect(result.url).toBeTruthy();
      expect(result.url).toContain("facebook.com");
      expect(result.url).toContain("client_id=");
      expect(result.url).toContain("redirect_uri=");
      expect(result.url).toContain(encodeURIComponent("https://beastbots.test/api/social/oauth/callback"));
      expect(result.setupRequired).toBeFalsy();
    } else {
      expect(result.setupRequired).toBe(true);
      expect(result.url).toBeNull();
    }
  });

  it("generates a real OAuth URL for TikTok when TIKTOK_CLIENT_KEY is set", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateSocialOAuthUrl({
      platform: "tiktok",
      origin: "https://beastbots.test",
    });

    if (process.env.TIKTOK_CLIENT_KEY) {
      expect(result.url).toBeTruthy();
      expect(result.url).toContain("tiktok.com");
      expect(result.url).toContain("client_key=");
      expect(result.setupRequired).toBeFalsy();
    } else {
      expect(result.setupRequired).toBe(true);
    }
  });

  it("generates a real OAuth URL for Twitter when TWITTER_CLIENT_ID is set", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateSocialOAuthUrl({
      platform: "twitter",
      origin: "https://beastbots.test",
    });

    if (process.env.TWITTER_CLIENT_ID) {
      expect(result.url).toBeTruthy();
      expect(result.url).toContain("twitter.com");
      expect(result.url).toContain("client_id=");
      expect(result.setupRequired).toBeFalsy();
    } else {
      expect(result.setupRequired).toBe(true);
    }
  });

  it("generates a real OAuth URL for Pinterest when PINTEREST_APP_ID is set", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateSocialOAuthUrl({
      platform: "pinterest",
      origin: "https://beastbots.test",
    });

    if (process.env.PINTEREST_APP_ID) {
      expect(result.url).toBeTruthy();
      expect(result.url).toContain("pinterest.com");
      expect(result.url).toContain("client_id=");
      expect(result.setupRequired).toBeFalsy();
    } else {
      expect(result.setupRequired).toBe(true);
    }
  });

  it("persists social OAuth state in the database", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateSocialOAuthUrl({
      platform: "meta",
      origin: "https://beastbots.test",
    });

    if (result.url) {
      const urlObj = new URL(result.url);
      const state = urlObj.searchParams.get("state");
      expect(state).toBeTruthy();

      // Verify state was persisted to DB (not in-memory)
      const dbToken = await db.getOAuthStateToken(state!, "social");
      expect(dbToken).toBeTruthy();
      expect(dbToken!.userId).toBe(42);
      expect(dbToken!.platform).toBe("meta");
      expect(dbToken!.flowType).toBe("social");
      expect(dbToken!.origin).toBe("https://beastbots.test");
    }
  });

  it("returns setupRequired for unconfigured platforms", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    // Pinterest has no client ID configured in test env. Picking a
    // platform that has *no* fallback path through Google or Meta OAuth
    // — pinterest stands alone, so its setupRequired branch is the
    // cleanest signal that the unconfigured-platform path works.
    const result = await caller.connectors.generateSocialOAuthUrl({
      platform: "pinterest",
      origin: "https://beastbots.test",
    });

    if (process.env.PINTEREST_APP_ID) {
      // Locally-configured environment — the test still exercises the URL path.
      expect(result.setupRequired).toBeFalsy();
      expect(result.url).toBeTruthy();
    } else {
      expect(result.setupRequired).toBe(true);
      expect(result.url).toBeNull();
      expect(result.setupInstructions).toBeTruthy();
    }
  });
});

describe("E-Commerce OAuth URL Generation", () => {
  it("generates a real OAuth URL for Etsy with PKCE when ETSY_API_KEY is set", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateOAuthUrl({
      platform: "etsy",
      origin: "https://beastbots.test",
    });

    if (process.env.ETSY_API_KEY) {
      expect(result.url).toBeTruthy();
      expect(result.url).toContain("etsy.com/oauth/connect");
      expect(result.url).toContain("code_challenge=");
      expect(result.url).toContain("code_challenge_method=S256");
      expect(result.url).toContain(`client_id=${process.env.ETSY_API_KEY}`);
      expect(result.url).toContain(encodeURIComponent("https://beastbots.test/api/ecommerce/oauth/callback"));

      // Verify PKCE code_verifier was persisted to DB
      const urlObj = new URL(result.url!);
      const state = urlObj.searchParams.get("state");
      expect(state).toBeTruthy();
      const dbToken = await db.getOAuthStateToken(state!, "ecommerce");
      expect(dbToken).toBeTruthy();
      expect(dbToken!.codeVerifier).toBeTruthy();
      expect(dbToken!.codeVerifier!.length).toBeGreaterThan(20);
    } else {
      expect(result.setupRequired).toBe(true);
    }
  });

  it("stores state data in database for Etsy", async () => {
    // generateOAuthUrl now validates that the supplied storeId belongs
    // to the caller's org (the OAuth callback writes the credential
    // against the store's orgId, so leaving this unchecked let an
    // attacker plant tokens in another tenant's row). Mock the lookup
    // so the test's synthetic storeId 99 is treated as belonging to
    // the active org. Without this the org-scoping guard short-
    // circuits with NOT_FOUND before any state token is persisted.
    const storeStub = vi
      .spyOn(db, "getStoreById")
      .mockResolvedValue({ id: 99, orgId: 1, userId: 42, platform: "etsy" } as any);
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateOAuthUrl({
      platform: "etsy",
      storeId: 99,
      origin: "https://beastbots.test",
    });
    storeStub.mockRestore();

    if (process.env.ETSY_API_KEY && result.url) {
      const urlObj = new URL(result.url);
      const state = urlObj.searchParams.get("state");
      expect(state).toBeTruthy();

      const dbToken = await db.getOAuthStateToken(state!, "ecommerce");
      expect(dbToken).toBeTruthy();
      expect(dbToken!.userId).toBe(42);
      expect(dbToken!.storeId).toBe(99);
      expect(dbToken!.platform).toBe("etsy");
      expect(dbToken!.flowType).toBe("ecommerce");
    }
  });

  it("uses hex state parameter (not base64url JSON)", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateOAuthUrl({
      platform: "etsy",
      origin: "https://beastbots.test",
    });

    if (result.url) {
      const urlObj = new URL(result.url);
      const state = urlObj.searchParams.get("state");
      expect(state).toBeTruthy();
      // State is now a random hex string (not base64url JSON)
      // It should be a 48-char hex string (24 random bytes)
      expect(state!.length).toBe(48);
      expect(/^[0-9a-f]+$/.test(state!)).toBe(true);
    }
  });

  it("rejects non-OAuth platforms like WooCommerce", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.connectors.generateOAuthUrl({
        platform: "woocommerce",
        origin: "https://beastbots.test",
      })
    ).rejects.toThrow("uses API key connection");
  });

  it("rejects unknown platforms", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.connectors.generateOAuthUrl({
        platform: "nonexistent",
        origin: "https://beastbots.test",
      })
    ).rejects.toThrow("Unknown platform");
  });
});

describe("Social OAuth Callback Route Registration", () => {
  it("exports registerSocialOAuthRoutes function", async () => {
    const { registerSocialOAuthRoutes } = await import("./socialOAuth");
    expect(typeof registerSocialOAuthRoutes).toBe("function");
  });
});

describe("E-Commerce OAuth Callback Route Registration", () => {
  it("exports registerEcommerceOAuthRoutes function", async () => {
    const { registerEcommerceOAuthRoutes } = await import("./ecommerceOAuth");
    expect(typeof registerEcommerceOAuthRoutes).toBe("function");
  });
});

describe("OAuth State Token DB Operations", () => {
  it.skipIf(!process.env.DATABASE_URL)("creates and retrieves an OAuth state token from DB", async () => {
    const state = `test_state_${Date.now()}`;
    await db.createOAuthStateToken({
      state,
      flowType: "social",
      userId: 42,
      platform: "meta",
      origin: "https://beastbots.test",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const token = await db.getOAuthStateToken(state, "social");
    expect(token).toBeTruthy();
    expect(token!.state).toBe(state);
    expect(token!.userId).toBe(42);
    expect(token!.platform).toBe("meta");
    expect(token!.flowType).toBe("social");
  });

  it.skipIf(!process.env.DATABASE_URL)("stores and retrieves PKCE code_verifier in DB", async () => {
    const state = `test_pkce_${Date.now()}`;
    const codeVerifier = "test_verifier_abc_123_very_long_enough";
    await db.createOAuthStateToken({
      state,
      flowType: "ecommerce",
      userId: 42,
      platform: "etsy",
      origin: "https://beastbots.test",
      codeVerifier,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const token = await db.getOAuthStateToken(state, "ecommerce");
    expect(token).toBeTruthy();
    expect(token!.codeVerifier).toBe(codeVerifier);
  });
});

describe("ENV wiring for OAuth secrets", () => {
  it.skipIf(!process.env.ETSY_API_KEY)("ETSY_API_KEY is available in ENV", () => {
    expect(process.env.ETSY_API_KEY).toBeDefined();
    expect(process.env.ETSY_API_KEY!.length).toBeGreaterThan(0);
  });

  it.skipIf(!process.env.ETSY_SHARED_SECRET)("ETSY_SHARED_SECRET is available in ENV", () => {
    expect(process.env.ETSY_SHARED_SECRET).toBeDefined();
    expect(process.env.ETSY_SHARED_SECRET!.length).toBeGreaterThan(0);
  });

  it.skipIf(!process.env.PINTEREST_APP_ID)("PINTEREST_APP_ID is available in ENV", () => {
    expect(process.env.PINTEREST_APP_ID).toBeDefined();
  });

  it.skipIf(!process.env.META_CLIENT_ID && !process.env.META_APP_ID)("META_CLIENT_ID or META_APP_ID is available in ENV", () => {
    const clientId = process.env.META_CLIENT_ID || process.env.META_APP_ID;
    expect(clientId).toBeDefined();
    expect(clientId!.length).toBeGreaterThan(0);
  });

  it.skipIf(!process.env.TWITTER_CLIENT_ID)("TWITTER_CLIENT_ID is available in ENV", () => {
    expect(process.env.TWITTER_CLIENT_ID).toBeDefined();
  });

  it.skipIf(!process.env.TIKTOK_CLIENT_KEY)("TIKTOK_CLIENT_KEY is available in ENV", () => {
    expect(process.env.TIKTOK_CLIENT_KEY).toBeDefined();
  });
});
