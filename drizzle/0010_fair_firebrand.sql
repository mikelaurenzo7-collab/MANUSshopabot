CREATE TABLE `oauth_state_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`state` varchar(255) NOT NULL,
	`flowType` enum('ecommerce','social') NOT NULL,
	`userId` int NOT NULL,
	`platform` varchar(50) NOT NULL,
	`storeId` int,
	`origin` text NOT NULL,
	`returnTo` varchar(255),
	`codeVerifier` text,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `oauth_state_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `oauth_state_tokens_state_unique` UNIQUE(`state`)
);
--> statement-breakpoint
CREATE INDEX `oauth_state_tokens_expires_idx` ON `oauth_state_tokens` (`expiresAt`);
--> statement-breakpoint
CREATE INDEX `oauth_state_tokens_flow_platform_idx` ON `oauth_state_tokens` (`flowType`,`platform`);