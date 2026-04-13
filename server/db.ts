import { eq, desc, and, sql, gte, lte, count, sum, inArray, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  stores, InsertStore,
  products, InsertProduct,
  orders, InsertOrder,
  agentTasks, InsertAgentTask,
  approvalQueue, InsertApprovalItem,
  botConfig, InsertBotConfig,
  notifications, InsertNotification,
  nicheReports, InsertNicheReport,
  adCampaigns, InsertAdCampaign,
  pricingRules, InsertPricingRule,
  seoKeywords, InsertSeoKeyword,
  socialPosts, InsertSocialPost,
  emailCampaigns, InsertEmailCampaign,
  analyticsSnapshots, InsertAnalyticsSnapshot,
  platformCredentials, InsertPlatformCredential,
  socialAccounts, InsertSocialAccount,
  oauthStateTokens, InsertOAuthStateToken,
  botEvents, InsertBotEvent,
  jobQueue, InsertJobQueueItem,
  agentWorkflows, InsertAgentWorkflow,
  workflowSteps, InsertWorkflowStep,
  agentTelemetry, InsertAgentTelemetry,
  workflowPausePoints, InsertWorkflowPausePoint,
  executionOverrides, InsertExecutionOverride,
  botPlugins, InsertBotPlugin,
  installedPlugins, InsertInstalledPlugin,
  purchaseOrders, InsertPurchaseOrder,
  poLineItems, InsertPoLineItem,
  promptVariants, InsertPromptVariant,
  promptMetrics, InsertPromptMetric,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User helpers ───────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Store helpers ──────────────────────────────────────────────────────────

export async function createStore(data: InsertStore) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(stores).values(data);
  return { id: result[0].insertId };
}

export async function getStoreCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: count() }).from(stores).where(eq(stores.userId, userId));
  return result[0]?.count ?? 0;
}

export async function getStoresByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stores).where(eq(stores.userId, userId)).orderBy(desc(stores.createdAt));
}

export async function getStoreById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  return result[0];
}

export async function updateStore(id: number, data: Partial<InsertStore>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(stores).set(data).where(eq(stores.id, id));
}

// ─── Product helpers ────────────────────────────────────────────────────────

export async function createProduct(data: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(products).values(data);
  return { id: result[0].insertId };
}

export async function getProductsByStore(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products).where(eq(products.storeId, storeId)).orderBy(desc(products.createdAt));
}

/**
 * Batch helper: get low-stock product counts for multiple stores in a single query.
 * Returns a map of storeId -> lowStockCount.
 */
export async function getLowStockCountsByStores(storeIds: number[]): Promise<Record<number, number>> {
  if (storeIds.length === 0) return {};
  const db = await getDb();
  if (!db) return {};
  const result = await db.select({
    storeId: products.storeId,
    lowStockCount: count(),
  })
    .from(products)
    .where(
      and(
        inArray(products.storeId, storeIds),
        sql`${products.stockLevel} <= ${products.lowStockThreshold}`,
        isNotNull(products.stockLevel),
        isNotNull(products.lowStockThreshold),
      )
    )
    .groupBy(products.storeId);
  const map: Record<number, number> = {};
  for (const row of result) {
    map[row.storeId] = row.lowStockCount;
  }
  return map;
}

export async function updateProduct(id: number, data: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function getLowStockProducts(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products)
    .where(and(eq(products.storeId, storeId), sql`${products.stockLevel} <= ${products.lowStockThreshold}`))
    .orderBy(products.stockLevel);
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0];
}

// ─── Order helpers ──────────────────────────────────────────────────────────

export async function createOrder(data: InsertOrder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(orders).values(data);
  return { id: result[0].insertId };
}

export async function getOrdersByStore(storeId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).where(eq(orders.storeId, storeId)).orderBy(desc(orders.createdAt)).limit(limit);
}

export async function getRecentOrders(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit);
}

export async function updateOrder(id: number, data: Partial<InsertOrder>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(orders).set(data).where(eq(orders.id, id));
}

// ─── Agent Task helpers ─────────────────────────────────────────────────────

export async function createAgentTask(data: InsertAgentTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(agentTasks).values(data);
  return { id: result[0].insertId };
}

export async function getAgentTasks(filters?: { agentType?: string; storeId?: number; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(agentTasks);
  const conditions = [];
  if (filters?.agentType) conditions.push(eq(agentTasks.agentType, filters.agentType as any));
  if (filters?.storeId) conditions.push(eq(agentTasks.storeId, filters.storeId));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return (query as any).orderBy(desc(agentTasks.createdAt)).limit(filters?.limit ?? 20).offset(filters?.offset ?? 0);
}

export async function updateAgentTask(id: number, data: Partial<InsertAgentTask>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(agentTasks).set(data).where(eq(agentTasks.id, id));
}

export async function getAgentTaskByIdempotencyKey(idempotencyKey: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(agentTasks).where(eq(agentTasks.idempotencyKey, idempotencyKey)).limit(1);
  return rows[0] ?? null;
}

// ─── Approval Queue helpers ─────────────────────────────────────────────────

export async function createApprovalItem(data: InsertApprovalItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(approvalQueue).values(data);
  return { id: result[0].insertId };
}

export async function getPendingApprovals() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalQueue).where(eq(approvalQueue.status, "pending")).orderBy(desc(approvalQueue.createdAt));
}

export async function getAllApprovals(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalQueue).orderBy(desc(approvalQueue.createdAt)).limit(limit);
}

export async function updateApproval(id: number, data: { status: "approved" | "rejected"; reviewNote?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalQueue).set({ ...data, reviewedAt: new Date() }).where(eq(approvalQueue.id, id));
}

// ─── Bot Config helpers ─────────────────────────────────────────────────────

export async function getBotConfigs(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(botConfig).where(eq(botConfig.userId, userId));
}

export async function upsertBotConfig(data: InsertBotConfig) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(botConfig)
    .where(and(eq(botConfig.userId, data.userId), eq(botConfig.agentType, data.agentType)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(botConfig).set(data).where(eq(botConfig.id, existing[0].id));
    return { id: existing[0].id };
  }
  const result = await db.insert(botConfig).values(data);
  return { id: result[0].insertId };
}

// ─── Notification helpers ───────────────────────────────────────────────────

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(notifications).values(data);
  return { id: result[0].insertId };
}

export async function getNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: count() }).from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return result[0]?.count ?? 0;
}

export async function getNotificationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

// ─── Niche Report helpers ───────────────────────────────────────────────────

export async function createNicheReport(data: InsertNicheReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(nicheReports).values(data);
  return { id: result[0].insertId };
}

export async function getNicheReports(storeId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (storeId) return db.select().from(nicheReports).where(eq(nicheReports.storeId, storeId)).orderBy(desc(nicheReports.createdAt));
  return db.select().from(nicheReports).orderBy(desc(nicheReports.createdAt)).limit(50);
}

export async function updateNicheReport(id: number, data: Partial<InsertNicheReport>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(nicheReports).set(data).where(eq(nicheReports.id, id));
}

// ─── Ad Campaign helpers ────────────────────────────────────────────────────

export async function createAdCampaign(data: InsertAdCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(adCampaigns).values(data);
  return { id: result[0].insertId };
}

export async function getAdCampaigns(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adCampaigns).where(eq(adCampaigns.storeId, storeId)).orderBy(desc(adCampaigns.createdAt));
}

export async function getAdCampaignsByUser(userId: number) {
  const userStores = await getStoresByUser(userId);
  if (userStores.length === 0) return [];
  const storeIds = userStores.map((s: any) => s.id);
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adCampaigns).where(inArray(adCampaigns.storeId, storeIds)).orderBy(desc(adCampaigns.createdAt));
}
export async function updateAdCampaign(id: number, data: Partial<InsertAdCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(adCampaigns).set(data).where(eq(adCampaigns.id, id));
}

// ─── Pricing Rule helpers ───────────────────────────────────────────────────

export async function createPricingRule(data: InsertPricingRule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(pricingRules).values(data);
  return { id: result[0].insertId };
}

export async function getPricingRules(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pricingRules).where(eq(pricingRules.storeId, storeId)).orderBy(desc(pricingRules.createdAt));
}

export async function updatePricingRule(id: number, data: Partial<InsertPricingRule>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(pricingRules).set(data).where(eq(pricingRules.id, id));
}

// ─── SEO Keyword helpers ────────────────────────────────────────────────────

export async function createSeoKeywords(data: InsertSeoKeyword[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return;
  await db.insert(seoKeywords).values(data);
}

export async function getSeoKeywords(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seoKeywords).where(eq(seoKeywords.storeId, storeId)).orderBy(desc(seoKeywords.createdAt));
}

export async function updateSeoKeyword(id: number, data: Partial<InsertSeoKeyword>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(seoKeywords).set(data).where(eq(seoKeywords.id, id));
}

// ─── Social Post helpers ────────────────────────────────────────────────────

export async function createSocialPost(data: InsertSocialPost) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(socialPosts).values(data);
  return { id: result[0].insertId };
}

export async function getSocialPosts(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(socialPosts).where(eq(socialPosts.storeId, storeId)).orderBy(desc(socialPosts.createdAt));
}

export async function updateSocialPost(id: number, data: Partial<InsertSocialPost>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(socialPosts).set(data).where(eq(socialPosts.id, id));
}

// ─── Email Campaign helpers ─────────────────────────────────────────────────

export async function createEmailCampaign(data: InsertEmailCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(emailCampaigns).values(data);
  return { id: result[0].insertId };
}

export async function getEmailCampaigns(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailCampaigns).where(eq(emailCampaigns.storeId, storeId)).orderBy(desc(emailCampaigns.createdAt));
}

export async function updateEmailCampaign(id: number, data: Partial<InsertEmailCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(emailCampaigns).set(data).where(eq(emailCampaigns.id, id));
}

// ─── Analytics helpers ──────────────────────────────────────────────────────

export async function createAnalyticsSnapshot(data: InsertAnalyticsSnapshot) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(analyticsSnapshots).values(data);
}

export async function getAnalyticsSnapshots(storeId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const dateStr = startDate.toISOString().split('T')[0];
  return db.select().from(analyticsSnapshots)
    .where(and(eq(analyticsSnapshots.storeId, storeId), gte(analyticsSnapshots.date, dateStr)))
    .orderBy(analyticsSnapshots.date);
}

// ─── Dashboard aggregate helpers ────────────────────────────────────────────

export async function getDashboardMetrics(storeId?: number) {
  const db = await getDb();
  if (!db) return { totalRevenue: 0, totalOrders: 0, activeProducts: 0, pendingApprovals: 0 };

  const orderConditions = storeId ? [eq(orders.storeId, storeId)] : [];
  const productConditions = storeId ? [eq(products.storeId, storeId), eq(products.status, "active")] : [eq(products.status, "active")];

  const [revenueResult] = await db.select({
    total: sum(orders.totalAmount),
    count: count(),
  }).from(orders).where(orderConditions.length > 0 ? and(...orderConditions) : undefined);

  const [productResult] = await db.select({
    count: count(),
  }).from(products).where(and(...productConditions));

  const [approvalResult] = await db.select({
    count: count(),
  }).from(approvalQueue).where(eq(approvalQueue.status, "pending"));

  return {
    totalRevenue: Number(revenueResult?.total ?? 0),
    totalOrders: revenueResult?.count ?? 0,
    activeProducts: productResult?.count ?? 0,
    pendingApprovals: approvalResult?.count ?? 0,
  };
}

export async function getAgentStatusSummary() {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({
    agentType: agentTasks.agentType,
    total: count(),
    running: sql<number>`SUM(CASE WHEN ${agentTasks.status} = 'running' THEN 1 ELSE 0 END)`,
    completed: sql<number>`SUM(CASE WHEN ${agentTasks.status} = 'completed' THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${agentTasks.status} = 'failed' THEN 1 ELSE 0 END)`,
  }).from(agentTasks).groupBy(agentTasks.agentType);
  return result;
}

// ─── Platform Credential helpers ───────────────────────────────────────────

export async function createPlatformCredential(data: InsertPlatformCredential) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(platformCredentials).values(data);
  return { id: result[0].insertId };
}

export async function getPlatformCredentials(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(platformCredentials).where(eq(platformCredentials.userId, userId)).orderBy(desc(platformCredentials.createdAt));
}

export async function getPlatformCredentialByStore(storeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(platformCredentials).where(eq(platformCredentials.storeId, storeId)).limit(1);
  return result[0];
}

export async function getPlatformCredentialById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(platformCredentials).where(eq(platformCredentials.id, id)).limit(1);
  return result[0];
}

export async function updatePlatformCredential(id: number, data: Partial<InsertPlatformCredential>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(platformCredentials).set(data).where(eq(platformCredentials.id, id));
}

export async function deletePlatformCredential(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(platformCredentials).where(eq(platformCredentials.id, id));
}

export async function getExpiredCredentials() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(platformCredentials)
    .where(and(
      eq(platformCredentials.status, "active"),
      lte(platformCredentials.tokenExpiresAt, new Date())
    ));
}

// ─── Social Account helpers ────────────────────────────────────────────────

export async function createSocialAccount(data: InsertSocialAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(socialAccounts).values(data);
  return { id: result[0].insertId };
}

export async function getSocialAccounts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(socialAccounts).where(eq(socialAccounts.userId, userId)).orderBy(desc(socialAccounts.createdAt));
}

export async function getSocialAccountById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  return result[0];
}

export async function getSocialAccountsByPlatform(userId: number, platform: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.platform, platform as any)));
}

export async function getSocialPostById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(socialPosts).where(eq(socialPosts.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function updateSocialAccount(id: number, data: Partial<InsertSocialAccount>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(socialAccounts).set(data).where(eq(socialAccounts.id, id));
}

export async function deleteSocialAccount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
}

export async function getConnectedPlatformSummary(userId: number) {
  const db = await getDb();
  if (!db) return { stores: 0, credentials: 0, socialAccounts: 0 };
  const [storeCount] = await db.select({ count: count() }).from(stores)
    .where(and(eq(stores.userId, userId), eq(stores.status, "active")));
  const [credCount] = await db.select({ count: count() }).from(platformCredentials)
    .where(and(eq(platformCredentials.userId, userId), eq(platformCredentials.status, "active")));
  const [socialCount] = await db.select({ count: count() }).from(socialAccounts)
    .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.status, "active")));
  return {
    stores: storeCount?.count ?? 0,
    credentials: credCount?.count ?? 0,
    socialAccounts: socialCount?.count ?? 0,
  };
}

// ─── OAuth State helpers ───────────────────────────────────────────────────

export async function createOAuthStateToken(data: InsertOAuthStateToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(oauthStateTokens).values(data);
  return { id: result[0].insertId };
}

export async function getOAuthStateToken(state: string, flowType?: "ecommerce" | "social" | "shopify") {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = [eq(oauthStateTokens.state, state)];
  if (flowType) conditions.push(eq(oauthStateTokens.flowType, flowType));

  const result = await db.select().from(oauthStateTokens)
    .where(and(...conditions))
    .limit(1);
  return result[0] ?? undefined;
}

export async function consumeOAuthStateToken(state: string, flowType?: "ecommerce" | "social" | "shopify") {
  const db = await getDb();
  if (!db) return undefined;

  const now = new Date();
  const conditions = [eq(oauthStateTokens.state, state), gte(oauthStateTokens.expiresAt, now)];
  if (flowType) conditions.push(eq(oauthStateTokens.flowType, flowType));

  const result = await db.select().from(oauthStateTokens)
    .where(and(...conditions))
    .limit(1);

  const token = result[0];
  if (!token) return undefined;

  await db.delete(oauthStateTokens).where(eq(oauthStateTokens.id, token.id));
  return token;
}

export async function deleteExpiredOAuthStateTokens() {
  const db = await getDb();
  if (!db) return;
  await db.delete(oauthStateTokens).where(lte(oauthStateTokens.expiresAt, new Date()));
}

// ─── Bot Event helpers ─────────────────────────────────────────────────────

export async function createBotEvent(data: InsertBotEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(botEvents).values(data);
  return { id: result[0].insertId };
}

export async function getPendingBotEvents(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(botEvents)
    .where(eq(botEvents.status, "pending"))
    .orderBy(botEvents.createdAt)
    .limit(limit);
}

export async function updateBotEvent(id: number, data: Partial<InsertBotEvent>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(botEvents).set(data).where(eq(botEvents.id, id));
}

// ─── Job Queue helpers ─────────────────────────────────────────────────────

export async function createJob(data: InsertJobQueueItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(jobQueue).values(data);
  return { id: result[0].insertId };
}

export async function getJobByDedupeKey(dedupeKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(jobQueue).where(eq(jobQueue.dedupeKey, dedupeKey)).limit(1);
  return result[0] ?? undefined;
}

export async function getRunnableJobs(limit = 25) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobQueue)
    .where(and(eq(jobQueue.status, "pending"), lte(jobQueue.runAt, new Date())))
    .orderBy(jobQueue.runAt)
    .limit(limit);
}

export async function getJobById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(jobQueue).where(eq(jobQueue.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function updateJob(id: number, data: Partial<InsertJobQueueItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(jobQueue).set(data).where(eq(jobQueue.id, id));
}

export async function getJobQueueStats() {
  const db = await getDb();
  if (!db) return { pending: 0, running: 0, completed24h: 0, failed: 0 };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [stats] = await db.select({
    pending: sql<number>`SUM(CASE WHEN ${jobQueue.status} = 'pending' THEN 1 ELSE 0 END)`,
    running: sql<number>`SUM(CASE WHEN ${jobQueue.status} = 'running' THEN 1 ELSE 0 END)`,
    completed24h: sql<number>`SUM(CASE WHEN ${jobQueue.status} = 'completed' AND ${jobQueue.completedAt} >= ${since} THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${jobQueue.status} = 'failed' THEN 1 ELSE 0 END)`,
  }).from(jobQueue);

  return stats ?? { pending: 0, running: 0, completed24h: 0, failed: 0 };
}

export async function getBotEventStats() {
  const db = await getDb();
  if (!db) return { pending: 0, processed24h: 0, failed: 0 };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [stats] = await db.select({
    pending: sql<number>`SUM(CASE WHEN ${botEvents.status} = 'pending' THEN 1 ELSE 0 END)`,
    processed24h: sql<number>`SUM(CASE WHEN ${botEvents.status} = 'processed' AND ${botEvents.processedAt} >= ${since} THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${botEvents.status} = 'failed' THEN 1 ELSE 0 END)`,
  }).from(botEvents);

  return stats ?? { pending: 0, processed24h: 0, failed: 0 };
}

export async function getOAuthStateStats() {
  const db = await getDb();
  if (!db) return { active: 0, expired: 0 };

  const now = new Date();
  const [stats] = await db.select({
    active: sql<number>`SUM(CASE WHEN ${oauthStateTokens.expiresAt} >= ${now} THEN 1 ELSE 0 END)`,
    expired: sql<number>`SUM(CASE WHEN ${oauthStateTokens.expiresAt} < ${now} THEN 1 ELSE 0 END)`,
  }).from(oauthStateTokens);

  return stats ?? { active: 0, expired: 0 };
}

// ─── Agent Workflow helpers ────────────────────────────────────────────────

export async function createWorkflow(data: InsertAgentWorkflow) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(agentWorkflows).values(data);
  return { id: result[0].insertId };
}

export async function getWorkflowById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(agentWorkflows).where(eq(agentWorkflows.id, id)).limit(1);
  return result[0];
}

export async function getWorkflowsByUser(userId: number, filters?: { agentType?: string; status?: string; storeId?: number; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(agentWorkflows.userId, userId)];
  if (filters?.agentType) conditions.push(eq(agentWorkflows.agentType, filters.agentType as any));
  if (filters?.status) conditions.push(eq(agentWorkflows.status, filters.status as any));
  if (filters?.storeId) conditions.push(eq(agentWorkflows.storeId, filters.storeId));
  return db.select().from(agentWorkflows)
    .where(and(...conditions))
    .orderBy(desc(agentWorkflows.createdAt))
    .limit(filters?.limit ?? 20)
    .offset(filters?.offset ?? 0);
}

export async function getActiveWorkflows(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentWorkflows)
    .where(and(
      eq(agentWorkflows.userId, userId),
      sql`${agentWorkflows.status} IN ('pending', 'running', 'awaiting_approval')`
    ))
    .orderBy(desc(agentWorkflows.createdAt));
}

export async function updateWorkflow(id: number, data: Partial<InsertAgentWorkflow>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(agentWorkflows).set(data).where(eq(agentWorkflows.id, id));
}

export async function getWorkflowCounts(userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, running: 0, completed: 0, failed: 0, awaiting: 0 };
  const result = await db.select({
    total: count(),
    running: sql<number>`SUM(CASE WHEN ${agentWorkflows.status} = 'running' THEN 1 ELSE 0 END)`,
    completed: sql<number>`SUM(CASE WHEN ${agentWorkflows.status} = 'completed' THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${agentWorkflows.status} = 'failed' THEN 1 ELSE 0 END)`,
    awaiting: sql<number>`SUM(CASE WHEN ${agentWorkflows.status} = 'awaiting_approval' THEN 1 ELSE 0 END)`,
  }).from(agentWorkflows).where(eq(agentWorkflows.userId, userId));
  return result[0] ?? { total: 0, running: 0, completed: 0, failed: 0, awaiting: 0 };
}

// ─── Workflow Step helpers ─────────────────────────────────────────────────

export async function createWorkflowSteps(data: InsertWorkflowStep[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return;
  await db.insert(workflowSteps).values(data);
}

export async function getWorkflowSteps(workflowId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workflowSteps)
    .where(eq(workflowSteps.workflowId, workflowId))
    .orderBy(workflowSteps.stepIndex);
}

export async function getWorkflowStepById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workflowSteps).where(eq(workflowSteps.id, id)).limit(1);
  return result[0];
}

export async function updateWorkflowStep(id: number, data: Partial<InsertWorkflowStep>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(workflowSteps).set(data).where(eq(workflowSteps.id, id));
}

export async function getPendingApprovalSteps(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Join workflow_steps with agent_workflows to filter by user
  return db.select({
    step: workflowSteps,
    workflow: agentWorkflows,
  }).from(workflowSteps)
    .innerJoin(agentWorkflows, eq(workflowSteps.workflowId, agentWorkflows.id))
    .where(and(
      eq(agentWorkflows.userId, userId),
      eq(workflowSteps.approvalStatus, "pending")
    ))
    .orderBy(desc(workflowSteps.createdAt));
}

// ─── Platform Bridge helpers ────────────────────────────────────────────────

export async function getCredentialsByStoreId(storeId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(platformCredentials)
    .where(eq(platformCredentials.storeId, storeId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getProductByPlatformId(storeId: number, platformProductId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(products)
    .where(and(eq(products.storeId, storeId), eq(products.platformProductId, platformProductId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getOrderById(orderId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Scheduler helpers ──────────────────────────────────────────────────────

export async function getActiveStores() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stores).where(eq(stores.status, "active"));
}

export async function getPendingFulfillmentOrders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders)
    .where(and(
      eq(orders.status, "pending"),
      eq(orders.fulfillmentStatus, "unfulfilled"),
    ))
    .limit(100);
}

export async function getDueScheduledPosts(now: Date) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(socialPosts)
    .where(and(
      eq(socialPosts.status, "scheduled"),
      lte(socialPosts.scheduledAt, now),
    ));
}

// ── Agent Telemetry ──────────────────────────────────────────

export async function logTelemetry(data: InsertAgentTelemetry) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(agentTelemetry).values(data);
  return result.insertId;
}

export async function updateTelemetryOutcome(id: number, outcome: {
  outcomeType: string;
  outcomeBefore: any;
  outcomeAfter: any;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(agentTelemetry)
    .set({
      outcomeType: outcome.outcomeType,
      outcomeBefore: outcome.outcomeBefore,
      outcomeAfter: outcome.outcomeAfter,
      outcomeCollectedAt: new Date(),
    })
    .where(eq(agentTelemetry.id, id));
}

export async function getTelemetryByStore(storeId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentTelemetry)
    .where(eq(agentTelemetry.storeId, storeId))
    .orderBy(desc(agentTelemetry.createdAt))
    .limit(limit);
}

export async function getTelemetryByAgent(agentType: "architect" | "merchant" | "social", limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentTelemetry)
    .where(eq(agentTelemetry.agentType, agentType))
    .orderBy(desc(agentTelemetry.createdAt))
    .limit(limit);
}

export async function getTelemetryStats(storeId?: number) {
  const db = await getDb();
  if (!db) return { total: 0, successful: 0, failed: 0, avgDurationMs: 0 };
  const where = storeId ? eq(agentTelemetry.storeId, storeId) : undefined;
  const [stats] = await db.select({
    total: count(),
    successful: count(sql`CASE WHEN ${agentTelemetry.success} = true THEN 1 END`),
    failed: count(sql`CASE WHEN ${agentTelemetry.success} = false THEN 1 END`),
    avgDurationMs: sql<number>`COALESCE(AVG(${agentTelemetry.durationMs}), 0)`,
  }).from(agentTelemetry).where(where);
  return stats;
}

// ─── PHASE 1: WORKFLOW PAUSE / OVERRIDE HELPERS ──────────────────────────────

export async function createPausePoint(data: InsertWorkflowPausePoint) {
  const db = await getDb();
  if (!db) return;
  const [result] = await db.insert(workflowPausePoints).values(data);
  return result.insertId;
}

export async function getPausePointsByWorkflow(workflowId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workflowPausePoints).where(eq(workflowPausePoints.workflowId, workflowId));
}

export async function deletePausePoint(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(workflowPausePoints).where(eq(workflowPausePoints.id, id));
}

export async function createExecutionOverride(data: InsertExecutionOverride) {
  const db = await getDb();
  if (!db) return;
  const [result] = await db.insert(executionOverrides).values(data);
  return result.insertId;
}

export async function getOverridesByTask(agentTaskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(executionOverrides).where(eq(executionOverrides.agentTaskId, agentTaskId));
}

export async function getRecentOverrides(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(executionOverrides).orderBy(desc(executionOverrides.timestamp)).limit(limit);
}

// ─── PHASE 2: APP STORE / PLUGIN HELPERS ─────────────────────────────────────

export async function listPlugins() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(botPlugins).where(eq(botPlugins.status, "active"));
}

export async function getPluginById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [plugin] = await db.select().from(botPlugins).where(eq(botPlugins.id, id));
  return plugin;
}

export async function createPlugin(data: InsertBotPlugin) {
  const db = await getDb();
  if (!db) return;
  const [result] = await db.insert(botPlugins).values(data);
  return result.insertId;
}

export async function installPlugin(data: InsertInstalledPlugin) {
  const db = await getDb();
  if (!db) return;
  const [result] = await db.insert(installedPlugins).values(data);
  return result.insertId;
}

export async function uninstallPlugin(userId: number, pluginId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(installedPlugins).where(
    and(eq(installedPlugins.userId, userId), eq(installedPlugins.pluginId, pluginId))
  );
}

export async function getInstalledPlugins(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(installedPlugins).where(eq(installedPlugins.userId, userId));
}

export async function togglePlugin(userId: number, pluginId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(installedPlugins)
    .set({ enabled })
    .where(and(eq(installedPlugins.userId, userId), eq(installedPlugins.pluginId, pluginId)));
}

// ─── PHASE 3: PURCHASE ORDER HELPERS ─────────────────────────────────────────

export async function createPurchaseOrder(data: InsertPurchaseOrder) {
  const db = await getDb();
  if (!db) return;
  const [result] = await db.insert(purchaseOrders).values(data);
  return result.insertId;
}

export async function getPurchaseOrdersByStore(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchaseOrders)
    .where(eq(purchaseOrders.storeId, storeId))
    .orderBy(desc(purchaseOrders.createdAt));
}

export async function getPurchaseOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  return po;
}

export async function updatePurchaseOrderStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(purchaseOrders).set({ status, updatedAt: new Date() }).where(eq(purchaseOrders.id, id));
}

export async function createPoLineItem(data: InsertPoLineItem) {
  const db = await getDb();
  if (!db) return;
  const [result] = await db.insert(poLineItems).values(data);
  return result.insertId;
}

export async function getPoLineItems(poId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(poLineItems).where(eq(poLineItems.poId, poId));
}

export async function updatePoLineItemReceived(id: number, receivedQty: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(poLineItems).set({ receivedQty }).where(eq(poLineItems.id, id));
}

// ─── PHASE 4: PROMPT REINFORCEMENT LEARNING HELPERS ──────────────────────────

export async function createPromptVariant(data: InsertPromptVariant) {
  const db = await getDb();
  if (!db) return;
  const [result] = await db.insert(promptVariants).values(data);
  return result.insertId;
}

export async function getActivePromptVariant(agentType: string, taskType: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [variant] = await db.select().from(promptVariants)
    .where(and(
      eq(promptVariants.agentType, agentType),
      eq(promptVariants.taskType, taskType),
      eq(promptVariants.isActive, true),
    ));
  return variant;
}

export async function listPromptVariants(agentType?: string) {
  const db = await getDb();
  if (!db) return [];
  const where = agentType ? eq(promptVariants.agentType, agentType) : undefined;
  return db.select().from(promptVariants).where(where).orderBy(desc(promptVariants.createdAt));
}

export async function promotePromptVariant(variantId: number) {
  const db = await getDb();
  if (!db) return;
  const variant = await db.select().from(promptVariants).where(eq(promptVariants.id, variantId));
  if (!variant[0]) return;
  // Deactivate all siblings for same agent+task
  await db.update(promptVariants)
    .set({ isActive: false })
    .where(and(
      eq(promptVariants.agentType, variant[0].agentType),
      eq(promptVariants.taskType, variant[0].taskType),
    ));
  // Activate the winner
  await db.update(promptVariants).set({ isActive: true }).where(eq(promptVariants.id, variantId));
}

export async function recordPromptInvocation(variantId: number, storeId: number | null, converted: boolean) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(promptMetrics)
    .where(and(
      eq(promptMetrics.variantId, variantId),
      storeId ? eq(promptMetrics.storeId, storeId) : sql`${promptMetrics.storeId} IS NULL`,
    ));
  if (existing[0]) {
    await db.update(promptMetrics).set({
      invocations: (existing[0].invocations ?? 0) + 1,
      conversions: (existing[0].conversions ?? 0) + (converted ? 1 : 0),
      successRate: Math.round(((existing[0].conversions ?? 0) + (converted ? 1 : 0)) / ((existing[0].invocations ?? 0) + 1) * 100),
      updatedAt: new Date(),
    }).where(eq(promptMetrics.id, existing[0].id));
  } else {
    await db.insert(promptMetrics).values({
      variantId,
      storeId,
      invocations: 1,
      conversions: converted ? 1 : 0,
      successRate: converted ? 100 : 0,
    });
  }
}

export async function getPromptMetricsByVariant(variantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(promptMetrics).where(eq(promptMetrics.variantId, variantId));
}

export async function getTopPerformingVariant(agentType: string, taskType: string) {
  const db = await getDb();
  if (!db) return undefined;
  const variants = await db.select().from(promptVariants)
    .where(and(eq(promptVariants.agentType, agentType), eq(promptVariants.taskType, taskType)));
  if (!variants.length) return undefined;
  const variantIds = variants.map(v => v.id);
  const metrics = await db.select().from(promptMetrics)
    .where(inArray(promptMetrics.variantId, variantIds));
  // Aggregate per variant
  const agg: Record<number, { invocations: number; conversions: number }> = {};
  for (const m of metrics) {
    if (!agg[m.variantId]) agg[m.variantId] = { invocations: 0, conversions: 0 };
    agg[m.variantId].invocations += m.invocations ?? 0;
    agg[m.variantId].conversions += m.conversions ?? 0;
  }
  let bestId = variants[0].id;
  let bestRate = -1;
  for (const [vid, data] of Object.entries(agg)) {
    if (data.invocations >= 10) { // min sample size
      const rate = data.conversions / data.invocations;
      if (rate > bestRate) { bestRate = rate; bestId = Number(vid); }
    }
  }
  return variants.find(v => v.id === bestId);
}

// ─── PROMPT RL DYNAMIC INJECTION ──────────────────────────────────────────

/**
 * Dynamically fetches the highest-performing prompt variant for a specific task.
 * Used at execution time by the WorkflowEngine to ensure the agent uses the safest/best logic.
 */
export async function getBestPromptVariant(
  agentType: string,
  taskType: string
) {
  const db = await getDb();
  if (!db) return null;
  const variants = await db.select({
    variant: promptVariants,
    metrics: promptMetrics,
  })
    .from(promptVariants)
    .leftJoin(promptMetrics, eq(promptVariants.id, promptMetrics.variantId))
    .where(
      and(
        eq(promptVariants.agentType, agentType),
        eq(promptVariants.taskType, taskType),
        eq(promptVariants.isActive, true)
      )
    )
    .orderBy(desc(promptMetrics.successRate));
    
  return variants[0]?.variant || null;
}

// ─── Stripe helpers ─────────────────────────────────────────────────────────

export async function updateUserStripe(
  userId: number,
  data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePlan?: "starter" | "growth" | "pro" | "scale";
    stripeSubscriptionStatus?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const set: Record<string, unknown> = {};
  if (data.stripeCustomerId !== undefined) set.stripeCustomerId = data.stripeCustomerId;
  if (data.stripeSubscriptionId !== undefined) set.stripeSubscriptionId = data.stripeSubscriptionId;
  if (data.stripePlan !== undefined) set.stripePlan = data.stripePlan ?? null;
  if (data.stripeSubscriptionStatus !== undefined) set.stripeSubscriptionStatus = data.stripeSubscriptionStatus;
  if (Object.keys(set).length === 0) return;
  await db.update(users).set(set).where(eq(users.id, userId));
}

export async function getUserByStripeCustomerId(customerId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
  return result[0] ?? undefined;
}

export async function getUserByStripeSubscriptionId(subscriptionId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.stripeSubscriptionId, subscriptionId)).limit(1);
  return result[0] ?? undefined;
}
