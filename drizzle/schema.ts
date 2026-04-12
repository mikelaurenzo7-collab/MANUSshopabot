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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Connected e-commerce stores (multi-platform)
 */
export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  platform: mysqlEnum("platform", ["shopify", "woocommerce", "amazon", "etsy", "ebay", "tiktok_shop", "walmart"]).default("shopify").notNull(),
  platformDomain: varchar("platformDomain", { length: 255 }),
  platformAccessToken: text("platformAccessToken"),
  platformStoreId: varchar("platformStoreId", { length: 255 }),
  niche: varchar("niche", { length: 255 }),
  status: mysqlEnum("status", ["setup", "active", "paused", "archived"]).default("setup").notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("stores_user_id_idx").on(table.userId),
  platformDomainIdx: index("stores_platform_domain_idx").on(table.platform, table.platformDomain),
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
}));

export type ApprovalItem = typeof approvalQueue.$inferSelect;
export type InsertApprovalItem = typeof approvalQueue.$inferInsert;

/**
 * Bot configuration / automation rules
 */
export const botConfig = mysqlTable("bot_config", {
  id: int("id").autoincrement().primaryKey(),
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
  platform: mysqlEnum("platform", ["tiktok", "meta", "instagram", "twitter", "pinterest", "google_ads", "email", "sms"]).default("meta").notNull(),
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
 * Platform credentials — per-user OAuth tokens with refresh lifecycle.
 * Supports all e-commerce platforms and tracks token health.
 */
export const platformCredentials = mysqlTable("platform_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
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
}));

export type PlatformCredential = typeof platformCredentials.$inferSelect;
export type InsertPlatformCredential = typeof platformCredentials.$inferInsert;

/**
 * Social media accounts — linked accounts for the Social Bot agent.
  * Supports Meta/Instagram, TikTok, Twitter/X, Pinterest, Google Ads.
 */
export const socialAccounts = mysqlTable("social_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  platform: mysqlEnum("platform", ["meta", "instagram", "tiktok", "twitter", "pinterest", "google_ads"]).notNull(),
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
  flowType: mysqlEnum("flowType", ["ecommerce", "social", "shopify"]).notNull(),
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
  stepType: mysqlEnum("stepType", ["llm_call", "api_call", "image_generation", "data_transform", "approval_gate", "notification", "store_action", "analysis"]).notNull(),
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

