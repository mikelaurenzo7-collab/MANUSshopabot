import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log("=== CLEANUP STARTING ===\n");

// 1. Delete duplicate stores (keep store ID 1, delete 2 and 3)
console.log("1. Removing duplicate stores...");
const [storeResult] = await conn.execute("DELETE FROM stores WHERE id IN (2, 3)");
console.log(`   Deleted ${storeResult.affectedRows} duplicate stores`);

// 2. Clear all agent tasks (all stuck in running)
console.log("2. Clearing agent tasks...");
const [taskResult] = await conn.execute("DELETE FROM agent_tasks");
console.log(`   Deleted ${taskResult.affectedRows} agent tasks`);

// 3. Clear all workflow steps
console.log("3. Clearing workflow steps...");
const [stepResult] = await conn.execute("DELETE FROM workflow_steps");
console.log(`   Deleted ${stepResult.affectedRows} workflow steps`);

// 4. Clear all agent workflows
console.log("4. Clearing agent workflows...");
const [wfResult] = await conn.execute("DELETE FROM agent_workflows");
console.log(`   Deleted ${wfResult.affectedRows} agent workflows`);

// 5. Clear approval queue
console.log("5. Clearing approval queue...");
const [aqResult] = await conn.execute("DELETE FROM approval_queue");
console.log(`   Deleted ${aqResult.affectedRows} approval items`);

// 6. Clear agent telemetry
console.log("6. Clearing agent telemetry...");
const [telResult] = await conn.execute("DELETE FROM agent_telemetry");
console.log(`   Deleted ${telResult.affectedRows} telemetry records`);

// 7. Clear bot execution logs
console.log("7. Clearing bot execution logs...");
try {
  const [belResult] = await conn.execute("DELETE FROM bot_execution_logs");
  console.log(`   Deleted ${belResult.affectedRows} execution logs`);
} catch (e) { console.log("   Skipped (table may not exist)"); }

// 8. Clear bot memory
console.log("8. Clearing bot memory...");
try {
  const [bmResult] = await conn.execute("DELETE FROM bot_memory");
  console.log(`   Deleted ${bmResult.affectedRows} memory records`);
} catch (e) { console.log("   Skipped (table may not exist)"); }

// 9. Clear bot events
console.log("9. Clearing bot events...");
try {
  const [beResult] = await conn.execute("DELETE FROM bot_events");
  console.log(`   Deleted ${beResult.affectedRows} bot events`);
} catch (e) { console.log("   Skipped (table may not exist)"); }

// 10. Clear webhook events
console.log("10. Clearing webhook events...");
try {
  const [weResult] = await conn.execute("DELETE FROM webhook_events");
  console.log(`   Deleted ${weResult.affectedRows} webhook events`);
} catch (e) { console.log("   Skipped (table may not exist)"); }

// 11. Clear job queue
console.log("11. Clearing job queue...");
try {
  const [jqResult] = await conn.execute("DELETE FROM job_queue");
  console.log(`   Deleted ${jqResult.affectedRows} job queue items`);
} catch (e) { console.log("   Skipped (table may not exist)"); }

// 12. Remove duplicate users — keep the FIRST (lowest id) per openId
console.log("12. Removing duplicate users...");
// For each distinct openId, keep the min(id) and delete the rest
const [dupeUsers] = await conn.execute(`
  SELECT u.id FROM users u
  INNER JOIN (
    SELECT openId, MIN(id) as keepId
    FROM users
    GROUP BY openId
  ) keeper ON u.openId = keeper.openId AND u.id != keeper.keepId
`);
console.log(`   Found ${dupeUsers.length} duplicate user rows to remove`);

if (dupeUsers.length > 0) {
  // Delete in batches of 500
  const ids = dupeUsers.map(r => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500);
    const placeholders = batch.map(() => "?").join(",");
    
    // First delete org_members referencing these users
    await conn.execute(`DELETE FROM org_members WHERE userId IN (${placeholders})`, batch);
    
    // Then delete the users
    const [delResult] = await conn.execute(`DELETE FROM users WHERE id IN (${placeholders})`, batch);
    console.log(`   Batch ${Math.floor(i/500)+1}: deleted ${delResult.affectedRows} users`);
  }
}

// 13. Set the founder (user 240002 / kghzrrQPp2d7qBFtcQJXJ7) to admin with free subscription
console.log("\n13. Setting founder account to admin with free 'scale' plan...");
// First check which user id remains for the founder openId
const [founderRows] = await conn.execute("SELECT id FROM users WHERE openId = 'kghzrrQPp2d7qBFtcQJXJ7' ORDER BY id ASC LIMIT 1");
if (founderRows.length > 0) {
  const founderId = founderRows[0].id;
  await conn.execute(
    "UPDATE users SET role = 'admin', stripePlan = 'scale', stripeSubscriptionStatus = 'active' WHERE id = ?",
    [founderId]
  );
  console.log(`   User ${founderId} → admin + scale plan + active subscription`);
  
  // Also ensure they're in org 1 as owner
  const [existingMember] = await conn.execute("SELECT id FROM org_members WHERE orgId = 1 AND userId = ?", [founderId]);
  if (existingMember.length === 0) {
    await conn.execute("INSERT INTO org_members (orgId, userId, role, invitedAt, joinedAt) VALUES (1, ?, 'owner', NOW(), NOW())", [founderId]);
    console.log(`   Added user ${founderId} as owner of org 1`);
  }
  
  // Set their currentOrgId
  await conn.execute("UPDATE users SET currentOrgId = 1 WHERE id = ?", [founderId]);
  console.log(`   Set currentOrgId = 1`);
} else {
  console.log("   WARNING: Founder user not found after dedup!");
}

// 14. Also set user 1 (OWNER_OPEN_ID) to admin with free scale plan
console.log("14. Setting system owner to admin with free 'scale' plan...");
await conn.execute(
  "UPDATE users SET role = 'admin', stripePlan = 'scale', stripeSubscriptionStatus = 'active' WHERE id = 1"
);
console.log("   User 1 → admin + scale plan + active subscription");

// Final verification
console.log("\n=== VERIFICATION ===");
const [uc] = await conn.execute("SELECT COUNT(*) as c FROM users");
console.log("Total users:", uc[0].c);
const [sc] = await conn.execute("SELECT COUNT(*) as c FROM stores");
console.log("Total stores:", sc[0].c);
const [wc] = await conn.execute("SELECT COUNT(*) as c FROM agent_workflows");
console.log("Total workflows:", wc[0].c);
const [tc] = await conn.execute("SELECT COUNT(*) as c FROM agent_tasks");
console.log("Total agent tasks:", tc[0].c);

// Show remaining users
const [remaining] = await conn.execute("SELECT id, openId, name, email, role, stripePlan, stripeSubscriptionStatus, currentOrgId FROM users ORDER BY id");
console.log("\nRemaining users:");
console.table(remaining);

// Show remaining stores
const [remainingStores] = await conn.execute("SELECT id, name, platform, platformDomain, status FROM stores");
console.log("\nRemaining stores:");
console.table(remainingStores);

await conn.end();
console.log("\n=== CLEANUP COMPLETE ===");
