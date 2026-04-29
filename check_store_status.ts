import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);

  // Store info
  const [stores] = await conn.execute("SELECT * FROM stores WHERE id = 30003") as any;
  console.log("=== STORE ===");
  const s = stores[0];
  if (s?.platformAccessToken) s.platformAccessToken = "[SET - " + s.platformAccessToken.substring(0, 8) + "...]";
  console.log(JSON.stringify(s, null, 2));

  // All workflows for this store
  const [workflows] = await conn.execute(`
    SELECT id, workflowType, status, createdAt, completedAt,
           SUBSTRING(output, 1, 500) as output_preview
    FROM agent_workflows 
    WHERE storeId = 30003 
    ORDER BY createdAt DESC 
    LIMIT 20
  `) as any;
  console.log("\n=== WORKFLOWS (most recent first) ===");
  console.log(JSON.stringify(workflows, null, 2));

  // Workflow steps for the most recent complete_store_buildout
  const [steps] = await conn.execute(`
    SELECT ws.stepIndex, ws.stepType, ws.title, ws.status, ws.createdAt,
           SUBSTRING(ws.output, 1, 400) as output_preview
    FROM workflow_steps ws
    JOIN agent_workflows aw ON ws.workflowId = aw.id
    WHERE aw.storeId = 30003 AND aw.workflowType = 'complete_store_buildout'
    ORDER BY aw.createdAt DESC, ws.stepIndex ASC
    LIMIT 30
  `) as any;
  console.log("\n=== STORE BUILDOUT STEPS ===");
  console.log(JSON.stringify(steps, null, 2));

  // Products in local DB
  const [products] = await conn.execute(
    "SELECT id, title, status, price, supplier, platformProductId, createdAt FROM products WHERE storeId = 30003 LIMIT 30"
  ) as any;
  console.log("\n=== LOCAL PRODUCTS (" + products.length + " total) ===");
  console.log(JSON.stringify(products, null, 2));

  // Platform credentials
  const [creds] = await conn.execute(
    "SELECT platform, status, platformAccountName, lastHealthCheck, createdAt FROM platform_credentials WHERE storeId = 30003"
  ) as any;
  console.log("\n=== CREDENTIALS ===");
  console.log(JSON.stringify(creds, null, 2));

  await conn.end();
}

main().catch(console.error);
