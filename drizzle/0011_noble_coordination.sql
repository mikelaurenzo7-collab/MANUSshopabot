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
CREATE INDEX `bot_events_status_created_idx` ON `bot_events` (`status`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `bot_events_routing_idx` ON `bot_events` (`toBot`,`eventType`);