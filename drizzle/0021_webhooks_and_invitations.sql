-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0021: SendGrid event webhook + email-based org invitations
--
-- Two independent feature additions, packaged together because they
-- both build on the multi-tenancy + delivery layer landed in 0020.
-- Idempotent guards (CREATE TABLE IF NOT EXISTS) so it's safe to
-- re-run during dev.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Email delivery events (SendGrid event webhook target) -------------------
CREATE TABLE IF NOT EXISTS `email_delivery_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `providerMessageId` varchar(255) NOT NULL,
  `eventId` varchar(128),
  `eventType` varchar(32) NOT NULL,
  `email` varchar(320),
  `campaignId` int,
  `categories` json,
  `url` text,
  `reason` text,
  `occurredAt` timestamp NOT NULL,
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `email_delivery_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE INDEX `email_delivery_events_provider_msg_idx` ON `email_delivery_events` (`providerMessageId`);
--> statement-breakpoint
CREATE INDEX `email_delivery_events_campaign_idx` ON `email_delivery_events` (`campaignId`);
--> statement-breakpoint
CREATE INDEX `email_delivery_events_event_type_idx` ON `email_delivery_events` (`eventType`);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_delivery_events_event_id_unique` ON `email_delivery_events` (`eventId`);
--> statement-breakpoint

-- 2. Organization invitations (email-based) ----------------------------------
CREATE TABLE IF NOT EXISTS `org_invitations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `orgId` int NOT NULL,
  `email` varchar(320) NOT NULL,
  `role` enum('admin','member') NOT NULL DEFAULT 'member',
  `token` varchar(64) NOT NULL,
  `invitedByUserId` int NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `acceptedAt` timestamp,
  `acceptedByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `org_invitations_id` PRIMARY KEY(`id`),
  CONSTRAINT `org_invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint

CREATE INDEX `org_invitations_org_id_idx` ON `org_invitations` (`orgId`);
--> statement-breakpoint
CREATE INDEX `org_invitations_email_idx` ON `org_invitations` (`email`);
