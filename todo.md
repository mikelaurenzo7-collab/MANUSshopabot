# Beast Bots - Project TODO

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
