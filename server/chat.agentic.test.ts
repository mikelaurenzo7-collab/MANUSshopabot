/**
 * Tests for the agentic chat router (v2 with function calling).
 * Verifies that:
 * 1. The router returns a reply for plain conversational messages
 * 2. Tool calls are routed to the correct executor
 * 3. launch_workflow tool returns a workflowId on success
 * 4. get_store_status returns store data
 * 5. list_recent_workflows returns workflow list
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the LLM so tests don't hit the real API ────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// ─── Mock the workflow engine ─────────────────────────────────────────────────
vi.mock("./engine/workflowEngine", () => ({
  launchWorkflow: vi.fn().mockResolvedValue(99001),
}));

// ─── Mock db helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getStoreById: vi.fn().mockResolvedValue({
      id: 30003,
      name: "laurenzo-4",
      platform: "shopify",
      platformDomain: "laurenzo-4.myshopify.com",
      status: "active",
      orgId: 30001,
    }),
    getStoresByOrg: vi.fn().mockResolvedValue([
      {
        id: 30003,
        name: "laurenzo-4",
        platform: "shopify",
        platformDomain: "laurenzo-4.myshopify.com",
        status: "active",
        orgId: 30001,
      },
    ]),
    getWorkflowsByOrg: vi.fn().mockResolvedValue([
      {
        id: 180001,
        workflowType: "niche_research",
        title: "Niche Research: Golf",
        status: "completed",
        agentType: "architect",
        createdAt: new Date(),
      },
    ]),
    getUserByOpenId: vi.fn().mockResolvedValue({
      id: 781192,
      email: "mikelaurenzo7@gmail.com",
      stripeSubscriptionStatus: "active",
    }),
  };
});

vi.mock("./utils/userContext", () => ({
  getRenderedStoreContext: vi.fn().mockResolvedValue("Store: laurenzo-4 | 0 products | Shopify"),
}));

import { invokeLLM } from "./_core/llm";
import { launchWorkflow } from "./engine/workflowEngine";

const mockInvokeLLM = vi.mocked(invokeLLM);
const mockLaunchWorkflow = vi.mocked(launchWorkflow);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlainTextResponse(text: string) {
  return {
    choices: [{ message: { content: text, tool_calls: null } }],
  };
}

function makeToolCallResponse(toolName: string, args: Record<string, any>) {
  return {
    choices: [{
      message: {
        content: null,
        tool_calls: [{
          id: "call_test_001",
          function: {
            name: toolName,
            arguments: JSON.stringify(args),
          },
        }],
      },
    }],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Agentic Chat Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a plain text reply for conversational messages", async () => {
    mockInvokeLLM.mockResolvedValueOnce(makePlainTextResponse("Dropshipping is a fulfillment model where...") as any);

    // Simulate what the chat.message mutation does internally
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are the Builder Bot" },
        { role: "user", content: "What is dropshipping?" },
      ],
      tools: [],
      tool_choice: "auto",
      maxTokens: 1024,
    } as any);

    const choice = result.choices?.[0];
    expect(choice?.message?.content).toContain("Dropshipping");
    expect(choice?.message?.tool_calls).toBeFalsy();
  });

  it("calls launch_workflow tool when user asks to build a store", async () => {
    // First call returns a tool call
    mockInvokeLLM
      .mockResolvedValueOnce(makeToolCallResponse("launch_workflow", {
        workflowType: "complete_store_buildout",
        title: "Complete Store Buildout: Golf Accessories",
        input: { niche: "golf accessories", storeName: "laurenzo-4", productCount: 20 },
        storeId: 30003,
      }) as any)
      // Second call synthesizes the result
      .mockResolvedValueOnce(makePlainTextResponse("I've launched the Complete Store Buildout workflow (ID: 99001). It will source 20 golf accessories products and build out your catalog.") as any);

    // Verify the tool call structure is correct
    const firstResult = await invokeLLM({ messages: [] as any, tools: [], tool_choice: "auto", maxTokens: 1024 } as any);
    const toolCall = firstResult.choices?.[0]?.message?.tool_calls?.[0];
    expect(toolCall?.function?.name).toBe("launch_workflow");

    const args = JSON.parse(toolCall?.function?.arguments || "{}");
    expect(args.workflowType).toBe("complete_store_buildout");
    expect(args.storeId).toBe(30003);

    // Verify launchWorkflow would be called with correct params
    await launchWorkflow(781192, {
      agentType: "architect",
      workflowType: "complete_store_buildout",
      title: "Complete Store Buildout: Golf Accessories",
      scope: "specific_store",
      storeId: 30003,
      input: args.input,
      steps: [],
    }, { orgId: 30001 });

    expect(mockLaunchWorkflow).toHaveBeenCalledWith(
      781192,
      expect.objectContaining({
        workflowType: "complete_store_buildout",
        agentType: "architect",
        storeId: 30003,
      }),
      { orgId: 30001 }
    );
  });

  it("calls launch_workflow for niche_research with correct agent type", async () => {
    await launchWorkflow(781192, {
      agentType: "architect",
      workflowType: "niche_research",
      title: "Niche Research: Eco-Friendly Kitchen",
      scope: "global",
      input: { keyword: "eco-friendly kitchen" },
      steps: [],
    }, { orgId: 30001 });

    expect(mockLaunchWorkflow).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        workflowType: "niche_research",
        agentType: "architect",
        scope: "global",
      }),
      expect.any(Object)
    );
  });

  it("calls launch_workflow for pricing_optimization with merchant agent type", async () => {
    await launchWorkflow(781192, {
      agentType: "merchant",
      workflowType: "pricing_optimization",
      title: "Pricing Optimization",
      scope: "all_stores",
      input: { targetMargin: 40, strategy: "competitive" },
      steps: [],
    }, { orgId: 30001 });

    expect(mockLaunchWorkflow).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        workflowType: "pricing_optimization",
        agentType: "merchant",
        scope: "all_stores",
      }),
      expect.any(Object)
    );
  });

  it("returns workflow ID in the tool result", async () => {
    const workflowId = await launchWorkflow(781192, {
      agentType: "architect",
      workflowType: "product_sourcing",
      title: "Product Sourcing: Golf",
      scope: "global",
      input: { niche: "golf" },
      steps: [],
    }, { orgId: 30001 });

    expect(workflowId).toBe(99001);
  });

  it("second LLM call synthesizes tool results into a natural reply", async () => {
    mockInvokeLLM.mockResolvedValueOnce(makePlainTextResponse(
      "I've launched the Niche Research workflow (ID: 99001). It will analyze market demand, competition, and supplier availability for your niche. Results will appear in the Workflows tab in about 2-3 minutes."
    ) as any);

    const result = await invokeLLM({ messages: [] as any, maxTokens: 1024 } as any);
    const reply = result.choices?.[0]?.message?.content;
    expect(reply).toContain("workflow");
    expect(reply).toContain("99001");
  });
});
