CREATE TABLE `bot_execution_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botProfileId` int NOT NULL,
	`workflowId` int,
	`userId` int NOT NULL,
	`actionType` varchar(100) NOT NULL,
	`status` enum('pending','running','completed','failed','blocked') NOT NULL DEFAULT 'pending',
	`input` json,
	`output` json,
	`error` text,
	`memoryUsed` json,
	`instructionsApplied` text,
	`safetyRulesApplied` json,
	`durationMs` int,
	`tokensUsed` int,
	`costCents` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bot_execution_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botProfileId` int NOT NULL,
	`userId` int NOT NULL,
	`memoryType` enum('fact','pattern','decision','outcome','context') NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`confidence` int DEFAULT 50,
	`relatedWorkflowId` int,
	`relatedStoreId` int,
	`tags` json,
	`lastAccessedAt` timestamp,
	`accessCount` int DEFAULT 0,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_memory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentType` enum('architect','merchant','social') NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`avatarUrl` text,
	`systemPrompt` text,
	`customInstructions` text,
	`personality` varchar(100),
	`autonomyLevel` enum('fully_autonomous','supervised','manual') NOT NULL DEFAULT 'supervised',
	`requiresApproval` boolean NOT NULL DEFAULT false,
	`approvalThreshold` varchar(100),
	`safetyRules` json,
	`memoryEnabled` boolean NOT NULL DEFAULT true,
	`memoryType` enum('short_term','long_term','hybrid') NOT NULL DEFAULT 'hybrid',
	`memoryMaxItems` int DEFAULT 100,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_safety_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botProfileId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`ruleType` enum('spending_limit','price_limit','action_restriction','approval_required','rate_limit') NOT NULL,
	`condition` json,
	`action` enum('block','warn','approve_required','log') NOT NULL DEFAULT 'warn',
	`appliesToWorkflows` json,
	`appliesToStores` json,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_safety_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botProfileId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`taskType` varchar(100) NOT NULL,
	`triggerType` enum('cron','interval','manual','event') NOT NULL DEFAULT 'manual',
	`cronExpression` varchar(255),
	`intervalSeconds` int,
	`eventType` varchar(100),
	`taskInput` json,
	`targetStoreIds` json,
	`maxConcurrent` int DEFAULT 1,
	`enabled` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`nextRunAt` timestamp,
	`totalRuns` int DEFAULT 0,
	`successfulRuns` int DEFAULT 0,
	`failedRuns` int DEFAULT 0,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `bot_execution_logs_bot_profile_id_idx` ON `bot_execution_logs` (`botProfileId`);--> statement-breakpoint
CREATE INDEX `bot_execution_logs_workflow_id_idx` ON `bot_execution_logs` (`workflowId`);--> statement-breakpoint
CREATE INDEX `bot_memory_bot_profile_id_idx` ON `bot_memory` (`botProfileId`);--> statement-breakpoint
CREATE INDEX `bot_memory_type_idx` ON `bot_memory` (`memoryType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `bot_memory_key_idx` ON `bot_memory` (`key`);--> statement-breakpoint
CREATE INDEX `bot_profiles_user_agent_idx` ON `bot_profiles` (`userId`,`agentType`);--> statement-breakpoint
CREATE INDEX `bot_safety_rules_bot_profile_id_idx` ON `bot_safety_rules` (`botProfileId`);--> statement-breakpoint
CREATE INDEX `bot_schedules_bot_profile_id_idx` ON `bot_schedules` (`botProfileId`);--> statement-breakpoint
CREATE INDEX `bot_schedules_enabled_idx` ON `bot_schedules` (`enabled`,`nextRunAt`);