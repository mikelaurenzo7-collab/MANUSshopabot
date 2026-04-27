# MANUS_SYNC.md — How to sync `main` into Manus without burning credits

This doc is the playbook for pulling Claude's commits on `main` into the
Manus runtime. Follow it as written and Manus shouldn't burn cycles
guessing what to do.

---

## TL;DR

```bash
# 1. From the Manus repo console, on `main`:
git fetch origin main
git reset --hard origin/main          # only if local has no real changes
# OR  git pull --ff-only origin main   # if local is in sync

# 2. Reinstall — schema or routers change frequently
pnpm install --frozen-lockfile

# 3. Apply any new migrations (idempotent, safe to re-run)
pnpm run db:push

# 4. Restart the server
#    Manus auto-restarts on file change; if not, just bounce the process.
```

If those four steps run cleanly, sync is done. The rest of this doc is
**why** Manus sometimes burns credits and **how to short-circuit it**.

---

## Why Manus has been burning credits on syncs

Manus sometimes treats a sync like a debug session: it tries to "fix"
things that aren't broken, hits an error in something orthogonal, and
spends a whole context-window getting confused. The fix is to give it
a deterministic recipe so it doesn't go exploratory.

**Common confusion sources we've seen:**

1. **Strict env validation that fails on Manus's auto-injected secrets.**
   FIXED on `8dfe50d` — `JWT_SECRET` length is now a warning, not a fatal.
   If you ever see "JWT_SECRET must be ≥ 32 chars" as a fatal again,
   someone re-added the strict gate; the pattern lives in
   `server/_core/env.ts:validateRequiredEnv()` and should stay as a
   `logger.warn(…)`, not `missing.push(…)`.

2. **Untracked migrations.** When `drizzle/0023_*.sql` lands and Manus
   doesn't run `db:push`, the server boots against a stale schema and
   queries fail with "Unknown column 'orgId'". Always run `db:push`
   after pulling.

3. **Stale `node_modules`.** New imports (especially
   `server/delivery/*`, `server/sendgridWebhooks.ts`) need fresh installs.
   `pnpm install --frozen-lockfile` is fast and idempotent.

4. **Tests run during deploy.** Some Manus presets run `pnpm test`
   during deploy; if Redis or Stripe env vars aren't injected at deploy
   time the test pre-flight can fail. Tests run cleanly in our CI
   environment with no env vars (verified — 584/584 pass with empty env);
   if a test starts failing, it's a real bug, not env wiring.

---

## Ship checklist for the Manus operator

Run these four commands in this order. Don't improvise.

```bash
# 1. Clean local state, pull main
git stash --include-untracked          # only if you have local edits
git fetch origin main
git checkout main
git reset --hard origin/main           # if local diverges from origin

# 2. Install dependencies (frozen lockfile = no surprises)
pnpm install --frozen-lockfile

# 3. Apply migrations
pnpm run db:push

# 4. Boot the server (Manus auto-restart should handle this on file change)
pnpm run start
```

**If any step fails:**
- Step 1 fails → check `git status`; resolve any uncommitted edits
- Step 2 fails → delete `node_modules` and retry once
- Step 3 fails → check `DATABASE_URL` is set (it is, on Manus)
- Step 4 fails → tail the logs; look for the FIRST error, not the last

**Don't:**
- Don't run `pnpm test` during deploy unless the runtime has the same
  env vars CI does. Tests are for development.
- Don't manually edit `server/_core/env.ts` on the runtime. If it's
  rejecting an env var, the fix lives in code, not config.
- Don't try to "fix" things by reverting individual commits. Pull
  `main` clean, restart.

---

## Verifying a successful sync

After the four steps above:

```bash
# Database is reachable + schema matches code
curl -s https://<your-manus-domain>/api/trpc/health.platformStatus \
  | jq '.result.data'

# Expected:
# {
#   "overall": "operational",
#   "services": [
#     { "id": "database", "healthy": true, ... },
#     ...
#   ]
# }
```

The `/status` page (publicly viewable at `https://<your-domain>/status`)
shows the same info in a UI. If the database row says `Unreachable`,
migrations probably failed in step 3.

---

## When Claude lands a breaking change

Claude commits land on `main` in clearly-labeled merge commits. If a
merge ever requires manual operator action beyond the four-step recipe,
the merge commit message will say so explicitly under a
`MANUAL STEPS REQUIRED` section.

Recent merges that needed nothing beyond the four-step recipe:

- `016c833` — Activation Coach + Welcome email + /status page
- `8dfe50d` — JWT length hotfix
- `0ac3d62` — Cross-tenant fixes + bot perf
- `b2feea8` — Ship prep (multi-tenancy isolation, customer flow)
- `7e952ad` — SendGrid webhook + email invitations
- `fe706ee` — Delivery layer (Gmail + SendGrid + Twilio)
- `bbede46` — Multi-tenancy foundation
- `493136b` — Design + functionality + honesty pass

All eight were sync-clean.

---

## Env vars to confirm on Manus

`.env.example` at the repo root is the source of truth. Cross-check
that Manus secrets contain at minimum:

**Required (server refuses to start without these):**
- `DATABASE_URL`
- `JWT_SECRET` (auto-injected by Manus — leave alone)

**Recommended (features won't work without them, but server boots):**
- `ALLOWED_ORIGINS` (your prod domain — required when `NODE_ENV=production`)
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `VITE_STRIPE_PUBLISHABLE_KEY`
- `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` (or `_MESSAGING_SERVICE_SID`)
- `SHOPIFY_PARTNER_CLIENT_ID` + `SHOPIFY_PARTNER_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (for Gmail)

**Optional (each unlocks one Connect tile):** Meta, TikTok, Twitter,
Pinterest, Etsy, eBay, Amazon SP-API. Server boots without any of
these; the affected platform tiles show as unavailable in the UI.

---

## Talking to Manus directly

If you need to give the Manus operator instructions in plain English,
this works:

> "Sync `main` into the runtime using the four-step recipe in
> MANUS_SYNC.md (git pull, pnpm install, db:push, restart). Don't run
> tests, don't improvise. After restart, hit
> `/api/trpc/health.platformStatus` and confirm the database service
> is healthy. If it's not, that's the only thing to debug."

Be specific. Manus does best with deterministic instructions, not
open-ended ones.
