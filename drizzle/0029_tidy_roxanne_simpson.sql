CREATE TABLE `workspace_chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`userId` int NOT NULL,
	`toolCalls` json,
	`relatedWorkflowId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`integrationType` enum('gmail','outlook','twitter','facebook','instagram','tiktok','linkedin','pinterest','youtube','slack','discord','telegram','whatsapp','shopify','stripe','mailchimp','klaviyo','zapier') NOT NULL,
	`accountId` varchar(255),
	`accountName` varchar(255),
	`accessToken` text,
	`refreshToken` text,
	`tokenExpiresAt` timestamp,
	`config` json,
	`enabled` boolean NOT NULL DEFAULT true,
	`connectedByUserId` int NOT NULL,
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_integrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_integrations_workspace_type_unique` UNIQUE(`workspaceId`,`integrationType`,`accountId`)
);
--> statement-breakpoint
CREATE TABLE `workspace_memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`memoryType` enum('fact','pattern','decision','outcome','context','preference') NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`confidence` int DEFAULT 50,
	`relatedWorkflowId` int,
	`relatedMessageId` int,
	`tags` json,
	`lastAccessedAt` timestamp,
	`accessCount` int DEFAULT 0,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_memory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`botEnabled` boolean NOT NULL DEFAULT true,
	`autonomyLevel` enum('fully_autonomous','supervised','manual') NOT NULL DEFAULT 'supervised',
	`requiresApproval` boolean NOT NULL DEFAULT false,
	`customInstructions` text,
	`systemPrompt` text,
	`personality` varchar(100),
	`notificationsEnabled` boolean NOT NULL DEFAULT true,
	`notificationChannels` json,
	`dailyBudgetCents` int,
	`approvalThresholdCents` int,
	`safetyRules` json,
	`enabledFeatures` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_settings_workspace_id_unique` UNIQUE(`workspaceId`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`createdByUserId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`slug` varchar(100) NOT NULL,
	`icon` varchar(255),
	`color` varchar(20),
	`storeId` int,
	`workspaceType` enum('store','general','campaign','channel') NOT NULL DEFAULT 'store',
	`archived` boolean NOT NULL DEFAULT false,
	`archivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspaces_slug_org_unique` UNIQUE(`slug`,`orgId`)
);
--> statement-breakpoint
CREATE INDEX `workspace_chat_messages_workspace_id_idx` ON `workspace_chat_messages` (`workspaceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `workspace_chat_messages_user_id_idx` ON `workspace_chat_messages` (`userId`);--> statement-breakpoint
CREATE INDEX `workspace_chat_messages_workflow_idx` ON `workspace_chat_messages` (`relatedWorkflowId`);--> statement-breakpoint
CREATE INDEX `workspace_integrations_workspace_id_idx` ON `workspace_integrations` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `workspace_integrations_type_idx` ON `workspace_integrations` (`integrationType`);--> statement-breakpoint
CREATE INDEX `workspace_memory_workspace_id_idx` ON `workspace_memory` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `workspace_memory_key_idx` ON `workspace_memory` (`key`);--> statement-breakpoint
CREATE INDEX `workspace_memory_type_idx` ON `workspace_memory` (`memoryType`);--> statement-breakpoint
CREATE INDEX `workspaces_org_id_idx` ON `workspaces` (`orgId`);--> statement-breakpoint
CREATE INDEX `workspaces_store_id_idx` ON `workspaces` (`storeId`);