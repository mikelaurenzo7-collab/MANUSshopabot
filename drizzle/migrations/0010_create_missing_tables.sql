-- Migration: Create all missing tables from schema
-- Tables: workflow_pause_points, execution_overrides, bot_plugins, installed_plugins,
--         purchase_orders, po_line_items, prompt_variants, prompt_metrics

CREATE TABLE IF NOT EXISTS `workflow_pause_points` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `workflowId` INT NOT NULL,
  `stepId` INT NOT NULL,
  `pauseReason` VARCHAR(500) NOT NULL,
  `overrideRequired` BOOLEAN DEFAULT true,
  `autoResumeConfig` JSON,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `execution_overrides` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `agentTaskId` INT NOT NULL,
  `overriddenByUserId` INT,
  `actionTaken` VARCHAR(50) NOT NULL,
  `reason` VARCHAR(500),
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `bot_plugins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `pluginName` VARCHAR(150) NOT NULL,
  `version` VARCHAR(50) NOT NULL,
  `description` TEXT,
  `author` VARCHAR(100) NOT NULL,
  `category` VARCHAR(50) DEFAULT 'utility',
  `iconUrl` VARCHAR(500),
  `webhookConfig` JSON,
  `eventTypes` JSON,
  `status` VARCHAR(50) DEFAULT 'active' NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `installed_plugins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `pluginId` INT NOT NULL,
  `configJson` JSON,
  `enabled` BOOLEAN DEFAULT true NOT NULL,
  `installedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `purchase_orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `storeId` INT NOT NULL,
  `supplierId` VARCHAR(150),
  `poNumber` VARCHAR(150) NOT NULL,
  `totalCents` INT NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
  `notes` TEXT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `po_line_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `poId` INT NOT NULL,
  `productId` INT NOT NULL,
  `quantity` INT NOT NULL,
  `unitCostCents` INT NOT NULL,
  `receivedQty` INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `prompt_variants` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `agentType` VARCHAR(50) NOT NULL,
  `taskType` VARCHAR(100) NOT NULL,
  `variantName` VARCHAR(50) NOT NULL,
  `promptTemplate` TEXT NOT NULL,
  `isActive` BOOLEAN DEFAULT false,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `prompt_metrics` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `variantId` INT NOT NULL,
  `storeId` INT,
  `successRate` INT,
  `invocations` INT DEFAULT 0,
  `conversions` INT DEFAULT 0,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
