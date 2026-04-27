-- Migration 0024: add `parallel_group` to the workflow_steps.stepType enum.
--
-- Lets workflow definitions declare a step that runs an array of
-- substeps concurrently (server/engine/workflowEngine.ts:executeParallelGroupStep).
-- Used by the new competitor_pricing_scan workflow and is available to
-- any future workflow with independent LLM/API calls.

ALTER TABLE `workflow_steps`
  MODIFY COLUMN `stepType` enum(
    'llm_call',
    'api_call',
    'image_generation',
    'data_transform',
    'approval_gate',
    'notification',
    'store_action',
    'analysis',
    'parallel_group'
  ) NOT NULL;
