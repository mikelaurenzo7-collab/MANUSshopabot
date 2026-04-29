import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, bigint, index, uniqueIndex } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /**
   * Active organization context — used to scope queries when no
   * explicit X-Org-Id header is sent. Backfilled by migration 0020 to
   * the personal org auto-created for each user.
   */
  currentOrgId: int("currentOrgId"),
  /**
   * Server-side onboarding completion. Set by `auth.completeOnboarding`
   * when the user finishes the wizard. Replaces the localStorage
   * flag used previously, which couldn't sync across devices and
   * could be trivially bypassed.
   */
  onboardedAt: timestamp("onboardedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 64 }),
  stripePlan: mysqlEnum("stripePlan", ["starter", "growth", "pro", "scale"]),
  stripeSubscriptionStatus: varchar("stripeSubscriptionStatus", { length: 32 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Organizations — the unit of multi-tenancy.
 *
 * Every user has at least one personal organization (auto-created on
 * signup, or backfilled for existing users). Stores, workflows, and all
 * scoped resources hang off `orgId`. Memberships in `org_members`
 * govern who can access what.
 *
 * The `ownerId` is the user who created the org and has irrevocable
 * super-admin rights. The `plan` mirrors the user's Stripe plan today;
 * per-org billing is a future migration.
 */
export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  /** URL-safe slug, unique. Used in vanity URLs and invitation links. */
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  ownerId: int("ownerId").notNull(),
  /** "personal" for the auto-created single-user org; "team" once a second member joins. */
  kind: mysqlEnum("kind", ["personal", "team"]).default("personal").notNull(),
  plan: mysqlEnum("plan", ["starter", "growth", "pro", "scale"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ownerIdx: index("organizations_owner_id_idx").on(table.ownerId),
}));

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

/**
 * Organization membership — governs which users can access which orgs.
 *
 * Roles:
 *  - `owner`  : full control, billing, can delete org. The org's `ownerId`
 *               always has this role; transfer requires explicit owner action.
 *  - `admin`  : everything except billing + delete + transfer ownership.
 *  - `member` : read + run-bot access; cannot manage members.
 *
 * `joinedAt` is null for invitations that haven't been accepted yet.
 */
export const orgMembers = mysqlTable("org_members", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
  invitedAt: timestamp("invitedAt").defaultNow().notNull(),
  joinedAt: timestamp("joinedAt"),
  invitedByUserId: int("invitedByUserId"),
}, (table) => ({
  orgUserUnique: uniqueIndex("org_members_org_user_unique").on(table.orgId, table.userId),
  userIdx: index("org_members_user_id_idx").on(table.userId),
  orgIdx: index("org_members_org_id_idx").on(table.orgId),
}));

export type OrgMember = typeof orgMembers.$inferSelect;
export type InsertOrgMember = typeof orgMembers.$inferInsert;

/**
 * Connected e-commerce stores (multi-platform)
 */
export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  /**
   * Owning organization — the unit of access control. Backfilled by
   * migration 0020 from `userId → user's personal org`. Going forward,
   * every store belongs to exactly one org; transfer = update orgId.
   */
  orgId: int("orgId").notNull(),
  /**
   * Creator user. Retained for audit / "who connected this store" UI;
   * NOT used for access control any more — see `orgId`.
   */
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  platform: mysqlEnum("platform", [
    "shopify", "woocommerce", "amazon", "etsy", "ebay", "tiktok_shop", "walmart",
    "depop", "bigcommerce", "square", "faire", "bonanza", "stockx", "reverb",
  ]).default("shopify").notNull(),
  platformDomain: varchar("platformDomain", { length: 255 }),
  platformAccessToken: text("platformAccessToken"),
  platformStoreId: varchar("platformStoreId", { length: 255 }),
  niche: varchar("niche", { length: 255 }),
  status: mysqlEnum("status", ["setup", "active", "paused", "archived"]).default("setup").notNull(),
  /**
   * Lifecycle stage — independent of `status` (which tracks paused/archived).
   *  - `building`: Builder bot is the lead — store is being set up.
   *  - `transitioning`: Builder finished; the handoff celebration has not been
   *    acknowledged. Both Builder + Merchant are visible.
   *  - `operating`: Merchant bot is the lead — store is fulfilling daily.
   *
   * The transition is driven by `markSetupComplete` (manual) or by store
   * signals (first paid order) — see `server/routers/lifecycle.ts`.
   */
  lifecycleStage: mysqlEnum("lifecycleStage", ["building", "transitioning", "operating"]).default("building").notNull(),
  setupCompletedAt: timestamp("setupCompletedAt"),
  firstOrderAt: timestamp("firstOrderAt"),
  handoffAcknowledgedAt: timestamp("handoffAcknowledgedAt"),
  currency: varchar("currency", { length: 10 }).default("USD"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  orgIdIdx: index("stores_org_id_idx").on(table.orgId),
  userIdIdx: index("stores_user_id_idx").on(table.userId),
  platformDomainIdx: index("stores_platform_domain_idx").on(table.platform, table.platformDomain),
  lifecycleStageIdx: index("stores_lifecycle_stage_idx").on(table.lifecycleStage),
}));

export type Store = typeof stores.$inferSelect;
export type InsertStore = typeof stores.$inferInsert;

/**
 * Products managed by the platform
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  price: int("price").default(0).notNull(), // cents
  costPrice: int("costPrice").default(0), // cents
  compareAtPrice: int("compareAtPrice"),
  sku: varchar("sku", { length: 100 }),
  imageUrl: text("imageUrl"),
  category: varchar("category", { length: 255 }),
  supplier: varchar("supplier", { length: 255 }),
  supplierUrl: text("supplierUrl"),
  stockLevel: int("stockLevel").default(0).notNull(),
  lowStockThreshold: int("lowStockThreshold").default(5),
  status: mysqlEnum("status", ["draft", "active", "out_of_stock", "archived"]).default("draft").notNull(),
  platformProductId: varchar("platformProductId", { length: 100 }), // platform-agnostic product ID (was shopifyProductId)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  storeIdIdx: index("products_store_id_idx").on(table.storeId),
  storeStatusIdx: index("products_store_status_idx").on(table.storeId, table.status),
}));

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * Orders / sales tracking
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  platformOrderId: varchar("platformOrderId", { length: 100 }), // platform-agnostic order ID (was shopifyOrderId)
  customerName: varchar("customerName", { length: 255 }),
  customerEmail: varchar("customerEmail", { length: 320 }),
  totalAmount: int("totalAmount").default(0).notNull(), // cents
  currency: varchar("currency", { length: 10 }).default("USD"),
  status: mysqlEnum("status", ["pending", "processing", "fulfilled", "shipped", "delivered", "cancelled", "refunded"]).default("pending").notNull(),
  fulfillmentStatus: mysqlEnum("fulfillmentStatus", ["unfulfilled", "partial", "fulfilled"]).default("unfulfilled").notNull(),
  trackingNumber: varchar("trackingNumber", { length: 255 }),
  trackingUrl: text("trackingUrl"),
  itemCount: int("itemCount").default(1),
  orderData: json("orderData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  storeIdIdx: index("orders_store_id_idx").on(table.storeId),
  storeStatusIdx: index("orders_store_status_idx").on(table.storeId, table.status),
  createdAtIdx: index("orders_created_at_idx").on(table.createdAt),
}));

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * Agent task / activity log
 */
export const agentTasks = mysqlTable("agent_tasks", {
  id: int("id").autoincrement().primaryKey(),
  agentType: mysqlEnum("agentType", ["architect", "merchant", "social"]).notNull(),
  taskType: varchar("taskType", { length: 100 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["running", "completed", "failed", "pending_approval", "approved", "rejected"]).default("running").notNull(),
  result: json("result"),
  storeId: int("storeId"),
  metadata: json("metadata"),
  idempotencyKey: varchar("idempotencyKey", { length: 255 }).unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  storeIdIdx: index("agent_tasks_store_id_idx").on(table.storeId),
  agentTypeIdx: index("agent_tasks_agent_type_idx").on(table.agentType, table.createdAt),
  idempotencyKeyIdx: uniqueIndex("agent_tasks_idempotency_key_idx").on(table.idempotencyKey),
}));

export type AgentTask = typeof agentTasks.$inferSelect;
export type InsertAgentTask = typeof agentTasks.$inferInsert;

/**
 * Approval queue for high-impact decisions
 */
export const approvalQueue = mysqlTable("approval_queue", {
  id: int("id").autoincrement().primaryKey(),
  /** Owning org — backfilled from agentTask.userId → user.currentOrgId in migration 0023. */
  orgId: int("orgId").notNull(),
  agentTaskId: int("agentTaskId").notNull(),
  agentType: mysqlEnum("agentType", ["architect", "merchant", "social"]).notNull(),
  actionType: varchar("actionType", { length: 100 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  impact: mysqlEnum("impact", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  proposedAction: json("proposedAction"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedAt: timestamp("reviewedAt"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("approval_queue_status_idx").on(table.status, table.createdAt),
  orgIdx: index("approval_queue_org_id_idx").on(table.orgId),
}));

export type ApprovalItem = typeof approvalQueue.$inferSelect;
export type InsertApprovalItem = typeof approvalQueue.$inferInsert;

/**
 * Bot configuration / automation rules
 */
export const botConfig = mysqlTable("bot_config", {
  id: int("id").autoincrement().primaryKey(),
  /** Owning org — bot config is per-org, not per-user. Backfilled from user.currentOrgId. */
  orgId: int("orgId").notNull(),
  userId: int("userId").notNull(),
  agentType: mysqlEnum("agentType", ["architect", "merchant", "social"]).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  config: json("config"), // agent-specific settings
  autoApprove: boolean("autoApprove").default(false).notNull(),
  // Default to fully_autonomous for Zero-Touch commerce (CTO directive)
  autonomyLevel: mysqlEnum("autonomyLevel", ["fully_autonomous", "supervised", "manual"]).default("fully_autonomous").notNull(),
  maxBudgetCents: int("maxBudgetCents").default(10000),
  // Granular safety thresholds (Priority 3 fix: persisted, not just UI)
  lowStockThreshold: int("lowStockThreshold").default(5), // units below which low-stock alert fires
  approvalRequired: boolean("approvalRequired").default(false).notNull(), // require human approval for high-impact actions
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userAgentIdx: index("bot_config_user_agent_idx").on(table.userId, table.agentType),
  orgAgentIdx: index("bot_config_org_agent_idx").on(table.orgId, table.agentType),
}));

export type BotConfig = typeof botConfig.$inferSelect;
export type InsertBotConfig = typeof botConfig.$inferInsert;

/**
 * Niche research reports (Architect)
 */
export const nicheReports = mysqlTable("niche_reports", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId"),
  keyword: varchar("keyword", { length: 255 }).notNull(),
  report: json("report"),
  score: int("score"), // 0-100 viability score
  status: mysqlEnum("status", ["generating", "completed", "failed"]).default("generating").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  storeIdIdx: index("niche_reports_store_id_idx").on(table.storeId),
}));

export type NicheReport = typeof nicheReports.$inferSelect;
export type InsertNicheReport = typeof nicheReports.$inferInsert;

/**
 * Ad campaigns (Social Bot)
 */
export const adCampaigns = mysqlTable("ad_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  platform: mysqlEnum("platform", ["tiktok", "meta", "instagram", "twitter", "pinterest", "google_ads", "email", "sms", "gmail"]).default("meta").notNull(),
  adCopy: text("adCopy"),
  imageUrl: text("imageUrl"),
  targetAudience: text("targetAudience"),
  budgetCents: int("budgetCents").default(0),
  spentCents: int("spentCents").default(0),
  impressions: int("impressions").default(0),
  clicks: int("clicks").default(0),
  conversions: int("conversions").default(0),
  status: mysqlEnum("status", ["draft", "active", "paused", "completed"]).default("draft").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  storeIdIdx: index("ad_campaigns_store_id_idx").on(table.storeId),
}));

export type AdCampaign = typeof adCampaigns.$inferSelect;
export type InsertAdCampaign = typeof adCampaigns.$inferInsert;

/**
 * Pricing rules (Merchant)
 */
export const pricingRules = mysqlTable("pricing_rules", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  ruleType: mysqlEnum("ruleType", ["margin_target", "competitor_match", "dynamic", "clearance"]).default("margin_target").notNull(),
  config: json("config"),
  enabled: boolean("enabled").default(true).notNull(),
  productsAffected: int("productsAffected").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  storeIdIdx: index("pricing_rules_store_id_idx").on(table.storeId),
}));

export type PricingRule = typeof pricingRules.$inferSelect;
export type InsertPricingRule = typeof pricingRules.$inferInsert;

/**
 * Platform notifications
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  agentType: mysqlEnum("agentType", ["architect", "merchant", "social", "system"]).notNull(),
  type: mysqlEnum("type", ["info", "warning", "error", "success", "approval_needed"]).default("info").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  message: text("message"),
  isRead: boolean("isRead").default(false).notNull(),
  actionUrl: varchar("actionUrl", { length: 500 }),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userReadIdx: index("notifications_user_id_idx").on(table.userId, table.isRead, table.createdAt),
}));

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * SEO keywords (Social Bot)
 */
export const seoKeywords = mysqlTable("seo_keywords", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  keyword: varchar("keyword", { length: 255 }).notNull(),
  volume: int("volume"),
  difficulty: int("difficulty"),
  relevanceScore: int("relevanceScore"),
  status: mysqlEnum("status", ["suggested", "active", "rejected"]).default("suggested").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  storeIdIdx: index("seo_keywords_store_id_idx").on(table.storeId),
}));

export type SeoKeyword = typeof seoKeywords.$inferSelect;
export type InsertSeoKeyword = typeof seoKeywords.$inferInsert;

/**
 * Social media posts (Social Bot)
 */
export const socialPosts = mysqlTable("social_posts", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  // Expanded enum: google_ads is first-class value
  platform: mysqlEnum("platform", ["tiktok", "instagram", "facebook", "meta", "twitter", "pinterest", "google_ads"]).notNull(),
  content: text("content"),
  imageUrl: text("imageUrl"),
  scheduledAt: timestamp("scheduledAt"),
  publishedAt: timestamp("publishedAt"),
  status: mysqlEnum("status", ["draft", "scheduled", "published", "failed"]).default("draft").notNull(),
  engagement: json("engagement"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  storeIdIdx: index("social_posts_store_id_idx").on(table.storeId),
  scheduledIdx: index("social_posts_scheduled_idx").on(table.status, table.scheduledAt),
}));

export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = typeof socialPosts.$inferInsert;

/**
 * Email campaigns (Social Bot)
 */
export const emailCampaigns = mysqlTable("email_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  recipientCount: int("recipientCount").default(0),
  openRate: int("openRate"), // percentage * 100
  clickRate: int("clickRate"), // percentage * 100
  campaignType: mysqlEnum("campaignType", ["welcome", "abandoned_cart", "promotional", "winback", "newsletter"]).default("promotional").notNull(),
  status: mysqlEnum("status", ["draft", "scheduled", "sent", "failed"]).default("draft").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  storeIdIdx: index("email_campaigns_store_id_idx").on(table.storeId),
}));

export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type InsertEmailCampaign = typeof emailCampaigns.$inferInsert;

/**
 * Daily analytics snapshots
 */
export const analyticsSnapshots = mysqlTable("analytics_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  revenue: int("revenue").default(0), // cents
  orders: int("orders").default(0),
  visitors: int("visitors").default(0),
  conversionRate: int("conversionRate").default(0), // percentage * 100
  avgOrderValue: int("avgOrderValue").default(0), // cents
  topProducts: json("topProducts"),
  trafficSources: json("trafficSources"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  storeDateIdx: index("analytics_snapshots_store_date_idx").on(table.storeId, table.date),
}));

export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type InsertAnalyticsSnapshot = typeof analyticsSnapshots.$inferInsert;

/**
 * Platform credentials — OAuth tokens with refresh lifecycle.
 *
 * Owned by an organization (not a user). When a user is in multiple
 * orgs, switching the active org gives them access ONLY to that org's
 * platform credentials — preventing the leak where Org B sees Org A's
 * Shopify token. Migration 0023 backfills `orgId` from
 * `users.currentOrgId` for existing rows.
 */
export const platformCredentials = mysqlTable("platform_credentials", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  userId: int("userId").notNull(), // creator — retained for audit
  storeId: int("storeId"), // linked store (null for social accounts)
  platform: varchar("platform", { length: 50 }).notNull(), // shopify, woocommerce, amazon, etsy, ebay, tiktok_shop, walmart
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  scopes: text("scopes"), // comma-separated granted scopes
  platformAccountId: varchar("platformAccountId", { length: 255 }), // seller ID, merchant ID, etc.
  platformAccountName: varchar("platformAccountName", { length: 255 }),
  status: mysqlEnum("status", ["active", "expired", "revoked", "error"]).default("active").notNull(),
  lastRefreshedAt: timestamp("lastRefreshedAt"),
  lastHealthCheck: timestamp("lastHealthCheck"),
  metadata: json("metadata"), // platform-specific extra data
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("platform_creds_user_id_idx").on(table.userId),
  userPlatformIdx: index("platform_creds_user_platform_idx").on(table.userId, table.platform),
  orgIdIdx: index("platform_creds_org_id_idx").on(table.orgId),
  orgPlatformIdx: index("platform_creds_org_platform_idx").on(table.orgId, table.platform),
}));

export type PlatformCredential = typeof platformCredentials.$inferSelect;
export type InsertPlatformCredential = typeof platformCredentials.$inferInsert;

/**
 * Social media accounts — linked accounts for the Social Bot agent.
  * Supports Meta/Instagram, TikTok, Twitter/X, Pinterest, Google Ads.
 */
export const socialAccounts = mysqlTable("social_accounts", {
  id: int("id").autoincrement().primaryKey(),
  /** Owning org. See platformCredentials for rationale. */
  orgId: int("orgId").notNull(),
  userId: int("userId").notNull(),
  platform: mysqlEnum("platform", ["meta", "instagram", "tiktok", "twitter", "pinterest", "google_ads", "gmail"]).notNull(),
  accountName: varchar("accountName", { length: 255 }),
  accountId: varchar("accountId", { length: 255 }), // platform-specific account/page ID
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  scopes: text("scopes"),
  profileUrl: text("profileUrl"),
  profileImageUrl: text("profileImageUrl"),
  followerCount: int("followerCount"),
  status: mysqlEnum("status", ["active", "expired", "revoked", "error"]).default("active").notNull(),
  lastRefreshedAt: timestamp("lastRefreshedAt"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("social_accounts_user_id_idx").on(table.userId),
  userPlatformIdx: index("social_accounts_user_platform_idx").on(table.userId, table.platform),
  orgIdIdx: index("social_accounts_org_id_idx").on(table.orgId),
  orgPlatformIdx: index("social_accounts_org_platform_idx").on(table.orgId, table.platform),
}));

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type InsertSocialAccount = typeof socialAccounts.$inferInsert;

/**
 * OAuth state tokens — durable CSRF/PKCE state for OAuth redirects.
 * Keeps callback continuity in the database instead of process memory.
 */
export const oauthStateTokens = mysqlTable("oauth_state_tokens", {
  id: int("id").autoincrement().primaryKey(),
  state: varchar("state", { length: 255 }).notNull().unique(),
  flowType: mysqlEnum("flowType", ["ecommerce", "social", "shopify", "tool"]).notNull(),
  userId: int("userId").notNull(),
  platform: varchar("platform", { length: 50 }).notNull(),
  storeId: int("storeId"),
  origin: text("origin").notNull(),
  returnTo: varchar("returnTo", { length: 255 }),
  codeVerifier: text("codeVerifier"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  expiresIdx: index("oauth_state_tokens_expires_idx").on(table.expiresAt),
  flowPlatformIdx: index("oauth_state_tokens_flow_platform_idx").on(table.flowType, table.platform),
}));

export type OAuthStateToken = typeof oauthStateTokens.$inferSelect;
export type InsertOAuthStateToken = typeof oauthStateTokens.$inferInsert;

/**
 * Bot Events — durable cross-bot coordination messages.
 * Used to hand off opportunities and follow-up actions between agents.
 */
export const botEvents = mysqlTable("bot_events", {
  id: int("id").autoincrement().primaryKey(),
  fromBot: mysqlEnum("fromBot", ["architect", "merchant", "social"]).notNull(),
  toBot: mysqlEnum("toBot", ["architect", "merchant", "social", "all"]).notNull(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  userId: int("userId").notNull(),
  storeId: int("storeId"),
  payload: json("payload").notNull(),
  status: mysqlEnum("status", ["pending", "processed", "ignored", "failed"]).default("pending").notNull(),
  error: text("error"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  statusCreatedIdx: index("bot_events_status_created_idx").on(table.status, table.createdAt),
  routingIdx: index("bot_events_routing_idx").on(table.toBot, table.eventType),
}));

export type BotEvent = typeof botEvents.$inferSelect;
export type InsertBotEvent = typeof botEvents.$inferInsert;

/**
 * Job Queue — durable async execution for external operations.
 * Supports retries, delayed execution, and idempotent dedupe keys.
 */
export const jobQueue = mysqlTable("job_queue", {
  id: int("id").autoincrement().primaryKey(),
  jobType: varchar("jobType", { length: 100 }).notNull(),
  dedupeKey: varchar("dedupeKey", { length: 255 }).unique(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  payload: json("payload").notNull(),
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("maxAttempts").default(3).notNull(),
  runAt: timestamp("runAt").defaultNow().notNull(),
  lastError: text("lastError"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  statusRunAtIdx: index("job_queue_status_run_at_idx").on(table.status, table.runAt),
  typeStatusIdx: index("job_queue_type_status_idx").on(table.jobType, table.status),
}));

export type JobQueueItem = typeof jobQueue.$inferSelect;
export type InsertJobQueueItem = typeof jobQueue.$inferInsert;

/**
 * Agent Workflows — multi-step pipelines executed by agents.
 * Each workflow represents a complete operation (e.g., "niche research", "ad campaign creation").
 * State machine: pending -> running -> awaiting_approval -> completed | failed | cancelled
 */
export const agentWorkflows = mysqlTable("agent_workflows", {
  id: int("id").autoincrement().primaryKey(),
  /** Owning org. Replaces userId as the access-control key after migration 0023. */
  orgId: int("orgId").notNull(),
  userId: int("userId").notNull(),
  agentType: mysqlEnum("agentType", ["architect", "merchant", "social"]).notNull(),
  workflowType: varchar("workflowType", { length: 100 }).notNull(), // e.g. niche_research, product_sourcing, ad_campaign, inventory_sync
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  // Scope: which store(s) this workflow targets
  scope: mysqlEnum("scope", ["specific_store", "all_stores", "global"]).default("global").notNull(),
  storeId: int("storeId"), // null if scope is all_stores or global
  // State machine
  status: mysqlEnum("status", ["pending", "running", "awaiting_approval", "completed", "failed", "cancelled"]).default("pending").notNull(),
  currentStepIndex: int("currentStepIndex").default(0).notNull(),
  totalSteps: int("totalSteps").default(0).notNull(),
  // Input/output
  input: json("input"), // workflow input parameters
  output: json("output"), // final workflow result
  error: text("error"), // error message if failed
  // Timing
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userStatusIdx: index("agent_workflows_user_id_idx").on(table.userId, table.status),
  orgStatusIdx: index("agent_workflows_org_id_idx").on(table.orgId, table.status),
  storeIdIdx: index("agent_workflows_store_id_idx").on(table.storeId),
}));

export type AgentWorkflow = typeof agentWorkflows.$inferSelect;
export type InsertAgentWorkflow = typeof agentWorkflows.$inferInsert;

/**
 * Workflow Steps — individual steps within a workflow pipeline.
 * Each step represents one atomic action (LLM call, API call, image gen, approval gate, etc.)
 */
export const workflowSteps = mysqlTable("workflow_steps", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(),
  stepIndex: int("stepIndex").notNull(), // 0-based order within workflow
  stepType: mysqlEnum("stepType", ["llm_call", "api_call", "image_generation", "data_transform", "approval_gate", "notification", "store_action", "analysis", "parallel_group"]).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  // Execution
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "skipped", "awaiting_approval"]).default("pending").notNull(),
  input: json("input"), // step-specific input (can reference previous step outputs)
  output: json("output"), // step result
  error: text("error"),
  // For approval gates
  requiresApproval: boolean("requiresApproval").default(false).notNull(),
  approvalStatus: mysqlEnum("approvalStatus", ["none", "pending", "approved", "rejected"]).default("none").notNull(),
  approvalNote: text("approvalNote"),
  // Timing
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"), // execution time in milliseconds
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  workflowStepIdx: index("workflow_steps_workflow_id_idx").on(table.workflowId, table.stepIndex),
}));

export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type InsertWorkflowStep = typeof workflowSteps.$inferInsert;

/**
 * Agent Telemetry — logs every agent action and its outcome for Phase 2 ML training.
 * Captures: what the agent did, what input it received, what output it produced,
 * and what the measurable outcome was (e.g., sales velocity change after a price change).
 */
export const agentTelemetry = mysqlTable("agent_telemetry", {
  id: int("id").autoincrement().primaryKey(),
  agentType: mysqlEnum("agentType", ["architect", "merchant", "social"]).notNull(),
  actionType: varchar("actionType", { length: 100 }).notNull(),
  storeId: int("storeId"),
  triggerSource: varchar("triggerSource", { length: 100 }),
  input: json("input"),
  output: json("output"),
  outcomeType: varchar("outcomeType", { length: 100 }),
  outcomeBefore: json("outcomeBefore"),
  outcomeAfter: json("outcomeAfter"),
  outcomeCollectedAt: timestamp("outcomeCollectedAt"),
  llmModel: varchar("llmModel", { length: 100 }),
  llmTokensUsed: int("llmTokensUsed"),
  llmLatencyMs: int("llmLatencyMs"),
  success: boolean("success").default(true).notNull(),
  errorMessage: text("errorMessage"),
  durationMs: int("durationMs"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  agentTypeIdx: index("agent_telemetry_agent_type_idx").on(table.agentType, table.createdAt),
  storeIdIdx: index("agent_telemetry_store_id_idx").on(table.storeId),
}));
export type AgentTelemetry = typeof agentTelemetry.$inferSelect;
export type InsertAgentTelemetry = typeof agentTelemetry.$inferInsert;

// ─── PHASE 1: WORKFLOW PAUSE/OVERRIDE (Node Graph) ───────────────────────────

export const workflowPausePoints = mysqlTable("workflow_pause_points", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(),
  stepId: int("stepId").notNull(),
  pauseReason: varchar("pauseReason", { length: 500 }).notNull(),
  overrideRequired: boolean("overrideRequired").default(true),
  autoResumeConfig: json("autoResumeConfig"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WorkflowPausePoint = typeof workflowPausePoints.$inferSelect;
export type InsertWorkflowPausePoint = typeof workflowPausePoints.$inferInsert;

export const executionOverrides = mysqlTable("execution_overrides", {
  id: int("id").autoincrement().primaryKey(),
  agentTaskId: int("agentTaskId").notNull(),
  overriddenByUserId: int("overriddenByUserId"),
  actionTaken: varchar("actionTaken", { length: 50 }).notNull(),
  reason: varchar("reason", { length: 500 }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});
export type ExecutionOverride = typeof executionOverrides.$inferSelect;
export type InsertExecutionOverride = typeof executionOverrides.$inferInsert;

// ─── PHASE 2: APP STORE / FIRST-PARTY PLUGINS ───────────────────────────────

export const botPlugins = mysqlTable("bot_plugins", {
  id: int("id").autoincrement().primaryKey(),
  pluginName: varchar("pluginName", { length: 150 }).notNull(),
  version: varchar("version", { length: 50 }).notNull(),
  description: text("description"),
  author: varchar("author", { length: 100 }).notNull(),
  category: varchar("category", { length: 50 }).default("utility"),
  iconUrl: varchar("iconUrl", { length: 500 }),
  webhookConfig: json("webhookConfig"),
  eventTypes: json("eventTypes"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BotPlugin = typeof botPlugins.$inferSelect;
export type InsertBotPlugin = typeof botPlugins.$inferInsert;

export const installedPlugins = mysqlTable("installed_plugins", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  pluginId: int("pluginId").notNull(),
  configJson: json("configJson"),
  enabled: boolean("enabled").default(true).notNull(),
  installedAt: timestamp("installedAt").defaultNow().notNull(),
});
export type InstalledPlugin = typeof installedPlugins.$inferSelect;
export type InsertInstalledPlugin = typeof installedPlugins.$inferInsert;

// ─── PHASE 3: SUPPLIER PURCHASE ORDERS ───────────────────────────────────────

export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  supplierId: varchar("supplierId", { length: 150 }),
  poNumber: varchar("poNumber", { length: 150 }).notNull(),
  totalCents: int("totalCents").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

export const poLineItems = mysqlTable("po_line_items", {
  id: int("id").autoincrement().primaryKey(),
  poId: int("poId").notNull(),
  productId: int("productId").notNull(),
  quantity: int("quantity").notNull(),
  unitCostCents: int("unitCostCents").notNull(),
  receivedQty: int("receivedQty").default(0),
});
export type PoLineItem = typeof poLineItems.$inferSelect;
export type InsertPoLineItem = typeof poLineItems.$inferInsert;

// ─── PHASE 4: PROMPT REINFORCEMENT LEARNING ──────────────────────────────────

export const promptVariants = mysqlTable("prompt_variants", {
  id: int("id").autoincrement().primaryKey(),
  agentType: varchar("agentType", { length: 50 }).notNull(),
  taskType: varchar("taskType", { length: 100 }).notNull(),
  variantName: varchar("variantName", { length: 50 }).notNull(),
  promptTemplate: text("promptTemplate").notNull(),
  isActive: boolean("isActive").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PromptVariant = typeof promptVariants.$inferSelect;
export type InsertPromptVariant = typeof promptVariants.$inferInsert;

export const promptMetrics = mysqlTable("prompt_metrics", {
  id: int("id").autoincrement().primaryKey(),
  variantId: int("variantId").notNull(),
  storeId: int("storeId"),
  successRate: int("successRate"),
  invocations: int("invocations").default(0),
  conversions: int("conversions").default(0),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type PromptMetric = typeof promptMetrics.$inferSelect;
export type InsertPromptMetric = typeof promptMetrics.$inferInsert;



// ─── BOT CUSTOMIZATION: MEMORY, INSTRUCTIONS, SCHEDULES, SAFETY ─────────────

/**
 * Bot Profiles — Per-bot configuration with memory, instructions, and safety settings.
 * Each bot (architect, merchant, social) has its own profile per user.
 */
export const botProfiles = mysqlTable("bot_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  agentType: mysqlEnum("agentType", ["architect", "merchant", "social"]).notNull(),
  
  // Identity & Display
  name: varchar("name", { length: 255 }).notNull(), // e.g., "My Builder Bot", "Inventory Manager"
  description: text("description"),
  avatarUrl: text("avatarUrl"),
  
  // Instructions & Behavior
  systemPrompt: text("systemPrompt"), // custom LLM system instructions
  customInstructions: text("customInstructions"), // user-defined behavior guidelines
  personality: varchar("personality", { length: 100 }), // e.g., "professional", "casual", "technical"
  
  // Safety & Autonomy
  autonomyLevel: mysqlEnum("autonomyLevel", ["fully_autonomous", "supervised", "manual"]).default("supervised").notNull(),
  requiresApproval: boolean("requiresApproval").default(false).notNull(),
  approvalThreshold: varchar("approvalThreshold", { length: 100 }), // e.g., "decisions > $500", "all_changes"
  safetyRules: json("safetyRules"), // { maxDailySpend, maxOrderValue, disabledActions: [...] }
  
  // Memory & Context
  memoryEnabled: boolean("memoryEnabled").default(true).notNull(),
  memoryType: mysqlEnum("memoryType", ["short_term", "long_term", "hybrid"]).default("hybrid").notNull(),
  memoryMaxItems: int("memoryMaxItems").default(100), // max stored memory entries
  
  // Status
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userAgentIdx: index("bot_profiles_user_agent_idx").on(table.userId, table.agentType),
}));

export type BotProfile = typeof botProfiles.$inferSelect;
export type InsertBotProfile = typeof botProfiles.$inferInsert;

/**
 * Bot Memory — Persistent context and conversation history for each bot.
 * Stores learned patterns, past decisions, and context for future workflows.
 */
export const botMemory = mysqlTable("bot_memory", {
  id: int("id").autoincrement().primaryKey(),
  botProfileId: int("botProfileId").notNull(),
  userId: int("userId").notNull(),
  
  // Memory Entry
  memoryType: mysqlEnum("memoryType", ["fact", "pattern", "decision", "outcome", "context"]).notNull(),
  key: varchar("key", { length: 255 }).notNull(), // e.g., "best_margin_for_electronics", "customer_pain_point_shipping"
  value: text("value").notNull(), // the actual memory content
  confidence: int("confidence").default(50), // 0-100 confidence score
  
  // Context
  relatedWorkflowId: int("relatedWorkflowId"), // workflow that generated this memory
  relatedStoreId: int("relatedStoreId"),
  tags: json("tags"), // ["pricing", "inventory", "customer_service"]
  
  // Lifecycle
  lastAccessedAt: timestamp("lastAccessedAt"),
  accessCount: int("accessCount").default(0),
  expiresAt: timestamp("expiresAt"), // auto-expire old memories
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  botProfileIdIdx: index("bot_memory_bot_profile_id_idx").on(table.botProfileId),
  memoryTypeIdx: index("bot_memory_type_idx").on(table.memoryType, table.createdAt),
  keyIdx: index("bot_memory_key_idx").on(table.key),
}));

export type BotMemory = typeof botMemory.$inferSelect;
export type InsertBotMemory = typeof botMemory.$inferInsert;

/**
 * Bot Schedules — User-defined recurring tasks and triggers for each bot.
 * Supports cron expressions, intervals, and manual triggers.
 */
export const botSchedules = mysqlTable("bot_schedules", {
  id: int("id").autoincrement().primaryKey(),
  botProfileId: int("botProfileId").notNull(),
  userId: int("userId").notNull(),
  
  // Schedule Definition
  name: varchar("name", { length: 255 }).notNull(), // e.g., "Daily Inventory Check", "Weekly Pricing Review"
  description: text("description"),
  taskType: varchar("taskType", { length: 100 }).notNull(), // e.g., "inventory_check", "price_optimization", "ad_campaign"
  
  // Trigger Type
  triggerType: mysqlEnum("triggerType", ["cron", "interval", "manual", "event"]).default("manual").notNull(),
  cronExpression: varchar("cronExpression", { length: 255 }), // e.g., "0 10 * * *" for daily at 10am
  intervalSeconds: int("intervalSeconds"), // e.g., 86400 for daily
  eventType: varchar("eventType", { length: 100 }), // e.g., "order_received", "inventory_low"
  
  // Execution
  taskInput: json("taskInput"), // workflow input parameters
  targetStoreIds: json("targetStoreIds"), // array of store IDs, or null for all stores
  maxConcurrent: int("maxConcurrent").default(1), // prevent overlapping executions
  
  // Status & Metrics
  enabled: boolean("enabled").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  totalRuns: int("totalRuns").default(0),
  successfulRuns: int("successfulRuns").default(0),
  failedRuns: int("failedRuns").default(0),
  lastError: text("lastError"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  botProfileIdIdx: index("bot_schedules_bot_profile_id_idx").on(table.botProfileId),
  enabledIdx: index("bot_schedules_enabled_idx").on(table.enabled, table.nextRunAt),
}));

export type BotSchedule = typeof botSchedules.$inferSelect;
export type InsertBotSchedule = typeof botSchedules.$inferInsert;

/**
 * Bot Safety Rules — Detailed safety constraints and approval requirements.
 * Enforced during workflow execution to prevent harmful actions.
 */
export const botSafetyRules = mysqlTable("bot_safety_rules", {
  id: int("id").autoincrement().primaryKey(),
  botProfileId: int("botProfileId").notNull(),
  userId: int("userId").notNull(),
  
  // Rule Definition
  name: varchar("name", { length: 255 }).notNull(), // e.g., "Max Daily Spend", "Price Floor"
  description: text("description"),
  ruleType: mysqlEnum("ruleType", ["spending_limit", "price_limit", "action_restriction", "approval_required", "rate_limit"]).notNull(),
  
  // Rule Parameters
  condition: json("condition"), // { field: "dailySpend", operator: "<=", value: 500 }
  action: mysqlEnum("action", ["block", "warn", "approve_required", "log"]).default("warn").notNull(),
  
  // Scope
  appliesToWorkflows: json("appliesToWorkflows"), // array of workflow types, or null for all
  appliesToStores: json("appliesToStores"), // array of store IDs, or null for all
  
  // Status
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  botProfileIdIdx: index("bot_safety_rules_bot_profile_id_idx").on(table.botProfileId),
}));

export type BotSafetyRule = typeof botSafetyRules.$inferSelect;
export type InsertBotSafetyRule = typeof botSafetyRules.$inferInsert;

/**
 * Bot Execution Logs — Audit trail of all bot actions with memory/instruction context.
 * Helps track bot behavior and debug issues.
 */
export const botExecutionLogs = mysqlTable("bot_execution_logs", {
  id: int("id").autoincrement().primaryKey(),
  botProfileId: int("botProfileId").notNull(),
  workflowId: int("workflowId"),
  userId: int("userId").notNull(),
  
  // Execution Context
  actionType: varchar("actionType", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "blocked"]).default("pending").notNull(),
  
  // Input & Output
  input: json("input"),
  output: json("output"),
  error: text("error"),
  
  // Memory & Instructions Applied
  memoryUsed: json("memoryUsed"), // memory entries that influenced this action
  instructionsApplied: text("instructionsApplied"), // which custom instructions were active
  safetyRulesApplied: json("safetyRulesApplied"), // which safety rules were checked
  
  // Metrics
  durationMs: int("durationMs"),
  tokensUsed: int("tokensUsed"),
  costCents: int("costCents"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  botProfileIdIdx: index("bot_execution_logs_bot_profile_id_idx").on(table.botProfileId),
  workflowIdIdx: index("bot_execution_logs_workflow_id_idx").on(table.workflowId),
}));

export type BotExecutionLog = typeof botExecutionLogs.$inferSelect;
export type InsertBotExecutionLog = typeof botExecutionLogs.$inferInsert;

/**
 * Webhook event log — stores the last N processed webhook events per store
 * for real-time visibility in the Platform Health dashboard.
 */
export const webhookEvents = mysqlTable("webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  storeId: int("storeId"),
  platform: varchar("platform", { length: 64 }).notNull(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["received", "processed", "failed", "skipped"]).default("received").notNull(),
  payload: json("payload"),
  errorMessage: text("errorMessage"),
  processingMs: int("processingMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("webhook_events_user_id_idx").on(table.userId),
  storeIdIdx: index("webhook_events_store_id_idx").on(table.storeId),
  createdAtIdx: index("webhook_events_created_at_idx").on(table.createdAt),
}));

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;

/**
 * Email delivery events — populated by the SendGrid Event Webhook.
 *
 * Every send fans out into a stream of events: `processed` and
 * `delivered` (success), `open` and `click` (engagement), `bounce` /
 * `dropped` / `deferred` / `spamreport` / `unsubscribe` (problems).
 * One row per event so we can replay history and compute per-campaign
 * funnels in the analytics layer.
 *
 * `providerMessageId` matches `DeliveryResult.providerMessageId` returned
 * by `delivery.sendEmail` so we can join back to the campaign that
 * originated the send.
 */
export const emailDeliveryEvents = mysqlTable("email_delivery_events", {
  id: int("id").autoincrement().primaryKey(),
  /** SendGrid message id (X-Message-Id from the send response). */
  providerMessageId: varchar("providerMessageId", { length: 255 }).notNull(),
  /** SendGrid sg_event_id — useful for dedupe; webhook can replay. */
  eventId: varchar("eventId", { length: 128 }),
  /** "processed" | "delivered" | "open" | "click" | "bounce" | "dropped" | "deferred" | "spamreport" | "unsubscribe" */
  eventType: varchar("eventType", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }),
  /** Which campaign id this send originated from, if any. */
  campaignId: int("campaignId"),
  /** Categories sent on the original message — useful for filtering. */
  categories: json("categories"),
  /** Optional URL on click events. */
  url: text("url"),
  /** Bounce reason / dropped reason / etc. */
  reason: text("reason"),
  /** Provider event timestamp (epoch seconds → JS Date). */
  occurredAt: timestamp("occurredAt").notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, (table) => ({
  providerMessageIdx: index("email_delivery_events_provider_msg_idx").on(table.providerMessageId),
  campaignIdx: index("email_delivery_events_campaign_idx").on(table.campaignId),
  eventTypeIdx: index("email_delivery_events_event_type_idx").on(table.eventType),
  eventIdUnique: uniqueIndex("email_delivery_events_event_id_unique").on(table.eventId),
}));

export type EmailDeliveryEvent = typeof emailDeliveryEvents.$inferSelect;
export type InsertEmailDeliveryEvent = typeof emailDeliveryEvents.$inferInsert;

/**
 * Organization invitations — pending invites sent by email.
 *
 * Lifecycle:
 *  1. owner/admin calls `orgs.inviteByEmail({ email, role })`
 *  2. Row is created with a random token + expiresAt (default 7 days).
 *  3. SendGrid (or whatever delivery layer picks) emails the invitee
 *     a link: `<origin>/invite/<token>`.
 *  4. Invitee opens the link, signs in if needed, clicks Accept.
 *  5. `orgs.acceptInvite({ token })` validates expiry, looks up the
 *     row, adds an `org_members` row, marks `acceptedAt`, and switches
 *     the user's active org to the new one.
 *
 * Tokens are single-use: rows with `acceptedAt` set are no longer valid.
 * Re-inviting the same email simply creates a new row.
 */
export const orgInvitations = mysqlTable("org_invitations", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  /** URL-safe random token; opaque to clients, indexed for lookup. */
  token: varchar("token", { length: 64 }).notNull().unique(),
  invitedByUserId: int("invitedByUserId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  acceptedByUserId: int("acceptedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("org_invitations_org_id_idx").on(table.orgId),
  emailIdx: index("org_invitations_email_idx").on(table.email),
}));

export type OrgInvitation = typeof orgInvitations.$inferSelect;
export type InsertOrgInvitation = typeof orgInvitations.$inferInsert;
