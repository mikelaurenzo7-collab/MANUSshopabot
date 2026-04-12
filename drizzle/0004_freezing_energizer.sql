CREATE TABLE `agent_workflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentType` enum('architect','merchant','hypeman') NOT NULL,
	`workflowType` varchar(100) NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`scope` enum('specific_store','all_stores','global') NOT NULL DEFAULT 'global',
	`storeId` int,
	`status` enum('pending','running','awaiting_approval','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`currentStepIndex` int NOT NULL DEFAULT 0,
	`totalSteps` int NOT NULL DEFAULT 0,
	`input` json,
	`output` json,
	`error` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_workflows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workflowId` int NOT NULL,
	`stepIndex` int NOT NULL,
	`stepType` enum('llm_call','api_call','image_generation','data_transform','approval_gate','notification','store_action','analysis') NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`status` enum('pending','running','completed','failed','skipped','awaiting_approval') NOT NULL DEFAULT 'pending',
	`input` json,
	`output` json,
	`error` text,
	`requiresApproval` boolean NOT NULL DEFAULT false,
	`approvalStatus` enum('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
	`approvalNote` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`durationMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `bot_config` ADD `autonomyLevel` enum('fully_autonomous','supervised','manual') DEFAULT 'supervised' NOT NULL;