# BeastBots App Audit — Sprint 17

## Pages & Status Summary

### FULLY BUILT (Backend-wired, interactive, production-ready)
1. **Landing** (455 lines) — Hero, How It Works, Testimonials, Pricing, Trust badges, Final CTA, Footer. All sections complete.
2. **Onboarding** (600+ lines) — 4-step wizard: Welcome → Platform Connect → Niche Launch → Complete. Fully wired to trpc.
3. **Home / Command Center** (704 lines) — KPI cards, Connected Stores, Cross-Store Intelligence, Pricing Tiers, Bot Status, Recent Activity. All wired.
4. **Architect / Builder Bot** (1021 lines) — 5 tabs: Niche Research, Product Catalog, Stores, Platforms, AI Tools. All wired with mutations.
5. **Merchant Bot** (520+ lines) — 5 tabs: Inventory, Orders, Pricing, Fulfillment, AI Tools. All wired.
6. **Social Bot** (680+ lines) — 6 tabs: Ad Copy, Image Gen, SEO, Social Posts, Email Recovery, AI Tools. All wired.
7. **Activity** (250+ lines) — 3 tabs: Activity Log, Approval Queue, Decision History. All wired with filters.
8. **Analytics** (431 lines) — KPI cards, Revenue Trend chart, Traffic Sources pie chart, Top Products bar chart. All wired.
9. **Integrations** (673 lines) — 3 tabs: E-Commerce Platforms, Social Media, Connected. Full OAuth + API key flows.
10. **Workflows** (500+ lines) — 4 tabs: Launch, Active, History, Approvals. Full workflow engine UI.
11. **Intelligence** (500+ lines) — 5 tabs: Anomalies, Platform Breakdown, Buy Box Monitor, Automation Controls, DLQ.
12. **Config** (490+ lines) — Per-bot autonomy controls, auto-fulfillment toggle, ad spend limits, credential diagnostics, global safety.
13. **PlatformHealth** (321 lines) — Health check button, E-Commerce + Social results, Webhook listeners.
14. **OrchestratorGraph** (196 lines) — ReactFlow canvas with live nodes, override controls, audit trail.
15. **PromptLab** (151 lines) — Agent selector, variant list, RL auto-evaluator. Wired to trpc.
16. **PluginStore** (154 lines) — Available plugins, installed plugins, install/uninstall/toggle. Wired but DB empty.
17. **SupplierPOs** (155 lines) — PO list with approve/submit/fulfill actions. Wired to trpc.

### ISSUES FOUND — Things to Fix/Build Out

#### A. Brand Consistency Issues
- [ ] Logo URLs still reference "shopbots-logo" CDN path in DashboardLayout.tsx and Landing.tsx
- [ ] localStorage key still "shopbots_onboarded" — should add "beastbots_onboarded" support
- [ ] Onboarding guard checks old keys only

#### B. Empty State Improvements Needed
- [ ] PluginStore shows "No plugins available yet" — need to seed default plugins in DB
- [ ] SupplierPOs has no store selector dropdown (always picks first store)
- [ ] Home page pricing tier buttons all go to /onboarding — no Stripe integration yet

#### C. Missing Features / Thin Areas
- [ ] No "Live Sales Feed" on Command Center — the project brief specifically calls for this
- [ ] No notification bell / real-time alerts in the dashboard header
- [ ] No user profile/settings page (only admin Config exists)
- [ ] ComponentShowcase page exists but isn't in nav — orphaned dev page, should remove route
- [ ] No dark/light theme toggle exposed to users (hardcoded dark)

#### D. UX Polish Gaps
- [ ] Fulfillment tab on Merchant page is thin — just a button and description, no order list
- [ ] Analytics page has no date range picker
- [ ] No search/filter on Activity page beyond agent filter
- [ ] Workflows launch tab has no confirmation dialog before launching
- [ ] No breadcrumbs or back navigation on sub-pages

## PRIORITY BUILDOUT PLAN (Sprint 17)

### HIGH IMPACT — Build These Out
1. **Live Sales Feed** on Command Center — real-time order ticker with animations
2. **Seed Default Plugins** — populate bot_plugins table with 6-8 first-party plugins
3. **Notification Bell** in dashboard header — show recent bot alerts
4. **User Profile Page** — account settings, connected platforms summary, usage stats
5. **SupplierPOs Store Selector** — add working store dropdown
6. **Fulfillment Tab Enhancement** — show order pipeline with status progression
7. **Brand Consistency** — fix logo URLs, localStorage keys

### MEDIUM IMPACT — Polish
8. **Analytics Date Range Picker** — 7d/30d/90d/all filter
9. **Workflow Launch Confirmation** — dialog before launching
10. **Remove ComponentShowcase** from routes (dev-only page)
