CREATE TABLE `workflow_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`userId` int NOT NULL,
	`storeId` int,
	`name` varchar(255) NOT NULL,
	`agentType` enum('architect','merchant','social') NOT NULL,
	`steps` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `workflow_drafts_org_id_idx` ON `workflow_drafts` (`orgId`);--> statement-breakpoint
CREATE INDEX `workflow_drafts_user_id_idx` ON `workflow_drafts` (`userId`);