/**
 * Restart workflow 210024 (complete_store_buildout) from step 1.
 * Uses direct DB updates + HTTP trigger to the live server.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);
  const workflowId = 210024;

  // 1. Get current state
  const [wf] = await conn.execute(
    "SELECT id, workflowType, status, currentStepIndex, userId, storeId, input FROM agent_workflows WHERE id = ?",
    [workflowId]
  ) as any;
  
  if (!wf[0]) {
    console.error("Workflow 210024 not found");
    await conn.end();
    process.exit(1);
  }
  
  console.log("Current workflow:", {
    id: wf[0].id,
    type: wf[0].workflowType,
    status: wf[0].status,
    currentStepIndex: wf[0].currentStepIndex,
  });

  // 2. Get all steps
  const [steps] = await conn.execute(
    "SELECT id, stepIndex, title, status FROM workflow_steps WHERE workflowId = ? ORDER BY stepIndex",
    [workflowId]
  ) as any;
  
  console.log("Steps:", steps.map((s: any) => ({ index: s.stepIndex, title: s.title, status: s.status })));

  // 3. Reset step 1 (Brand Identity) to pending
  const step1 = steps.find((s: any) => s.stepIndex === 1);
  if (step1) {
    await conn.execute(
      "UPDATE workflow_steps SET status = 'pending', startedAt = NULL, output = NULL, error = NULL WHERE id = ?",
      [step1.id]
    );
    console.log(`\n✅ Reset step 1 (${step1.title}) to pending`);
  }

  // 4. Set workflow back to running at step 1
  await conn.execute(
    "UPDATE agent_workflows SET status = 'running', currentStepIndex = 1, error = NULL, updatedAt = NOW() WHERE id = ?",
    [workflowId]
  );
  console.log("✅ Workflow 210024 set back to running at step 1");

  // 5. Verify
  const [final] = await conn.execute(
    "SELECT id, workflowType, status, currentStepIndex FROM agent_workflows WHERE id = ?",
    [workflowId]
  ) as any;
  console.log("\nFinal state:", final[0]);
  
  await conn.end();
  
  // 6. Trigger the workflow engine via HTTP to the live server
  console.log("\nTriggering workflow engine via HTTP...");
  try {
    const serverUrl = process.env.ALLOWED_ORIGINS?.split(",")[0]?.trim() || "http://localhost:3000";
    const response = await fetch(`${serverUrl}/api/trpc/workflows.triggerEngine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId }),
    });
    console.log("HTTP trigger response:", response.status);
  } catch (e) {
    console.log("HTTP trigger not available — workflow will be picked up by scheduler on next tick");
  }
  
  console.log("\n✅ Done. The workflow will resume from Brand Identity step.");
  console.log("   Monitor progress in the Workflows tab of the app.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
