CREATE TABLE `email_delivery_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerMessageId` varchar(255) NOT NULL,
	`eventId` varchar(128),
	`eventType` varchar(32) NOT NULL,
	`email` varchar(320),
	`campaignId` int,
	`categories` json,
	`url` text,
	`reason` text,
	`occurredAt` timestamp NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_delivery_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_delivery_events_event_id_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `org_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('admin','member') NOT NULL DEFAULT 'member',
	`token` varchar(64) NOT NULL,
	`invitedByUserId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`acceptedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `org_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `org_invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `org_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`invitedAt` timestamp NOT NULL DEFAULT (now()),
	`joinedAt` timestamp,
	`invitedByUserId` int,
	CONSTRAINT `org_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `org_members_org_user_unique` UNIQUE(`orgId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`ownerId` int NOT NULL,
	`kind` enum('personal','team') NOT NULL DEFAULT 'personal',
	`plan` enum('starter','growth','pro','scale'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `ad_campaigns` MODIFY COLUMN `platform` enum('tiktok','meta','instagram','twitter','pinterest','google_ads','email','sms','gmail','snapchat') NOT NULL DEFAULT 'meta';--> statement-breakpoint
ALTER TABLE `social_accounts` MODIFY COLUMN `platform` enum('meta','instagram','tiktok','twitter','pinterest','google_ads','gmail','snapchat') NOT NULL;--> statement-breakpoint
ALTER TABLE `social_posts` MODIFY COLUMN `platform` enum('tiktok','instagram','facebook','meta','twitter','pinterest','google_ads','snapchat') NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_steps` MODIFY COLUMN `stepType` enum('llm_call','api_call','image_generation','data_transform','approval_gate','notification','store_action','analysis','parallel_group') NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_workflows` ADD `orgId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `approval_queue` ADD `orgId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_config` ADD `orgId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `platform_credentials` ADD `orgId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `orgId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `orgId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `currentOrgId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `onboardedAt` timestamp;--> statement-breakpoint
CREATE INDEX `email_delivery_events_provider_msg_idx` ON `email_delivery_events` (`providerMessageId`);--> statement-breakpoint
CREATE INDEX `email_delivery_events_campaign_idx` ON `email_delivery_events` (`campaignId`);--> statement-breakpoint
CREATE INDEX `email_delivery_events_event_type_idx` ON `email_delivery_events` (`eventType`);--> statement-breakpoint
CREATE INDEX `org_invitations_org_id_idx` ON `org_invitations` (`orgId`);--> statement-breakpoint
CREATE INDEX `org_invitations_email_idx` ON `org_invitations` (`email`);--> statement-breakpoint
CREATE INDEX `org_members_user_id_idx` ON `org_members` (`userId`);--> statement-breakpoint
CREATE INDEX `org_members_org_id_idx` ON `org_members` (`orgId`);--> statement-breakpoint
CREATE INDEX `organizations_owner_id_idx` ON `organizations` (`ownerId`);--> statement-breakpoint
CREATE INDEX `agent_workflows_org_id_idx` ON `agent_workflows` (`orgId`,`status`);--> statement-breakpoint
CREATE INDEX `approval_queue_org_id_idx` ON `approval_queue` (`orgId`);--> statement-breakpoint
CREATE INDEX `bot_config_org_agent_idx` ON `bot_config` (`orgId`,`agentType`);--> statement-breakpoint
CREATE INDEX `platform_creds_org_id_idx` ON `platform_credentials` (`orgId`);--> statement-breakpoint
CREATE INDEX `platform_creds_org_platform_idx` ON `platform_credentials` (`orgId`,`platform`);--> statement-breakpoint
CREATE INDEX `social_accounts_org_id_idx` ON `social_accounts` (`orgId`);--> statement-breakpoint
CREATE INDEX `social_accounts_org_platform_idx` ON `social_accounts` (`orgId`,`platform`);--> statement-breakpoint
CREATE INDEX `stores_org_id_idx` ON `stores` (`orgId`);