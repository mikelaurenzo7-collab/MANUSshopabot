import { eq, desc, and, sql, gte, lte, count, sum, inArray, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { logger } from "./utils/logger";
import { insertWithSlugRetry, isMysqlDuplicateKeyError, toSlug } from "./utils/slug";
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
  botProfiles, InsertBotProfile,
  botMemory, InsertBotMemory,
  botSchedules, InsertBotSchedule,
  botSafetyRules, InsertBotSafetyRule,
  botExecutionLogs, InsertBotExecutionLog,
  webhookEvents, InsertWebhookEvent,
  organizations, InsertOrganization, Organization,
  orgMembers, InsertOrgMember, OrgMember,
  emailDeliveryEvents, InsertEmailDeliveryEvent,
  orgInvitations, InsertOrgInvitation, OrgInvitation,
  workflowDrafts, InsertWorkflowDraft, WorkflowDraft,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { decryptSecret, encryptSecret } from "./_core/secrets";

let _db: ReturnType<typeof drizzle> | null = null;
type DbExecutor = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });
    } catch (error) {
      logger.warn("db_connect_failed", {
        module: "db",
        error: error instanceof Error ? error.message : String(error),
      });
      _db = null;
    }
  }
  return _db;
}

async function requireDb(): Promise<DbExecutor> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db as DbExecutor;
}

export async function withTransaction<T>(callback: (tx: DbExecutor) => Promise<T>): Promise<T> {
  const db = await requireDb();
  return db.transaction(async (tx) => callback(tx as unknown as DbExecutor));
}

function encryptStoreTokens<T extends { platformAccessToken?: string | null }>(record: T): T {
  if (!("platformAccessToken" in record)) return record;
  return {
    ...record,
    platformAccessToken: encryptSecret(record.platformAccessToken) ?? null,
  };
}

function decryptStoreTokens<T extends { platformAccessToken?: string | null }>(record: T | undefined): T | undefined {
  if (!record) return record;
  return {
    ...record,
    platformAccessToken: decryptSecret(record.platformAccessToken) ?? null,
  };
}

function encryptCredentialTokens<T extends { accessToken?: string | null; refreshToken?: string | null }>(record: T): T {
  return {
    ...record,
    accessToken: encryptSecret(record.accessToken) ?? null,
    refreshToken: encryptSecret(record.refreshToken) ?? null,
  };
}

function decryptCredentialTokens<T extends { accessToken?: string | null; refreshToken?: string | null }>(record: T | undefined): T | undefined {
  if (!record) return record;
  return {
    ...record,
    accessToken: decryptSecret(record.accessToken) ?? null,
    refreshToken: decryptSecret(record.refreshToken) ?? null,
  };
}

// ─── User helpers ───────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    logger.warn("db_upsert_user_unavailable", { module: "db" });
    return;
  }
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
    // First-signup trial seeding. The workflow-launch gate accepts
    // either "trialing" or "active" — without a seed value here, every
    // brand-new user hits the paywall before they ever see a bot run,
    // which contradicts the FAQ promise of a 7-day free trial. The
    // value lives in `values` (insert path) but is intentionally
    // omitted from `updateSet` so re-signup doesn't downgrade an
    // already-active or already-cancelled subscription.
    if (user.stripeSubscriptionStatus !== undefined) {
      values.stripeSubscriptionStatus = user.stripeSubscriptionStatus;
      updateSet.stripeSubscriptionStatus = user.stripeSubscriptionStatus;
    } else {
      values.stripeSubscriptionStatus = "trialing";
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    logger.error("db_upsert_user_failed", {
      module: "db",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Mark a user as having completed the onboarding wizard. Idempotent —
 * re-calls overwrite the timestamp, which is fine because we only care
 * about presence/absence in the OnboardingGuard.
 */
export async function markUserOnboarded(userId: number): Promise<void> {
  const db = await requireDb();
  await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Generic user-row update helper used by `auth.logoutEverywhere`
 * to bump `tokensInvalidBefore`. Kept narrow on purpose — most
 * callers should use a dedicated helper (markUserOnboarded,
 * updateUserStripe, setCurrentOrgForUser) so the call sites are
 * easy to audit. This is the escape hatch.
 */
export async function updateUser(
  userId: number,
  patch: Partial<{
    tokensInvalidBefore: Date | null;
  }>,
): Promise<void> {
  const db = await requireDb();
  await db.update(users).set(patch).where(eq(users.id, userId));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Organization helpers ───────────────────────────────────────────────────

/**
 * Create an organization and add the owner as a member.
 *
 * Slug strategy: insert-on-conflict-retry with a crypto-random suffix.
 * The unique index on `organizations.slug` is the source of truth for
 * collisions — a SELECT-then-INSERT check would race against concurrent
 * creates of orgs with the same base name. See `utils/slug.ts` for the
 * generic helper + tests.
 */
export async function createOrganization(
  data: { name: string; ownerId: number; kind?: "personal" | "team"; plan?: Organization["plan"] },
): Promise<Organization> {
  const db = await requireDb();
  const baseSlug = toSlug(data.name || `user-${data.ownerId}`, `user-${data.ownerId}`);

  const { slug, result: orgId } = await insertWithSlugRetry(
    async (candidate) => {
      const insert = await db.insert(organizations).values({
        name: data.name,
        slug: candidate,
        ownerId: data.ownerId,
        kind: data.kind ?? "personal",
        plan: data.plan ?? null,
      } as InsertOrganization);
      return insert[0].insertId;
    },
    isMysqlDuplicateKeyError,
    { baseSlug },
  );
  void slug; // emitted via the org row below

  await db.insert(orgMembers).values({
    orgId,
    userId: data.ownerId,
    role: "owner",
    joinedAt: new Date(),
  } as InsertOrgMember);

  const created = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return created[0]!;
}

/** Get all organizations the user is a member of, with their role. */
export async function getOrgsForUser(userId: number): Promise<Array<Organization & { role: OrgMember["role"] }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      org: organizations,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .orderBy(desc(organizations.createdAt));
  return rows.map((r) => ({ ...r.org, role: r.role }));
}

/** Get a specific org by id, or undefined. */
export async function getOrgById(id: number): Promise<Organization | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return rows[0];
}

/**
 * Look up the membership row for (orgId, userId). Returns the role + joinedAt
 * status, or undefined if the user is not a member.
 */
export async function getOrgMembership(
  orgId: number,
  userId: number,
): Promise<OrgMember | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);
  return rows[0];
}

/**
 * Ensure a personal org exists for the user; create one if not. Used at
 * authentication time for users who predate the multi-tenancy migration
 * or were created before the migration ran. Idempotent.
 */
export async function ensurePersonalOrg(userId: number): Promise<Organization> {
  const db = await requireDb();
  const existing = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.ownerId, userId), eq(organizations.kind, "personal")))
    .limit(1);
  if (existing[0]) return existing[0];

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const userName = userRows[0]?.name?.trim() || `User ${userId}`;
  return createOrganization({ name: userName, ownerId: userId, kind: "personal" });
}

/**
 * Set the user's "active" org. Caller must have already verified
 * membership — this function does NOT re-check.
 */
export async function setCurrentOrgForUser(userId: number, orgId: number): Promise<void> {
  const db = await requireDb();
  await db.update(users).set({ currentOrgId: orgId }).where(eq(users.id, userId));
}

/**
 * Add a user to an org with the given role. Idempotent: if a row already
 * exists, the role is updated and joinedAt is preserved.
 */
export async function addOrgMember(data: {
  orgId: number;
  userId: number;
  role: OrgMember["role"];
  invitedByUserId?: number;
}): Promise<void> {
  const db = await requireDb();
  await db
    .insert(orgMembers)
    .values({
      orgId: data.orgId,
      userId: data.userId,
      role: data.role,
      invitedAt: new Date(),
      joinedAt: new Date(),
      invitedByUserId: data.invitedByUserId ?? null,
    } as InsertOrgMember)
    .onDuplicateKeyUpdate({ set: { role: data.role } });
}

/** Get all members of an org, joined to the user table. */
export async function getOrgMembers(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: orgMembers.id,
      userId: orgMembers.userId,
      role: orgMembers.role,
      invitedAt: orgMembers.invitedAt,
      joinedAt: orgMembers.joinedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(desc(orgMembers.joinedAt));
}

// ─── Store helpers ──────────────────────────────────────────────────────────

export async function createStore(data: InsertStore, executor?: DbExecutor) {
  const db = executor ?? await requireDb();
  const result = await db.insert(stores).values(encryptStoreTokens(data));
  return { id: result[0].insertId };
}

export async function getStoreCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: count() }).from(stores).where(eq(stores.userId, userId));
  return result[0]?.count ?? 0;
}

/**
 * Number of stores connected to an org. Used by `stores.create` to
 * enforce per-plan caps (Starter 1 / Growth 3 / Pro 10 / Scale ∞).
 */
export async function getStoreCountForOrg(orgId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: count() }).from(stores).where(eq(stores.orgId, orgId));
  return Number(result[0]?.count ?? 0);
}

/**
 * @deprecated Spans every org the user belongs to — a cross-tenant leak
 * in any tenant-facing code path. Use `getStoresByOrg(ctx.org.id)`
 * instead. Retained only for legacy single-user/global flows
 * (e.g. operator dashboards, scheduler tasks that haven't been
 * migrated to per-org execution yet).
 */
export async function getStoresByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(stores).where(eq(stores.userId, userId)).orderBy(desc(stores.createdAt));
  return results.map(store => decryptStoreTokens(store)!);
}

/**
 * Canonical store-list query — scoped to an organization. Replaces
 * `getStoresByUser` for any code that has gone through the org context
 * middleware. The latter is retained for legacy single-user paths only.
 */
export async function getStoresByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(stores).where(eq(stores.orgId, orgId)).orderBy(desc(stores.createdAt));
  return results.map(store => decryptStoreTokens(store)!);
}

/**
 * Sum the active+draft product count across every store in an org.
 * Used by the workflow recommender to classify the org's lifecycle
 * stage (fresh / launching / operating / scaling) without dragging
 * the full product list into memory. Drafts count — they signal
 * intent to launch, which still maps to the "launching" stage.
 */
export async function getProductCountForOrg(orgId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const orgStores = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.orgId, orgId));
  if (orgStores.length === 0) return 0;
  const ids = orgStores.map((s) => s.id);
  const result = await db
    .select({ c: count() })
    .from(products)
    .where(inArray(products.storeId, ids));
  return Number(result[0]?.c ?? 0);
}

export async function getStoreById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  return decryptStoreTokens(result[0]);
}

export async function updateStore(id: number, data: Partial<InsertStore>, executor?: DbExecutor) {
  const db = executor ?? await requireDb();
  await db.update(stores).set(encryptStoreTokens(data)).where(eq(stores.id, id));
}

// ─── Product helpers ────────────────────────────────────────────────────────

export async function createProduct(data: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(products).values(data);
  return { id: result[0].insertId };
}

/**
 * Bulk-insert products in a single SQL round-trip. Used by the platform
 * bridge's product sync — replaces the previous "loop calling
 * createProduct()" pattern that fired one INSERT per product (so a
 * 250-item Shopify sync was 250 round-trips). One insert per platform
 * sweep is now the norm. Returns the count of rows inserted.
 *
 * Drizzle's mysql `insert(...).values([...])` produces a single
 * multi-row INSERT statement; the affected-rows count comes back in
 * `result[0].affectedRows`.
 */
export async function bulkInsertProducts(rows: InsertProduct[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(products).values(rows);
  return Number(result[0]?.affectedRows ?? rows.length);
}

export async function getProductsByStore(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products).where(eq(products.storeId, storeId)).orderBy(desc(products.createdAt));
}

/**
 * Bulk-lookup products by their platform IDs for a single store. The
 * platform bridge uses this to batch the "is this remote product
 * already in our DB?" check that previously fired one SELECT per
 * incoming product. Returns a Map keyed by platformProductId so the
 * caller can branch on existing-vs-new in O(1) per row.
 */
export async function getProductsByPlatformIds(
  storeId: number,
  platformProductIds: string[],
): Promise<Map<string, typeof products.$inferSelect>> {
  const map = new Map<string, typeof products.$inferSelect>();
  if (platformProductIds.length === 0) return map;
  const db = await getDb();
  if (!db) return map;
  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.storeId, storeId),
        inArray(products.platformProductId, platformProductIds),
      ),
    );
  for (const row of rows) {
    if (row.platformProductId) map.set(row.platformProductId, row);
  }
  return map;
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

/**
 * Time-window order fetch — used by velocity-based analyses.
 * Returns orders whose createdAt falls inside the lookback window.
 * Hard-capped at 5000 rows to bound memory + LLM input size.
 */
export async function getOrdersByStoreSince(storeId: number, sinceDate: Date, hardCap = 5000) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.storeId, storeId), gte(orders.createdAt, sinceDate)))
    .orderBy(desc(orders.createdAt))
    .limit(hardCap);
}

/**
 * Aggregate `open` event counts grouped by day-of-week (0–6, Sunday=0)
 * and hour (0–23). Used by the Send-Time Optimizer workflow. Returns
 * a flat array `{ dow, hour, count }` so callers can fold into a 2D
 * heatmap.
 *
 * Filtered by org via the campaignId → storeId.orgId join — only
 * events whose originating campaign belongs to an org-scoped store
 * surface here. Capped at the SQL level: GROUP BY produces ≤ 168
 * rows (7 × 24), so no LIMIT needed.
 */
export async function getOpenHeatmapByOrg(orgId: number, sinceDate: Date) {
  const db = await getDb();
  if (!db) return [] as Array<{ dow: number; hour: number; count: number }>;
  // MySQL DAYOFWEEK returns 1–7 (Sunday=1); we shift to 0–6 so the
  // result aligns with JS Date.getDay() conventions.
  const dowExpr = sql<number>`DAYOFWEEK(${emailDeliveryEvents.occurredAt}) - 1`;
  const hourExpr = sql<number>`HOUR(${emailDeliveryEvents.occurredAt})`;
  const rows = await db
    .select({
      dow: dowExpr,
      hour: hourExpr,
      count: count(),
    })
    .from(emailDeliveryEvents)
    .innerJoin(emailCampaigns, eq(emailCampaigns.id, emailDeliveryEvents.campaignId))
    .innerJoin(stores, eq(stores.id, emailCampaigns.storeId))
    .where(
      and(
        eq(emailDeliveryEvents.eventType, "open"),
        gte(emailDeliveryEvents.occurredAt, sinceDate),
        eq(stores.orgId, orgId),
      ),
    )
    .groupBy(dowExpr, hourExpr);

  return rows.map((r) => ({
    dow: Number(r.dow),
    hour: Number(r.hour),
    count: Number(r.count),
  }));
}

/**
 * @deprecated Returns orders across the entire platform. Use
 * `getRecentOrdersByOrg(ctx.org.id, limit)` from any tenant-facing
 * route. Kept for operator-side admin dashboards.
 */
export async function getRecentOrders(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit);
}

/**
 * Org-scoped recent orders. Joins orders → stores so we only return
 * rows belonging to the active org's stores. Replaces the legacy
 * `getRecentOrders(limit)` global query in tenant-facing routes.
 */
export async function getRecentOrdersByOrg(orgId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ orders })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(eq(stores.orgId, orgId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  return rows.map((r) => r.orders);
}

export async function updateOrder(id: number, data: Partial<InsertOrder>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(orders).set(data).where(eq(orders.id, id));
}

// ─── Agent Task helpers ─────────────────────────────────────────────────────

export async function createAgentTask(data: InsertAgentTask, executor?: DbExecutor) {
  const db = executor ?? await requireDb();
  const result = await db.insert(agentTasks).values(data);
  return { id: result[0].insertId };
}

/**
 * @deprecated Returns agent tasks from every tenant. Use
 * `getAgentTasksByOrg(ctx.org.id, filters)` from any tenant-facing
 * route. Kept for the scheduler's own self-introspection.
 */
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

/**
 * Org-scoped agent tasks. Inner-joins through stores.orgId so only
 * the active org's tasks come back. System-wide tasks (storeId=null)
 * are intentionally excluded — they belong to the operator scheduler,
 * not any tenant.
 */
export async function getAgentTasksByOrg(
  orgId: number,
  filters?: { agentType?: string; storeId?: number; limit?: number; offset?: number },
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(stores.orgId, orgId)];
  if (filters?.agentType) conditions.push(eq(agentTasks.agentType, filters.agentType as any));
  if (filters?.storeId) conditions.push(eq(agentTasks.storeId, filters.storeId));
  const rows = await db
    .select({ agentTasks })
    .from(agentTasks)
    .innerJoin(stores, eq(stores.id, agentTasks.storeId))
    .where(and(...conditions))
    .orderBy(desc(agentTasks.createdAt))
    .limit(filters?.limit ?? 20)
    .offset(filters?.offset ?? 0);
  return rows.map((r) => r.agentTasks);
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

/** Org-scoped — preferred. Returns only approvals visible to the active org. */
export async function getPendingApprovalsByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalQueue)
    .where(and(eq(approvalQueue.status, "pending"), eq(approvalQueue.orgId, orgId)))
    .orderBy(desc(approvalQueue.createdAt));
}

export async function getAllApprovals(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalQueue).orderBy(desc(approvalQueue.createdAt)).limit(limit);
}

/** Org-scoped — preferred. */
export async function getAllApprovalsByOrg(orgId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalQueue)
    .where(eq(approvalQueue.orgId, orgId))
    .orderBy(desc(approvalQueue.createdAt))
    .limit(limit);
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

/** Org-scoped — preferred. Returns the org's bot configs across all members. */
export async function getBotConfigsByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(botConfig).where(eq(botConfig.orgId, orgId));
}

export async function upsertBotConfig(data: InsertBotConfig) {
  return withTransaction(async (tx) => {
    const existing = await tx.select().from(botConfig)
      .where(and(eq(botConfig.userId, data.userId), eq(botConfig.agentType, data.agentType)))
      .limit(1);
    if (existing.length > 0) {
      await tx.update(botConfig).set(data).where(eq(botConfig.id, existing[0].id));
      return { id: existing[0].id };
    }
    const result = await tx.insert(botConfig).values(data);
    return { id: result[0].insertId };
  });
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

/**
 * @deprecated Use `getAdCampaignsByOrg(ctx.org.id)` in any tenant-facing
 * code. This helper joins through `stores.userId`, which spans every
 * org the user belongs to. Retained for legacy scheduler tasks only.
 */
export async function getAdCampaignsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adCampaigns)
    .where(sql`exists (
      select 1
      from ${stores}
      where ${stores.id} = ${adCampaigns.storeId}
        and ${stores.userId} = ${userId}
    )`)
    .orderBy(desc(adCampaigns.createdAt));
}

/** Org-scoped variant — preferred for any caller in a tenant context. */
export async function getAdCampaignsByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adCampaigns)
    .where(sql`exists (
      select 1
      from ${stores}
      where ${stores.id} = ${adCampaigns.storeId}
        and ${stores.orgId} = ${orgId}
    )`)
    .orderBy(desc(adCampaigns.createdAt));
}
export async function getAdCampaignById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1);
  return rows[0];
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

export async function getPricingRuleById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(pricingRules).where(eq(pricingRules.id, id)).limit(1);
  return rows[0] ?? null;
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

export async function getSeoKeywordById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(seoKeywords).where(eq(seoKeywords.id, id)).limit(1);
  return rows[0];
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

export async function getEmailCampaignById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id)).limit(1);
  return rows[0];
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

/**
 * Org-scoped analytics snapshots. Resolves the storeId, verifies it
 * belongs to the org, and returns an empty list if not — preventing
 * cross-tenant snapshot reads via guessed store IDs.
 */
export async function getAnalyticsSnapshotsForOrg(orgId: number, storeId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];
  const [owned] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.id, storeId), eq(stores.orgId, orgId)))
    .limit(1);
  if (!owned) return [];
  return getAnalyticsSnapshots(storeId, days);
}

// ─── Dashboard aggregate helpers ────────────────────────────────────────────

/**
 * Org-scoped dashboard metrics. When `storeId` is provided we still
 * verify it belongs to the org before aggregating; when omitted we
 * sum across all of the org's stores. Replaces `getDashboardMetrics`
 * for tenant-facing routes — the legacy global helper survives only
 * for operator-facing use (admin dashboards aggregating platform-wide).
 */
export async function getDashboardMetricsForOrg(orgId: number, storeId?: number) {
  const db = await getDb();
  if (!db) return { totalRevenue: 0, storeRevenue: 0, totalOrders: 0, activeProducts: 0, pendingApprovals: 0 };

  // Resolve the store ids that belong to this org (and optionally
  // narrow to a specific store the caller asked about).
  const orgStores = await db
    .select({ id: stores.id })
    .from(stores)
    .where(
      storeId
        ? and(eq(stores.orgId, orgId), eq(stores.id, storeId))
        : eq(stores.orgId, orgId),
    );
  const storeIds = orgStores.map((s) => s.id);
  if (storeIds.length === 0) {
    return { totalRevenue: 0, storeRevenue: 0, totalOrders: 0, activeProducts: 0, pendingApprovals: 0 };
  }

  const [revenueResult] = await db
    .select({ total: sum(orders.totalAmount), count: count() })
    .from(orders)
    .where(inArray(orders.storeId, storeIds));

  const [productResult] = await db
    .select({ count: count() })
    .from(products)
    .where(and(inArray(products.storeId, storeIds), eq(products.status, "active")));

  const [approvalResult] = await db
    .select({ count: count() })
    .from(approvalQueue)
    .where(and(eq(approvalQueue.orgId, orgId), eq(approvalQueue.status, "pending")));

  const storeRevenue = Number(revenueResult?.total ?? 0);
  return {
    totalRevenue: storeRevenue,
    storeRevenue,
    totalOrders: revenueResult?.count ?? 0,
    activeProducts: productResult?.count ?? 0,
    pendingApprovals: approvalResult?.count ?? 0,
  };
}

/**
 * @deprecated Aggregates across every store on the platform when
 * `storeId` is omitted. Use `getDashboardMetricsForOrg(ctx.org.id, storeId?)`
 * from any tenant-facing route. Retained for operator/admin metrics.
 */
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

  // Fetch platform revenue (Stripe subscriptions) — only if not filtering by store
  let platformRevenue = 0;
  let activeSubscriptions = 0;
  if (!storeId) {
    const [stripeResult] = await db.select({
      activeCount: count(),
    }).from(users).where(eq(users.stripeSubscriptionStatus, "active"));
    activeSubscriptions = stripeResult?.activeCount ?? 0;
    // Estimate platform revenue: average $250/user/month in cents
    platformRevenue = activeSubscriptions * 25000;
  }

  const storeRevenue = Number(revenueResult?.total ?? 0);
  const totalRevenue = storeRevenue + platformRevenue;

  return {
    totalRevenue,
    storeRevenue,
    platformRevenue,
    totalOrders: revenueResult?.count ?? 0,
    activeProducts: productResult?.count ?? 0,
    pendingApprovals: approvalResult?.count ?? 0,
    activeSubscriptions,
  };
}

/**
 * @deprecated Aggregates agent tasks across every tenant. Use
 * `getAgentStatusSummaryByOrg(ctx.org.id)` from any tenant-facing
 * route. Kept for operator-side dashboards.
 */
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

/**
 * Org-scoped agent status summary. Inner-joins through stores.orgId so
 * the per-bot running/completed/failed counts reflect only the active
 * org's work. Used by the Command Center bot-health KPI.
 */
export async function getAgentStatusSummaryByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      agentType: agentTasks.agentType,
      total: count(),
      running: sql<number>`SUM(CASE WHEN ${agentTasks.status} = 'running' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN ${agentTasks.status} = 'completed' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN ${agentTasks.status} = 'failed' THEN 1 ELSE 0 END)`,
    })
    .from(agentTasks)
    .innerJoin(stores, eq(stores.id, agentTasks.storeId))
    .where(eq(stores.orgId, orgId))
    .groupBy(agentTasks.agentType);
}

// ─── Platform Credential helpers ───────────────────────────────────────────

export async function createPlatformCredential(data: InsertPlatformCredential, executor?: DbExecutor) {
  const db = executor ?? await requireDb();
  const result = await db.insert(platformCredentials).values(encryptCredentialTokens(data));
  return { id: result[0].insertId };
}

/**
 * @deprecated Use `getPlatformCredentialsByOrg(ctx.org.id)` for any
 * caller in a tenant context. Filters by `platformCredentials.userId`
 * and spans every org the user belongs to.
 */
export async function getPlatformCredentials(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(platformCredentials).where(eq(platformCredentials.userId, userId)).orderBy(desc(platformCredentials.createdAt));
  return results.map(credential => decryptCredentialTokens(credential)!);
}

export async function getPlatformCredentialByStore(storeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(platformCredentials).where(eq(platformCredentials.storeId, storeId)).limit(1);
  return decryptCredentialTokens(result[0]);
}

export async function getPlatformCredentialById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(platformCredentials).where(eq(platformCredentials.id, id)).limit(1);
  return decryptCredentialTokens(result[0]);
}

export async function updatePlatformCredential(id: number, data: Partial<InsertPlatformCredential>, executor?: DbExecutor) {
  const db = executor ?? await requireDb();
  await db.update(platformCredentials).set(encryptCredentialTokens(data)).where(eq(platformCredentials.id, id));
}

export async function deletePlatformCredential(id: number, executor?: DbExecutor) {
  const db = executor ?? await requireDb();
  await db.delete(platformCredentials).where(eq(platformCredentials.id, id));
}

export async function getExpiredCredentials() {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(platformCredentials)
    .where(and(
      eq(platformCredentials.status, "active"),
      lte(platformCredentials.tokenExpiresAt, new Date())
    ));
  return results.map(credential => decryptCredentialTokens(credential)!);
}

// ─── Social Account helpers ────────────────────────────────────────────────

export async function createSocialAccount(data: InsertSocialAccount, executor?: DbExecutor) {
  const db = executor ?? await requireDb();
  const result = await db.insert(socialAccounts).values(encryptCredentialTokens(data));
  return { id: result[0].insertId };
}

/**
 * @deprecated Use `getSocialAccountsByOrg(ctx.org.id)` for any caller
 * in a tenant context. This helper filters by `socialAccounts.userId`
 * and spans every org the user belongs to.
 */
export async function getSocialAccounts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(socialAccounts).where(eq(socialAccounts.userId, userId)).orderBy(desc(socialAccounts.createdAt));
  return results.map(account => decryptCredentialTokens(account)!);
}

/** Org-scoped variant — preferred for any caller in a tenant context. */
export async function getSocialAccountsByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(socialAccounts).where(eq(socialAccounts.orgId, orgId)).orderBy(desc(socialAccounts.createdAt));
  return results.map(account => decryptCredentialTokens(account)!);
}

export async function getSocialAccountById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  return decryptCredentialTokens(result[0]);
}

export async function getSocialAccountsByPlatform(userId: number, platform: string) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.platform, platform as any)));
  return results.map(account => decryptCredentialTokens(account)!);
}

/**
 * Org-scoped variant of `getSocialAccountsByPlatform`. Use this from
 * any caller that knows the active org — every credential is scoped to
 * exactly one org, so this is what prevents cross-org leakage when a
 * single user belongs to multiple orgs (e.g., the Gmail account
 * connected in Org A must not be reachable from Org B's send-email
 * flow). The userId-keyed sibling above is preserved for legacy
 * scheduler code that hasn't been migrated yet.
 */
export async function getSocialAccountsByPlatformForOrg(orgId: number, platform: string) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.orgId, orgId), eq(socialAccounts.platform, platform as any)));
  return results.map(account => decryptCredentialTokens(account)!);
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
  await db.update(socialAccounts).set(encryptCredentialTokens(data)).where(eq(socialAccounts.id, id));
}

export async function deleteSocialAccount(id: number, executor?: DbExecutor) {
  const db = executor ?? await requireDb();
  await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
}

/**
 * @deprecated Sums across every org the user belongs to. Use
 * `getConnectedPlatformSummaryByOrg(ctx.org.id)` from any tenant-facing
 * route.
 */
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

/**
 * Org-scoped variant of `getConnectedPlatformSummary`. Counts stores,
 * platform credentials, and social accounts that belong to the active
 * org — not the legacy user-wide aggregate (which spans every org the
 * user is a member of).
 */
export async function getConnectedPlatformSummaryByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return { stores: 0, credentials: 0, socialAccounts: 0 };
  const [storeCount] = await db.select({ count: count() }).from(stores)
    .where(and(eq(stores.orgId, orgId), eq(stores.status, "active")));
  const [credCount] = await db.select({ count: count() }).from(platformCredentials)
    .where(and(eq(platformCredentials.orgId, orgId), eq(platformCredentials.status, "active")));
  const [socialCount] = await db.select({ count: count() }).from(socialAccounts)
    .where(and(eq(socialAccounts.orgId, orgId), eq(socialAccounts.status, "active")));
  return {
    stores: storeCount?.count ?? 0,
    credentials: credCount?.count ?? 0,
    socialAccounts: socialCount?.count ?? 0,
  };
}

/**
 * Org-scoped platform credentials. Used by `connectors.listCredentials`,
 * `tools.connected`, and `health.checkAll` — every callsite that
 * surfaces credentials to a tenant-facing user should use this rather
 * than `getPlatformCredentials(userId)`, which spans every org the
 * user belongs to.
 */
export async function getPlatformCredentialsByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(platformCredentials)
    .where(eq(platformCredentials.orgId, orgId))
    .orderBy(desc(platformCredentials.createdAt));
  return results.map(credential => decryptCredentialTokens(credential)!);
}

// ─── OAuth State helpers ───────────────────────────────────────────────────

export async function createOAuthStateToken(data: InsertOAuthStateToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(oauthStateTokens).values(data);
  return { id: result[0].insertId };
}

export async function getOAuthStateToken(state: string, flowType?: "ecommerce" | "social" | "shopify" | "tool") {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = [eq(oauthStateTokens.state, state)];
  if (flowType) conditions.push(eq(oauthStateTokens.flowType, flowType));

  const result = await db.select().from(oauthStateTokens)
    .where(and(...conditions))
    .limit(1);
  return result[0] ?? undefined;
}

export async function consumeOAuthStateToken(state: string, flowType?: "ecommerce" | "social" | "shopify" | "tool") {
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

  // Use DELETE's affectedRows as the consume race-winner signal. Two
  // concurrent callbacks (user double-clicking the OAuth redirect, or
  // a browser retry) can both see the token in the SELECT above; only
  // one of their DELETEs will affect a row. The losing caller returns
  // undefined so it doesn't proceed to a second vendor code-exchange
  // (which would fail anyway since OAuth codes are single-use, but
  // we shouldn't lean on that vendor invariant for our CSRF guard).
  const deleteResult = await db.delete(oauthStateTokens).where(eq(oauthStateTokens.id, token.id));
  // Drizzle's mysql2 exec result shape: [{ affectedRows, insertId, ... }, fields]
  const affectedRows = (deleteResult as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0;
  if (affectedRows === 0) return undefined;
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

export async function createWorkflow(data: InsertAgentWorkflow, executor?: DbExecutor) {
  const db = executor ?? await requireDb();
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

/** Org-scoped variant — preferred for new callers. */
export async function getWorkflowsByOrg(orgId: number, filters?: { agentType?: string; status?: string; storeId?: number; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(agentWorkflows.orgId, orgId)];
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

export async function getActiveWorkflowsByOrg(orgId: number, storeId?: number) {
  const db = await getDb();
  if (!db) return [];
  // When the caller is inside a per-store workspace, scope to that
  // store so the WorkspaceWorkflows tab only shows what's running in
  // *this* store. Otherwise return every active row in the org (the
  // global /workflows view).
  const conditions = [
    eq(agentWorkflows.orgId, orgId),
    sql`${agentWorkflows.status} IN ('pending', 'running', 'awaiting_approval')`,
  ];
  if (typeof storeId === "number") conditions.push(eq(agentWorkflows.storeId, storeId));
  return db.select().from(agentWorkflows)
    .where(and(...conditions))
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

export async function getWorkflowCountsByOrg(orgId: number, storeId?: number) {
  const db = await getDb();
  if (!db) return { total: 0, running: 0, completed: 0, failed: 0, awaiting: 0 };
  const conditions = [eq(agentWorkflows.orgId, orgId)];
  if (typeof storeId === "number") conditions.push(eq(agentWorkflows.storeId, storeId));
  const result = await db.select({
    total: count(),
    running: sql<number>`SUM(CASE WHEN ${agentWorkflows.status} = 'running' THEN 1 ELSE 0 END)`,
    completed: sql<number>`SUM(CASE WHEN ${agentWorkflows.status} = 'completed' THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${agentWorkflows.status} = 'failed' THEN 1 ELSE 0 END)`,
    awaiting: sql<number>`SUM(CASE WHEN ${agentWorkflows.status} = 'awaiting_approval' THEN 1 ELSE 0 END)`,
  }).from(agentWorkflows).where(and(...conditions));
  return result[0] ?? { total: 0, running: 0, completed: 0, failed: 0, awaiting: 0 };
}

// ─── Workflow Step helpers ─────────────────────────────────────────────────

export async function createWorkflowSteps(data: InsertWorkflowStep[], executor?: DbExecutor) {
  const db = executor ?? await requireDb();
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

export async function getPendingApprovalStepsByOrg(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    step: workflowSteps,
    workflow: agentWorkflows,
  }).from(workflowSteps)
    .innerJoin(agentWorkflows, eq(workflowSteps.workflowId, agentWorkflows.id))
    .where(and(
      eq(agentWorkflows.orgId, orgId),
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
  return decryptCredentialTokens(rows[0]) ?? null;
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
  const results = await db.select().from(stores).where(eq(stores.status, "active"));
  return results.map(store => decryptStoreTokens(store)!);
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
  await withTransaction(async (tx) => {
    const variant = await tx.select().from(promptVariants).where(eq(promptVariants.id, variantId));
    if (!variant[0]) return;
    await tx.update(promptVariants)
      .set({ isActive: false })
      .where(and(
        eq(promptVariants.agentType, variant[0].agentType),
        eq(promptVariants.taskType, variant[0].taskType),
      ));
    await tx.update(promptVariants).set({ isActive: true }).where(eq(promptVariants.id, variantId));
  });
}

export async function recordPromptInvocation(variantId: number, storeId: number | null, converted: boolean) {
  await withTransaction(async (tx) => {
    const existing = await tx.select().from(promptMetrics)
      .where(and(
        eq(promptMetrics.variantId, variantId),
        storeId ? eq(promptMetrics.storeId, storeId) : sql`${promptMetrics.storeId} IS NULL`,
      ));
    if (existing[0]) {
      await tx.update(promptMetrics).set({
        invocations: (existing[0].invocations ?? 0) + 1,
        conversions: (existing[0].conversions ?? 0) + (converted ? 1 : 0),
        successRate: Math.round(((existing[0].conversions ?? 0) + (converted ? 1 : 0)) / ((existing[0].invocations ?? 0) + 1) * 100),
        updatedAt: new Date(),
      }).where(eq(promptMetrics.id, existing[0].id));
      return;
    }
    await tx.insert(promptMetrics).values({
      variantId,
      storeId,
      invocations: 1,
      conversions: converted ? 1 : 0,
      successRate: converted ? 100 : 0,
    });
  });
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


// ─── Bot Profile helpers ────────────────────────────────────────────────────

export async function getBotProfile(userId: number, agentType: "architect" | "merchant" | "social") {
  const db = await getDb();
  if (!db) return null;
  return (db.query as any).botProfiles.findFirst({
    where: (t: any, { and, eq }: any) => and(eq(t.userId, userId), eq(t.agentType, agentType)),
  });
}

export async function upsertBotProfile(data: InsertBotProfile) {
  const db = await getDb();
  if (!db) return null;
  const existing = await (db.query as any).botProfiles.findFirst({
    where: (t: any, { and, eq }: any) => and(eq(t.userId, data.userId!), eq(t.agentType, data.agentType!)),
  });
  if (existing) {
    await db.update(botProfiles).set(data as any).where(eq(botProfiles.id, existing.id));
    return existing.id;
  } else {
    const result = await db.insert(botProfiles).values(data);
    return result[0].insertId;
  }
}

export async function getBotMemory(botProfileId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return (db.query as any).botMemory.findMany({
    where: (t: any, { eq }: any) => eq(t.botProfileId, botProfileId),
    limit,
    orderBy: (t: any, { desc }: any) => desc(t.lastAccessedAt || t.createdAt),
  });
}

export async function addBotMemory(data: InsertBotMemory) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(botMemory).values(data);
  return result[0].insertId;
}

/**
 * Lookup a single memory entry by exact key for one bot profile.
 * Used by the memory tool's `memory_read` handler — exact match,
 * not a substring search. Returns the most recent if duplicates exist
 * (shouldn't happen, but the schema doesn't enforce uniqueness on
 * (botProfileId, key) so callers should treat this as best-effort).
 */
export async function getBotMemoryByKey(botProfileId: number, key: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await (db.query as any).botMemory.findMany({
    where: (t: any, { eq, and }: any) =>
      and(eq(t.botProfileId, botProfileId), eq(t.key, key)),
    orderBy: (t: any, { desc }: any) => desc(t.updatedAt),
    limit: 1,
  });
  return rows[0] ?? null;
}

/**
 * Substring search across memory keys + values for one profile.
 * Optional filters: memoryType, tag (must exist in the row's tags
 * array). Returns up to `limit` rows ordered by most-recently-accessed.
 */
export async function searchBotMemory(args: {
  botProfileId: number;
  query?: string;
  memoryType?: "fact" | "pattern" | "decision" | "outcome" | "context";
  tag?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const limit = args.limit ?? 20;
  const rows = await (db.query as any).botMemory.findMany({
    where: (t: any, { eq, and, or, like }: any) => {
      const clauses: any[] = [eq(t.botProfileId, args.botProfileId)];
      if (args.memoryType) clauses.push(eq(t.memoryType, args.memoryType));
      if (args.query) {
        clauses.push(or(like(t.key, `%${args.query}%`), like(t.value, `%${args.query}%`)));
      }
      return and(...clauses);
    },
    orderBy: (t: any, { desc }: any) => desc(t.lastAccessedAt || t.createdAt),
    limit,
  });
  // Tag filter is JSON — Drizzle doesn't have a portable JSON contains,
  // so filter in-memory after the row fetch.
  if (!args.tag) return rows;
  return rows.filter((r: any) => Array.isArray(r.tags) && r.tags.includes(args.tag));
}

/**
 * Bump `accessCount` and `lastAccessedAt` for a memory row.
 * Called on every successful read so the memory tool can later
 * decay/forget unused entries (`expireOldBotMemory`).
 */
export async function touchBotMemory(memoryId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(botMemory)
    .set({
      lastAccessedAt: new Date(),
      accessCount: sql`${botMemory.accessCount} + 1`,
    })
    .where(eq(botMemory.id, memoryId));
}

/**
 * Delete a memory row by id. Used by `memory_forget`. Returns the
 * affected row count (1 = deleted, 0 = nothing matched).
 */
export async function deleteBotMemoryById(memoryId: number, botProfileId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .delete(botMemory)
    .where(and(eq(botMemory.id, memoryId), eq(botMemory.botProfileId, botProfileId)));
  return (result as any)[0]?.affectedRows ?? 0;
}

/**
 * Update a memory row by id. Used by `memory_write` to upsert. Only
 * the value/tags/confidence fields are updatable; key + type are
 * immutable once created (preserve referential integrity for
 * downstream analytics).
 */
export async function updateBotMemoryById(
  memoryId: number,
  fields: Partial<Pick<InsertBotMemory, "value" | "tags" | "confidence" | "expiresAt">>,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(botMemory).set(fields).where(eq(botMemory.id, memoryId));
}

export async function getBotSchedules(botProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  return (db.query as any).botSchedules.findMany({
    where: (t: any, { eq }: any) => eq(t.botProfileId, botProfileId),
  });
}

export async function upsertBotSchedule(data: InsertBotSchedule) {
  const db = await getDb();
  if (!db) return null;
  if (data.id) {
    await db.update(botSchedules).set(data).where(eq(botSchedules.id, data.id as number));
    return data.id;
  } else {
    const result = await db.insert(botSchedules).values(data);
    return result[0].insertId;
  }
}

export async function getBotSafetyRules(botProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  return (db.query as any).botSafetyRules.findMany({
    where: (t: any, { eq }: any) => eq(t.botProfileId, botProfileId),
  });
}

export async function addBotSafetyRule(data: InsertBotSafetyRule) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(botSafetyRules).values(data);
  return result[0].insertId;
}

export async function logBotExecution(data: InsertBotExecutionLog) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(botExecutionLogs).values(data);
  return result[0].insertId;
}

export async function getBotExecutionHistory(botProfileId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return (db.query as any).botExecutionLogs.findMany({
    where: (t: any, { eq }: any) => eq(t.botProfileId, botProfileId),
    limit,
    orderBy: (t: any, { desc }: any) => desc(t.createdAt),
  });
}

// ── Webhook Event Log ──────────────────────────────────────────────────────
export async function logWebhookEvent(data: InsertWebhookEvent) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(webhookEvents).values(data);
  return result[0].insertId;
}

export async function getWebhookEvents(userId: number, options?: { storeId?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const { eq, and, desc } = await import("drizzle-orm");
  const conditions = [eq(webhookEvents.userId, userId)];
  if (options?.storeId) conditions.push(eq(webhookEvents.storeId, options.storeId));
  return db
    .select()
    .from(webhookEvents)
    .where(and(...conditions))
    .orderBy(desc(webhookEvents.createdAt))
    .limit(options?.limit ?? 50);
}

export async function pruneWebhookEvents(userId: number, keepCount = 200) {
  const db = await getDb();
  if (!db) return;
  const { eq, lt, desc } = await import("drizzle-orm");
  // Find the cutoff id — keep the newest keepCount rows
  const rows = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(eq(webhookEvents.userId, userId))
    .orderBy(desc(webhookEvents.createdAt))
    .limit(keepCount);
  if (rows.length < keepCount) return;
  const minId = rows[rows.length - 1].id;
  await db.delete(webhookEvents).where(lt(webhookEvents.id, minId));
}

// ─── Email delivery events (SendGrid webhook) ──────────────────────────────

/**
 * Persist a single delivery event from the SendGrid webhook. Idempotent
 * via the unique `eventId` index — replays from SendGrid (which can
 * deliver the same event up to 4 times) silently de-dupe.
 */
export async function recordEmailDeliveryEvent(data: InsertEmailDeliveryEvent): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(emailDeliveryEvents).values(data);
  } catch (err: any) {
    // Duplicate eventId — webhook replay. Treat as success.
    if (err?.code === "ER_DUP_ENTRY") return;
    throw err;
  }
}

/**
 * Aggregate counts per event type for a given campaign. Powers the
 * campaign analytics view ("100 sent, 87 delivered, 42 opened, 8 clicked").
 */
export async function getEmailCampaignEventCounts(campaignId: number): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db
    .select({ eventType: emailDeliveryEvents.eventType, count: count() })
    .from(emailDeliveryEvents)
    .where(eq(emailDeliveryEvents.campaignId, campaignId))
    .groupBy(emailDeliveryEvents.eventType);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.eventType] = Number(r.count);
  return out;
}

// ─── Organization invitations ──────────────────────────────────────────────

export async function createOrgInvitation(data: InsertOrgInvitation): Promise<OrgInvitation> {
  const db = await requireDb();
  await db.insert(orgInvitations).values(data);
  const rows = await db
    .select()
    .from(orgInvitations)
    .where(eq(orgInvitations.token, data.token))
    .limit(1);
  return rows[0]!;
}

export async function getOrgInvitationByToken(token: string): Promise<OrgInvitation | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(orgInvitations)
    .where(eq(orgInvitations.token, token))
    .limit(1);
  return rows[0];
}

export async function markOrgInvitationAccepted(
  id: number,
  userId: number,
): Promise<void> {
  const db = await requireDb();
  await db
    .update(orgInvitations)
    .set({ acceptedAt: new Date(), acceptedByUserId: userId })
    .where(eq(orgInvitations.id, id));
}

/** Pending (not yet accepted, not yet expired) invitations for an org. */
export async function getPendingInvitationsForOrg(orgId: number): Promise<OrgInvitation[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(orgInvitations)
    .where(eq(orgInvitations.orgId, orgId))
    .orderBy(desc(orgInvitations.createdAt));
}

// ─── Workflow drafts ─────────────────────────────────────────────────────
// Server-side persistence for the WorkflowBuilder canvas. Replaces the
// localStorage-only flow that didn't follow the operator across devices.

/**
 * Upsert a workflow draft. If `id` is provided AND the row belongs to
 * the calling org, the existing row is updated; otherwise a new row is
 * inserted. Returns the canonical id of the saved draft so the client
 * can hold a stable reference for subsequent saves.
 *
 * The org check is critical: an attacker who guesses a draft id from
 * another tenant must not be able to overwrite it via the upsert path.
 * The router's `orgProcedure` enforces caller authentication; this
 * function adds the per-row tenancy guard.
 */
export async function upsertWorkflowDraft(
  draft: Omit<InsertWorkflowDraft, "createdAt" | "updatedAt"> & { id?: number },
): Promise<number> {
  const db = await requireDb();
  if (draft.id) {
    // Update path — verify ownership before writing.
    const existing = await db
      .select({ id: workflowDrafts.id, orgId: workflowDrafts.orgId })
      .from(workflowDrafts)
      .where(eq(workflowDrafts.id, draft.id))
      .limit(1);
    if (existing[0] && existing[0].orgId === draft.orgId) {
      await db
        .update(workflowDrafts)
        .set({
          name: draft.name,
          agentType: draft.agentType,
          steps: draft.steps,
          storeId: draft.storeId ?? null,
        })
        .where(eq(workflowDrafts.id, draft.id));
      return draft.id;
    }
    // The id was supplied but doesn't belong to this org. Fall through
    // to the insert path so we never overwrite another tenant's row.
  }
  const result = await db.insert(workflowDrafts).values({
    orgId: draft.orgId,
    userId: draft.userId,
    storeId: draft.storeId ?? null,
    name: draft.name,
    agentType: draft.agentType,
    steps: draft.steps,
  });
  return Number((result as any)[0]?.insertId ?? 0);
}

/** Read a single draft by id, scoped to the caller's org. Returns
 *  `null` when the draft doesn't exist OR belongs to a different org. */
export async function getWorkflowDraft(
  id: number,
  orgId: number,
): Promise<WorkflowDraft | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(workflowDrafts)
    .where(eq(workflowDrafts.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.orgId !== orgId) return null;
  return row;
}

/** All drafts owned by the caller's org, most-recently-updated first. */
export async function listWorkflowDraftsForOrg(orgId: number): Promise<WorkflowDraft[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(workflowDrafts)
    .where(eq(workflowDrafts.orgId, orgId))
    .orderBy(desc(workflowDrafts.updatedAt));
}

/** Delete a draft by id, only when the row belongs to the caller's org. */
export async function deleteWorkflowDraft(id: number, orgId: number): Promise<void> {
  const db = await requireDb();
  // Two-step delete: read first to confirm tenancy, then delete by id.
  // The single-statement alternative (DELETE ... WHERE id=? AND orgId=?)
  // is faster but harder to audit — and this path runs once on a
  // human-driven UI click, so the extra round-trip is fine.
  const rows = await db
    .select({ id: workflowDrafts.id, orgId: workflowDrafts.orgId })
    .from(workflowDrafts)
    .where(eq(workflowDrafts.id, id))
    .limit(1);
  if (!rows[0] || rows[0].orgId !== orgId) return;
  await db.delete(workflowDrafts).where(eq(workflowDrafts.id, id));
}
