/**
 * Founder Account Cleanup Script
 * - List all stores (identify duplicates)
 * - List workflow counts
 * - Remove duplicate stores (keep lowest ID per platformDomain)
 * - Clear all workflows
 */
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

console.log("\n=== STORES ===");
const [stores] = await conn.execute("SELECT id, orgId, userId, name, platform, platformDomain, platformStoreId, status FROM stores ORDER BY id");
console.table(stores);

console.log("\n=== DUPLICATE STORES (same platformDomain) ===");
const [dupes] = await conn.execute(`
  SELECT platformDomain, COUNT(*) as cnt, GROUP_CONCAT(id ORDER BY id) as ids
  FROM stores 
  WHERE platformDomain IS NOT NULL
  GROUP BY platformDomain 
  HAVING COUNT(*) > 1
`);
console.table(dupes);

console.log("\n=== WORKFLOWS ===");
const [wfCounts] = await conn.execute(`
  SELECT status, COUNT(*) as cnt 
  FROM agent_workflows 
  GROUP BY status
`);
console.table(wfCounts);

const [totalWf] = await conn.execute("SELECT COUNT(*) as total FROM agent_workflows");
console.log(`Total workflows: ${totalWf[0].total}`);

console.log("\n=== AGENT TASKS ===");
const [taskCounts] = await conn.execute(`
  SELECT agentType, status, COUNT(*) as cnt 
  FROM agent_tasks 
  GROUP BY agentType, status
`);
console.table(taskCounts);

const [totalTasks] = await conn.execute("SELECT COUNT(*) as total FROM agent_tasks");
console.log(`Total agent tasks: ${totalTasks[0].total}`);

console.log("\n=== APPROVAL QUEUE ===");
const [approvalCounts] = await conn.execute("SELECT COUNT(*) as total FROM approval_queue");
console.log(`Total approval items: ${approvalCounts[0].total}`);

console.log("\n=== PLATFORM CREDENTIALS ===");
const [creds] = await conn.execute("SELECT id, storeId, platform, platformAccountId, status FROM platform_credentials ORDER BY id");
console.table(creds);

console.log("\n=== USERS ===");
const [users] = await conn.execute("SELECT id, openId, name, email, role, subscriptionStatus, subscriptionPlan FROM users");
console.table(users);

await conn.end();
console.log("\nDone inspecting. Run with --clean flag to actually clean up.");
