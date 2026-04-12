ALTER TABLE `stores` ADD `platform` enum('shopify','woocommerce','amazon','etsy','ebay','tiktok_shop','walmart') DEFAULT 'shopify' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `platformDomain` varchar(255);--> statement-breakpoint
ALTER TABLE `stores` ADD `platformAccessToken` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `platformStoreId` varchar(255);--> statement-breakpoint
ALTER TABLE `stores` DROP COLUMN `shopifyDomain`;--> statement-breakpoint
ALTER TABLE `stores` DROP COLUMN `shopifyAccessToken`;