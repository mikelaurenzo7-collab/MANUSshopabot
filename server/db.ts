import { eq, desc, and, sql, gte, lte, count, sum } from "drizzle-orm";
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
  agentWorkflows, InsertAgentWorkflow,
  workflowSteps, InsertWorkflowStep,
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

export async function getAgentTasks(filters?: { agentType?: string; storeId?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(agentTasks);
  const conditions = [];
  if (filters?.agentType) conditions.push(eq(agentTasks.agentType, filters.agentType as any));
  if (filters?.storeId) conditions.push(eq(agentTasks.storeId, filters.storeId));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return (query as any).orderBy(desc(agentTasks.createdAt)).limit(filters?.limit ?? 100);
}

export async function updateAgentTask(id: number, data: Partial<InsertAgentTask>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(agentTasks).set(data).where(eq(agentTasks.id, id));
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

export async function getWorkflowsByUser(userId: number, filters?: { agentType?: string; status?: string; storeId?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(agentWorkflows.userId, userId)];
  if (filters?.agentType) conditions.push(eq(agentWorkflows.agentType, filters.agentType as any));
  if (filters?.status) conditions.push(eq(agentWorkflows.status, filters.status as any));
  if (filters?.storeId) conditions.push(eq(agentWorkflows.storeId, filters.storeId));
  return db.select().from(agentWorkflows)
    .where(and(...conditions))
    .orderBy(desc(agentWorkflows.createdAt))
    .limit(filters?.limit ?? 50);
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
    .where(and(eq(products.storeId, storeId), eq(products.shopifyProductId, platformProductId)))
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
