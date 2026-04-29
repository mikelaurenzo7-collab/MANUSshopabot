/**
 * Sprint 27.5 — Outlook, Slack, YouTube end-to-end smoke tests.
 *
 * Guards that each new platform is wired through every layer:
 *   1. Adapter registry returns the right class
 *   2. Capability matrix is non-empty + coherent
 *   3. Brand registry knows the icon + color
 *   4. tRPC connectors router exposes a tile with capabilityMatrix
 *   5. OAuth URL generator accepts the platform without zod errors
 *
 * The tests do not hit the network — they only verify the wiring.
 */
import { describe, it, expect, vi } from "vitest";
import {
  getSocialAdapter,
  SUPPORTED_SOCIAL_PLATFORMS,
  getSocialCapabilityMatrix,
  OutlookAdapter,
  SlackAdapter,
  YouTubeAdapter,
} from "./adapters/social";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const NEW_SOCIAL = ["outlook", "slack", "youtube"] as const;

function ctx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test",
      email: "test@example.com",
      name: "Test",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    activeOrg: { id: 1, role: "owner" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("Sprint 27.5 — Outlook, Slack, YouTube", () => {
  it("registry contains all 10 social surfaces", () => {
    expect(SUPPORTED_SOCIAL_PLATFORMS).toHaveLength(10);
    for (const id of NEW_SOCIAL) {
      expect(SUPPORTED_SOCIAL_PLATFORMS).toContain(id);
    }
  });

  it("adapter classes wire correctly", () => {
    expect(getSocialAdapter("outlook")).toBeInstanceOf(OutlookAdapter);
    expect(getSocialAdapter("slack")).toBeInstanceOf(SlackAdapter);
    expect(getSocialAdapter("youtube")).toBeInstanceOf(YouTubeAdapter);
  });

  it.each(NEW_SOCIAL)("%s adapter exposes the full social interface", (id) => {
    const a = getSocialAdapter(id);
    expect(a.platform).toBe(id);
    for (const fn of [
      "verifyConnection",
      "createPost",
      "schedulePost",
      "deletePost",
      "getPostAnalytics",
      "getAccountAnalytics",
      "createAdCampaign",
      "getAdCampaignPerformance",
      "listAdCampaigns",
      "pauseAdCampaign",
      "healthCheck",
      "getCapabilities",
    ] as const) {
      expect(typeof (a as any)[fn]).toBe("function");
    }
  });

  it.each(NEW_SOCIAL)("%s capability matrix is coherent", (id) => {
    const matrix = getSocialCapabilityMatrix();
    const caps = matrix[id];
    expect(caps).toBeTruthy();
    expect(Array.isArray(caps.strengths)).toBe(true);
    expect(caps.strengths.length).toBeGreaterThan(0);
    expect(Array.isArray(caps.limitations)).toBe(true);
    expect(["engagement", "commerce", "awareness"]).toContain(caps.audienceType);
    expect(["native", "recommended", "ignored"]).toContain(caps.hashtagSupport);
  });

  it("connectors.socialPlatforms surfaces all three with capability matrices", async () => {
    const caller = appRouter.createCaller(ctx());
    const platforms = await caller.connectors.socialPlatforms();
    const ids = platforms.map((p: any) => p.id);
    expect(ids).toContain("outlook");
    expect(ids).toContain("slack");
    expect(ids).toContain("youtube");
    for (const id of NEW_SOCIAL) {
      const tile = platforms.find((p: any) => p.id === id);
      expect(tile?.capabilityMatrix).toBeTruthy();
      expect(tile?.connectionType).toBe("oauth");
    }
  });

  it.each(NEW_SOCIAL)(
    "generateSocialOAuthUrl accepts %s in the zod enum (no zod error)",
    async (id) => {
      const caller = appRouter.createCaller(ctx());
      // The mutation either returns a URL (env configured) OR a
      // setupRequired payload — both are valid; we just need the zod
      // validator to accept the platform id without throwing.
      const result = await caller.connectors.generateSocialOAuthUrl({
        platform: id,
        origin: "https://shopabot.test",
      });
      expect(result).toHaveProperty("setupRequired");
    },
  );

  it("Outlook requires offline_access scope so refresh tokens come back", async () => {
    const caller = appRouter.createCaller(ctx());
    process.env.AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || "test-client";
    const result = await caller.connectors.generateSocialOAuthUrl({
      platform: "outlook",
      origin: "https://shopabot.test",
    });
    if (result.url) {
      expect(decodeURIComponent(result.url)).toContain("offline_access");
      expect(decodeURIComponent(result.url)).toContain("Mail.Send");
    }
  });

  it("YouTube reuses the Google OAuth client (gmail wires the same client)", () => {
    // The router declares googleClientId for both gmail and youtube.
    // Spot-check the mapping by scanning the source — keeps the
    // shared-client invariant from drifting.
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "routers/connectors.ts"),
      "utf-8",
    );
    expect(src).toContain("youtube: ENV.googleClientId");
    expect(src).toContain("gmail: ENV.googleClientId");
  });
});
