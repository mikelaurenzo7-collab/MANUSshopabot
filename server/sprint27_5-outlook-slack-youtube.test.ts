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

describe("Sprint 27.5 — OAuth callback dispatch", () => {
  // The dispatcher in server/socialOAuth.ts must include a case for
  // every social platform that the connectors router accepts. Without
  // these branches, users can authorize but the callback returns
  // ?error=unsupported_platform.
  it("server/socialOAuth.ts has case branches + token exchangers + profile fetchers for the new platforms", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "socialOAuth.ts"),
      "utf-8",
    );
    for (const p of NEW_SOCIAL) {
      expect(src, `missing case "${p}" in dispatch`).toContain(`case "${p}":`);
    }
    expect(src).toContain("exchangeOutlookCode");
    expect(src).toContain("fetchOutlookProfile");
    expect(src).toContain("exchangeSlackCode");
    expect(src).toContain("fetchSlackProfile");
    expect(src).toContain("exchangeYouTubeCode");
    expect(src).toContain("fetchYouTubeProfile");
    // Outlook OAuth must request offline_access so refresh tokens come
    // back — without it, every send forces a re-consent.
    expect(src).toContain("offline_access");
  });
});

describe("Sprint 27.5 — workflow catalog + engine wiring", () => {
  // The engine's executeStoreActionStep must include cases for the
  // three new actions; the workflow catalog must register all three
  // recipes; and each LLM step must produce the structured output the
  // engine expects.
  const NEW_WORKFLOWS = [
    "outlook_b2b_outreach",
    "slack_drop_announcement",
    "youtube_shorts_publisher",
  ];

  it.each(NEW_WORKFLOWS)("registers %s with the workflow engine", async (name) => {
    // Trigger the registry side-effects.
    await import("./engine/platformEliteWorkflows");
    const { listWorkflowTypes } = await import("./engine/workflowEngine");
    expect(listWorkflowTypes()).toContain(name);
  });

  it("engine has store-action handlers for all three new actions", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "engine/workflowEngine.ts"),
      "utf-8",
    );
    expect(src).toContain('case "outlook_send_drafts"');
    expect(src).toContain('case "slack_post_drop"');
    expect(src).toContain('case "youtube_publish_short"');
  });

  it("connectors workflow catalog surfaces all three to the social bot", async () => {
    const caller = appRouter.createCaller(ctx());
    const types = await caller.workflows.availableTypes();
    const socialTypes = types.social.map((t: any) => t.type);
    expect(socialTypes).toContain("outlook_b2b_outreach");
    expect(socialTypes).toContain("slack_drop_announcement");
    expect(socialTypes).toContain("youtube_shorts_publisher");
  });
});
