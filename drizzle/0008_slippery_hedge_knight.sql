ALTER TABLE `agent_tasks` MODIFY COLUMN `agentType` enum('architect','merchant','social') NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_telemetry` MODIFY COLUMN `agentType` enum('architect','merchant','social') NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_workflows` MODIFY COLUMN `agentType` enum('architect','merchant','social') NOT NULL;--> statement-breakpoint
ALTER TABLE `approval_queue` MODIFY COLUMN `agentType` enum('architect','merchant','social') NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_config` MODIFY COLUMN `agentType` enum('architect','merchant','social') NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `agentType` enum('architect','merchant','social','system') NOT NULL;