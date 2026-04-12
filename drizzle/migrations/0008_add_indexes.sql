-- Performance indexes for ShopBot
-- These composite indexes optimize the most common query patterns

-- Orders: filtered by store + status (fulfillment queries)
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders (storeId, status);
-- Orders: filtered by store + creation date (activity feed, analytics)
CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders (storeId, createdAt);

-- Products: filtered by store + status (inventory queries)
CREATE INDEX IF NOT EXISTS idx_products_store_status ON products (storeId, status);
-- Products: filtered by store + creation date (product listing)
CREATE INDEX IF NOT EXISTS idx_products_store_created ON products (storeId, createdAt);

-- Agent telemetry: filtered by agent type + creation date (telemetry dashboard)
CREATE INDEX IF NOT EXISTS idx_telemetry_agent_created ON agent_telemetry (agentType, createdAt);
-- Agent telemetry: filtered by store + creation date (store-specific analytics)
CREATE INDEX IF NOT EXISTS idx_telemetry_store_created ON agent_telemetry (storeId, createdAt);

-- Stores: filtered by user + status (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_stores_user_status ON stores (userId, status);

-- Agent workflows: filtered by user + status (workflow listing)
CREATE INDEX IF NOT EXISTS idx_workflows_user_status ON agent_workflows (userId, status);
-- Agent workflows: filtered by creation date (activity feed)
CREATE INDEX IF NOT EXISTS idx_workflows_created ON agent_workflows (createdAt);

-- Agent tasks: filtered by agent type + creation date (activity log)
CREATE INDEX IF NOT EXISTS idx_tasks_agent_created ON agent_tasks (agentType, createdAt);
-- Agent tasks: filtered by store (store-specific activity)
CREATE INDEX IF NOT EXISTS idx_tasks_store ON agent_tasks (storeId);

-- Platform credentials: filtered by user + platform (OAuth queries)
CREATE INDEX IF NOT EXISTS idx_creds_user_platform ON platform_credentials (userId, platform);

-- Social accounts: filtered by user + platform (social dashboard)
CREATE INDEX IF NOT EXISTS idx_social_user_platform ON social_accounts (userId, platform);

-- Notifications: filtered by user + read status (notification bell)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (userId, isRead);
