-- Migration 0031: per-workspace multi-session chat (Claude-Code-style).
--
-- Each workspace already had ONE continuous chat thread via
-- `workspace_chat_messages`. This migration introduces
-- `workspace_chat_sessions` so a single workspace can hold many
-- independent conversations (start a new chat, resume any past chat,
-- pin important ones, archive stale ones), and links every chat
-- message to a session via a new nullable `sessionId` column.
--
-- Backward compatibility: existing messages keep `sessionId = NULL`.
-- The server adopts loose messages into a single "Continued from
-- earlier" session per workspace on first sidebar load, so no data
-- is lost and no destructive backfill SQL is required here.

CREATE TABLE `workspace_chat_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `workspaceId` int NOT NULL,
  `createdByUserId` int NOT NULL,
  `title` varchar(255) NOT NULL DEFAULT 'New chat',
  `summary` text,
  `pinned` boolean NOT NULL DEFAULT false,
  `archived` boolean NOT NULL DEFAULT false,
  `archivedAt` timestamp NULL,
  `messageCount` int NOT NULL DEFAULT 0,
  `lastMessageAt` timestamp NULL,
  `lastMessagePreview` varchar(280),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `workspace_chat_sessions_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE INDEX `workspace_chat_sessions_workspace_idx`
  ON `workspace_chat_sessions` (`workspaceId`, `archived`, `lastMessageAt`);
--> statement-breakpoint
CREATE INDEX `workspace_chat_sessions_pinned_idx`
  ON `workspace_chat_sessions` (`workspaceId`, `pinned`, `lastMessageAt`);
--> statement-breakpoint
ALTER TABLE `workspace_chat_messages` ADD COLUMN `sessionId` int NULL;
--> statement-breakpoint
CREATE INDEX `workspace_chat_messages_session_id_idx`
  ON `workspace_chat_messages` (`sessionId`, `createdAt`);
