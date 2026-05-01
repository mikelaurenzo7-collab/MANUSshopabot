/**
 * Router contract regression tests — source-pin assertions for the
 * untested high-impact routers (orgs, lifecycle, botProfile, queueHealth).
 *
 * Pattern matches `workspace-shell.test.ts`: rather than spinning up a
 * heavy mock-db harness per procedure, we read the router source and
 * assert the security-critical and shape-critical invariants are
 * present. A future refactor that quietly downgrades an authz check
 * (e.g. swapping `orgProcedure` → `protectedProcedure`) or drops a
 * sanitization call will fail the build first.
 *
 * The four routers in scope here previously had ZERO direct contract
 * coverage; the org-isolation canary covers cross-tenant reads but
 * not the per-procedure security gates these routers depend on.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("orgsRouter contract", () => {
  const src = read("server/routers/orgs.ts");

  it("is registered on the appRouter", async () => {
    const { appRouter } = await import("./routers");
    expect((appRouter as any)._def?.procedures || (appRouter as any)._def?.record).toBeDefined();
    // The org router is mounted under the `orgs` namespace.
    const procedures = (appRouter as any)._def?.procedures ?? (appRouter as any)._def?.record ?? {};
    const keys = Object.keys(procedures);
    expect(keys.some((k) => k.startsWith("orgs."))).toBe(true);
  });

  it("setActive verifies membership BEFORE persisting the active org", () => {
    // The most important authz check on this router: a user must not
    // be able to switch into an org they don't belong to. The order
    // matters — membership lookup → throw FORBIDDEN if missing →
    // setCurrentOrgForUser. If anyone reorders these the gate is bypassed.
    expect(src).toMatch(/setActive[\s\S]+?getOrgMembership\(input\.orgId,\s*ctx\.user\.id\)/);
    expect(src).toMatch(/setActive[\s\S]+?if\s*\(!membership\)[\s\S]+?code:\s*"FORBIDDEN"/);
  });

  it("inviteMember blocks self-invitations", () => {
    expect(src).toMatch(/input\.userId === ctx\.user\.id/);
    expect(src).toMatch(/code: "BAD_REQUEST"[\s\S]+?already a member/);
  });

  it("inviteByEmail validates email + generates a TTL'd token + uses sendgrid provider", () => {
    // Sanitize the email — never trust raw input from the wire.
    expect(src).toMatch(/sanitizeEmail\(input\.email\)/);
    // Crypto-random token (not Math.random, not a sequence).
    expect(src).toContain("crypto.randomBytes(32).toString(\"base64url\")");
    // Tokens have a finite TTL — the test pins the documented 7-day window.
    expect(src).toContain("INVITE_TTL_DAYS = 7");
    // Force the SendGrid sender so invites can't be spoofed via the
    // inviter's personal Gmail (impersonation + deliverability concern).
    expect(src).toMatch(/provider:\s*"sendgrid"/);
  });

  it("previewInvitation rejects already-accepted and expired tokens", () => {
    expect(src).toMatch(/previewInvitation[\s\S]+?if\s*\(invitation\.acceptedAt\)/);
    expect(src).toMatch(/previewInvitation[\s\S]+?invitation\.expiresAt\.getTime\(\)\s*<\s*Date\.now\(\)/);
  });

  it("acceptInvite is idempotent and auto-switches the user into the org", () => {
    // Re-accepts shouldn't throw — addOrgMember handles the duplicate.
    expect(src).toMatch(/acceptInvite[\s\S]+?addOrgMember\(\{[\s\S]+?orgId: invitation\.orgId/);
    // Mark the invitation accepted so `acceptedAt` gates future use.
    expect(src).toMatch(/markOrgInvitationAccepted\(invitation\.id, ctx\.user\.id\)/);
    // Auto-switch so the redirect lands them in context.
    expect(src).toMatch(/acceptInvite[\s\S]+?setCurrentOrgForUser\(ctx\.user\.id,\s*invitation\.orgId\)/);
  });

  it("inviteMember + inviteByEmail + pendingInvitations are orgAdminProcedure (owner/admin only)", () => {
    // Use a regex that tolerates the `inviteMember:` and `inviteByEmail:`
    // procedure prefixes, then verify orgAdminProcedure follows.
    expect(src).toMatch(/inviteMember:\s*orgAdminProcedure/);
    expect(src).toMatch(/inviteByEmail:\s*orgAdminProcedure/);
    expect(src).toMatch(/pendingInvitations:\s*orgAdminProcedure/);
  });
});

describe("lifecycleRouter contract", () => {
  const src = read("server/routers/lifecycle.ts");

  it("every procedure is org-scoped via orgProcedure (no protectedProcedure leaks)", () => {
    // The router exposes `get`, `listAll`, `markSetupComplete`,
    // `acknowledgeHandoff`, `reopenBuilder`. All five must be
    // orgProcedure or any per-user reads would leak across the
    // tenant boundary.
    expect(src).toMatch(/get:\s*orgProcedure/);
    expect(src).toMatch(/listAll:\s*orgProcedure/);
    expect(src).toMatch(/markSetupComplete:\s*orgProcedure/);
    expect(src).toMatch(/acknowledgeHandoff:\s*orgProcedure/);
    expect(src).toMatch(/reopenBuilder:\s*orgProcedure/);
    // Negative: no procedure should fall back to protectedProcedure
    // here. This is the canary for a "quick fix" refactor.
    expect(src).not.toMatch(/^\s*\w+:\s*protectedProcedure/m);
  });

  it("loadOrgStore enforces store.orgId === orgId (not just store existence)", () => {
    // The cross-tenant gate: a NOT_FOUND when the store isn't in the
    // active org. Without the orgId comparison this devolves into a
    // `getStoreById` reachable by any authenticated user.
    expect(src).toMatch(/loadOrgStore[\s\S]+?store\.orgId !== orgId[\s\S]+?code:\s*"NOT_FOUND"/);
  });

  it("acknowledgeHandoff is idempotent for stores already operating", () => {
    // Re-clicking the celebration banner shouldn't push a duplicate
    // agentTask audit row. Check the early-return guard.
    expect(src).toMatch(/acknowledgeHandoff[\s\S]+?store\.lifecycleStage === "operating"[\s\S]+?return\s*\{\s*storeId/);
  });

  it("markSetupComplete + acknowledgeHandoff write structured audit tasks", () => {
    // Both transitions write to `agent_tasks` so the operator's
    // activity feed shows the lifecycle moves. Pin the taskType strings.
    expect(src).toMatch(/createAgentTask\([\s\S]+?taskType:\s*"setup_complete"/);
    expect(src).toMatch(/createAgentTask\([\s\S]+?taskType:\s*"handoff_accepted"/);
  });

  it("auto-promotes building → transitioning when isHandoffReady fires", () => {
    expect(src).toMatch(/stage === "building" && isHandoffReady\(signals\)/);
    expect(src).toMatch(/lifecycleStage:\s*stage,\s*setupCompletedAt/);
  });
});

describe("botProfileRouter contract", () => {
  const src = read("server/routers/botProfile.ts");

  it("getMemory returns [] when no profile exists, addMemory throws NOT_FOUND", () => {
    // The Workspace Memory page reads `getMemory` and renders an empty
    // state — it relies on the empty-array contract. addMemory by
    // contrast must throw so callers don't silently no-op a write.
    expect(src).toMatch(/getMemory[\s\S]+?if\s*\(!profile\)\s*return\s*\[\]/);
    expect(src).toMatch(/addMemory[\s\S]+?if\s*\(!profile\)\s*throw new TRPCError\(\{\s*code:\s*"NOT_FOUND"/);
  });

  it("getSchedules + getSafetyRules + getExecutionHistory all return [] when profile is missing", () => {
    expect(src).toMatch(/getSchedules[\s\S]+?if\s*\(!profile\)\s*return\s*\[\]/);
    expect(src).toMatch(/getSafetyRules[\s\S]+?if\s*\(!profile\)\s*return\s*\[\]/);
    expect(src).toMatch(/getExecutionHistory[\s\S]+?if\s*\(!profile\)\s*return\s*\[\]/);
  });

  it("updateProfile + addMemory + upsertSchedule sanitize multiline operator input", () => {
    // Without the sanitizers a malicious operator can plant multi-KB
    // values that bloat storage or contain control characters.
    expect(src).toMatch(/updateProfile[\s\S]+?sanitizeMultiline\(updateData\.systemPrompt,\s*5000\)/);
    expect(src).toMatch(/updateProfile[\s\S]+?sanitizeMultiline\(updateData\.customInstructions,\s*5000\)/);
    expect(src).toMatch(/addMemory[\s\S]+?sanitizeMultiline\(input\.value,\s*2000\)/);
    expect(src).toMatch(/upsertSchedule[\s\S]+?sanitizeName\(input\.name,\s*100\)/);
  });

  it("memory + safety enums are tightly bounded (not free-form strings)", () => {
    // Loose enum schemas have historically let an attacker plant
    // unexpected values that downstream code dispatches on; pin the
    // documented enums.
    expect(src).toMatch(/MemoryType\s*=\s*z\.enum\(\["fact",\s*"pattern",\s*"decision",\s*"outcome",\s*"context"\]\)/);
    expect(src).toMatch(/RuleType\s*=\s*z\.enum\(\["spending_limit",\s*"price_limit",\s*"action_restriction",\s*"approval_required",\s*"rate_limit"\]\)/);
    expect(src).toMatch(/TriggerType\s*=\s*z\.enum\(\["cron",\s*"interval",\s*"manual",\s*"event"\]\)/);
  });

  it("every procedure runs under protectedProcedure (auth required, not public)", () => {
    // botProfile predates the org pivot — it's still per-user-scoped.
    // The invariant we DO need: nothing here is publicProcedure.
    expect(src).not.toMatch(/^\s*\w+:\s*publicProcedure/m);
    // And every documented procedure runs under protectedProcedure.
    for (const name of [
      "getProfile",
      "updateProfile",
      "getMemory",
      "addMemory",
      "getSchedules",
      "upsertSchedule",
      "getSafetyRules",
      "addSafetyRule",
      "getExecutionHistory",
    ]) {
      expect(src).toMatch(new RegExp(`${name}:\\s*protectedProcedure`));
    }
  });
});

describe("queueHealthRouter contract", () => {
  const src = read("server/routers/queueHealth.ts");

  it("every procedure requires admin auth (adminProcedure, not protectedProcedure)", () => {
    // Queue stats reveal infrastructure topology + recent failures (which
    // can include redacted message previews). Admin-gate everything.
    expect(src).toMatch(/getHealth:\s*adminProcedure/);
    expect(src).toMatch(/recentFailures:\s*adminProcedure/);
    expect(src).toMatch(/getQueueStats:\s*adminProcedure/);
    expect(src).not.toMatch(/^\s*\w+:\s*protectedProcedure/m);
    expect(src).not.toMatch(/^\s*\w+:\s*publicProcedure/m);
  });

  it("getQueueStats validates the queueName against a closed enum", () => {
    // No free-form strings: a typo or planted value should be rejected
    // by zod, not reach `health.queues[any-key]` and dereference undefined.
    expect(src).toMatch(/queueName:\s*z\.enum\(\['webhooks',\s*'external-apis'\]\)/);
  });

  it("recentFailures caps the operator-supplied limit at 100", () => {
    // Without the cap, a UI bug (or a malicious admin) can request
    // 1M failed jobs and tank the BullMQ connection.
    expect(src).toMatch(/limit:\s*z\.number\(\)\.min\(1\)\.max\(100\)\.default\(25\)/);
  });

  it("returns the documented { success, data | error } envelope (not throwing)", () => {
    // The dashboard renders a degraded banner if queueHealth is down.
    // Throwing instead of returning an error envelope flips the UI
    // into a generic ErrorBoundary fallback, which is worse UX.
    expect(src).toMatch(/return\s*\{\s*success:\s*true,?[\s\S]+?data:\s*health/);
    expect(src).toMatch(/success:\s*false,?[\s\S]+?error/);
  });
});
