CREATE TABLE `webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storeId` int,
	`platform` varchar(64) NOT NULL,
	`eventType` varchar(128) NOT NULL,
	`status` enum('received','processed','failed','skipped') NOT NULL DEFAULT 'received',
	`payload` json,
	`errorMessage` text,
	`processingMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `webhook_events_user_id_idx` ON `webhook_events` (`userId`);--> statement-breakpoint
CREATE INDEX `webhook_events_store_id_idx` ON `webhook_events` (`storeId`);--> statement-breakpoint
CREATE INDEX `webhook_events_created_at_idx` ON `webhook_events` (`createdAt`);