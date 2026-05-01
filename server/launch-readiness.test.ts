/**
 * Launch-readiness audit: ship-blocker regression guards.
 *
 * Each block locks in a fix the four pre-launch audits surfaced —
 * Manus deployment compatibility, critical-path bugs, multi-tenancy
 * isolation, and visual polish. Source-level pattern checks (no DB,
 * no live calls) so the suite stays fast and deterministic.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

describe("Multi-tenancy: connectors / tools credentials gated by orgId", () => {
  it("connectors.ts cred mutations all use orgProcedure + cred.orgId check", () => {
    const src = read("server/routers/connectors.ts");
    for (const proc of ["connectWithApiKey", "disconnectCredential", "disconnectSocialAccount", "checkCredentialHealth"]) {
      expect(src, `${proc} must be on orgProcedure`).toMatch(
        new RegExp(`${proc}:\\s*orgProcedure`),
      );
    }
    // The legacy userId-equality check is what made Org A's creds
    // visible from Org B. Make sure none of these procedures use it.
    const procRanges = src.split(/\n\s*\/\*\*/);
    for (const range of procRanges) {
      if (
        range.includes("connectWithApiKey") ||
        range.includes("disconnectCredential") ||
        range.includes("disconnectSocialAccount") ||
        range.includes("checkCredentialHealth")
      ) {
        expect(range, "no userId-equality scope in cred procedures").not.toMatch(
          /userId !==\s*ctx\.user\.id/,
        );
      }
    }
  });

  it("tools.ts disconnect/checkHealth use orgProcedure + cred.orgId check", () => {
    const src = read("server/routers/tools.ts");
    expect(src).toMatch(/disconnect:\s*orgProcedure/);
    expect(src).toMatch(/checkHealth:\s*orgProcedure/);
    expect(src).toMatch(/cred\.orgId !==\s*ctx\.org\.id/);
  });
});

describe("Multi-tenancy: Gmail credentials resolve via orgId, not userId", () => {
  it("delivery/gmail.ts loadGmailCredentials accepts org+user; isGmailAvailable variant exists", () => {
    const src = read("server/delivery/gmail.ts");
    expect(src).toContain("getSocialAccountsByPlatformForOrg");
    expect(src).toContain("export async function isGmailAvailable");
    // Sender contract is { userId?, orgId? } — both valid, orgId preferred
    expect(src).toMatch(/loadGmailCredentials\(args:\s*\{\s*userId\?:\s*number;\s*orgId\?:\s*number;?\s*\}\)/);
  });

  it("gmailBot.ts router endpoints all use orgProcedure + getGmailCredentialsForOrg", () => {
    const src = read("server/routers/gmailBot.ts");
    for (const proc of ["getInbox", "sendEmail", "getAutoReply", "updateAutoReply"]) {
      expect(src, `${proc} must be on orgProcedure`).toMatch(
        new RegExp(`${proc}:\\s*orgProcedure`),
      );
    }
    expect(src).toContain("getGmailCredentialsForOrg(ctx.org.id)");
    expect(src).toContain('orgId: ctx.org.id');
  });
});

describe("Multi-tenancy: vision listing save-as-draft is org-scoped", () => {
  it("architect.saveListingAsDraftProduct uses orgProcedure + store.orgId check", () => {
    const src = read("server/routers/architect.ts");
    expect(src).toMatch(/saveListingAsDraftProduct:\s*orgProcedure/);
    expect(src).toMatch(/store\.orgId !==\s*ctx\.org\.id/);
  });
});

describe("Critical path: trial seeded for new signups", () => {
  it("upsertUser seeds stripeSubscriptionStatus=trialing on first signup", () => {
    const src = read("server/db.ts");
    // Inserts get the default trial seed; updates do NOT clobber an
    // existing status (otherwise re-signup would downgrade an active sub)
    expect(src).toMatch(/values\.stripeSubscriptionStatus = "trialing"/);
    // Comment must explain the rationale so future devs don't strip it
    expect(src).toMatch(/First-signup trial seeding/);
  });
});

describe("Critical path: Onboarding finish surfaces failures + retries", () => {
  it("Onboarding.tsx retries the completion mutation once and toasts on persistent failure", () => {
    const src = read("client/src/pages/Onboarding.tsx");
    // Retry loop with attempt counter + toast on persistent failure
    expect(src).toMatch(/for \(let attempt = 0; attempt < 2; attempt\+\+\)/);
    expect(src).toContain('toast.error(');
    expect(src).toContain("couldn't sync your onboarding state");
  });
});

// The legacy "Critical path: trend detector launches with niche +
// platforms" describe block was retired with the standalone /social
// page (now redirects to /chat). The launch payload contract is still
// enforced by the workflow router tests.

describe("Manus deployment readiness", () => {
  it("REDIS_URL is required in production; localhost fallback only valid in dev", () => {
    const src = read("server/_core/env.ts");
    expect(src).toContain('"REDIS_URL"'); // listed as a recommended var
    expect(src).toMatch(/NODE_ENV === "production".*REDIS_URL/s);
  });

  it("/health and /healthz lightweight liveness aliases exist alongside /api/health", () => {
    const src = read("server/_core/index.ts");
    expect(src).toMatch(/app\.get\(\["\/health",\s*"\/healthz"\]/);
    // The deep readiness probe stays at /api/health for back-compat
    expect(src).toContain('"/api/health"');
  });
});

describe("Visual polish: emojis removed from premium UI", () => {
  it("StripeSuccessBanner has no celebratory emojis", () => {
    const src = read("client/src/components/StripeSuccessBanner.tsx");
    expect(src).not.toContain("🎉");
    expect(src).not.toContain("✨");
  });

  it("Onboarding personas use lucide icons (Rocket / ShoppingBag / Telescope), not emojis", () => {
    const src = read("client/src/pages/Onboarding.tsx");
    expect(src).toContain("import type { LucideIcon }");
    expect(src).toContain("icon: Rocket");
    expect(src).toContain("icon: ShoppingBag");
    expect(src).toContain("icon: Telescope");
    // No more emoji-keyed persona records
    expect(src).not.toMatch(/emoji:\s*"🚀"/);
    expect(src).not.toMatch(/emoji:\s*"🔭"/);
  });

  it("ManusDialog is responsive (no fixed-width 400px)", () => {
    const src = read("client/src/components/ManusDialog.tsx");
    // viewport-aware width clamps to a max instead of a fixed pixel value
    expect(src).toContain("w-[calc(100vw-2rem)]");
    expect(src).toContain("max-w-[400px]");
  });
});
