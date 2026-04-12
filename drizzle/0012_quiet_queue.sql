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
CREATE INDEX `job_queue_status_run_at_idx` ON `job_queue` (`status`,`runAt`);
--> statement-breakpoint
CREATE INDEX `job_queue_type_status_idx` ON `job_queue` (`jobType`,`status`);