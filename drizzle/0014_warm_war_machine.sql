CREATE TABLE `bot_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromBot` enum('architect','merchant','social') NOT NULL,
	`toBot` enum('architect','merchant','social','all') NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`userId` int NOT NULL,
	`storeId` int,
	`payload` json NOT NULL,
	`status` enum('pending','processed','ignored','failed') NOT NULL DEFAULT 'pending',
	`error` text,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bot_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_plugins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pluginName` varchar(150) NOT NULL,
	`version` varchar(50) NOT NULL,
	`description` text,
	`author` varchar(100) NOT NULL,
	`category` varchar(50) DEFAULT 'utility',
	`iconUrl` varchar(500),
	`webhookConfig` json,
	`eventTypes` json,
	`status` varchar(50) NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bot_plugins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `execution_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentTaskId` int NOT NULL,
	`overriddenByUserId` int,
	`actionTaken` varchar(50) NOT NULL,
	`reason` varchar(500),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `execution_overrides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `installed_plugins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`pluginId` int NOT NULL,
	`configJson` json,
	`enabled` boolean NOT NULL DEFAULT true,
	`installedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `installed_plugins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobType` varchar(100) NOT NULL,
	`dedupeKey` varchar(255),
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`payload` json NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 3,
	`runAt` timestamp NOT NULL DEFAULT (now()),
	`lastError` text,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_queue_id` PRIMARY KEY(`id`),
	CONSTRAINT `job_queue_dedupeKey_unique` UNIQUE(`dedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `oauth_state_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`state` varchar(255) NOT NULL,
	`flowType` enum('ecommerce','social','shopify') NOT NULL,
	`userId` int NOT NULL,
	`platform` varchar(50) NOT NULL,
	`storeId` int,
	`origin` text NOT NULL,
	`returnTo` varchar(255),
	`codeVerifier` text,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `oauth_state_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `oauth_state_tokens_state_unique` UNIQUE(`state`)
);
--> statement-breakpoint
CREATE TABLE `po_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poId` int NOT NULL,
	`productId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitCostCents` int NOT NULL,
	`receivedQty` int DEFAULT 0,
	CONSTRAINT `po_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prompt_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`variantId` int NOT NULL,
	`storeId` int,
	`successRate` int,
	`invocations` int DEFAULT 0,
	`conversions` int DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prompt_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prompt_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentType` varchar(50) NOT NULL,
	`taskType` varchar(100) NOT NULL,
	`variantName` varchar(50) NOT NULL,
	`promptTemplate` text NOT NULL,
	`isActive` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prompt_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`supplierId` varchar(150),
	`poNumber` varchar(150) NOT NULL,
	`totalCents` int NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'draft',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_pause_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workflowId` int NOT NULL,
	`stepId` int NOT NULL,
	`pauseReason` varchar(500) NOT NULL,
	`overrideRequired` boolean DEFAULT true,
	`autoResumeConfig` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_pause_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `agent_tasks` ADD `idempotencyKey` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `stripeCustomerId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `stripeSubscriptionId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `stripePlan` enum('starter','growth','pro','scale');--> statement-breakpoint
ALTER TABLE `users` ADD `stripeSubscriptionStatus` varchar(32);--> statement-breakpoint
ALTER TABLE `agent_tasks` ADD CONSTRAINT `agent_tasks_idempotencyKey_unique` UNIQUE(`idempotencyKey`);--> statement-breakpoint
ALTER TABLE `agent_tasks` ADD CONSTRAINT `agent_tasks_idempotency_key_idx` UNIQUE(`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `bot_events_status_created_idx` ON `bot_events` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `bot_events_routing_idx` ON `bot_events` (`toBot`,`eventType`);--> statement-breakpoint
CREATE INDEX `job_queue_status_run_at_idx` ON `job_queue` (`status`,`runAt`);--> statement-breakpoint
CREATE INDEX `job_queue_type_status_idx` ON `job_queue` (`jobType`,`status`);--> statement-breakpoint
CREATE INDEX `oauth_state_tokens_expires_idx` ON `oauth_state_tokens` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `oauth_state_tokens_flow_platform_idx` ON `oauth_state_tokens` (`flowType`,`platform`);--> statement-breakpoint
CREATE INDEX `ad_campaigns_store_id_idx` ON `ad_campaigns` (`storeId`);--> statement-breakpoint
CREATE INDEX `agent_tasks_store_id_idx` ON `agent_tasks` (`storeId`);--> statement-breakpoint
CREATE INDEX `agent_tasks_agent_type_idx` ON `agent_tasks` (`agentType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agent_telemetry_agent_type_idx` ON `agent_telemetry` (`agentType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agent_telemetry_store_id_idx` ON `agent_telemetry` (`storeId`);--> statement-breakpoint
CREATE INDEX `agent_workflows_user_id_idx` ON `agent_workflows` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `agent_workflows_store_id_idx` ON `agent_workflows` (`storeId`);--> statement-breakpoint
CREATE INDEX `analytics_snapshots_store_date_idx` ON `analytics_snapshots` (`storeId`,`date`);--> statement-breakpoint
CREATE INDEX `approval_queue_status_idx` ON `approval_queue` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `bot_config_user_agent_idx` ON `bot_config` (`userId`,`agentType`);--> statement-breakpoint
CREATE INDEX `email_campaigns_store_id_idx` ON `email_campaigns` (`storeId`);--> statement-breakpoint
CREATE INDEX `niche_reports_store_id_idx` ON `niche_reports` (`storeId`);--> statement-breakpoint
CREATE INDEX `notifications_user_id_idx` ON `notifications` (`userId`,`isRead`,`createdAt`);--> statement-breakpoint
CREATE INDEX `orders_store_id_idx` ON `orders` (`storeId`);--> statement-breakpoint
CREATE INDEX `orders_store_status_idx` ON `orders` (`storeId`,`status`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`createdAt`);--> statement-breakpoint
CREATE INDEX `platform_creds_user_id_idx` ON `platform_credentials` (`userId`);--> statement-breakpoint
CREATE INDEX `platform_creds_user_platform_idx` ON `platform_credentials` (`userId`,`platform`);--> statement-breakpoint
CREATE INDEX `pricing_rules_store_id_idx` ON `pricing_rules` (`storeId`);--> statement-breakpoint
CREATE INDEX `products_store_id_idx` ON `products` (`storeId`);--> statement-breakpoint
CREATE INDEX `products_store_status_idx` ON `products` (`storeId`,`status`);--> statement-breakpoint
CREATE INDEX `seo_keywords_store_id_idx` ON `seo_keywords` (`storeId`);--> statement-breakpoint
CREATE INDEX `social_accounts_user_id_idx` ON `social_accounts` (`userId`);--> statement-breakpoint
CREATE INDEX `social_accounts_user_platform_idx` ON `social_accounts` (`userId`,`platform`);--> statement-breakpoint
CREATE INDEX `social_posts_store_id_idx` ON `social_posts` (`storeId`);--> statement-breakpoint
CREATE INDEX `social_posts_scheduled_idx` ON `social_posts` (`status`,`scheduledAt`);--> statement-breakpoint
CREATE INDEX `stores_user_id_idx` ON `stores` (`userId`);--> statement-breakpoint
CREATE INDEX `stores_platform_domain_idx` ON `stores` (`platform`,`platformDomain`);--> statement-breakpoint
CREATE INDEX `workflow_steps_workflow_id_idx` ON `workflow_steps` (`workflowId`,`stepIndex`);