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

describe("activityRouter contract", () => {
  const src = read("server/routers/activity.ts");

  it("caps `limit` at 200 (DoS protection)", () => {
    // Without the cap, a single tRPC call can pull megabytes of
    // activity rows. The router is the last line — preflight doesn't
    // see runtime input.
    expect(src).toMatch(/limit:\s*z\.number\(\)\.min\(1\)\.max\(200\)\.default\(20\)/);
  });

  it("agentType is a closed enum (no free-form drift)", () => {
    expect(src).toMatch(/agentType:\s*z\.enum\(\["architect",\s*"merchant",\s*"social"\]\)/);
  });

  it("list runs under protectedProcedure (auth required)", () => {
    expect(src).toMatch(/list:\s*protectedProcedure/);
    expect(src).not.toMatch(/^\s*\w+:\s*publicProcedure/m);
  });
});

describe("orchestratorRouter contract", () => {
  const src = read("server/routers/orchestrator.ts");

  it("every tenant-scoped procedure passes ctx.org.id to its engine fn", () => {
    // The single most important thing this router has to get right:
    // the engine functions take a userId AND orgId, and the orgId
    // is the tenancy boundary. If anyone calls the engine fns with
    // just userId the cross-tenant boundary is bypassed.
    expect(src).toMatch(/getUnifiedMetrics\(ctx\.user\.id,\s*ctx\.org\.id,\s*input\.period\)/);
    expect(src).toMatch(/detectAnomalies\(ctx\.user\.id,\s*ctx\.org\.id\)/);
    expect(src).toMatch(/monitorBuyBox\(ctx\.user\.id,\s*ctx\.org\.id\)/);
    expect(src).toMatch(/runDynamicPricingEngine\(ctx\.user\.id,\s*ctx\.org\.id\)/);
    expect(src).toMatch(/runCreativeVelocityOptimization\(ctx\.user\.id,\s*ctx\.org\.id\)/);
    expect(src).toMatch(/pauseAdsForOutOfStockProducts\(ctx\.user\.id,\s*ctx\.org\.id\)/);
  });

  it("tenant-scoped procedures use orgProcedure (not protectedProcedure)", () => {
    expect(src).toMatch(/unifiedMetrics:\s*orgProcedure/);
    expect(src).toMatch(/anomalies:\s*orgProcedure/);
    expect(src).toMatch(/buyBoxStatus:\s*orgProcedure/);
    expect(src).toMatch(/triggerDynamicPricing:\s*orgProcedure/);
    expect(src).toMatch(/triggerCreativeVelocity:\s*orgProcedure/);
    expect(src).toMatch(/triggerAdPause:\s*orgProcedure/);
  });

  it("dlqStatus is intentionally NOT org-scoped (operator-only, no tenant data)", () => {
    // The DLQ surfaces failed jobs across the whole queue — operator
    // concern, not a tenant resource. Document that the protectedProcedure
    // is intentional so a future "make everything org-scoped" sweep
    // doesn't break the operator's view of stuck jobs.
    expect(src).toMatch(/dlqStatus:\s*protectedProcedure/);
    expect(src).toMatch(/Stays on protectedProcedure since it doesn't return any tenant data/);
  });

  it("triggerDynamicPricing returns the documented shape", () => {
    // The dashboard renders `total / autoApplied / queuedForApproval`.
    expect(src).toMatch(/total:\s*results\.length/);
    expect(src).toMatch(/autoApplied:\s*results\.filter\(r\s*=>\s*r\.approved\)\.length/);
    expect(src).toMatch(/queuedForApproval:\s*results\.filter\(r\s*=>\s*r\.requiresApproval\)\.length/);
  });
});

describe("pluginStoreRouter contract", () => {
  const src = read("server/routers/pluginStore.ts");

  it("install verifies plugin exists AND not already installed (idempotency gate)", () => {
    // Without the dupe-check, a double-click on the install button
    // creates two installation rows and emits two notifications.
    expect(src).toMatch(/install[\s\S]+?const plugin = await db\.getPluginById\(input\.pluginId\)/);
    expect(src).toMatch(/install[\s\S]+?if\s*\(!plugin\)\s*throw/);
    expect(src).toMatch(/install[\s\S]+?if\s*\(existing\.some[\s\S]+?\)\s*\{\s*throw new Error\("Plugin already installed"\)/);
  });

  it("install + uninstall + toggle are user-scoped via ctx.user.id", () => {
    // The plugin store predates the org pivot — installations are
    // per-user. Pin the scope so a refactor doesn't quietly widen
    // the read to all installs system-wide.
    expect(src).toMatch(/install[\s\S]+?userId:\s*ctx\.user\.id,\s*pluginId:\s*input\.pluginId/);
    expect(src).toMatch(/uninstallPlugin\(ctx\.user\.id,\s*input\.pluginId\)/);
    expect(src).toMatch(/togglePlugin\(ctx\.user\.id,\s*input\.pluginId,\s*input\.enabled\)/);
  });

  it("install fires a notification with structured metadata for the audit feed", () => {
    expect(src).toMatch(/createNotification\(\{[\s\S]+?metadata:\s*\{\s*pluginId:\s*input\.pluginId\s*\}/);
    expect(src).toMatch(/actionUrl:\s*"\/plugins"/);
  });

  it("every procedure runs under protectedProcedure", () => {
    expect(src).not.toMatch(/^\s*\w+:\s*publicProcedure/m);
    for (const name of ["listAvailable", "getPlugin", "myPlugins", "install", "uninstall", "toggle"]) {
      expect(src).toMatch(new RegExp(`${name}:\\s*protectedProcedure`));
    }
  });
});

describe("promptRLRouter contract", () => {
  const src = read("server/routers/promptRL.ts");

  it("createVariant agentType is closed to architect/merchant/social", () => {
    expect(src).toMatch(/agentType:\s*z\.enum\(\["architect",\s*"merchant",\s*"social"\]\)/);
  });

  it("createVariant bounds operator input (taskType, variantName, promptTemplate)", () => {
    // Without the min length, the dashboard fills with empty drafts
    // that never resolve. Without the max, an LLM-fed prompt can
    // grow until it OOMs the row.
    expect(src).toMatch(/taskType:\s*z\.string\(\)\.min\(1\)\.max\(100\)/);
    expect(src).toMatch(/variantName:\s*z\.string\(\)\.min\(1\)\.max\(50\)/);
    expect(src).toMatch(/promptTemplate:\s*z\.string\(\)\.min\(10\)/);
  });

  it("autoPromote falls back to a structured 'no winner' result instead of throwing", () => {
    // The job queue calls this on a schedule. If a fresh task hasn't
    // accumulated enough invocations, the right answer is `promoted:
    // false` + a documented reason — not a crash.
    expect(src).toMatch(/autoPromote[\s\S]+?if\s*\(best\)/);
    expect(src).toMatch(/return\s*\{\s*promoted:\s*true,\s*variantId:\s*best\.id/);
    expect(src).toMatch(/return\s*\{\s*promoted:\s*false,\s*reason:\s*"No variant with sufficient sample size/);
  });

  it("every procedure runs under protectedProcedure", () => {
    expect(src).not.toMatch(/^\s*\w+:\s*publicProcedure/m);
    for (const name of [
      "listVariants",
      "createVariant",
      "getActivePrompt",
      "promoteVariant",
      "recordInvocation",
      "recordConversion",
      "variantMetrics",
      "evaluateBest",
      "autoPromote",
      "dashboard",
    ]) {
      expect(src).toMatch(new RegExp(`${name}:\\s*protectedProcedure`));
    }
  });
});

describe("stripeRouter contract", () => {
  const src = read("server/routers/stripe.ts");

  it("getPlans is intentionally publicProcedure (landing page reads it anonymously)", () => {
    // The landing page renders the pricing grid before login. This
    // public read is by design — pin it so a future "make everything
    // protected" sweep doesn't break the conversion funnel.
    expect(src).toMatch(/getPlans:\s*publicProcedure/);
    expect(src).toMatch(/public — used on landing page/);
  });

  it("createCheckoutSession + getSubscription + createBillingPortalSession require auth", () => {
    expect(src).toMatch(/getSubscription:\s*protectedProcedure/);
    expect(src).toMatch(/createCheckoutSession:\s*protectedProcedure/);
    expect(src).toMatch(/createBillingPortalSession:\s*protectedProcedure/);
  });

  it("planId is restricted to the closed Stripe plan enum", () => {
    // No free-form planId — the webhook hardening pins this on the
    // server side too, but the router is the first line.
    expect(src).toMatch(/planId:\s*z\.enum\(\["starter",\s*"growth",\s*"pro",\s*"scale"\]\)/);
  });

  it("checkout session honors the 7-day trial + cancel-on-missing-card behavior", () => {
    // Landing/FAQ promises "7-day free trial, no credit card". The
    // checkout collects the card up front but only charges after day 7,
    // and cancels if no card is on file then.
    expect(src).toMatch(/trial_period_days:\s*7/);
    expect(src).toMatch(/missing_payment_method:\s*"cancel"/);
  });

  it("founder bypass is wired via the env-allowlisted helper, not a hardcoded list", () => {
    // The allowlist lives in FOUNDER_EMAILS so support can rotate it
    // without a deploy. Pin both call sites — the read AND the
    // checkout block.
    expect(src).toContain('import { isFounderEmail } from "../_core/founder"');
    expect(src).toMatch(/isFounderEmail\(user\.email,\s*\{\s*reason:\s*"subscription_status"\s*\}\)/);
    expect(src).toMatch(/isFounderEmail\(user\.email,\s*\{\s*reason:\s*"checkout_blocked"\s*\}\)/);
  });

  it("createBillingPortalSession requires an existing stripeCustomerId", () => {
    // Calling the billing portal without a customer ID throws a
    // confusing Stripe error; we surface a friendly BAD_REQUEST first.
    expect(src).toMatch(/createBillingPortalSession[\s\S]+?if\s*\(!user\?\.stripeCustomerId\)[\s\S]+?code:\s*"BAD_REQUEST"/);
  });
});

describe("workflowGraphRouter contract", () => {
  const src = read("server/routers/workflowGraph.ts");

  it("liveState is org-scoped via orgProcedure + reads only ctx.org.id stores", () => {
    expect(src).toMatch(/liveState:\s*orgProcedure/);
    expect(src).toMatch(/getStoresByOrg\(ctx\.org\.id\)/);
  });

  it("liveState caps the work it does (10 stores × 30 tasks, 25 task nodes, 10 events)", () => {
    // The procedure builds a ReactFlow snapshot. Without bounds, an
    // org with hundreds of stores tanks the dashboard.
    expect(src).toMatch(/storeIds\.slice\(0,\s*10\)/);
    expect(src).toMatch(/db\.getAgentTasks\(\{\s*storeId:\s*sid,\s*limit:\s*30\s*\}\)/);
    expect(src).toMatch(/allTasks\.slice\(0,\s*25\)/);
    expect(src).toMatch(/processedEvents\.slice\(0,\s*10\)/);
  });

  it("override mutations record an audit row in execution_overrides", () => {
    // Pause/resume/cancel must always leave a trail keyed to the user
    // who issued the override — this is the audit story the dashboard
    // shows in `overrideHistory`.
    expect(src).toMatch(/pauseTask[\s\S]+?createExecutionOverride\(\{[\s\S]+?overriddenByUserId:\s*ctx\.user\.id,[\s\S]+?actionTaken:\s*"paused"/);
    expect(src).toMatch(/resumeTask[\s\S]+?createExecutionOverride\(\{[\s\S]+?actionTaken:\s*"resumed"/);
    expect(src).toMatch(/cancelTask[\s\S]+?createExecutionOverride\(\{[\s\S]+?actionTaken:\s*"cancelled"/);
  });

  it("status transitions match the documented state machine", () => {
    // pauseTask → pending_approval, resumeTask → running,
    // cancelTask → rejected.
    expect(src).toMatch(/pauseTask[\s\S]+?status:\s*"pending_approval"/);
    expect(src).toMatch(/resumeTask[\s\S]+?status:\s*"running"/);
    expect(src).toMatch(/cancelTask[\s\S]+?status:\s*"rejected"/);
  });

  it("cancelTask requires a reason (not optional like pause/resume)", () => {
    // Cancellation is destructive — the audit row should always
    // capture WHY. Pause and resume have a friendlier default.
    expect(src).toMatch(/cancelTask[\s\S]+?reason:\s*z\.string\(\)\.max\(500\)\s*\}\)/);
    expect(src).toMatch(/pauseTask[\s\S]+?reason:\s*z\.string\(\)\.max\(500\)\.optional\(\)/);
    expect(src).toMatch(/resumeTask[\s\S]+?reason:\s*z\.string\(\)\.max\(500\)\.optional\(\)/);
  });

  it("overrideHistory caps `limit` at 100", () => {
    expect(src).toMatch(/overrideHistory[\s\S]+?limit:\s*z\.number\(\)\.min\(1\)\.max\(100\)\.default\(50\)/);
  });
});

describe("workflows draft procedures contract (PR #97)", () => {
  const src = read("server/routers/workflows.ts");
  const dbSrc = read("server/db.ts");

  it("saveDraft / getDraft / listDrafts / deleteDraft are all orgProcedure", () => {
    // Drafts cross the tenancy boundary — anything less than orgProcedure
    // would let a user save into / read another tenant's drafts.
    expect(src).toMatch(/saveDraft:\s*orgProcedure/);
    expect(src).toMatch(/getDraft:\s*orgProcedure/);
    expect(src).toMatch(/listDrafts:\s*orgProcedure/);
    expect(src).toMatch(/deleteDraft:\s*orgProcedure/);
  });

  it("saveDraft validates storeId against the active org via requireStoreInOrg", () => {
    // Without the per-row storeId check, a user could plant a draft
    // pointing into another tenant's store row by guessing an id.
    expect(src).toMatch(/saveDraft[\s\S]+?if\s*\(typeof input\.storeId === "number"\)\s*\{[\s\S]+?await requireStoreInOrg\(input\.storeId,\s*ctx\.org\.id\)/);
  });

  it("saveDraft input bounds operator-supplied fields", () => {
    expect(src).toMatch(/name:\s*z\.string\(\)\.min\(1\)\.max\(255\)/);
    expect(src).toMatch(/agentType:\s*z\.enum\(\["architect",\s*"merchant",\s*"social"\]\)/);
    // Each step has a bounded type + title — prevents an LLM-fed
    // workflow from ballooning the JSON column.
    expect(src).toMatch(/type:\s*z\.string\(\)\.min\(1\)\.max\(64\)/);
    expect(src).toMatch(/title:\s*z\.string\(\)\.max\(500\)/);
  });

  it("getDraft throws NOT_FOUND on miss / cross-org access (no silent null)", () => {
    expect(src).toMatch(/getDraft[\s\S]+?if\s*\(!draft\)[\s\S]+?code:\s*"NOT_FOUND"/);
  });

  it("upsertWorkflowDraft enforces tenancy on the update path", () => {
    // The most important db-helper invariant: when the caller passes
    // an `id`, we must verify the row's orgId matches before writing.
    // Without this, the upsert is a cross-tenant overwrite primitive.
    expect(dbSrc).toMatch(/upsertWorkflowDraft[\s\S]+?if\s*\(existing\[0\] && existing\[0\]\.orgId === draft\.orgId\)/);
    // Falling through to insert when the id doesn't match is the
    // safe failure mode — never overwrites another tenant's row.
    expect(dbSrc).toMatch(/Fall through[\s\S]+?to the insert path/);
  });

  it("getWorkflowDraft + deleteWorkflowDraft both gate on orgId match", () => {
    expect(dbSrc).toMatch(/getWorkflowDraft[\s\S]+?if\s*\(!row \|\| row\.orgId !== orgId\)/);
    expect(dbSrc).toMatch(/deleteWorkflowDraft[\s\S]+?if\s*\(!rows\[0\] \|\| rows\[0\]\.orgId !== orgId\)/);
  });

  it("schema migration 0030 ships the workflow_drafts table with org index", () => {
    const migration = read("drizzle/0030_safe_warlock.sql");
    expect(migration).toContain("CREATE TABLE `workflow_drafts`");
    expect(migration).toContain("`orgId` int NOT NULL");
    expect(migration).toContain("CREATE INDEX `workflow_drafts_org_id_idx`");
    // Schema declares the same shape.
    const schema = read("drizzle/schema.ts");
    expect(schema).toMatch(/workflowDrafts = mysqlTable\("workflow_drafts"/);
    expect(schema).toMatch(/orgId: int\("orgId"\)\.notNull\(\)/);
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
