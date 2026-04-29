import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Count users
const [uc] = await conn.execute("SELECT COUNT(*) as c FROM users");
console.log("Total users:", uc[0].c);

// 2. Find the real founder (user 240002)
const [founder] = await conn.execute("SELECT id, openId, name, email, role, stripePlan, stripeSubscriptionStatus FROM users WHERE id = 240002");
console.log("Founder:", JSON.stringify(founder[0]));

// 3. Count duplicate users with same openId as founder
const founderOpenId = founder[0]?.openId;
const [dupeCount] = await conn.execute("SELECT COUNT(*) as c FROM users WHERE openId = ?", [founderOpenId]);
console.log("Users with founder openId:", dupeCount[0].c);

// 4. Stores info
const [stores] = await conn.execute("SELECT id, name, platform, platformDomain, status FROM stores ORDER BY id");
console.log("\nStores:", JSON.stringify(stores));

// 5. Workflow counts
const [wf] = await conn.execute("SELECT status, COUNT(*) as c FROM agent_workflows GROUP BY status");
console.log("\nWorkflows:", JSON.stringify(wf));

// 6. Agent task counts
const [at] = await conn.execute("SELECT status, COUNT(*) as c FROM agent_tasks GROUP BY status");
console.log("\nAgent tasks:", JSON.stringify(at));

// 7. Products count
const [pc] = await conn.execute("SELECT COUNT(*) as c FROM products");
console.log("\nProducts:", pc[0].c);

// 8. Orders count
const [oc] = await conn.execute("SELECT COUNT(*) as c FROM orders");
console.log("\nOrders:", oc[0].c);

// 9. Bot events count
const [be] = await conn.execute("SELECT COUNT(*) as c FROM bot_events");
console.log("Bot events:", be[0].c);

// 10. Webhook events count
const [we] = await conn.execute("SELECT COUNT(*) as c FROM webhook_events");
console.log("Webhook events:", we[0].c);

await conn.end();
