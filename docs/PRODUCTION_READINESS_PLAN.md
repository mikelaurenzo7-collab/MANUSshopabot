# SHOPaBOT — Production Readiness Plan
**Audit Date:** April 25, 2026  
**Build Status:** ✅ 0 TypeScript errors  
**Test Status:** 515/548 passing (33 failing)  
**Deployment Status:** Live at beastbots-r65at2l4.manus.space

---

## Audit Summary

### What's Working Well
- Full tRPC stack with 20+ routers, all registered and typed
- 3-bot architecture (Architect, Merchant, Social) with workflow engine
- Stripe subscription enforcement (revenue moat)
- BullMQ job queue infrastructure (Phase 1 complete)
- Sharp image optimization (Phase 2 complete)
- Zod validation schemas for all 5 platforms (Phase 3 complete)
- 21 pages, all routed and accessible
- OAuth flows for 10+ platforms (Shopify, Amazon, Etsy, TikTok, Walmart, Meta, Pinterest, Twitter, Gmail, Google Ads)
- Scheduler tasks for all 3 bots
- Signal intelligence system (competitor stalker, inventory intelligence, trend hijack)
- Plugin store with seeded plugins
- Telemetry and analytics tracking

### Failing Tests — Categorized

#### Category A: Missing `Workflows.tsx` Page (CRITICAL — blocks 8 tests)
- `server/implementations.test.ts` — expects `client/src/pages/Workflows.tsx`
- `server/polish.test.ts` — expects `client/src/pages/Workflows.tsx`
- `server/sprint6.test.ts` — expects retry button in `Workflows.tsx`
- **Fix:** Create `Workflows.tsx` page with workflow list, history tab, retry mutation, and empty states

#### Category B: Missing UI Patterns in Home.tsx (MEDIUM — blocks 3 tests)
- `server/implementations.test.ts` — expects `error: metricsError`, `error: agentError`, `Dashboard Error`
- `server/polish.test.ts` — same
- `server/sprint6.test.ts` — expects `page-enter` and `stagger-list` CSS classes applied in Home.tsx
- **Fix:** Add error destructuring aliases and animation classes to Home.tsx

#### Category C: DashboardLayout Missing Patterns (MEDIUM — blocks 4 tests)
- `server/sprint6.test.ts` — expects `navigateTo` alias, `const [location, setLocation] = useLocation()`, `Platform Health` nav item with `HeartPulse` icon and `/health` path
- **Fix:** Add `navigateTo` alias to DashboardLayout, add Platform Health to sidebar nav

#### Category D: Landing.tsx Missing BrandName JSX Usage (LOW — blocks 2 tests)
- `server/sprint16.test.ts` — expects `<BrandName` in Landing.tsx JSX (it's imported but not used in JSX)
- **Fix:** Replace hardcoded `SHOPaBOT` text spans in Landing.tsx with `<BrandName>` component

#### Category E: Architect.tsx Missing Error Handling (LOW — blocks 2 tests)
- `server/implementations.test.ts` — expects `onError:` and `toast.error` in Architect.tsx
- `server/polish.test.ts` — same
- **Fix:** Add `onError` callbacks with `toast.error` to Architect.tsx mutations

#### Category F: DB-Dependent Tests Not Skipping Properly (MEDIUM — blocks 9 tests)
- `server/workflows.test.ts` — `it.skipIf(!process.env.DATABASE_URL)` but DATABASE_URL IS set, so tests run and fail because test user (`openId: "test-user"`) doesn't exist in DB
- `server/enhanced-bots.test.ts` — same pattern
- **Fix:** Mock `getUserByOpenId` in tests OR add a test user upsert in test setup, OR change the router to use `ctx.user.id` directly instead of re-querying by openId

#### Category G: External API Credential Tests (LOW — cannot fix without user action)
- `server/pinterest.credentials.test.ts` — Pinterest API returns 401 (token expired or app not approved)
- `server/twitter-oauth2.test.ts` — Twitter OAuth2 returns 400 (credentials issue)
- **Fix:** User needs to refresh Pinterest access token and verify Twitter OAuth2 app credentials

#### Category H: BullMQ Test Timeout (LOW — Redis not available in test env)
- `server/queue/webhookProcessor.test.ts` — times out because Redis is not running in sandbox
- **Fix:** Mock the BullMQ Queue in tests to avoid real Redis dependency

---

## Production Readiness Checklist

### 🔴 P0 — Blockers (Must fix before launch)

| # | Task | Category | Effort |
|---|------|----------|--------|
| 1 | **Create Workflows.tsx page** with workflow list, history tab, retry mutation, empty states | A | 2h |
| 2 | **Fix DB-dependent test mocking** — mock getUserByOpenId in test setup so workflow launch tests pass | F | 1h |
| 3 | **Add Redis mock to BullMQ tests** — prevent timeout in CI | H | 30m |

### 🟡 P1 — High Priority (Fix before first paid user)

| # | Task | Category | Effort |
|---|------|----------|--------|
| 4 | **Add error handling to Home.tsx** — `error: metricsError`, `error: agentError`, `Dashboard Error` UI | B | 30m |
| 5 | **Add animation classes to Home.tsx** — `page-enter` on root div, `stagger-list` on metrics grid | B | 15m |
| 6 | **Fix DashboardLayout** — add `navigateTo` alias, `setLocation`, Platform Health nav item | C | 30m |
| 7 | **Fix Architect.tsx mutations** — add `onError` callbacks with `toast.error` | E | 20m |
| 8 | **Fix Landing.tsx** — replace hardcoded SHOPaBOT spans with `<BrandName>` component | D | 20m |

### 🟢 P2 — Polish (Before marketing launch)

| # | Task | Category | Effort |
|---|------|----------|--------|
| 9 | **Wire Zod validation into webhook processor** — validate payloads before processing | Integration | 1h |
| 10 | **Wire Sharp optimization into Builder Bot** — auto-optimize product images on sourcing | Integration | 1h |
| 11 | **Migrate Shopify webhooks to BullMQ** — use enqueueWebhook in shopifyWebhooks.ts | Integration | 1h |
| 12 | **Migrate Amazon/Etsy/TikTok/Walmart webhooks to BullMQ** | Integration | 2h |
| 13 | **Queue monitoring dashboard UI** — show active/waiting/failed jobs | UI | 2h |
| 14 | **Add image optimization tRPC endpoint** — manual trigger from Merchant Bot UI | UI | 1h |
| 15 | **Refresh Pinterest access token** | External | User action |
| 16 | **Verify Twitter OAuth2 app credentials** | External | User action |

### 🔵 P3 — Nice to Have (Post-launch)

| # | Task | Category | Effort |
|---|------|----------|--------|
| 17 | **Email template builder UI** — visual template editor with variable substitution | UI | 3h |
| 18 | **Bot autonomy slider** — visual control for manual → supervised → autonomous | UI | 2h |
| 19 | **Webhook testing dashboard** — real-time payload debugger | UI | 2h |
| 20 | **Performance review system** — after every 20 workflows, auto-analyze success rates | Engine | 3h |

---

## Immediate Action Plan

**Today's Sprint:** Complete all P0 blockers + P1 items to achieve 548/548 tests passing.

**Order of execution:**
1. Create `Workflows.tsx` (biggest impact — unblocks 8 tests)
2. Fix DashboardLayout (Platform Health nav + navigateTo alias)
3. Fix Home.tsx (error handling + animation classes)
4. Fix Architect.tsx (onError callbacks)
5. Fix Landing.tsx (BrandName JSX)
6. Fix DB-dependent test mocking (workflow launch tests)
7. Fix BullMQ test Redis mock

**Estimated time to 0 failing tests:** ~6 hours of focused development

---

## Test Score Projection

| Phase | Tests Passing | Tests Failing |
|-------|--------------|---------------|
| Current | 515 | 33 |
| After P0 | 524 | 24 |
| After P1 | 543 | 5 |
| After P2 | 546 | 2 |
| After P3 (user action) | 548 | 0 |

*The 2 remaining failures (Pinterest + Twitter) require user credential refresh.*

---

## Architecture Health

| Component | Status | Notes |
|-----------|--------|-------|
| tRPC Routers | ✅ 20 routers, all registered | |
| Database Schema | ✅ All tables migrated | |
| Auth (Manus OAuth) | ✅ Working | |
| Stripe Integration | ✅ Sandbox configured | Needs live keys for production |
| BullMQ Queue | ⚠️ Installed, Redis not provisioned | Needs Redis in production |
| Sharp Optimization | ✅ Integrated | |
| Zod Validation | ✅ Schemas created | Needs wiring into processors |
| Scheduler | ✅ All 3 bots scheduled | |
| Signal Intelligence | ✅ 3 signals active | |
| Plugin Store | ✅ Seeded with plugins | |
| Telemetry | ✅ Tracking active | |
| Image Storage (S3) | ✅ Configured | |
| Gmail Bot | ✅ Router + UI | |
| Bot Settings | ✅ UI complete | |

---

## First Task to Execute: Create Workflows.tsx

This single page unblocks 8 failing tests and is a critical missing piece of the user experience — users need to see and manage their bot workflows. The page must include:

1. **Active workflows tab** — list of running workflows with status, progress, agent type
2. **History tab** — completed/cancelled workflows with results
3. **Retry mutation** — `retryMutation`, `onRetry`, `retryLoading` variables
4. **Empty states** — `.length === 0` check with `border-dashed` styling
5. **Launch workflow button** — triggers the workflow launch modal
6. **Error handling** — `onError` with `toast.error`
