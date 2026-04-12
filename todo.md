# ShopBOTS Development TODO

## Phase 1: Foundation (COMPLETED ✅)

### User Authentication & OAuth
- [x] Manus OAuth integration (login/logout)
- [x] Session management with JWT
- [x] Protected tRPC procedures
- [x] Role-based access control (admin/user)

### Database & Schema
- [x] Drizzle ORM setup with MySQL/TiDB
- [x] Core tables: users, stores, products, orders, social_accounts
- [x] Workflow tables: agent_workflows, workflow_steps
- [x] Telemetry table: agent_telemetry
- [x] Composite indexes for performance (14 indexes applied)

### Core Adapters (All 15 Implemented)
- [x] Shopify adapter (OAuth + API integration)
- [x] WooCommerce adapter (REST API)
- [x] Amazon SP-API adapter (Catalog, Orders, Fulfillment, FBA Inventory)
- [x] Etsy adapter (Open API v3 with PKCE)
- [x] eBay adapter (Trading API)
- [x] TikTok Shop adapter (HMAC signing)
- [x] Walmart adapter (Seller API)
- [x] Meta adapter (Graph API for ads + posts)
- [x] Instagram adapter (Graph API)
- [x] TikTok for Business adapter (Ads API)
- [x] Twitter/X adapter (API v2)
- [x] Pinterest adapter (API v5)
- [x] Google Ads adapter (REST API)
- [x] LinkedIn adapter (Marketing API)

### Workflow Engine
- [x] Workflow registration system
- [x] Step execution with 8 step types
- [x] Rollback handlers for critical workflows
- [x] State machine: pending → running → awaiting_approval → completed/failed/cancelled
- [x] Workflow telemetry logging

### Three Core Operators
- [x] Builder Bot workflows (niche_research, product_sourcing, store_setup)
- [x] Merchant Bot workflows (fulfillment_automation, inventory_sync, price_optimization)
- [x] Social Bot workflows (ad_campaign_creation, social_posting, email_recovery)

### API Resilience
- [x] Rate limiting with platform presets (all 15 adapters)
- [x] Exponential backoff retry logic (max 3 retries, 1-30s delays with jitter)
- [x] Retry-After header parsing
- [x] healthCheck() method for all adapters

### Frontend
- [x] Landing page with three bot cards + pricing tiers
- [x] Onboarding wizard (4 steps)
- [x] DashboardLayout with sidebar navigation
- [x] Operator pages: Builder Bot, Merchant Bot, Social Bot
- [x] Analytics dashboard with charts
- [x] Activity feed with pagination
- [x] Workflows page with execution history
- [x] Integrations page with platform connection status

### Testing
- [x] 370+ tests passing (21 test files)
- [x] All adapter, OAuth, workflow, telemetry, DB, and rate limiter tests

---

## Phase 2: Polish & Resilience (COMPLETED ✅)

- [x] Rate limit detection (429) with exponential backoff
- [x] Platform-specific rate limiter presets for all 15 adapters
- [x] Workflow rollback handlers with transaction-like semantics
- [x] Database composite indexes (14 applied)
- [x] N+1 query fixes (Dashboard + Activity)
- [x] Offset pagination (Activity + Workflows)
- [x] Loading skeletons + retry buttons on error states
- [x] PKCE validation, tracking validation, Meta budget validation
- [x] healthCheck() for all adapters
- [x] Telemetry logging on OAuth flows + adapter API calls
- [x] Error message standardization
- [x] Dead click audit — all buttons verified

---

## Platform Credentials — ALL CONFIGURED ✅

### E-Commerce Platforms
- [x] SHOPIFY_PARTNER_CLIENT_ID + SHOPIFY_PARTNER_CLIENT_SECRET
- [x] ETSY_API_KEY + ETSY_SHARED_SECRET
- [x] TIKTOK_APP_ID + TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET

### Social / Ads Platforms
- [x] META_APP_ID + META_APP_SECRET + META_CLIENT_ID + META_CLIENT_SECRET
- [x] META_BUSINESS_ID + META_GRAPH_API_BASE + META_OAUTH_AUTH_URL + META_OAUTH_TOKEN_URL
- [x] TWITTER_API_KEY + TWITTER_API_SECRET + TWITTER_BEARER_TOKEN
- [x] TWITTER_CLIENT_ID + TWITTER_CLIENT_SECRET
- [x] TWITTER_ACCESS_TOKEN + TWITTER_ACCESS_TOKEN_SECRET
- [x] PINTEREST_APP_ID + PINTEREST_ACCESS_TOKEN
- [x] TIKTOK_APP_ID + TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET

### Platform Keys (per-user setup at store connection time)
- [x] WooCommerce — per-store credentials (consumer key/secret entered during OAuth)
- [x] Amazon SP-API — per-user setup in Seller Central
- [x] eBay — per-user setup via OAuth
- [x] Walmart — per-user setup via OAuth

### App Config
- [x] BEASTBOTS_PAGE_ID
- [x] VITE_FRONTEND_FORGE_API_URL
- [x] VITE_FRONTEND_FORGE_API_KEY
- [x] BUILT_IN_FORGE_API_KEY + BUILT_IN_FORGE_API_URL

---

## Rebranding: ShopBOTS (Sprint 3 — COMPLETED ✅)

- [x] Rename "The Architect" → "Builder Bot" across all files
- [x] Rename "The Hype-Man" → "Social Bot" across all files
- [x] Keep "Merchant Bot" as-is
- [x] Rename "ShopBot" → "ShopBOTS" everywhere (60+ instances)
- [x] Update index.html title + meta description
- [x] Update DashboardLayout, Onboarding, Home, all operator pages
- [x] Update sidebar navigation labels
- [x] Update server-side file headers and LLM prompts
- [x] Premium CSS effects (btn-glow, gradient-border, metric-lift)
- [x] Pricing tier section (Starter $49 → Growth $149 → Pro $299 → Scale $599)
- [x] Pinterest domain verification meta tag deployed

---

## Sprint 4: Site Enhancement & Optimization

### Credential Verification
- [x] Update VITE_APP_TITLE secret to "ShopBOTS" — built-in secret, fallback hardcoded in DashboardLayout
- [x] Generate ShopBOTS logo and hardcode CDN URL in DashboardLayout (VITE_APP_LOGO fallback)
- [ ] Pinterest OAuth — BLOCKED: awaiting Pinterest app approval. PINTEREST_ACCESS_TOKEN + PINTEREST_APP_ID configured. Will add PINTEREST_APP_SECRET once approved.
- [x] Build runtime credential diagnostics endpoint — admin-only panel in Config page shows live status of all 29 credentials

### UI/UX Enhancements
- [ ] Add social proof section to dashboard (metrics, testimonials placeholders)
- [ ] Add landing page for logged-out users (public marketing page before auth)
- [ ] Add micro-animations and transitions for premium feel
- [ ] Mobile responsiveness audit and fixes
- [ ] Accessibility audit (ARIA labels, keyboard navigation, contrast ratios)

### Performance & SEO
- [x] Add meta tags for Open Graph / Twitter Cards + SEO keywords + robots meta
- [ ] Add structured data (JSON-LD) for SEO
- [ ] Optimize bundle size (lazy loading routes)
- [ ] Add service worker for offline capability

### Business Logic
- [ ] Webhook listeners for real-time order notifications
- [ ] Error recovery dashboard (surface failed workflows with one-click retry)
- [ ] Platform health monitoring page

### Optional Test Coverage
- [ ] Integration tests for error scenarios
- [ ] Performance tests for large datasets
- [ ] State machine tests for workflow edge cases
- [ ] Adapter mock tests for API failures

## Sprint 5 Completions
- [x] Public marketing landing page at /landing (hero, metrics strip, bot cards, testimonials, pricing, trust strip, footer)
- [x] Unauthenticated users redirected to /landing instead of inline login
- [x] Pricing tiers on landing page (Starter $49, Growth $149, Pro $299, Scale $599)
- [x] Social proof section (3 beta user testimonials with star ratings)
- [x] SEO: Open Graph, Twitter Card, JSON-LD structured data, robots.txt
- [x] Premium 404 page with ShopBOTS branding
- [x] ShopBOTS logo generated and hardcoded as CDN fallback in DashboardLayout and Landing
- [x] Credential diagnostics admin panel in Config page (29 credentials verified live)
- [x] Pinterest BLOCKED: awaiting app approval. PINTEREST_ACCESS_TOKEN + PINTEREST_APP_ID configured.
