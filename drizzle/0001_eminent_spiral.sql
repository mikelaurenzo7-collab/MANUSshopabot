CREATE TABLE `ad_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`platform` enum('tiktok','meta','google','email','sms') NOT NULL DEFAULT 'meta',
	`adCopy` text,
	`imageUrl` text,
	`targetAudience` text,
	`budgetCents` int DEFAULT 0,
	`spentCents` int DEFAULT 0,
	`impressions` int DEFAULT 0,
	`clicks` int DEFAULT 0,
	`conversions` int DEFAULT 0,
	`status` enum('draft','active','paused','completed') NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ad_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentType` enum('architect','merchant','hypeman') NOT NULL,
	`taskType` varchar(100) NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`status` enum('running','completed','failed','pending_approval','approved','rejected') NOT NULL DEFAULT 'running',
	`result` json,
	`storeId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analytics_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`revenue` int DEFAULT 0,
	`orders` int DEFAULT 0,
	`visitors` int DEFAULT 0,
	`conversionRate` int DEFAULT 0,
	`avgOrderValue` int DEFAULT 0,
	`topProducts` json,
	`trafficSources` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `approval_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentTaskId` int NOT NULL,
	`agentType` enum('architect','merchant','hypeman') NOT NULL,
	`actionType` varchar(100) NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`impact` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`proposedAction` json,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedAt` timestamp,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `approval_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentType` enum('architect','merchant','hypeman') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`config` json,
	`autoApprove` boolean NOT NULL DEFAULT false,
	`maxBudgetCents` int DEFAULT 10000,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`subject` varchar(500),
	`body` text,
	`recipientCount` int DEFAULT 0,
	`openRate` int,
	`clickRate` int,
	`campaignType` enum('welcome','abandoned_cart','promotional','winback','newsletter') NOT NULL DEFAULT 'promotional',
	`status` enum('draft','scheduled','sent','failed') NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `niche_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int,
	`keyword` varchar(255) NOT NULL,
	`report` json,
	`score` int,
	`status` enum('generating','completed','failed') NOT NULL DEFAULT 'generating',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `niche_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentType` enum('architect','merchant','hypeman','system') NOT NULL,
	`type` enum('info','warning','error','success','approval_needed') NOT NULL DEFAULT 'info',
	`title` varchar(500) NOT NULL,
	`message` text,
	`isRead` boolean NOT NULL DEFAULT false,
	`actionUrl` varchar(500),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`shopifyOrderId` varchar(100),
	`customerName` varchar(255),
	`customerEmail` varchar(320),
	`totalAmount` int NOT NULL DEFAULT 0,
	`currency` varchar(10) DEFAULT 'USD',
	`status` enum('pending','processing','fulfilled','shipped','delivered','cancelled','refunded') NOT NULL DEFAULT 'pending',
	`fulfillmentStatus` enum('unfulfilled','partial','fulfilled') NOT NULL DEFAULT 'unfulfilled',
	`trackingNumber` varchar(255),
	`trackingUrl` text,
	`itemCount` int DEFAULT 1,
	`orderData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pricing_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`ruleType` enum('margin_target','competitor_match','dynamic','clearance') NOT NULL DEFAULT 'margin_target',
	`config` json,
	`enabled` boolean NOT NULL DEFAULT true,
	`productsAffected` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pricing_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`price` int NOT NULL DEFAULT 0,
	`costPrice` int DEFAULT 0,
	`compareAtPrice` int,
	`sku` varchar(100),
	`imageUrl` text,
	`category` varchar(255),
	`supplier` varchar(255),
	`supplierUrl` text,
	`stockLevel` int NOT NULL DEFAULT 0,
	`lowStockThreshold` int DEFAULT 5,
	`status` enum('draft','active','out_of_stock','archived') NOT NULL DEFAULT 'draft',
	`shopifyProductId` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_keywords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`volume` int,
	`difficulty` int,
	`relevanceScore` int,
	`status` enum('suggested','active','rejected') NOT NULL DEFAULT 'suggested',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seo_keywords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `social_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`platform` enum('tiktok','instagram','facebook','twitter','pinterest') NOT NULL,
	`content` text,
	`imageUrl` text,
	`scheduledAt` timestamp,
	`publishedAt` timestamp,
	`status` enum('draft','scheduled','published','failed') NOT NULL DEFAULT 'draft',
	`engagement` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `social_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`shopifyDomain` varchar(255),
	`shopifyAccessToken` text,
	`niche` varchar(255),
	`status` enum('setup','active','paused','archived') NOT NULL DEFAULT 'setup',
	`currency` varchar(10) DEFAULT 'USD',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_id` PRIMARY KEY(`id`)
);
