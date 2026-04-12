-- Migration 0013: Add performance indexes to high-traffic tables + expand OAuth flow type
-- These indexes prevent full table scans on Manus-hosted MySQL for the most common
-- query patterns: userId lookups, storeId filtering, status filtering, and composite sorts.

-- Expand OAuth state token flowType enum to support Shopify nonce durability
ALTER TABLE `oauth_state_tokens` MODIFY COLUMN `flowType` enum('ecommerce','social','shopify') NOT NULL;

-- stores: getStoresByUser(userId), findStoreByDomain(platformDomain)
CREATE INDEX `stores_user_id_idx` ON `stores` (`userId`);
CREATE INDEX `stores_platform_domain_idx` ON `stores` (`platform`, `platformDomain`);

-- products: getProductsByStore, getLowStockProducts
CREATE INDEX `products_store_id_idx` ON `products` (`storeId`);
CREATE INDEX `products_store_status_idx` ON `products` (`storeId`, `status`);

-- orders: getOrdersByStore, getRecentOrders
CREATE INDEX `orders_store_id_idx` ON `orders` (`storeId`);
CREATE INDEX `orders_store_status_idx` ON `orders` (`storeId`, `status`);
CREATE INDEX `orders_created_at_idx` ON `orders` (`createdAt`);

-- agent_tasks: getAgentTasks(agentType, storeId), recent activity feeds
CREATE INDEX `agent_tasks_store_id_idx` ON `agent_tasks` (`storeId`);
CREATE INDEX `agent_tasks_agent_type_idx` ON `agent_tasks` (`agentType`, `createdAt`);

-- approval_queue: getPendingApprovals, getApprovalsByStatus
CREATE INDEX `approval_queue_status_idx` ON `approval_queue` (`status`, `createdAt`);

-- bot_config: getBotConfigByUser
CREATE INDEX `bot_config_user_agent_idx` ON `bot_config` (`userId`, `agentType`);

-- notifications: getNotifications(userId), unreadCount
CREATE INDEX `notifications_user_id_idx` ON `notifications` (`userId`, `isRead`, `createdAt`);

-- social_posts: getDueScheduledPosts (critical for job queue), getPostsByStore
CREATE INDEX `social_posts_store_id_idx` ON `social_posts` (`storeId`);
CREATE INDEX `social_posts_scheduled_idx` ON `social_posts` (`status`, `scheduledAt`);

-- email_campaigns: getCampaignsByStore
CREATE INDEX `email_campaigns_store_id_idx` ON `email_campaigns` (`storeId`);

-- analytics_snapshots: getSnapshotsByDateRange (dashboard queries)
CREATE INDEX `analytics_snapshots_store_date_idx` ON `analytics_snapshots` (`storeId`, `date`);

-- platform_credentials: getCredentialsByUser, getCredentialByPlatform
CREATE INDEX `platform_creds_user_id_idx` ON `platform_credentials` (`userId`);
CREATE INDEX `platform_creds_user_platform_idx` ON `platform_credentials` (`userId`, `platform`);

-- social_accounts: getSocialAccountsByPlatform(userId, platform)
CREATE INDEX `social_accounts_user_id_idx` ON `social_accounts` (`userId`);
CREATE INDEX `social_accounts_user_platform_idx` ON `social_accounts` (`userId`, `platform`);

-- agent_workflows: getWorkflowsByUser, filter by status
CREATE INDEX `agent_workflows_user_id_idx` ON `agent_workflows` (`userId`, `status`);
CREATE INDEX `agent_workflows_store_id_idx` ON `agent_workflows` (`storeId`);

-- workflow_steps: getStepsByWorkflow
CREATE INDEX `workflow_steps_workflow_id_idx` ON `workflow_steps` (`workflowId`, `stepIndex`);

-- agent_telemetry: getTelemetryByAgent, recent telemetry
CREATE INDEX `agent_telemetry_agent_type_idx` ON `agent_telemetry` (`agentType`, `createdAt`);
CREATE INDEX `agent_telemetry_store_id_idx` ON `agent_telemetry` (`storeId`);

-- ad_campaigns: getCampaignsByStore
CREATE INDEX `ad_campaigns_store_id_idx` ON `ad_campaigns` (`storeId`);

-- pricing_rules: getRulesByStore
CREATE INDEX `pricing_rules_store_id_idx` ON `pricing_rules` (`storeId`);

-- seo_keywords: getKeywordsByStore
CREATE INDEX `seo_keywords_store_id_idx` ON `seo_keywords` (`storeId`);

-- niche_reports: getReportsByStore
CREATE INDEX `niche_reports_store_id_idx` ON `niche_reports` (`storeId`);
