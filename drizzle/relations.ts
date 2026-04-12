import { relations } from "drizzle-orm";
import {
  users,
  stores,
  products,
  orders,
  agentTasks,
  approvalQueue,
  botConfig,
  notifications,
  socialPosts,
  emailCampaigns,
  analyticsSnapshots,
  platformCredentials,
  socialAccounts,
  agentWorkflows,
  workflowSteps,
  adCampaigns,
  pricingRules,
  seoKeywords,
  nicheReports,
  botEvents,
  jobQueue,
  oauthStateTokens,
  agentTelemetry,
} from "./schema";

// ─── User Relations ─────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  stores: many(stores),
  notifications: many(notifications),
  botConfigs: many(botConfig),
  socialAccounts: many(socialAccounts),
  platformCredentials: many(platformCredentials),
  workflows: many(agentWorkflows),
}));

// ─── Store Relations ────────────────────────────────────────────────────────
export const storesRelations = relations(stores, ({ one, many }) => ({
  user: one(users, { fields: [stores.userId], references: [users.id] }),
  products: many(products),
  orders: many(orders),
  socialPosts: many(socialPosts),
  analyticsSnapshots: many(analyticsSnapshots),
  adCampaigns: many(adCampaigns),
  pricingRules: many(pricingRules),
  seoKeywords: many(seoKeywords),
  emailCampaigns: many(emailCampaigns),
  nicheReports: many(nicheReports),
}));

// ─── Product Relations ──────────────────────────────────────────────────────
export const productsRelations = relations(products, ({ one }) => ({
  store: one(stores, { fields: [products.storeId], references: [stores.id] }),
}));

// ─── Order Relations ────────────────────────────────────────────────────────
export const ordersRelations = relations(orders, ({ one }) => ({
  store: one(stores, { fields: [orders.storeId], references: [stores.id] }),
}));

// ─── Agent Task Relations ───────────────────────────────────────────────────
export const agentTasksRelations = relations(agentTasks, ({ one }) => ({
  store: one(stores, { fields: [agentTasks.storeId], references: [stores.id] }),
}));

// ─── Approval Queue Relations ───────────────────────────────────────────────
export const approvalQueueRelations = relations(approvalQueue, ({ one }) => ({
  task: one(agentTasks, { fields: [approvalQueue.agentTaskId], references: [agentTasks.id] }),
}));

// ─── Bot Config Relations ───────────────────────────────────────────────────
export const botConfigRelations = relations(botConfig, ({ one }) => ({
  user: one(users, { fields: [botConfig.userId], references: [users.id] }),
}));

// ─── Notification Relations ─────────────────────────────────────────────────
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// ─── Social Post Relations ──────────────────────────────────────────────────
export const socialPostsRelations = relations(socialPosts, ({ one }) => ({
  store: one(stores, { fields: [socialPosts.storeId], references: [stores.id] }),
}));

// ─── Analytics Snapshot Relations ───────────────────────────────────────────
export const analyticsSnapshotsRelations = relations(analyticsSnapshots, ({ one }) => ({
  store: one(stores, { fields: [analyticsSnapshots.storeId], references: [stores.id] }),
}));

// ─── Platform Credential Relations ──────────────────────────────────────────
export const platformCredentialsRelations = relations(platformCredentials, ({ one }) => ({
  user: one(users, { fields: [platformCredentials.userId], references: [users.id] }),
  store: one(stores, { fields: [platformCredentials.storeId], references: [stores.id] }),
}));

// ─── Social Account Relations ───────────────────────────────────────────────
export const socialAccountsRelations = relations(socialAccounts, ({ one }) => ({
  user: one(users, { fields: [socialAccounts.userId], references: [users.id] }),
}));

// ─── Workflow Relations ─────────────────────────────────────────────────────
export const agentWorkflowsRelations = relations(agentWorkflows, ({ one, many }) => ({
  user: one(users, { fields: [agentWorkflows.userId], references: [users.id] }),
  store: one(stores, { fields: [agentWorkflows.storeId], references: [stores.id] }),
  steps: many(workflowSteps),
}));

export const workflowStepsRelations = relations(workflowSteps, ({ one }) => ({
  workflow: one(agentWorkflows, { fields: [workflowSteps.workflowId], references: [agentWorkflows.id] }),
}));

// ─── Ad Campaign Relations ──────────────────────────────────────────────────
export const adCampaignsRelations = relations(adCampaigns, ({ one }) => ({
  store: one(stores, { fields: [adCampaigns.storeId], references: [stores.id] }),
}));

// ─── Pricing Rule Relations ─────────────────────────────────────────────────
export const pricingRulesRelations = relations(pricingRules, ({ one }) => ({
  store: one(stores, { fields: [pricingRules.storeId], references: [stores.id] }),
}));

// ─── SEO Keyword Relations ──────────────────────────────────────────────────
export const seoKeywordsRelations = relations(seoKeywords, ({ one }) => ({
  store: one(stores, { fields: [seoKeywords.storeId], references: [stores.id] }),
}));

// ─── Email Campaign Relations ───────────────────────────────────────────────
export const emailCampaignsRelations = relations(emailCampaigns, ({ one }) => ({
  store: one(stores, { fields: [emailCampaigns.storeId], references: [stores.id] }),
}));

// ─── Niche Report Relations ─────────────────────────────────────────────────
export const nicheReportsRelations = relations(nicheReports, ({ one }) => ({
  store: one(stores, { fields: [nicheReports.storeId], references: [stores.id] }),
}));
