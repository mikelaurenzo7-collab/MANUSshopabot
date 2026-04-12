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

### Core Adapters (All 13 Implemented — LinkedIn Removed)
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
- [x] Add social proof section to dashboard (metrics, testimonials placeholders)
- [x] Add landing page for logged-out users (public marketing page before auth)
- [x] Add micro-animations and transitions for premium feel
- [x] Mobile responsiveness audit and fixes
- [x] Accessibility audit (ARIA labels, keyboard navigation, contrast ratios)

### Performance & SEO
- [x] Add meta tags for Open Graph / Twitter Cards + SEO keywords + robots meta
- [x] Add structured data (JSON-LD) for SEO
- [x] Optimize bundle size (lazy loading routes)
- [x] Add service worker for offline capability (vite-plugin-pwa with Workbox, NetworkFirst for tRPC)

### Business Logic
- [x] Webhook listeners for real-time order notifications
- [x] Error recovery dashboard (surface failed workflows with one-click retry)
- [x] Platform health monitoring page

### Optional Test Coverage
- [x] Integration tests for error scenarios (UNAUTHORIZED/FORBIDDEN guards, invalid enum rejection)
- [x] Performance tests for large datasets (pagination limit enforcement, large limit acceptance)
- [x] State machine tests for workflow edge cases (registry exports, all 3 agent types, retry/cancel auth)
- [x] Adapter mock tests for API failures (platformRateLimiters, healthCheck methods, factory functions)

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

## Sprint 6: Error Recovery, Health Monitoring & Performance

- [x] Add workflow retry mutation to workflows router (retry failed/cancelled workflows)
- [x] Add retry button to failed workflows in Workflows History tab
- [x] Create platform health monitoring tRPC router (healthCheck all connected adapters)
- [x] Create PlatformHealth.tsx page with live health status for all connected platforms
- [x] Add /health route to App.tsx sidebar navigation
- [x] Webhook listeners already implemented (Shopify orders/create, orders/paid, orders/fulfilled, products/update, inventory_levels/update) - verified mounted in server bootstrap
- [x] Lazy load all routes in App.tsx with React.lazy + Suspense
- [x] Add micro-animations: fade-in on page load, stagger on lists, hover scale on cards, shimmer, pulse-glow
- [x] Fix duplicate useLocation declaration in DashboardLayout.tsx (Vite parse error)
- [x] Mobile responsiveness audit and fixes (shadcn sidebar auto-switches to Sheet overlay on mobile, metrics grid responsive)
- [x] Apply page-enter, stagger-list, card-hover animation classes to Home dashboard cards and Workflows history list
- [x] Add reduced-motion media query fallback for animations

## Sprint 7: Mobile, Accessibility & Service Worker

- [x] Mobile responsiveness: DashboardLayout sidebar collapses to overlay on mobile (< md breakpoint)
- [x] Mobile responsiveness: Home metrics grid 1-col on mobile, 2-col on sm, 4-col on lg
- [x] Mobile responsiveness: Workflows page table/cards scroll horizontally on mobile
- [x] Accessibility: Add aria-label to all icon-only buttons
- [x] Accessibility: Add role="status" to live metric updates
- [x] Accessibility: Ensure focus trap in all modals/dialogs (shadcn/ui Dialog/Sheet use Radix FocusTrap natively)
- [x] Service worker: Add basic offline fallback page via Vite PWA plugin (vite-plugin-pwa installed + configured)
- [x] Mark structured data (JSON-LD) as done (completed in Sprint 5)
- [x] Mark micro-animations as done (completed in Sprint 6)

## Sprint 8: Rename hypeman → social

- [x] Rename HypeMan.tsx → Social.tsx and update all imports/routes
- [x] Replace all "hypeman" agent type strings with "social" (server routers, workflow engine, DB queries)
- [x] Replace all "HypeMan" / "Hype-Man" display labels with "Social Bot" in UI
- [x] Update AGENT_NAMES maps, sidebar nav, and workflow type references
- [x] Update test files that reference "hypeman"
- [x] Verify TypeScript 0 errors after rename (401 tests passing)

## Sprint 9: Deep Platform Research & Bot Strategy
- [x] Research all 13 platform connectors (7 e-commerce + 6 social/ads) in parallel
- [x] Document API capabilities, rate limits, and automation opportunities for each platform
- [x] Define elite bot strategies for each platform (store operations + social management)
- [x] Compile comprehensive strategy document with actionable bot playbooks

## Sprint 10: Elite Platform Playbook Implementation

### Phase 2: Merchant Elite Workflows
- [x] Inventory-aware ad pausing: when product goes OOS, auto-pause ads across ALL connected social platforms
- [x] Buy Box monitoring workflow for Amazon/eBay/Walmart (reprice within margin limits)
- [x] Shopify Metafields support: store supplier cost, profit margin, reorder point per product (registered workflow)
- [x] Shopify Bulk Operations API support for batch product updates (registered workflow)
- [x] FBA replenishment monitoring: track Amazon IPI score and trigger inbound shipment alerts (registered workflow)
- [x] Etsy listing refresh automation: weekly title/tag updates to maintain search visibility (registered workflow)
- [x] WooCommerce out-of-stock hide (not delete) to preserve SEO rankings (registered workflow)
- [x] Walmart Seller Performance Alarm webhook handler (registered workflow)
- [x] Dynamic pricing engine: rules based on inventory age, turnover velocity, margin targets, time-of-day
- [x] Scheduler tasks: buy_box_monitor (every 30 min), inventory_ad_pause (real-time), dynamic_pricing (hourly)

### Phase 3: Social Bot Elite Workflows
- [x] Conversions API integration for Meta: server-side event sending with hashed PII (registered workflow)
- [x] Creative velocity A/B testing: auto-pause creatives with CPA > 20% above target, scale winners
- [x] TikTok early engagement monitoring: 3-second view rate and hold rate tracking (registered workflow)
- [x] Pinterest Trends API integration: trend-driven pin scheduling (registered workflow)
- [x] Spark Ads automation: auto-boost high-performing organic TikTok posts (registered workflow)
- [x] Instagram Reels watch time monitoring: auto-boost high watch-time reels (registered workflow)
- [x] Google Ads Performance Max optimization: asset group management and bid strategy (registered workflow)
- [x] Twitter/X Filtered Stream monitoring: brand mention tracking and sentiment analysis (registered workflow)
- [x] Scheduler tasks: creative_velocity_check (hourly), trend_monitor (daily), spark_ads_boost (daily)

### Phase 4: Cross-Platform Orchestration
- [x] Anomaly detection engine: detect unusual patterns (price spikes, inventory drops, ROAS crashes)
- [x] Circuit breaker pattern: auto-pause API calls to a platform if error rate > 50%
- [x] Unified metrics aggregator: cross-platform ROAS, CPA, inventory health, fulfillment quality
- [x] Bot autonomy enforcement layer: approval gates for budget increases > 20%, pricing changes > 15%
- [x] Dead-letter queue for failed webhook deliveries with retry logic

### Phase 5: UI Updates
- [x] Platform-specific strategy cards in Intelligence Center dashboard
- [x] Autonomy control panel: per-platform approval thresholds configurable by user (Intelligence Center)
- [x] Real-time anomaly alerts in Intelligence Center dashboard
- [x] Cross-platform metrics comparison table in Intelligence Center
- [x] Buy Box win rate and IPI score widgets in Intelligence Center
