import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);

  // 1. Find all users associated with the owner (mikelaurenzo7, mlaurenzo8, etc.)
  const [users] = await conn.execute(
    `SELECT id, email, name, role, stripePlan FROM users WHERE 
     email LIKE '%laurenzo%' OR name LIKE '%Laurenzo%' OR name LIKE '%Michael%'
     ORDER BY id`
  ) as any;
  console.log("=== OWNER ACCOUNTS FOUND ===");
  console.log(JSON.stringify(users, null, 2));

  // 2. Promote all of them to Scale plan (unlimited stores)
  const userIds = users.map((u: any) => u.id);
  if (userIds.length > 0) {
    await conn.execute(
      `UPDATE users SET stripePlan = 'scale', role = 'admin' WHERE id IN (${userIds.join(",")})`
    );
    console.log(`\n✅ Promoted ${userIds.length} accounts to Scale plan (unlimited stores)`);
  }

  // 3. Also promote the org owner by orgId
  const [orgs] = await conn.execute(
    `SELECT id, name, ownerId FROM organizations WHERE id IN (
      SELECT orgId FROM stores WHERE id = 30003
    )`
  ) as any;
  console.log("\n=== ORGS FOR STORE 30003 ===");
  console.log(JSON.stringify(orgs, null, 2));

  if (orgs.length > 0) {
    const orgOwnerIds = orgs.map((o: any) => o.ownerId).filter(Boolean);
    if (orgOwnerIds.length > 0) {
      await conn.execute(
        `UPDATE users SET stripePlan = 'scale', role = 'admin' WHERE id IN (${orgOwnerIds.join(",")})`
      );
      console.log(`✅ Promoted org owners to Scale plan`);
    }
  }

  // 4. Fix the stuck workflow 210024 — reset step 1 (Brand Identity) from 'running' to 'pending'
  // so the workflow engine can re-execute it
  const [stepResult] = await conn.execute(
    `UPDATE workflow_steps SET status = 'pending', startedAt = NULL, output = NULL, error = NULL
     WHERE workflowId = 210024 AND stepIndex = 1 AND status = 'running'`
  ) as any;
  console.log(`\n✅ Reset stuck Brand Identity step: ${stepResult.affectedRows} row(s) updated`);

  // Also reset the workflow itself to pending so the engine picks it up
  const [wfResult] = await conn.execute(
    `UPDATE agent_workflows SET status = 'pending', currentStepIndex = 1
     WHERE id = 210024 AND status = 'running'`
  ) as any;
  console.log(`✅ Reset workflow 210024 to pending: ${wfResult.affectedRows} row(s) updated`);

  // 5. Verify final state
  const [finalUsers] = await conn.execute(
    `SELECT id, email, name, role, stripePlan FROM users WHERE id IN (${userIds.join(",")})` 
  ) as any;
  console.log("\n=== FINAL USER STATE ===");
  console.log(JSON.stringify(finalUsers, null, 2));

  const [finalWf] = await conn.execute(
    `SELECT id, workflowType, status, currentStepIndex FROM agent_workflows WHERE id = 210024`
  ) as any;
  console.log("\n=== FINAL WORKFLOW STATE ===");
  console.log(JSON.stringify(finalWf, null, 2));

  await conn.end();
}

main().catch(console.error);
