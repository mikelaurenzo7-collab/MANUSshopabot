/**
 * Direct workflow launcher — bypasses HTTP and calls launchWorkflow() directly.
 * Run with: cd /home/ubuntu/beast-bots && npx tsx launch_buildout.ts
 */

// Import workflow registrations to populate the registry
import "./server/engine/architectWorkflows";
import "./server/engine/merchantWorkflows";
import "./server/engine/socialWorkflows";

import { launchWorkflow } from "./server/engine/workflowEngine";
import * as db from "./server/db";

const USER_ID = 781192;
const STORE_ID = 30003;
const ORG_ID = 30001;

async function main() {
  console.log("🚀 Launching complete_store_buildout for laurenzo-4 (store id=30003)...");
  console.log("   Niche: Golf Accessories");
  console.log("   Suppliers: Printful + CJ Dropshipping");
  console.log("   Target products: 20");
  console.log("");

  const workflowId = await launchWorkflow(
    USER_ID,
    {
      agentType: "architect",
      workflowType: "complete_store_buildout",
      title: "Complete Store Buildout: Golf Accessories — laurenzo-4",
      description: "Full autonomous store buildout: niche validation, product sourcing from Printful/CJ, catalog generation, Shopify import, and SEO optimization for laurenzo-4.",
      scope: "specific_store",
      storeId: STORE_ID,
      input: {
        niche: "golf accessories",
        storeName: "laurenzo-4",
        productCount: 20,
        targetMargin: 40,
        suppliers: ["printful", "cj"],
        platforms: ["shopify"],
      },
      steps: [],
    },
    { orgId: ORG_ID },
  );

  console.log(`✅ Workflow launched!`);
  console.log(`   Workflow ID: ${workflowId}`);
  console.log(`   Type: complete_store_buildout`);
  console.log(`   Store: laurenzo-4 (id=${STORE_ID})`);
  console.log("");

  // Poll for 5 seconds to show initial step progress
  console.log("⏳ Waiting 5s for initial steps to execute...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  const wf = await db.getWorkflowById(workflowId);
  const steps = await db.getWorkflowSteps(workflowId);

  console.log("\n📊 Workflow status:");
  console.log(`   Status: ${wf?.status}`);
  console.log(`   Steps (${steps.length} total):`);
  for (const step of steps) {
    const icon = step.status === "completed" ? "✅" : step.status === "running" ? "⏳" : step.status === "failed" ? "❌" : step.status === "awaiting_approval" ? "🔔" : "⏸️";
    const result = step.result ? ` → ${JSON.stringify(step.result).slice(0, 80)}` : "";
    console.log(`   ${icon} [${step.status}] ${step.stepId}${result}`);
  }
}

main().catch(err => {
  console.error("❌ Launch failed:", err.message || err);
  process.exit(1);
});
