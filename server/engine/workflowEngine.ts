/**
 * Shop_a_Bot Workflow Engine
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
  getStoresByUser, getStoresByOrg, getStoreById, getBotConfigs, withTransaction,
  getBotProfile, getBotMemory,
  getProductsByStore, getOrdersByStoreSince, getOpenHeatmapByOrg,
} from "../db";
import { invokeLLM } from "../_core/llm";
import { invokeWithFallback, isClaudeDirectAvailable } from "../_core/claudeDirect";
import { runMemoryAgent, isMemoryAgentAvailable } from "./memoryAgent";
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

export type StepType = "llm_call" | "api_call" | "image_generation" | "data_transform" | "approval_gate" | "notification" | "store_action" | "analysis" | "parallel_group";

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
  botMemory?: any[]; // bot's persistent memory entries
  botProfile?: any; // bot profile with instructions, autonomy level, safety rules
}

// ─── Workflow Registry ─────────────────────────────────────────────────────

export const workflowRegistry: Map<string, (input: Record<string, any>) => WorkflowStepDefinition[]> = new Map();

export function registerWorkflow(workflowType: string, stepFactory: (input: Record<string, any>) => WorkflowStepDefinition[]) {
  workflowRegistry.set(workflowType, stepFactory);
}

/**
 * List every workflow type currently registered. Used by tests and the
 * workflow-catalog router to verify the registry covers every public
 * recipe surfaced in the UI.
 */
export function listWorkflowTypes(): string[] {
  return Array.from(workflowRegistry.keys());
}

// ─── Engine Core ───────────────────────────────────────────────────────────

/**
 * Launch a new workflow. Creates the DB records and begins execution.
 *
 * `orgId` is required: every workflow belongs to an organization, and
 * scope="all_stores" runs against `getStoresByOrg(orgId)`. `userId`
 * remains as the actor — the human who launched the workflow — so the
 * audit trail tracks who initiated it.
 */
export async function launchWorkflow(
  userId: number,
  definition: WorkflowDefinition,
  options: { orgId: number },
): Promise<number> {
  const { orgId } = options;

  // Check if agent is enabled (per-org config now — falls back to per-user for backfill)
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
    orgId,
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

  // Load stores if scope is all_stores. Org-scoped now — when a user is
  // in two orgs and launches a workflow in Org B, the engine must NOT
  // see Org A's stores.
  let allStores: any[] | undefined;
  if (workflow.scope === "all_stores") {
    allStores = workflow.orgId
      ? await getStoresByOrg(workflow.orgId)
      : await getStoresByUser(userId); // legacy fallback for pre-migration rows
  }

  // Load bot profile and memory
  const botProfile = await getBotProfile(userId, workflow.agentType as any);
  let botMemory: any[] = [];
  if (botProfile) {
    botMemory = await getBotMemory(botProfile.id, 50);
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

      // Create approval item — scoped to the workflow's org so it
      // surfaces in the right tenant's approval queue.
      await createApprovalItem({
        orgId: workflow.orgId,
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
        botMemory,
        botProfile,
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
    case "parallel_group":
      return executeParallelGroupStep(context);
    default:
      return { message: `Step type "${stepType}" executed (no-op handler)` };
  }
}

/**
 * Run a list of substeps concurrently. Use when each substep is
 * independent of the others — typical example: a workflow that needs
 * audience research AND ad copy AND product image, none of which
 * depend on each other.
 *
 * Substeps share the parent's previousOutputs slice (read-only — they
 * can't see each other's outputs). The result is `{ outputs: [...] }`
 * positionally aligned with the input substeps array.
 *
 * Errors: a single substep failure rejects the whole group, so the
 * engine's outer retry kicks in. This is intentional — partial
 * success in a parallel group is rarely useful and tends to leave
 * downstream steps in a confusing partial state.
 */
async function executeParallelGroupStep(context: StepContext): Promise<any> {
  const { input } = context;
  const substeps = (input.substeps as Array<{ stepType: StepType; input?: Record<string, any> }>) ?? [];
  if (substeps.length === 0) {
    return { outputs: [] };
  }

  const results = await Promise.all(
    substeps.map((sub) =>
      executeStepByType(sub.stepType, {
        ...context,
        input: sub.input ?? {},
      }),
    ),
  );
  return { outputs: results };
}

/**
 * Process-local cache for prompt-variant lookups. Without this, every
 * LLM step queries `prompt_variants` even though the result rarely
 * changes during a single workflow run. 5-minute TTL keeps RL updates
 * visible to in-flight workflows without becoming stale forever.
 */
const PROMPT_VARIANT_TTL_MS = 5 * 60 * 1000;
const promptVariantCache = new Map<string, { value: any; expiresAt: number }>();

async function getCachedPromptVariant(agentType: string, promptClass: string) {
  const key = `${agentType}::${promptClass}`;
  const cached = promptVariantCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const fresh = await getBestPromptVariant(agentType, promptClass);
  promptVariantCache.set(key, { value: fresh, expiresAt: now + PROMPT_VARIANT_TTL_MS });
  // Cap cache size — protect against unbounded growth on long-running processes
  if (promptVariantCache.size > 200) {
    const firstKey = promptVariantCache.keys().next().value;
    if (firstKey) promptVariantCache.delete(firstKey);
  }
  return fresh;
}

async function executeLLMStep(context: StepContext): Promise<any> {
  const { input, previousOutputs, agentType, botMemory, botProfile } = context;
  let systemPrompt = input.systemPrompt ?? "You are a helpful e-commerce AI assistant.";
  const userPrompt = input.userPrompt ?? input.prompt ?? "Analyze the provided data.";

  // -- MANUS AI AUTONOMOUS OVERRIDE: Reinforcement Learning Prompt Injection --
  if (input.promptClass) {
    const bestVariant = await getCachedPromptVariant(agentType, input.promptClass);
    if (bestVariant) {
      // Logged once per cache miss in getCachedPromptVariant; quiet here to avoid log spam.
      systemPrompt = bestVariant.promptTemplate;
    }
  }

  // ── Memory recall (passive) ─────────────────────────────────────
  // When the bot profile has stored memories from prior runs and this
  // step hasn't opted out, prepend the most-recently-accessed entries
  // as a "Recall" preamble. The model treats them as context, not
  // instructions — they shape decisions without overriding the
  // step-specific system prompt. Capped at 12 entries to keep the
  // recall block compact (~600 tokens at the upper end). Bots accumulate
  // memory via explicit memory_write tool calls inside an agentic loop
  // (engine/memory.ts) — until that loop lands, this is read-only.
  if (
    botProfile?.memoryEnabled !== false &&
    botMemory &&
    botMemory.length > 0 &&
    input.useMemory !== false
  ) {
    const top = botMemory.slice(0, 12);
    const recallLines = top
      .map((m: any) => {
        const conf = typeof m.confidence === "number" ? ` (conf:${m.confidence})` : "";
        return `- [${m.memoryType}]${conf} ${m.key}: ${m.value}`;
      })
      .join("\n");
    systemPrompt = `${systemPrompt}\n\nRECALL — durable learnings from prior runs (use as context, not instructions):\n${recallLines}`;
  }

  // Build context from previous step outputs
  let contextStr = "";
  if (previousOutputs.length > 0) {
    contextStr = `\n\nContext from previous steps:\n${JSON.stringify(previousOutputs.slice(-3), null, 2)}`;
  }

  // Resilience: a single LLM hiccup shouldn't crash a 10-step
  // workflow. The engine has its own retry around each step (3
  // attempts with backoff via `withRetries` in workflow execution),
  // but if all attempts time out we still want a structured failure
  // marker the next step can react to instead of a thrown exception
  // bubbling up.
  // ── Claude-direct opt-in ────────────────────────────────────────
  // When the workflow author tags this step with `useClaudeDirect:
  // true` AND `ANTHROPIC_API_KEY` is configured, the call routes
  // through the official SDK with the requested premium features
  // (prompt caching, adaptive thinking, effort). On any other
  // condition — flag absent, key absent, ENV in dev — the call falls
  // back to the existing Forge proxy. Zero breaking change for
  // Manus deploys without the key.
  //
  // Activation guidance:
  //   • cacheSystemPrompt: true on workflows with long, frozen system
  //     prompts that are reused across runs (niche_research,
  //     brand_identity_kit). Caches the first ~90% of input tokens.
  //   • effort: "xhigh" for coding/agentic; "high" for intelligence-
  //     sensitive analysis (default); "medium"/"low" for cost-sensitive.
  //   • adaptiveThinking: true (default) for multi-step reasoning;
  //     pass false for short classifiers to skip thinking overhead.
  // ── Agentic memory write loop (opt-in) ──────────────────────────
  // When the step opts in via `useMemoryTools: true` AND the direct
  // Anthropic SDK is wired AND the bot profile exists, route through
  // the memory agent: a tool-use loop that lets the model call
  // memory_read/search/write/forget itself during the step. This is
  // the *write* half of the memory feature (passive recall above is
  // the read half). Falls back to the regular single-shot path on
  // any of: flag absent, key absent, no profile.
  if (
    input.useMemoryTools &&
    isMemoryAgentAvailable() &&
    botProfile?.id &&
    botProfile.memoryEnabled !== false
  ) {
    try {
      const agentResult = await runMemoryAgent({
        systemPrompt,
        userPrompt: userPrompt + contextStr,
        ctx: { botProfileId: botProfile.id, userId: context.userId },
        ...(input.effort ? { effort: input.effort as any } : {}),
      });
      if (input.responseFormat) {
        try {
          return JSON.parse(agentResult.text);
        } catch {
          return {
            text: agentResult.text,
            __memoryAgent: {
              iterations: agentResult.iterations,
              toolCalls: agentResult.toolCallCount,
              hitCap: agentResult.hitIterationCap,
            },
          };
        }
      }
      return {
        text: agentResult.text,
        __memoryAgent: {
          iterations: agentResult.iterations,
          toolCalls: agentResult.toolCallCount,
          hitCap: agentResult.hitIterationCap,
        },
      };
    } catch (err: any) {
      console.error(
        `[WorkflowEngine.LLMStep] memory agent failed, falling back to single-shot: ${err?.message ?? err}`,
      );
      // Fall through to the standard path so a flaky agentic call
      // doesn't hard-fail the workflow.
    }
  }

  let response: Awaited<ReturnType<typeof invokeLLM>>;
  try {
    response = await invokeWithFallback({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt + contextStr },
      ],
      ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
      ...(input.useClaudeDirect ? { useClaudeDirect: true } : {}),
      ...(input.cacheSystemPrompt ? { cacheSystemPrompt: true } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
      ...(input.adaptiveThinking !== undefined ? { adaptiveThinking: input.adaptiveThinking } : {}),
    });
  } catch (err: any) {
    console.error(`[WorkflowEngine.LLMStep] invokeLLM failed: ${err?.message ?? err}`);
    // Re-throw — the engine retry layer wraps this call, so a bare
    // throw triggers retries before failing the step. Returning a
    // structured error here would BYPASS retries and treat a
    // transient timeout as success, which is worse.
    throw err;
  }

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

  // Image source: Unsplash placeholder, then run through Sharp for
  // optimization + S3 upload. The previous version of this function
  // also fired an `invokeLLM` call with `prompt` and discarded the
  // result — pure cost (~1-2s + tokens per step) with no effect.
  // Removed: keyword extraction is local now.
  const keyword = prompt.split(/\s+/).find((w: string) => w.length > 2) ?? "ecommerce";
  const rawUrl = `https://source.unsplash.com/1080x1080/?ecommerce,${encodeURIComponent(keyword)}`;
  const optimizedUrl = await optimizeAndUploadImage(rawUrl);

  return { imageUrl: optimizedUrl, prompt, source: rawUrl };
}

async function executeAnalysisStep(context: StepContext): Promise<any> {
  const { input, previousOutputs } = context;
  // Use LLM to analyze data from previous steps
  const dataToAnalyze = input.data ?? previousOutputs;

  let response: Awaited<ReturnType<typeof invokeLLM>>;
  try {
    response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert e-commerce data analyst. Analyze the provided data and return actionable insights." },
        { role: "user", content: `Analyze this data and provide insights:\n${JSON.stringify(dataToAnalyze, null, 2)}\n\n${input.analysisPrompt ?? "Provide key findings and recommendations."}` },
      ],
    });
  } catch (err: any) {
    console.error(`[WorkflowEngine.AnalysisStep] invokeLLM failed: ${err?.message ?? err}`);
    throw err; // Engine retry wraps; let it kick in.
  }

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
  const { input, previousOutputs, storeId } = context;

  // Named operations (preferred) — workflows declare `input.operation`
  // and the executor dispatches to a real implementation. If we don't
  // recognize the op name, fall through to the legacy field-extract /
  // template path below so existing workflows keep working.
  if (input.operation) {
    return runNamedDataTransform(input.operation, context);
  }

  // Legacy generic transforms — extract/reshape from previous output
  const sourceIndex = input.sourceStepIndex ?? previousOutputs.length - 1;
  const source = previousOutputs[sourceIndex] ?? {};

  if (input.extractField) {
    return { extracted: source[input.extractField] };
  }

  if (input.template) {
    let result = input.template;
    for (const [key, value] of Object.entries(source)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
    }
    return { transformed: result };
  }

  // Unknown / no-op transform — return source unchanged
  return source;

  async function runNamedDataTransform(op: string, ctx: StepContext): Promise<any> {
    void storeId; // referenced via ctx below
    switch (op) {
      // ─── competitor_pricing_scan ─────────────────────────────────
      case "merge_pricing_report": {
        // Previous step is a parallel_group → its output is
        // { outputs: [competitor_data, pricing_strategy] }.
        const last = ctx.previousOutputs[ctx.previousOutputs.length - 1] ?? {};
        const groupOutputs: any[] = Array.isArray(last?.outputs) ? last.outputs : [];
        const competitor = groupOutputs[0] ?? null;
        const positioning = groupOutputs[1] ?? null;
        return {
          generatedAt: new Date().toISOString(),
          competitorScan: competitor,
          positioning,
        };
      }

      // ─── margin_guard_audit ──────────────────────────────────────
      case "load_margin_audit_dataset": {
        if (!ctx.storeId) {
          return { products: [], note: "No store selected — margin audit skipped." };
        }
        const minMarginPct = (ctx.input.minMarginPct as number | undefined) ?? 15;
        const includePaused = (ctx.input.includePaused as boolean | undefined) ?? false;
        const products = await getProductsByStore(ctx.storeId);
        const filtered = products
          .filter((p: any) => includePaused || p.status === "active")
          .filter((p: any) => p.price != null && p.costPrice != null);
        // Cap to 200 products per audit so the LLM input stays bounded.
        const sample = filtered.slice(0, 200).map((p: any) => {
          const priceUsd = (p.price ?? 0) / 100;
          const costUsd = (p.costPrice ?? 0) / 100;
          const marginPct = priceUsd > 0 ? ((priceUsd - costUsd) / priceUsd) * 100 : 0;
          return {
            productId: p.id,
            title: p.title,
            currentPriceUsd: Number(priceUsd.toFixed(2)),
            costPriceUsd: Number(costUsd.toFixed(2)),
            currentMarginPct: Number(marginPct.toFixed(1)),
            stockLevel: p.stockLevel ?? p.stockQuantity ?? 0,
            status: p.status ?? "active",
          };
        });
        return {
          minMarginPct,
          productsAudited: sample.length,
          totalProducts: products.length,
          truncated: filtered.length > sample.length,
          dataset: sample,
        };
      }

      // ─── velocity_restock_predictor ──────────────────────────────
      case "compute_sales_velocity": {
        if (!ctx.storeId) {
          return { skus: [], note: "No store selected — velocity scan skipped." };
        }
        const lookbackDays = (ctx.input.lookbackDays as number | undefined) ?? 30;
        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

        const [products, recentOrders] = await Promise.all([
          getProductsByStore(ctx.storeId),
          getOrdersByStoreSince(ctx.storeId, since),
        ]);

        // Sum quantity sold per product across all orders in window.
        // Order items are stored as JSON; gracefully handle the
        // common shapes (Shopify line_items + our internal shape).
        const unitsByProductId = new Map<number, number>();
        const unitsBySku = new Map<string, number>();
        for (const order of recentOrders) {
          const itemsRaw = (order as any).items ?? (order as any).lineItems ?? null;
          if (!itemsRaw) continue;
          let items: any[];
          try {
            items = typeof itemsRaw === "string" ? JSON.parse(itemsRaw) : itemsRaw;
          } catch {
            continue;
          }
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            const qty = Number(item?.quantity ?? 1);
            if (!Number.isFinite(qty) || qty <= 0) continue;
            const pid = Number(item?.productId ?? item?.product_id);
            const sku = item?.sku as string | undefined;
            if (Number.isFinite(pid) && pid > 0) {
              unitsByProductId.set(pid, (unitsByProductId.get(pid) ?? 0) + qty);
            } else if (sku) {
              unitsBySku.set(sku, (unitsBySku.get(sku) ?? 0) + qty);
            }
          }
        }

        const rows = products
          .map((p: any) => {
            const matchById = unitsByProductId.get(p.id) ?? 0;
            const matchBySku = p.sku ? unitsBySku.get(p.sku) ?? 0 : 0;
            const unitsSold = matchById + matchBySku;
            const dailyVelocity = unitsSold / Math.max(lookbackDays, 1);
            const stockLevel = p.stockLevel ?? p.stockQuantity ?? 0;
            const daysOfCover = dailyVelocity > 0 ? stockLevel / dailyVelocity : null;
            return {
              productId: p.id,
              title: p.title,
              sku: p.sku ?? null,
              stockLevel,
              unitsSold,
              dailyVelocity: Number(dailyVelocity.toFixed(3)),
              daysOfCoverRemaining: daysOfCover === null ? null : Number(daysOfCover.toFixed(1)),
              priceUsd: ((p.price ?? 0) / 100),
            };
          })
          // Bias toward at-risk SKUs in the LLM input so the response
          // stays sharp even with hundreds of products.
          .sort((a, b) => {
            const aRisk = a.daysOfCoverRemaining ?? Infinity;
            const bRisk = b.daysOfCoverRemaining ?? Infinity;
            return aRisk - bRisk;
          })
          .slice(0, 100);

        return {
          lookbackDays,
          ordersAnalyzed: recentOrders.length,
          skusAnalyzed: products.length,
          velocity: rows,
        };
      }

      // ─── send_time_optimizer ─────────────────────────────────────
      case "aggregate_open_heatmap": {
        const lookbackDays = (ctx.input.lookbackDays as number | undefined) ?? 90;
        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

        // Org context comes from the workflow row; fall back to a noop
        // result when we can't resolve it (workflow run with no org —
        // shouldn't happen post-Phase-3, but defensive anyway).
        const wf = await getWorkflowById(ctx.workflowId);
        const orgId = wf?.orgId ?? null;
        if (!orgId) {
          return {
            heatmap: [],
            isColdStart: true,
            note: "No org context — falling back to industry defaults.",
          };
        }

        const rows = await getOpenHeatmapByOrg(orgId, since);
        const totalEvents = rows.reduce((acc, r) => acc + r.count, 0);

        return {
          lookbackDays,
          totalOpenEvents: totalEvents,
          isColdStart: totalEvents < 20, // 20 events ≈ minimum for any signal
          heatmap: rows,
        };
      }

      default:
        // Unknown operation — return previousOutputs so the next step
        // can still attempt to do something useful, and log.
        console.warn(`[WorkflowEngine.DataTransform] Unknown operation: ${op}`);
        return { unknownOperation: op, previousOutputs: ctx.previousOutputs };
    }
  }
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
    case "bulk_push_products": {
      // Used by complete_store_buildout: takes a `products` array
      // (either provided directly via input.products OR pulled from a
      // prior LLM step's output via productsFromPriorStep:true) and
      // bulk-inserts them into the local DB as drafts. Drafts get
      // pushed to the platform later by the Merchant Bot's publish
      // workflow once the operator approves them.
      if (!storeId) return { error: "Missing storeId for bulk_push_products" };
      let productList: Array<Record<string, any>> = [];
      if (Array.isArray(input.products)) {
        productList = input.products as Array<Record<string, any>>;
      } else if (input.productsFromPriorStep) {
        // Walk the previousOutputs chain looking for the most-recent
        // step that returned a `products` array.
        for (let i = context.previousOutputs.length - 1; i >= 0; i--) {
          const out = context.previousOutputs[i];
          if (out && Array.isArray(out.products)) {
            productList = out.products as Array<Record<string, any>>;
            break;
          }
        }
      }
      if (productList.length === 0) {
        return { action, storeId, status: "no_products", inserted: 0 };
      }
      const dbModule = await import("../db");
      const status = (input.productStatus === "active" ? "active" : "draft") as "active" | "draft";
      const rows = productList.map((p) => ({
        storeId,
        title: String(p.title ?? "Untitled product").slice(0, 500),
        description: String(p.description ?? ""),
        price: Number(p.priceCents ?? 0),
        costPrice: Number(p.costPriceCents ?? 0),
        sku: p.sku ? String(p.sku).slice(0, 100) : null,
        category: p.category ? String(p.category).slice(0, 255) : null,
        stockLevel: 0,
        status,
      }));
      const inserted = await dbModule.bulkInsertProducts(rows as any);
      return { action, storeId, inserted, status, total: productList.length };
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



// ─── Safety Rule Enforcement ──────────────────────────────────────────────

/**
 * Check if a proposed action violates any of the bot's safety rules.
 * Returns { allowed: boolean, reason?: string }
 */
export async function enforceSafetyRules(
  context: StepContext,
  proposedAction: Record<string, any>
): Promise<{ allowed: boolean; reason?: string }> {
  if (!context.botProfile?.requiresApproval) {
    return { allowed: true };
  }

  const db = await import("../db");
  const { getBotSafetyRules } = db;
  const safetyRules = await getBotSafetyRules(context.botProfile.id);

  for (const rule of safetyRules) {
    switch (rule.ruleType) {
      case "spending_limit":
        if (proposedAction.amount && proposedAction.amount > parseFloat(rule.limit)) {
          return {
            allowed: false,
            reason: `Spending limit exceeded: ${proposedAction.amount} > ${rule.limit}`,
          };
        }
        break;

      case "price_limit":
        if (proposedAction.price && proposedAction.price > parseFloat(rule.limit)) {
          return {
            allowed: false,
            reason: `Price limit exceeded: ${proposedAction.price} > ${rule.limit}`,
          };
        }
        break;

      case "action_restriction":
        if (rule.restrictedActions?.includes(proposedAction.actionType)) {
          return {
            allowed: false,
            reason: `Action restricted: ${proposedAction.actionType}`,
          };
        }
        break;

      case "approval_required":
        if (rule.requiresApproval) {
          return {
            allowed: false,
            reason: `This action requires manual approval`,
          };
        }
        break;

      case "rate_limit": {
        // Window-based rate limiting: count agent_tasks of the same
        // actionType in the rule's window (default 1 hour) and
        // refuse the action if it would exceed the limit.
        //
        // Rule shape: rule.limit holds the max-per-window as a string;
        // rule.windowSeconds (optional) scales the window. Falls back
        // to 1 hour if unset.
        const limit = parseInt(rule.limit, 10);
        if (!Number.isFinite(limit) || limit <= 0) break;
        const windowSec = (rule as any).windowSeconds
          ? parseInt(String((rule as any).windowSeconds), 10)
          : 3600;
        const since = new Date(Date.now() - windowSec * 1000);
        const dbMod = await import("../db");
        // Count recent tasks of this actionType for this bot's user
        const recent = await dbMod.getAgentTasks({
          agentType: context.agentType,
          limit: limit + 1,
        });
        const matching = (recent ?? []).filter((t: any) =>
          t.taskType === proposedAction.actionType
          && new Date(t.createdAt).getTime() >= since.getTime()
        );
        if (matching.length >= limit) {
          return {
            allowed: false,
            reason: `Rate limit hit: max ${limit} ${proposedAction.actionType} actions per ${Math.round(windowSec / 60)} min — currently at ${matching.length}.`,
          };
        }
        break;
      }
    }
  }

  return { allowed: true };
}
