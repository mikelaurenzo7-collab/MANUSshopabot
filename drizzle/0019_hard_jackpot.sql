ALTER TABLE `stores` ADD `lifecycleStage` enum('building','transitioning','operating') DEFAULT 'building' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `setupCompletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `stores` ADD `firstOrderAt` timestamp;--> statement-breakpoint
ALTER TABLE `stores` ADD `handoffAcknowledgedAt` timestamp;--> statement-breakpoint
CREATE INDEX `stores_lifecycle_stage_idx` ON `stores` (`lifecycleStage`);