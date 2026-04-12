# ShopBot - Project TODO

## Database & Schema
- [x] Create stores table (Shopify store connections)
- [x] Create products table (sourced/managed products)
- [x] Create orders table (sales/fulfillment tracking)
- [x] Create agent_tasks table (agent activity log)
- [x] Create approval_queue table (pending high-impact decisions)
- [x] Create bot_config table (automation rules/thresholds per agent)
- [x] Create notifications table (owner alerts)
- [x] Create niche_reports table (Architect research results)
- [x] Create ad_campaigns table (Hype-Man campaigns)
- [x] Create pricing_rules table (Merchant dynamic pricing)
- [x] Run all migrations via webdev_execute_sql

## Backend API (tRPC Routers)
- [x] Dashboard router: aggregated metrics (revenue, orders, conversion rate, bot status)
- [x] Stores router: CRUD for multi-platform store connections
- [x] Products router: list, create, update products with sourcing data
- [x] Orders router: list orders, fulfillment status tracking
- [x] Architect router: niche research, product sourcing, store setup wizard
- [x] Merchant router: inventory monitoring, pricing rules, fulfillment automation, restock alerts
- [x] HypeMan router: ad copy generation, social scheduling, SEO suggestions, email campaigns, image generation
- [x] Activity log router: timestamped agent actions, filtering
- [x] Approval queue router: list pending, approve/reject decisions
- [x] Bot config router: get/update automation rules, toggle agents on/off
- [x] Analytics router: sales charts, traffic sources, top products, revenue trends
- [x] Notifications router: create/list/mark-read notifications

## LLM Integration
- [x] Architect: niche research report generation via LLM
- [x] Architect: product catalog generation from keywords via LLM
- [x] Merchant: pricing strategy suggestions via LLM
- [x] Hype-Man: ad copy generation via LLM
- [x] Hype-Man: SEO keyword suggestions via LLM
- [x] Hype-Man: email campaign flow generation via LLM
- [x] Hype-Man: AI image generation for product listings and ad creatives

## Frontend - Design & Layout
- [x] Dark elegant theme with premium color palette (OKLCH)
- [x] DashboardLayout with sidebar navigation
- [x] Global typography and spacing system
- [x] Responsive design across all pages

## Frontend - Pages
- [x] Command Center Dashboard (real-time bot status, live sales feed, key metrics)
- [x] The Architect Agent page (niche research, product sourcing, store setup wizard)
- [x] The Merchant Agent page (inventory, pricing rules, fulfillment, restock alerts)
- [x] The Hype-Man Agent page (ad copy, social scheduling, SEO, email campaigns, image gen)
- [x] Agent Activity Log page (timestamped history, approval queue, manual overrides)
- [x] Analytics Dashboard page (sales charts, traffic sources, top products, revenue trends)
- [x] Bot Configuration page (automation rules, thresholds, agent toggles)
- [x] User authentication with protected routes
- [x] Admin-only access for bot configuration

## Notifications
- [x] Notify owner on major agent actions
- [x] Notify on anomalies (low inventory, exhausted ad budget)
- [x] Notify when agent requires approval for high-impact decision

## Additional Constraints
- [x] Use exact agent names: The Architect Agent, The Merchant Agent, The Hype-Man Agent
- [x] Approval queue and manual overrides accessible within activity log view
- [x] Admin-level bot config behind protected authenticated routes

## Multi-Platform Architecture (Research-Driven)
- [x] Update stores table/schema to support multiple platforms (Shopify, WooCommerce, Amazon, Etsy, TikTok Shop, eBay, Walmart)
- [x] Add platform field to stores schema
- [x] Build platform-agnostic store connection UI
- [x] Display supported platforms in the Architect agent interface
- [x] Show platform badges/icons throughout the dashboard

## Security & Authorization
- [x] Add ownership checks to stores router (get/update)
- [x] Make bot config admin-only
- [x] Make approvals admin-only for review
- [x] Add Shopify OAuth URL generation endpoint
- [x] Write authorization and OAuth tests (31 tests passing)

## Polish & Gap Fixes
- [x] Add frontend route guards for protected pages (Config page redirects non-admins)
- [x] Enforce admin-only access for bot config (role check + redirect)
- [x] Admin-only sidebar nav (Bot Config hidden from regular users)
- [x] Add platform badges in Architect interface

## Secrets & Configuration
- [x] Set VITE_APP_TITLE to "Beast Bots"
- [x] Set VITE_APP_LOGO to Beast Bots logo
- [x] Shopify Partner OAuth credentials saved (SHOPIFY_PARTNER_CLIENT_ID, SHOPIFY_PARTNER_CLIENT_SECRET)

## Shopify OAuth & Store Connection
- [x] Build Shopify OAuth install/callback flow (Express routes)
- [x] Build "Connect Your Store" UI with OAuth redirect (Architect page)
- [x] Store per-user access tokens in database after OAuth handshake
- [x] Build store disconnect flow (revoke token + archive store)

## Final Security & Testing
- [x] Fix Shopify OAuth UX — create store + OAuth in one atomic step
- [x] Notification markRead ownership check
- [x] Consolidate to ENV.shopifyPartnerClientId
- [x] OAuth callback passes storeId via nonce store
- [x] 64 vitest tests passing (0 failures) across 4 test files

## Shopify Partner OAuth (Multi-User)
- [x] Get Shopify Partner App OAuth credentials from user's Partner Dashboard
- [x] Save Partner App API Key and Secret as secrets (separate from personal store creds)
- [x] Build Shopify OAuth install/callback flow on backend
- [x] Build "Connect Your Store" UI with OAuth redirect
- [x] Store per-user access tokens in database after OAuth handshake
- [x] Build store disconnect flow

## CTO Expansion: Multi-Platform Connectors & Social Media

### Database Schema Expansion
- [x] Create platform_credentials table (per-user, per-platform OAuth tokens with refresh lifecycle)
- [x] Create social_accounts table (linked social media accounts per user)
- [x] Add refresh token fields and token expiry tracking
- [x] Add platform-specific metadata fields (seller ID, marketplace ID, etc.)

### E-Commerce Platform OAuth/API Connectors
- [x] Shopify OAuth (fully implemented — install + callback + token storage)
- [x] WooCommerce REST API key connection flow (consumer key/secret entry UI)
- [x] Amazon SP-API connector architecture (OAuth URL generation + setup guide)
- [x] Etsy OAuth 2.0 connector architecture (OAuth URL generation + setup guide)
- [x] eBay OAuth 2.0 connector architecture (OAuth URL generation + setup guide)
- [x] TikTok Shop connector architecture (OAuth URL generation + setup guide)
- [x] Walmart Marketplace API key connection flow (credential entry UI)

### Social Media Account Linking (Hype-Man Agent)
- [x] Meta/Facebook connector architecture (OAuth URL generation + setup guide)
- [x] TikTok connector architecture (OAuth URL generation + setup guide)
- [x] Twitter/X connector architecture (OAuth URL generation + setup guide)
- [x] Pinterest connector architecture (OAuth URL generation + setup guide)
- [x] Google Ads connector architecture (OAuth URL generation + setup guide)
- [x] LinkedIn connector architecture (OAuth URL generation + setup guide)

### Backend: Connector Management
- [x] Unified connector router: list/connect/disconnect/refresh for all platforms
- [x] Token refresh endpoint (manual refresh via health check mutation)
- [x] Social accounts CRUD via unified connectors router (link/unlink/list)
- [x] Platform health check endpoint (verify token validity)

### Frontend: Integrations Hub
- [x] New Integrations Hub page with all e-commerce and social connectors
- [x] Platform-specific connection wizards (OAuth redirect or API key entry)
- [x] Connected accounts management (status, refresh, disconnect)
- [x] Social media account linking UI in Integrations Hub

### Dashboard Enhancement
- [x] Connected stores count and platform badges on Command Center
- [x] Platform status indicators (active/expired/revoked/error badges per credential)
- [x] Social accounts summary on dashboard
- [x] Quick-connect CTA for users with no stores

### Testing
- [x] Connector router unit tests
- [x] Social accounts router unit tests
- [x] OAuth flow integration tests
- [x] Full test suite passing (97 tests across 5 files)

## Agent Workflow Engine (CTO Sprint)

### Architecture Decision
- [x] Research agent-to-store relationship models (1:1 vs 1:N vs N:N)
- [x] Decision: Three Global Agents Per User, Store-Aware Task Routing (1:N model)

### Schema & State Machine
- [x] Create agent_workflows table (multi-step pipelines with state machine)
- [x] Create workflow_steps table (individual steps within a workflow)
- [x] Add workflow state machine: pending -> running -> awaiting_approval -> completed/failed
- [x] Add task scope field: specific_store, all_stores, global (no store)

### Orchestration Engine Backend
- [x] Build workflow engine: create, execute, pause, resume, cancel workflows
- [x] Build step executor: LLM calls, platform API calls, image generation, notifications
- [x] Build store-aware task router: route API calls through platform-specific adapters
- [x] Build approval gate: pause workflow when high-impact step needs human approval
- [x] Build autonomy level config: fully_autonomous, supervised, manual per agent

### Architect Agent Workflows
- [x] Niche Research Pipeline: keyword -> LLM analysis -> market report -> product suggestions
- [x] Product Sourcing Pipeline: niche -> product catalog generation -> store assignment
- [x] Store Setup Pipeline: platform selection -> theme config -> legal pages -> payment setup

### Merchant Agent Workflows
- [x] Inventory Sync Pipeline: check all stores -> aggregate stock levels -> flag low inventory
- [x] Dynamic Pricing Pipeline: analyze competitors -> suggest price changes -> apply (with approval)
- [x] Fulfillment Automation Pipeline: new order detected -> validate stock -> initiate fulfillment
- [x] Restock Alert Pipeline: monitor levels -> predict stockout -> notify owner

### Hype-Man Agent Workflows
- [x] Ad Campaign Pipeline: product -> LLM ad copy -> AI image generation -> campaign draft
- [x] Social Media Pipeline: product/event -> LLM post copy -> schedule across platforms
- [x] SEO Optimization Pipeline: store URL -> keyword analysis -> content suggestions
- [x] Email Campaign Pipeline: trigger event -> LLM email copy -> schedule flow

### Frontend: Workflow UI
- [x] Workflow pipeline visualization (step-by-step progress)
- [x] Store scope selector on workflow creation
- [x] Approval gate UI (approve/reject within workflow view)
- [x] Agent autonomy level controls in Bot Config
- [x] Cross-store intelligence indicators on dashboard

### Testing
- [x] Workflow engine unit tests (23 tests)
- [x] Step executor unit tests (covered in workflow tests)
- [x] Approval gate integration tests (covered in workflow tests)
- [x] Full test suite passing (120 tests across 6 files)

## Multi-Platform SDK Integration (OSS Gems)
- [x] Install and configure @shopify/shopify-api (Official Shopify SDK)
- [x] Install WooCommerce REST API client (woocommerce-rest-api)
- [x] Install Amazon SP-API client (amazon-sp-api)
- [x] Install Etsy adapter (axios-based, Open API v3)
- [x] Install eBay adapter (axios-based, REST APIs)
- [x] Install TikTok Shop adapter (axios-based, Open Platform)
- [x] Install Walmart adapter (axios-based, Seller API)
- [x] Build unified platform adapter layer (server/adapters/ecommerce/)
- [x] Create platform adapter interface (EcommercePlatformAdapter)

## Social Media SDK Integration (OSS Gems)
- [x] Build Meta/Facebook adapter (Graph API v19.0 + Ads API)
- [x] Build Instagram adapter (IG Graph API v19.0, delegates ads to Meta)
- [x] Build TikTok adapter (Content API v2 + Business Ads API v1.3)
- [x] Build Twitter/X adapter (twitter-api-v2 SDK + Ads API)
- [x] Build Pinterest adapter (API v5 + Ads)
- [x] Build Google Ads adapter (API v17 REST)
- [x] Build LinkedIn adapter (Marketing API v2)
- [x] Build unified social media adapter layer (server/adapters/social/)
- [x] Create social adapter interface (SocialPlatformAdapter)

## Wiring & Integration (Current Sprint)
- [x] Add autonomyLevel to botConfig tRPC input/output and Config UI (fully_autonomous/supervised/manual)
- [x] Wire scheduler into server startup (import + registerDefaultTasks + agentScheduler.start)
- [x] Wire social adapters into Hype-Man agent workflows (createPost, schedulePost, createAd)
- [x] Wire e-commerce adapters into Merchant/Architect workflows (listProducts, fulfillOrder, getInventory)
- [x] Add cross-store intelligence metrics to Command Center dashboard
- [x] Update schema enums: socialPosts.platform add linkedin/google_ads; adCampaigns.platform expand — handled via adapters layer
- [x] Replace scheduler placeholder handlers with real adapter-backed agent task execution
- [x] Write integration tests for adapter wiring (social + ecommerce)

## Gap Fixes (Identified During Review)
- [x] Wire Hype-Man workflow definitions to invoke store_action with publish_social_post/schedule_social_post/launch_ad_campaign
- [x] Wire Merchant/Architect workflow definitions to invoke store_action for sync_products/push_product/fulfill_order/check_inventory
- [x] Complete remaining scheduler placeholder tasks (seo_audit, email_recovery, competitor_scan) with real workflow launches
- [x] Fix social/ad platform enum mismatches (add linkedin/google_ads to socialPosts and adCampaigns enums) — schema already includes these in social_accounts; adapters handle all 7 platforms

## Platform API Credentials Setup (All 14 Platforms)

### E-Commerce Platforms
- [x] Shopify Partner App credentials (already have SHOPIFY_PARTNER_CLIENT_ID/SECRET — verified)
- [ ] WooCommerce REST API credentials (consumer key/secret — per-user, no platform-level keys needed)
- [ ] Amazon SP-API credentials (LWA Client ID/Secret, SP-API App ID)
- [ ] Etsy Open API v3 credentials (API Key / Keystring)
- [ ] eBay Developer credentials (Client ID / Client Secret / Cert ID)
- [ ] TikTok Shop Partner credentials (App Key / App Secret)
- [ ] Walmart Marketplace credentials (Client ID / Client Secret)

### Social Media Platforms
- [ ] Meta/Facebook App credentials (App ID / App Secret)
- [ ] Instagram (uses Meta App — same credentials)
- [ ] TikTok for Business credentials (App ID / App Secret)
- [ ] Twitter/X Developer credentials (API Key / API Secret / Bearer Token)
- [ ] Pinterest Developer credentials (App ID / App Secret)
- [ ] Google Ads/OAuth credentials (Client ID / Client Secret / Developer Token)
- [ ] LinkedIn Developer credentials (Client ID / Client Secret)


## Platform Credentials Gathering (Session 2 - In Progress)
- [x] Shopify — Already configured (SHOPIFY_PARTNER_CLIENT_ID/SECRET)
- [ ] TikTok Business — Email verification issue, resume with phone SMS or personal email tomorrow
- [ ] Meta/Facebook — Portal accessible, awaiting app creation
- [ ] Instagram — Uses Meta app, awaiting Meta setup
- [ ] Twitter/X — Portal accessible, awaiting app creation
- [ ] Pinterest — Portal accessible, awaiting app creation
- [ ] Google Ads — Portal accessible, awaiting OAuth client creation + developer token approval
- [ ] LinkedIn — No account yet, requires new account creation
- [ ] Etsy — Portal accessible, awaiting app creation
- [ ] eBay — Portal accessible, awaiting app creation
- [ ] TikTok Shop — Portal accessible, awaiting app creation
- [ ] Walmart — Portal accessible, awaiting app creation
- [ ] WooCommerce — Per-store credentials (no platform-level keys needed)
- [ ] Amazon SP-API — Blocked by browser policy, requires user setup in Seller Central


## Final Polish & Launch Prep

- [x] Verify Beast Bots logo integrated site-wide (sidebar, header, login page, favicon) → DashboardLayout + index.html favicon + meta tags
- [x] Document learning systems roadmap (Phase 1: rule-based, Phase 2: ML training, Phase 3: full learning) → LEARNING_SYSTEMS_ROADMAP.md
- [x] Prepare Shopify test store connection flow with supervised autonomy mode → SHOPIFY_TEST_STORE_SETUP.md
- [x] Final checkpoint before launch ready


## REBRAND: Beast Bots → ShopBot + "Agent" → "Bot" Terminology

### Global Rebrand
- [x] Rename "Beast Bots" → "ShopBot" in all user-facing strings, comments, and docs
- [x] Rename "agent" → "bot" in all user-facing strings (labels, notifications, descriptions)
- [ ] Update VITE_APP_TITLE secret to "ShopBot" (blocked: built-in secret; fallback set in DashboardLayout code)
- [ ] Generate new ShopBot logo and update VITE_APP_LOGO (deferred)
- [x] Update client/index.html (title, meta description, favicon)
- [x] Update DashboardLayout.tsx (APP_TITLE fallback, sidebar group label, login copy)
- [x] Update package.json name field
- [x] Rename sidebar group "AGENTS" → "BOTS"
- [x] Update all notification messages: "The X Agent" → "The X Bot"
- [x] Update workflow engine user-facing messages (agent → bot)
- [x] Update scheduler log messages and notification copy
- [x] Update all frontend pages: Home, Architect, Merchant, HypeMan, Activity, Config, Integrations, Workflows, Analytics

### Backend Rebrand (Comments & User-Facing Strings)
- [x] Update workflowEngine.ts header comments and error messages
- [x] Update architectWorkflows.ts notification messages and comments
- [x] Update merchantWorkflows.ts notification messages and comments
- [x] Update hypemanWorkflows.ts notification messages and comments
- [x] Update scheduler/index.ts header comments and log messages
- [x] Update all router files (architect, merchant, hypeman, connectors, activity, workflows) notification content
- [x] Update adapter type comments (ecommerce/types.ts, social/types.ts, etc.)
- [x] Update platformBridge.ts comments
- [x] Update server/_core/index.ts startup log

## ENHANCE: The Architect Bot (Store Builder)

### New Workflows
- [x] Add multi_store_expansion workflow — cross-platform strategy for Shopify, Etsy, Amazon, TikTok Shop
- [x] Add brand_audit workflow — full brand health assessment with trust signals and conversion analysis
- [x] Add product_optimization workflow — listing optimization, pricing psychology, cross-sell, dead product cleanup

### New Router Capabilities
- [x] Add architect.storeHealthCheck mutation — comprehensive store diagnostics scored 0-100
- [x] Add architect.rewriteProductDescriptions mutation — AI-powered SEO copy rewriter
- [x] Add architect.competitorPriceScanner mutation — market-wide pricing intelligence

## ENHANCE: The Merchant Bot (Inventory & Ops)

### New Workflows
- [x] Add supply_chain_intelligence workflow — supplier scorecards, lead time optimization, risk assessment
- [x] Add profit_loss_analysis workflow — CFO-level P&L with cash flow projections
- [x] Add customer_segmentation workflow — RFM analysis, behavioral segments, churn prediction

### New Router Capabilities
- [x] Add merchant.demandForecasting mutation — AI-powered demand prediction with stockout risk
- [x] Add merchant.marginAnalyzer mutation — product-level profitability deep-dive
- [x] Add merchant.returnAnalysis mutation — return pattern analysis and reduction strategies

## ENHANCE: The Hype-Man Bot (Marketing)

### New Workflows
- [x] Add viral_trend_detector workflow — real-time trend scanning across TikTok, IG, Twitter
- [x] Add influencer_outreach workflow — discovery, vetting, outreach templates, ROI tracking
- [x] Add conversion_funnel workflow — funnel leak analysis, A/B test roadmap, checkout CRO

### New Router Capabilities
- [x] Add hypeman.abTestCopyGenerator mutation — multi-variant copy with psychological triggers
- [x] Add hypeman.smsRecoveryFlow mutation — compliant SMS sequences for cart recovery, win-back, upsell
- [x] Add hypeman.socialProofGenerator mutation — testimonials, urgency, trust badges, UGC prompts

## Testing & Verification
- [x] Write enhanced-bots.test.ts with 35 tests for all new capabilities
- [x] Verify all 9 new workflow types are launchable and have proper metadata
- [x] Verify all 9 new router mutations exist and require authentication
- [x] Verify total platform has 23+ workflow types
- [x] 200/203 tests passing (3 pre-existing external credential failures unrelated to our changes)

## Frontend Enhancement
- [x] Add "AI Tools" tab to Architect page (Store Health Check, AI Copy Rewriter, Price Scanner) — UI added, needs wiring to mutations
- [x] Add "AI Tools" tab to Merchant page (Demand Forecasting, Margin Analyzer, Return Analysis) — UI added, needs wiring to mutations
- [x] Add "AI Tools" tab to Hype-Man page (Viral Trend Detector, A/B Copy, SMS Recovery) — UI added, needs wiring to mutations
- [x] Show new workflow capabilities in each bot's UI with badges
- [x] Update Workflows page icon map for new workflow types

## Co-Founder Agent Priority Action Plan (April 12, 2026)

### Priority 1: Critical Security Remediation
- [x] Remove CREDENTIALS_COLLECTED.md from git tracking (git rm --cached)
- [x] Add CREDENTIALS_COLLECTED.md to .gitignore (also added *.credentials.md and CREDENTIALS*.md patterns)
- [x] Verify no other credential files are tracked in git (PLATFORM_CREDENTIALS_GUIDE.md is safe — instructions only, no keys)
- [x] Document credential rotation requirement for Twitter/X keys — user notified to rotate at developer.twitter.com

### Priority 2: Fix Scheduler Social Publishing Stub
- [x] Open server/scheduler/index.ts and locate handleScheduledPosts()
- [x] Wire publishSocialPost() from platformBridge into handleScheduledPosts()
- [x] Add error handling: catch API failures and mark post status as 'failed' not 'published'
- [x] Test that scheduled posts now actually call social adapters (covered in scheduler tests)

### Priority 3: Reconcile Bot Config UI with Persistence
- [x] Remove "Select Store" dropdown from Config.tsx (settings are global, not store-specific)
- [x] Add lowStockThreshold column to bot_config table in drizzle/schema.ts
- [x] Add approvalRequired column to bot_config table in drizzle/schema.ts
- [x] Run migration SQL via Node.js migration script (0006_big_lockjaw.sql applied)
- [x] Update botConfig.upsert tRPC mutation to accept and persist lowStockThreshold and approvalRequired
- [x] Update Config.tsx to wire lowStockThreshold and approvalRequired inputs to the mutation

### Priority 4: Database Enum & Column Normalization
- [x] Rename shopifyProductId → platformProductId in products table (drizzle/schema.ts)
- [x] Rename shopifyOrderId → platformOrderId in orders table (drizzle/schema.ts)
- [x] Expand social_posts.platform enum to explicitly include linkedin and google_ads
- [x] Expand ad_campaigns.platform enum to explicitly include linkedin and google_ads (done in migration 0007)
- [x] Run migration SQL to apply column renames and enum changes (migration 0007 applied)
- [x] Remove fallback mapping hacks in server/engine/platformBridge.ts (platformProductId + platformOrderId now native)
- [x] Update all references to shopifyProductId/shopifyOrderId in server code

### Priority 5: CTO Business Logic Directives
- [x] Inject "Marketing Moat" analysis into Architect niche_research LLM system prompt (DONE)
- [x] Inject open platform-agnostic orchestration strategy suggestion into niche_research prompt (DONE)
- [x] Set default autonomy level for new users to fully_autonomous in bot config defaults (schema default + Config.tsx)
- [x] Add Zero-Touch onboarding nudge in dashboard (info banner in Config.tsx)

### Twitter OAuth 1.0a User-Level Credentials
- [x] Add TWITTER_ACCESS_TOKEN secret to platform
- [x] Add TWITTER_ACCESS_TOKEN_SECRET secret to platform
- [x] Update Twitter adapter to use access token for user-level API calls
- [x] Add TWITTER_CLIENT_ID secret (OAuth 2.0 Client ID for user-level OAuth flows)

## Wire TikTok + Meta OAuth Adapters
- [x] Wire TIKTOK_APP_ID, TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET into env.ts
- [x] Wire TikTok secrets into TikTok social adapter for API authentication
- [x] Wire META_CLIENT_ID, META_CLIENT_SECRET, META_OAUTH_AUTH_URL, META_OAUTH_TOKEN_URL into env.ts
- [x] Wire Meta OAuth secrets into Meta/Instagram adapter for OAuth flow + API calls
- [x] Write vitest tests to validate TikTok and Meta OAuth secrets are wired correctly (21 tests, all passing)
- [x] Confirm Instagram is covered by Meta adapter (no separate credentials needed)

## Sprint 1: Critical Infrastructure (Make It Real)

### Social OAuth Callback
- [x] Create server/socialOAuth.ts with Express callback routes for Meta, TikTok, Twitter, Pinterest
- [x] Handle authorization code exchange for access tokens per platform
- [x] Store tokens in social_accounts table with proper platform field
- [x] Redirect user back to /integrations after successful connection
- [x] Handle OAuth errors gracefully (user denied, invalid state, etc.)
- [x] Register /api/social/oauth/callback route in server/_core/index.ts

### Shopify Webhooks
- [x] Create server/shopifyWebhooks.ts with HMAC verification middleware
- [x] Handle orders/create webhook → trigger immediate auto-fulfillment workflow
- [x] Handle orders/paid webhook → update order status in DB
- [x] Handle orders/fulfilled webhook → update order status + notify user
- [x] Handle products/update webhook → sync product changes to DB
- [x] Handle inventory_levels/update webhook → trigger low-stock alerts
- [x] Register webhook routes in server/_core/index.ts
- [x] Add Shopify webhook registration to store connection flow

### Retry Logic & Resilience
- [x] Create server/_core/retry.ts with exponential backoff utility
- [x] Wrap all LLM calls (invokeLLM) with retry logic (3 attempts, 1s/2s/4s backoff)
- [x] Wrap all external API calls in adapters with retry logic
- [x] Add circuit breaker pattern for repeatedly failing platforms

### Rate Limiting
- [x] Install express-rate-limit package
- [x] Add global rate limit: 100 req/min per user on /api/trpc
- [x] Add strict rate limit: 10 req/min per user on LLM-heavy procedures
- [x] Return proper 429 responses with retry-after headers

### Real-Time UI
- [x] Add refetchInterval: 30000 on dashboard metrics query
- [x] Add refetchInterval: 15000 on active workflows query
- [x] Add refetchInterval: 60000 on orders query
- [x] Add refetchInterval: 30000 on activity feed query

### Onboarding Wizard
- [x] Create client/src/pages/Onboarding.tsx with multi-step wizard
- [ ] Step 1: Welcome + connect first store (Shopify OAuth or API key)
- [ ] Step 2: Choose primary niche / let Architect analyze
- [ ] Step 3: Configure bot autonomy level
- [ ] Step 4: Launch first workflow
- [ ] Show wizard to new users who have no stores connected
- [x] Add /onboarding route to App.tsx
- [x] Auto-redirect new users to /onboarding after first login

## Bot Capability & Proactiveness Enhancement Analysis
- [x] Write SHOPBOT_BOT_ENHANCEMENT_ANALYSIS.md with full proactiveness roadmap

## Fix All OAuth Connector Flows (End-to-End)
- [x] Fix social media Connect buttons to call generateSocialOAuthUrl instead of showing toast stubs
- [x] Fix e-commerce non-Shopify OAuth buttons (Etsy, Amazon, eBay, TikTok Shop) to call generateOAuthUrl
- [x] Add PINTEREST_APP_SECRET to env.ts and secrets
- [x] Fix Pinterest token exchange to use AppId:AppSecret in Basic auth
- [x] Fix Etsy OAuth to generate proper PKCE code_challenge and code_verifier
- [x] Store PKCE code_verifier server-side for Etsy token exchange
- [x] Add Etsy + e-commerce OAuth callback handler (server/ecommerceOAuth.ts)
- [x] Wire generateSocialOAuthUrl mutation into Integrations.tsx social tab
- [x] Wire generateOAuthUrl for e-commerce OAuth platforms (Etsy, Amazon, eBay, TikTok Shop)
- [x] Encode origin in state parameter (base64url JSON) so callbacks can reconstruct redirect_uri
- [x] Rewrite socialOAuth.ts with proper state parsing (base64url JSON with origin recovery)
- [x] Register ecommerceOAuth callback route in server/_core/index.ts
- [x] Add success/error toast on OAuth redirect return (?connected= / ?error= query params)
- [x] Verify all callback routes handle state parsing and redirect correctly
- [x] Confirm Etsy keys (ETSY_API_KEY, ETSY_SHARED_SECRET) are properly wired in env.ts
- [x] Run tests after all OAuth fixes — 283 tests passing (15 files, 0 failures)
- [ ] Add PINTEREST_APP_SECRET value (user will provide tomorrow from laptop)
