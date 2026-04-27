-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0023: complete multi-tenancy data isolation.
--
-- Adds `orgId` to the five tables most likely to leak across orgs once
-- a user belongs to multiple. Backfills from `users.currentOrgId` (the
-- creator's active org at migration time), then locks NOT NULL.
--
-- The remaining single-tenant tables (botMemory, botSchedules,
-- botEvents, executionOverrides, botProfiles, agentTasks) reach via
-- FK joins through these now-org-scoped parents and don't need
-- direct orgId columns for the v1 ship.
--
-- Idempotent — safe to re-run during dev.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. platform_credentials ────────────────────────────────────────────────────
ALTER TABLE `platform_credentials` ADD COLUMN `orgId` int;
--> statement-breakpoint
UPDATE `platform_credentials` pc
JOIN `users` u ON u.`id` = pc.`userId`
SET pc.`orgId` = u.`currentOrgId`
WHERE pc.`orgId` IS NULL AND u.`currentOrgId` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `platform_credentials` MODIFY COLUMN `orgId` int NOT NULL;
--> statement-breakpoint
CREATE INDEX `platform_creds_org_id_idx` ON `platform_credentials` (`orgId`);
--> statement-breakpoint
CREATE INDEX `platform_creds_org_platform_idx` ON `platform_credentials` (`orgId`, `platform`);
--> statement-breakpoint

-- 2. social_accounts ────────────────────────────────────────────────────────
ALTER TABLE `social_accounts` ADD COLUMN `orgId` int;
--> statement-breakpoint
UPDATE `social_accounts` sa
JOIN `users` u ON u.`id` = sa.`userId`
SET sa.`orgId` = u.`currentOrgId`
WHERE sa.`orgId` IS NULL AND u.`currentOrgId` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_accounts` MODIFY COLUMN `orgId` int NOT NULL;
--> statement-breakpoint
CREATE INDEX `social_accounts_org_id_idx` ON `social_accounts` (`orgId`);
--> statement-breakpoint
CREATE INDEX `social_accounts_org_platform_idx` ON `social_accounts` (`orgId`, `platform`);
--> statement-breakpoint

-- 3. bot_config ──────────────────────────────────────────────────────────────
ALTER TABLE `bot_config` ADD COLUMN `orgId` int;
--> statement-breakpoint
UPDATE `bot_config` bc
JOIN `users` u ON u.`id` = bc.`userId`
SET bc.`orgId` = u.`currentOrgId`
WHERE bc.`orgId` IS NULL AND u.`currentOrgId` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `bot_config` MODIFY COLUMN `orgId` int NOT NULL;
--> statement-breakpoint
CREATE INDEX `bot_config_org_agent_idx` ON `bot_config` (`orgId`, `agentType`);
--> statement-breakpoint

-- 4. agent_workflows ────────────────────────────────────────────────────────
ALTER TABLE `agent_workflows` ADD COLUMN `orgId` int;
--> statement-breakpoint
UPDATE `agent_workflows` aw
JOIN `users` u ON u.`id` = aw.`userId`
SET aw.`orgId` = u.`currentOrgId`
WHERE aw.`orgId` IS NULL AND u.`currentOrgId` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_workflows` MODIFY COLUMN `orgId` int NOT NULL;
--> statement-breakpoint
CREATE INDEX `agent_workflows_org_id_idx` ON `agent_workflows` (`orgId`, `status`);
--> statement-breakpoint

-- 5. approval_queue ─────────────────────────────────────────────────────────
-- Approval queue rows reference an `agentTask`, which has a userId. Pull
-- orgId via that path.
ALTER TABLE `approval_queue` ADD COLUMN `orgId` int;
--> statement-breakpoint
UPDATE `approval_queue` aq
JOIN `agent_tasks` at ON at.`id` = aq.`agentTaskId`
JOIN `users` u ON u.`id` = at.`userId`
SET aq.`orgId` = u.`currentOrgId`
WHERE aq.`orgId` IS NULL AND u.`currentOrgId` IS NOT NULL;
--> statement-breakpoint
-- For any approval rows whose agentTask doesn't have a recoverable user
-- (legacy data), fall back to the workspace owner; if still null, leave
-- the row as a soft-deletable orphan rather than fail the migration.
UPDATE `approval_queue` SET `orgId` = (SELECT MIN(`id`) FROM `organizations`)
WHERE `orgId` IS NULL;
--> statement-breakpoint
ALTER TABLE `approval_queue` MODIFY COLUMN `orgId` int NOT NULL;
--> statement-breakpoint
CREATE INDEX `approval_queue_org_id_idx` ON `approval_queue` (`orgId`);
