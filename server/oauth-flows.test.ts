import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { pkceStore, ecomOAuthStateStore } from "./routers/connectors";

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

  it("encodes origin in the state parameter (base64url JSON)", async () => {
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
      // Decode the state
      const decoded = JSON.parse(Buffer.from(state!, "base64url").toString("utf-8"));
      expect(decoded.u).toBe(42); // userId
      expect(decoded.p).toBe("meta"); // platform
      expect(decoded.o).toBe("https://beastbots.test"); // origin
      expect(decoded.n).toBeTruthy(); // nonce
    }
  });

  it("returns setupRequired for unconfigured platforms", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateSocialOAuthUrl({
      platform: "linkedin",
      origin: "https://beastbots.test",
    });

    // LinkedIn has no client ID configured
    expect(result.setupRequired).toBe(true);
    expect(result.url).toBeNull();
    expect(result.setupInstructions).toBeTruthy();
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

      // Verify PKCE code_verifier was stored
      const urlObj = new URL(result.url!);
      const state = urlObj.searchParams.get("state");
      expect(state).toBeTruthy();
      const pkceData = pkceStore.get(state!);
      expect(pkceData).toBeTruthy();
      expect(pkceData!.codeVerifier).toBeTruthy();
      expect(pkceData!.codeVerifier.length).toBeGreaterThan(20);

      // Clean up
      pkceStore.delete(state!);
    } else {
      expect(result.setupRequired).toBe(true);
    }
  });

  it("stores state data in ecomOAuthStateStore for Etsy", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateOAuthUrl({
      platform: "etsy",
      storeId: 99,
      origin: "https://beastbots.test",
    });

    if (process.env.ETSY_API_KEY && result.url) {
      const urlObj = new URL(result.url);
      const state = urlObj.searchParams.get("state");
      expect(state).toBeTruthy();

      const stateData = ecomOAuthStateStore.get(state!);
      expect(stateData).toBeTruthy();
      expect(stateData!.userId).toBe(42);
      expect(stateData!.storeId).toBe(99);
      expect(stateData!.platform).toBe("etsy");

      // Clean up
      ecomOAuthStateStore.delete(state!);
      pkceStore.delete(state!);
    }
  });

  it("encodes origin in e-commerce state parameter", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connectors.generateOAuthUrl({
      platform: "etsy",
      origin: "https://beastbots.test",
    });

    if (result.url) {
      const urlObj = new URL(result.url);
      const state = urlObj.searchParams.get("state");
      const decoded = JSON.parse(Buffer.from(state!, "base64url").toString("utf-8"));
      expect(decoded.o).toBe("https://beastbots.test");
      expect(decoded.t).toBe("ecom");
      expect(decoded.p).toBe("etsy");

      // Clean up
      ecomOAuthStateStore.delete(state!);
      pkceStore.delete(state!);
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

describe("PKCE Store", () => {
  it("stores and retrieves code_verifier by state key", () => {
    const testState = "test_pkce_state_123";
    pkceStore.set(testState, { codeVerifier: "test_verifier_abc", timestamp: Date.now() });
    const data = pkceStore.get(testState);
    expect(data).toBeTruthy();
    expect(data!.codeVerifier).toBe("test_verifier_abc");
    pkceStore.delete(testState);
  });
});

describe("ENV wiring for OAuth secrets", () => {
  it("ETSY_API_KEY is available in ENV", () => {
    expect(process.env.ETSY_API_KEY).toBeDefined();
    expect(process.env.ETSY_API_KEY!.length).toBeGreaterThan(0);
  });

  it("ETSY_SHARED_SECRET is available in ENV", () => {
    expect(process.env.ETSY_SHARED_SECRET).toBeDefined();
    expect(process.env.ETSY_SHARED_SECRET!.length).toBeGreaterThan(0);
  });

  it("PINTEREST_APP_ID is available in ENV", () => {
    expect(process.env.PINTEREST_APP_ID).toBeDefined();
  });

  it("META_CLIENT_ID or META_APP_ID is available in ENV", () => {
    const clientId = process.env.META_CLIENT_ID || process.env.META_APP_ID;
    expect(clientId).toBeDefined();
    expect(clientId!.length).toBeGreaterThan(0);
  });

  it("TWITTER_CLIENT_ID is available in ENV", () => {
    expect(process.env.TWITTER_CLIENT_ID).toBeDefined();
  });

  it("TIKTOK_CLIENT_KEY is available in ENV", () => {
    expect(process.env.TIKTOK_CLIENT_KEY).toBeDefined();
  });
});
