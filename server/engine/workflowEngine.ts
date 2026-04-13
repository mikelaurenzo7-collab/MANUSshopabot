/**
 * orchAIstrate Workflow Engine
 * 
 * The orchestration brain. Manages the lifecycle of multi-step bot workflows:
 * 1. Creates workflows with defined step pipelines
 * 2. Executes steps sequentially (LLM calls, API calls, image gen, etc.)
 * 3. Pauses at approval gates for human-on-the-loop review
 * 4. Handles errors, retries, and cancellation
 * 5. Notifies the owner on completion, failures, and approval requests
 * 
 * Architecture: Three global agents per user, store-aware task routing.
 * Each workflow has a scope: specific_store, all_stores, or global.
 */

import {
  createWorkflow, updateWorkflow, getWorkflowById,
  createWorkflowSteps, getWorkflowSteps, updateWorkflowStep, getBestPromptVariant, getWorkflowStepById,
  createAgentTask, createNotification, createApprovalItem,
  getStoresByUser, getStoreById, getBotConfigs, withTransaction,
} from "../db";
import { invokeLLM } from "../_core/llm";
import { generateImage } from "../_core/imageGeneration";
import { notifyOwner } from "../_core/notification";
import {
  syncProductsFromStore,
  pushProductToStore,
  fulfillOrderOnPlatform,
  checkInventoryAcrossStores,
  publishSocialPost,
  scheduleSocialPost,
  launchAdCampaign,
  getCrossPlatformSocialAnalytics,
} from "./platformBridge";
import type { InsertAgentWorkflow, InsertWorkflowStep } from "../../drizzle/schema";
import { logAgentAction } from "../telemetry";

// ─── Types ─────────────────────────────────────────────────────────────────

export type StepType = "llm_call" | "api_call" | "image_generation" | "data_transform" | "approval_gate" | "notification" | "store_action" | "analysis";

export interface WorkflowStepDefinition {
  stepType: StepType;
  title: string;
  description?: string;
  requiresApproval?: boolean;
  input?: Record<string, any>;
  handler?: (context: StepContext) => Promise<any>;
  /** Optional rollback handler — called when a later step fails to undo this step's side effects */
  rollback?: (context: StepContext, output: any) => Promise<void>;
}

export interface WorkflowDefinition {
  agentType: "architect" | "merchant" | "social";
  workflowType: string;
  title: string;
  description?: string;
  scope: "specific_store" | "all_stores" | "global";
  storeId?: number;
  input?: Record<string, any>;
  steps: WorkflowStepDefinition[];
}

export interface StepContext {
  agentType: string;
  workflowId: number;
  stepId: number;
  stepIndex: number;
  userId: number;
  storeId?: number;
  input: Record<string, any>;
  previousOutputs: Record<string, any>[]; // outputs from all previous steps
  allStores?: any[]; // available when scope is "all_stores"
}

// ─── Workflow Registry ─────────────────────────────────────────────────────

const workflowRegistry: Map<string, (input: Record<string, any>) => WorkflowStepDefinition[]> = new Map();

export function registerWorkflow(workflowType: string, stepFactory: (input: Record<string, any>) => WorkflowStepDefinition[]) {
  workflowRegistry.set(workflowType, stepFactory);
}

// ─── Engine Core ───────────────────────────────────────────────────────────

/**
 * Launch a new workflow. Creates the DB records and begins execution.
 */
export async function launchWorkflow(userId: number, definition: WorkflowDefinition): Promise<number> {
  // Check if agent is enabled
  const configs = await getBotConfigs(userId);
  const agentConfig = configs.find(c => c.agentType === definition.agentType);
  if (agentConfig && !agentConfig.enabled) {
    throw new Error(`The ${definition.agentType} agent is currently disabled. Enable it in Bot Configuration.`);
  }

  // Resolve steps from registry or definition
  let steps = definition.steps;
  if (steps.length === 0 && workflowRegistry.has(definition.workflowType)) {
    const factory = workflowRegistry.get(definition.workflowType)!;
    steps = factory(definition.input ?? {});
  }

  if (steps.length === 0) {
    throw new Error(`No steps defined for workflow type: ${definition.workflowType}`);
  }

  // Create workflow record
  const workflowData: InsertAgentWorkflow = {
    userId,
    agentType: definition.agentType,
    workflowType: definition.workflowType,
    title: definition.title,
    description: definition.description,
    scope: definition.scope,
    storeId: definition.storeId ?? null,
    status: "pending",
    currentStepIndex: 0,
    totalSteps: steps.length,
    input: definition.input ?? {},
  };

  const workflowId = await withTransaction(async (tx) => {
    const { id } = await createWorkflow(workflowData, tx);
    const stepRecords: InsertWorkflowStep[] = steps.map((step, index) => ({
      workflowId: id,
      stepIndex: index,
      stepType: step.stepType,
      title: step.title,
      description: step.description,
      requiresApproval: step.requiresApproval ?? false,
      input: step.input ?? {},
    }));

    await createWorkflowSteps(stepRecords, tx);
    await createAgentTask({
      agentType: definition.agentType,
      taskType: definition.workflowType,
      title: `Workflow started: ${definition.title}`,
      description: `${steps.length}-step workflow initiated`,
      status: "running",
      storeId: definition.storeId ?? null,
      metadata: { workflowId: id },
    }, tx);

    return id;
  });

  // Start execution (non-blocking)
  executeWorkflow(workflowId, userId, steps).catch(err => {
    console.error(`[WorkflowEngine] Workflow ${workflowId} failed:`, err);
  });

  return workflowId;
}

/**
 * Execute a workflow step by step.
 */
async function executeWorkflow(workflowId: number, userId: number, stepDefinitions: WorkflowStepDefinition[]) {
  // Validate state machine transition
  const workflow = await getWorkflowById(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
  
  const validTransitions: Record<string, string[]> = {
    pending: ["running"],
    running: ["awaiting_approval", "completed", "failed", "cancelled"],
    awaiting_approval: ["running", "failed", "cancelled"],
    completed: [],
    failed: ["running"], // Allow retry
    cancelled: [],
  };
  
  if (!validTransitions[workflow.status as string]?.includes("running")) {
    throw new Error(`Invalid state transition: ${workflow.status} -> running`);
  }
  
  // Set 30-minute timeout
  const timeoutMs = 30 * 60 * 1000;
  const startTime = Date.now();
  
  await updateWorkflow(workflowId, { status: "running", startedAt: new Date() });

  const dbSteps = await getWorkflowSteps(workflowId);
  const previousOutputs: Record<string, any>[] = [];

  // Load stores if scope is all_stores
  let allStores: any[] | undefined;
  if (workflow.scope === "all_stores") {
    allStores = await getStoresByUser(userId);
  }

  for (let i = workflow.currentStepIndex; i < dbSteps.length; i++) {
    // Check timeout (startTime is in outer scope)
    if (Date.now() - startTime > timeoutMs) {
      await updateWorkflow(workflowId, { status: "failed" });
      throw new Error(`Workflow ${workflowId} exceeded 30-minute timeout`);
    }
    
    const dbStep = dbSteps[i];
    const stepDef = stepDefinitions[i];

    // Update workflow progress
    await updateWorkflow(workflowId, { currentStepIndex: i });

    // Check if step requires approval
    if (dbStep.requiresApproval && dbStep.approvalStatus === "none") {
      // Pause workflow for approval
      await updateWorkflowStep(dbStep.id, {
        status: "awaiting_approval",
        approvalStatus: "pending",
      });
      await updateWorkflow(workflowId, { status: "awaiting_approval" });

      // Create approval item
      await createApprovalItem({
        agentTaskId: workflowId,
        agentType: workflow.agentType,
        actionType: stepDef.stepType,
        title: `Approval needed: ${stepDef.title}`,
        description: stepDef.description ?? `Step ${i + 1} of workflow "${workflow.title}" requires your approval.`,
        impact: "high",
        proposedAction: { workflowId, stepId: dbStep.id, stepIndex: i, input: dbStep.input },
      });

      // Notify owner
      await createNotification({
        userId,
        agentType: workflow.agentType,
        type: "approval_needed",
        title: `Approval Required: ${stepDef.title}`,
        message: `The ${workflow.agentType} agent needs your approval to proceed with "${stepDef.title}" in workflow "${workflow.title}".`,
        actionUrl: `/activity`,
      });

      await notifyOwner({
        title: `🔔 Approval Needed: ${stepDef.title}`,
        content: `The ${workflow.agentType} agent is waiting for approval on step "${stepDef.title}" in workflow "${workflow.title}".`,
      });

      return; // Pause execution — will resume when approved
    }

    // If step was rejected, skip it
    if (dbStep.approvalStatus === "rejected") {
      await updateWorkflowStep(dbStep.id, { status: "skipped" });
      previousOutputs.push({ skipped: true });
      continue;
    }

    // Execute the step
    const stepStartTime = Date.now();
    await updateWorkflowStep(dbStep.id, { status: "running", startedAt: new Date() });

    try {
      const context: StepContext = {
        agentType: workflow.agentType,
        workflowId,
        stepId: dbStep.id,
        stepIndex: i,
        userId,
        storeId: workflow.storeId ?? undefined,
        input: { ...(dbStep.input as Record<string, any> ?? {}), ...(stepDef.input ?? {}) },
        previousOutputs,
        allStores,
      };

      let output: any;

      // Execute based on step type or custom handler
      if (stepDef.handler) {
        output = await stepDef.handler(context);
      } else {
        output = await executeStepByType(dbStep.stepType as StepType, context);
      }

      const durationMs = Date.now() - stepStartTime;
      await updateWorkflowStep(dbStep.id, {
        status: "completed",
        output,
        completedAt: new Date(),
        durationMs,
      });

      previousOutputs.push(output ?? {});

      // Telemetry: log successful step
      logAgentAction({
        agentType: workflow.agentType,
        actionType: `workflow_step:${dbStep.stepType}`,
        storeId: workflow.storeId ?? undefined,
        triggerSource: "workflow",
        input: context.input,
        output,
        success: true,
        durationMs,
        metadata: { workflowId, stepId: dbStep.id, stepIndex: i, workflowTitle: workflow.title, stepTitle: stepDef.title },
      }).catch((telemetryErr: any) => {
        console.error(`[Workflow] Failed to log telemetry for step ${i}:`, telemetryErr.message);
      });
    } catch (error: any) {
      const durationMs = Date.now() - stepStartTime;
      await updateWorkflowStep(dbStep.id, {
        status: "failed",
        error: error.message ?? String(error),
        completedAt: new Date(),
        durationMs,
      });

      // Telemetry: log failed step
      logAgentAction({
        agentType: workflow.agentType,
        actionType: `workflow_step:${dbStep.stepType}`,
        storeId: workflow.storeId ?? undefined,
        triggerSource: "workflow",
        input: dbStep.input,
        success: false,
        errorMessage: error.message ?? String(error),
        durationMs,
        metadata: { workflowId, stepId: dbStep.id, stepIndex: i, workflowTitle: workflow.title, stepTitle: stepDef.title },
      }).catch((telemetryErr: any) => {
        console.error(`[Workflow] Failed to log telemetry for failed step ${i}:`, telemetryErr.message);
      });

      // Attempt rollback of previously completed steps (reverse order)
      for (let r = i - 1; r >= 0; r--) {
        const rollbackDef = stepDefinitions[r];
        if (rollbackDef.rollback) {
          try {
            const rollbackCtx: StepContext = {
              agentType: workflow.agentType,
              workflowId,
              stepId: dbSteps[r].id,
              stepIndex: r,
              userId,
              storeId: workflow.storeId ?? undefined,
              input: { ...(dbSteps[r].input as Record<string, any> ?? {}), ...(rollbackDef.input ?? {}) },
              previousOutputs,
              allStores,
            };
            await rollbackDef.rollback(rollbackCtx, previousOutputs[r] ?? {});
            console.log(`[WorkflowEngine] Rolled back step ${r}: ${rollbackDef.title}`);
          } catch (rollbackErr: any) {
            console.error(`[WorkflowEngine] Rollback failed for step ${r} (${rollbackDef.title}):`, rollbackErr.message);
          }
        }
      }

      // Fail the entire workflow
      await updateWorkflow(workflowId, {
        status: "failed",
        error: `Step ${i + 1} failed: ${error.message}`,
        completedAt: new Date(),
      });

      await createNotification({
        userId,
        agentType: workflow.agentType,
        type: "error",
        title: `Workflow Failed: ${workflow.title}`,
        message: `Step "${stepDef.title}" failed: ${error.message}`,
        actionUrl: `/activity`,
      });

      await notifyOwner({
        title: `❌ Workflow Failed: ${workflow.title}`,
        content: `The ${workflow.agentType} agent's workflow "${workflow.title}" failed at step "${stepDef.title}": ${error.message}`,
      });

      return;
    }
  }

  // All steps completed successfully
  const finalOutput = previousOutputs.length > 0 ? previousOutputs[previousOutputs.length - 1] : {};
  await updateWorkflow(workflowId, {
    status: "completed",
    output: { stepOutputs: previousOutputs, final: finalOutput },
    completedAt: new Date(),
  });

  await createNotification({
    userId,
    agentType: workflow.agentType,
    type: "success",
    title: `Workflow Completed: ${workflow.title}`,
    message: `All ${dbSteps.length} steps completed successfully.`,
    actionUrl: `/activity`,
  });

  await notifyOwner({
    title: `✅ Workflow Completed: ${workflow.title}`,
    content: `The ${workflow.agentType} agent successfully completed "${workflow.title}" (${dbSteps.length} steps).`,
  });
}

/**
 * Resume a paused workflow after approval.
 */
export async function resumeWorkflow(workflowId: number, stepId: number, approved: boolean, note?: string) {
  const workflow = await getWorkflowById(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
  if (workflow.status !== "awaiting_approval") throw new Error("Workflow is not awaiting approval");

  const step = await getWorkflowStepById(stepId);
  if (!step) throw new Error(`Step ${stepId} not found`);

  await updateWorkflowStep(stepId, {
    approvalStatus: approved ? "approved" : "rejected",
    approvalNote: note,
    status: approved ? "pending" : "skipped",
  });

  if (!approved) {
    // Cancel the workflow if approval is rejected
    await updateWorkflow(workflowId, {
      status: "cancelled",
      error: `Step "${step.title}" was rejected: ${note ?? "No reason provided"}`,
      completedAt: new Date(),
    });

    await createNotification({
      userId: workflow.userId,
      agentType: workflow.agentType,
      type: "warning",
      title: `Workflow Cancelled: ${workflow.title}`,
      message: `Step "${step.title}" was rejected. Workflow has been cancelled.`,
      actionUrl: `/activity`,
    });
    return;
  }

  // Re-fetch the step definitions from the registry
  const registeredFactory = workflowRegistry.get(workflow.workflowType);
  let stepDefinitions: WorkflowStepDefinition[];
  if (registeredFactory) {
    stepDefinitions = registeredFactory(workflow.input as Record<string, any> ?? {});
  } else {
    // Reconstruct from DB steps
    const dbSteps = await getWorkflowSteps(workflowId);
    stepDefinitions = dbSteps.map(s => ({
      stepType: s.stepType as StepType,
      title: s.title,
      description: s.description ?? undefined,
      requiresApproval: s.requiresApproval,
      input: s.input as Record<string, any> ?? {},
    }));
  }

  // Resume execution from the approved step
  executeWorkflow(workflowId, workflow.userId, stepDefinitions).catch(err => {
    console.error(`[WorkflowEngine] Resumed workflow ${workflowId} failed:`, err);
  });
}

/**
 * Cancel a running or paused workflow.
 */
export async function cancelWorkflow(workflowId: number) {
  const workflow = await getWorkflowById(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
  if (workflow.status === "completed" || workflow.status === "failed" || workflow.status === "cancelled") {
    throw new Error("Cannot cancel a workflow that has already ended");
  }

  await updateWorkflow(workflowId, {
    status: "cancelled",
    error: "Cancelled by user",
    completedAt: new Date(),
  });

  // Mark all pending steps as skipped
  const steps = await getWorkflowSteps(workflowId);
  for (const step of steps) {
    if (step.status === "pending" || step.status === "running" || step.status === "awaiting_approval") {
      await updateWorkflowStep(step.id, { status: "skipped" });
    }
  }
}

import { optimizeAndUploadImage } from "../utils/imageOptimizer";

// ─── Step Executors ────────────────────────────────────────────────────────

async function executeStepByType(stepType: StepType, context: StepContext): Promise<any> {
  switch (stepType) {
    case "llm_call":
      return executeLLMStep(context);
    case "image_generation":
      return executeImageGenStep(context);
    case "analysis":
      return executeAnalysisStep(context);
    case "notification":
      return executeNotificationStep(context);
    case "data_transform":
      return executeDataTransformStep(context);
    case "store_action":
      return executeStoreActionStep(context);
    case "api_call":
      return executeApiCallStep(context);
    default:
      return { message: `Step type "${stepType}" executed (no-op handler)` };
  }
}

async function executeLLMStep(context: StepContext): Promise<any> {
  const { input, previousOutputs, agentType } = context;
  let systemPrompt = input.systemPrompt ?? "You are a helpful e-commerce AI assistant.";
  const userPrompt = input.userPrompt ?? input.prompt ?? "Analyze the provided data.";

  // -- MANUS AI AUTONOMOUS OVERRIDE: Reinforcement Learning Prompt Injection --
  if (input.promptClass) {
    const bestVariant = await getBestPromptVariant(agentType, input.promptClass);
    if (bestVariant) {
      console.log(`[RL_ENGINE] Injecting high-performing prompt variant for ${input.promptClass} (Agent: ${agentType})`);
      systemPrompt = bestVariant.promptTemplate;
    } else {
      console.log(`[RL_ENGINE] No active variants found for ${input.promptClass}. Using static fallback.`);
    }
  }

  // Build context from previous step outputs
  let contextStr = "";
  if (previousOutputs.length > 0) {
    contextStr = `\n\nContext from previous steps:\n${JSON.stringify(previousOutputs.slice(-3), null, 2)}`;
  }

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt + contextStr },
    ],
    ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
  });

  const content = String(response.choices?.[0]?.message?.content ?? "");

  // Try to parse as JSON if response_format was specified
  if (input.responseFormat) {
    try {
      return JSON.parse(content);
    } catch {
      return { text: content };
    }
  }

  return { text: content };
}

async function executeImageGenStep(context: StepContext): Promise<any> {
  const { input, previousOutputs } = context;
  let prompt = input.prompt ?? "Generate a professional e-commerce product image";

  // If previous step output has text, use it to enhance the prompt
  if (previousOutputs.length > 0) {
    const lastOutput = previousOutputs[previousOutputs.length - 1];
    if (lastOutput?.imagePrompt) {
      prompt = lastOutput.imagePrompt;
    }
  }

  const result = await invokeLLM({
    messages: [{ role: "user", content: prompt }], // Use standard text generation for now since DALL-E integration is missing from demo sandbox
  });
  
  // We'll mock the image generation in the sandbox with an unsplash placeholder,
  // then pass it through sharp to optimize it
  const rawUrl = `https://source.unsplash.com/1080x1080/?ecommerce,${encodeURIComponent(prompt.split(' ')[0])}`;
  const optimizedUrl = await optimizeAndUploadImage(rawUrl);

  return { imageUrl: optimizedUrl, prompt, source: rawUrl };
}

async function executeAnalysisStep(context: StepContext): Promise<any> {
  const { input, previousOutputs } = context;
  // Use LLM to analyze data from previous steps
  const dataToAnalyze = input.data ?? previousOutputs;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are an expert e-commerce data analyst. Analyze the provided data and return actionable insights." },
      { role: "user", content: `Analyze this data and provide insights:\n${JSON.stringify(dataToAnalyze, null, 2)}\n\n${input.analysisPrompt ?? "Provide key findings and recommendations."}` },
    ],
  });

  return { analysis: response.choices?.[0]?.message?.content ?? "" };
}

async function executeNotificationStep(context: StepContext): Promise<any> {
  const { userId, input, previousOutputs } = context;
  const title = input.title ?? "Bot Update";
  const message = input.message ?? `Workflow step completed.`;

  await createNotification({
    userId,
    agentType: input.agentType ?? "system",
    type: input.notificationType ?? "info",
    title,
    message,
  });

  if (input.notifyOwner) {
    await notifyOwner({ title, content: message });
  }

  return { notified: true };
}

async function executeDataTransformStep(context: StepContext): Promise<any> {
  const { input, previousOutputs } = context;
  // Simple data transformation — extract/reshape data from previous outputs
  const sourceIndex = input.sourceStepIndex ?? previousOutputs.length - 1;
  const source = previousOutputs[sourceIndex] ?? {};

  if (input.extractField) {
    return { extracted: source[input.extractField] };
  }

  if (input.template) {
    // Simple template substitution
    let result = input.template;
    for (const [key, value] of Object.entries(source)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
    }
    return { transformed: result };
  }

  return source;
}

async function executeStoreActionStep(context: StepContext): Promise<any> {
  const { input, storeId, userId } = context;
  const action = input.action ?? "unknown";

  switch (action) {
    case "sync_products": {
      if (!storeId) return { error: "No store specified for product sync" };
      const result = await syncProductsFromStore(storeId, userId);
      return { action, storeId, ...result };
    }
    case "push_product": {
      if (!storeId || !input.productId) return { error: "Missing storeId or productId" };
      const product = await pushProductToStore(storeId, input.productId);
      return { action, storeId, product };
    }
    case "fulfill_order": {
      if (!storeId || !input.orderId) return { error: "Missing storeId or orderId" };
      const success = await fulfillOrderOnPlatform(storeId, input.orderId, input.trackingNumber, input.trackingUrl);
      return { action, storeId, orderId: input.orderId, success };
    }
    case "check_inventory": {
      const inventory = await checkInventoryAcrossStores(userId);
      return { action, inventory };
    }
    case "publish_social_post": {
      if (!input.accountId || !input.post) return { error: "Missing accountId or post data" };
      const post = await publishSocialPost(input.accountId, input.post, storeId);
      return { action, post };
    }
    case "schedule_social_post": {
      if (!input.accountId || !input.post || !input.scheduledAt) return { error: "Missing required fields" };
      const scheduled = await scheduleSocialPost(input.accountId, input.post, new Date(input.scheduledAt), storeId);
      return { action, post: scheduled };
    }
    case "launch_ad_campaign": {
      if (!input.accountId || !input.campaign || !storeId) return { error: "Missing required fields" };
      const campaign = await launchAdCampaign(input.accountId, input.campaign, storeId);
      return { action, campaign };
    }
    case "social_analytics": {
      const analytics = await getCrossPlatformSocialAnalytics(userId);
      return { action, analytics };
    }
    default:
      return {
        action,
        storeId,
        status: "unsupported",
        message: `Store action "${action}" is not yet supported`,
      };
  }
}

async function executeApiCallStep(context: StepContext): Promise<any> {
  const { input } = context;
  // Generic API call step — for external service integrations
  if (!input.url) {
    return { error: "No URL provided for API call" };
  }

  try {
    const response = await fetch(input.url, {
      method: input.method ?? "GET",
      headers: input.headers ?? { "Content-Type": "application/json" },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });

    const data = await response.json().catch(() => response.text());
    return { statusCode: response.status, data };
  } catch (error: any) {
    return { error: error.message };
  }
}

