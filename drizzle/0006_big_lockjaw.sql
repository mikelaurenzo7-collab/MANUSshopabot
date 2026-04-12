ALTER TABLE `bot_config` MODIFY COLUMN `autonomyLevel` enum('fully_autonomous','supervised','manual') NOT NULL DEFAULT 'fully_autonomous';--> statement-breakpoint
ALTER TABLE `bot_config` ADD `lowStockThreshold` int DEFAULT 5;--> statement-breakpoint
ALTER TABLE `bot_config` ADD `approvalRequired` boolean DEFAULT false NOT NULL;