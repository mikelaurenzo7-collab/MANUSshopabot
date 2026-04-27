-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0020: multi-tenancy foundation
--
-- Adds organizations + org_members tables, plus stores.orgId and
-- users.currentOrgId. Backfills a personal org for every existing user
-- and assigns each store to its creator's org. Idempotent guards make
-- it safe to re-run during dev.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create organizations table -----------------------------------------------
CREATE TABLE IF NOT EXISTS `organizations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `slug` varchar(80) NOT NULL,
  `ownerId` int NOT NULL,
  `kind` enum('personal','team') NOT NULL DEFAULT 'personal',
  `plan` enum('starter','growth','pro','scale'),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
  CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint

CREATE INDEX `organizations_owner_id_idx` ON `organizations` (`ownerId`);
--> statement-breakpoint

-- 2. Create org_members table -------------------------------------------------
CREATE TABLE IF NOT EXISTS `org_members` (
  `id` int AUTO_INCREMENT NOT NULL,
  `orgId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
  `invitedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `joinedAt` timestamp,
  `invitedByUserId` int,
  CONSTRAINT `org_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE UNIQUE INDEX `org_members_org_user_unique` ON `org_members` (`orgId`, `userId`);
--> statement-breakpoint
CREATE INDEX `org_members_user_id_idx` ON `org_members` (`userId`);
--> statement-breakpoint
CREATE INDEX `org_members_org_id_idx` ON `org_members` (`orgId`);
--> statement-breakpoint

-- 3. Add currentOrgId to users ------------------------------------------------
ALTER TABLE `users` ADD COLUMN `currentOrgId` int;
--> statement-breakpoint

-- 4. Add orgId to stores (nullable initially so backfill can run) -------------
ALTER TABLE `stores` ADD COLUMN `orgId` int;
--> statement-breakpoint

-- 5. Backfill: create a personal org for every existing user ------------------
-- Slug = "user-<id>"; collisions are impossible because user IDs are unique.
INSERT INTO `organizations` (`name`, `slug`, `ownerId`, `kind`, `plan`)
SELECT
  COALESCE(NULLIF(TRIM(`name`), ''), CONCAT('User ', `id`)) AS name,
  CONCAT('user-', `id`) AS slug,
  `id` AS ownerId,
  'personal' AS kind,
  `stripePlan` AS plan
FROM `users`
WHERE `id` NOT IN (SELECT `ownerId` FROM `organizations` WHERE `kind` = 'personal');
--> statement-breakpoint

-- 6. Backfill: add owner membership for each personal org ---------------------
INSERT INTO `org_members` (`orgId`, `userId`, `role`, `joinedAt`)
SELECT
  o.`id` AS orgId,
  o.`ownerId` AS userId,
  'owner' AS role,
  CURRENT_TIMESTAMP AS joinedAt
FROM `organizations` o
WHERE o.`kind` = 'personal'
  AND NOT EXISTS (
    SELECT 1 FROM `org_members` m
    WHERE m.`orgId` = o.`id` AND m.`userId` = o.`ownerId`
  );
--> statement-breakpoint

-- 7. Backfill: set users.currentOrgId to their personal org -------------------
UPDATE `users` u
JOIN `organizations` o ON o.`ownerId` = u.`id` AND o.`kind` = 'personal'
SET u.`currentOrgId` = o.`id`
WHERE u.`currentOrgId` IS NULL;
--> statement-breakpoint

-- 8. Backfill: every existing store gets the orgId of its creator's org -------
UPDATE `stores` s
JOIN `organizations` o ON o.`ownerId` = s.`userId` AND o.`kind` = 'personal'
SET s.`orgId` = o.`id`
WHERE s.`orgId` IS NULL;
--> statement-breakpoint

-- 9. Now that backfill is done, lock orgId NOT NULL on stores -----------------
ALTER TABLE `stores` MODIFY COLUMN `orgId` int NOT NULL;
--> statement-breakpoint

CREATE INDEX `stores_org_id_idx` ON `stores` (`orgId`);
