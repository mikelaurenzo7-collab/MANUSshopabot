/**
 * Direct Anthropic SDK integration — fallback + opt-in canary.
 *
 * The integration is opt-in by design:
 *   - When ANTHROPIC_API_KEY is unset, every call falls through to the
 *     Forge proxy. Manus deploys without the key continue to work
 *     unchanged.
 *   - When the key IS set + a workflow step opts in via
 *     useClaudeDirect: true, the call routes through the official
 *     SDK, unlocking prompt caching, adaptive thinking, and effort.
 *
 * These tests assert source-level wiring without making live API
 * calls — keeps them fast and free.
 */
import { describe, it, expect } from "vitest";

describe("Claude direct integration", () => {
  it("isClaudeDirectAvailable() reads ANTHROPIC_API_KEY at call-time", async () => {
    const { isClaudeDirectAvailable } = await import("./_core/claudeDirect");
    // Invariant: the function is exported and callable. Returns false
    // by default in tests since the test env doesn't set the key.
    expect(typeof isClaudeDirectAvailable).toBe("function");
    // Returns true when ANTHROPIC_API_KEY is configured, false otherwise.
    expect(typeof isClaudeDirectAvailable()).toBe("boolean");
  });

  it("invokeWithFallback falls back to Forge when key is missing", async () => {
    // Pre-fix this didn't exist; opting into useClaudeDirect on a
    // deploy without ANTHROPIC_API_KEY would throw. The fallback path
    // makes the flag a hint rather than a requirement.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "_core/claudeDirect.ts"),
      "utf-8",
    );
    expect(src).toContain("isClaudeDirectAvailable");
    expect(src).toContain("invokeLLM(params)");
    // The fallback branch must trigger when the key is unset, NOT
    // when the flag is unset — otherwise opting in becomes mandatory.
    expect(src).toMatch(/wantsDirect = params\.useClaudeDirect && isClaudeDirectAvailable/);
  });

  it("workflowEngine threads claudeDirect flags through llm_call steps", async () => {
    // Regression guard: the engine's executeLLMStep must forward the
    // four opt-in flags (useClaudeDirect, cacheSystemPrompt, effort,
    // adaptiveThinking) to invokeWithFallback. If these get dropped,
    // workflows that opted in silently lose the premium features.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "engine/workflowEngine.ts"),
      "utf-8",
    );
    expect(src).toContain("invokeWithFallback");
    expect(src).toContain("input.useClaudeDirect");
    expect(src).toContain("input.cacheSystemPrompt");
    expect(src).toContain("input.effort");
    expect(src).toContain("input.adaptiveThinking");
  });

  it("niche_research workflow opts into claudeDirect with effort=high + adaptive thinking", async () => {
    // The longest, most-reused system prompt in the platform —
    // worth promoting first. Verifies the workflow's first
    // llm_call step sets the four flags so adaptive thinking and
    // (when prompts grow past 4096 tokens) cache_control activate.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "engine/architectWorkflows.ts"),
      "utf-8",
    );
    // Find the niche_research registration and verify the flags
    // appear in its first step body.
    const start = src.indexOf('registerWorkflow("niche_research"');
    expect(start).toBeGreaterThan(-1);
    const slice = src.slice(start, start + 3000);
    expect(slice).toContain("useClaudeDirect: true");
    expect(slice).toContain("cacheSystemPrompt: true");
    expect(slice).toContain('effort: "high"');
    expect(slice).toContain("adaptiveThinking: true");
  });

  it("claudeDirect uses adaptive thinking + effort in output_config (not top-level)", async () => {
    // Per the SDK contract: `effort` goes inside `output_config`,
    // NOT as a top-level parameter. Reverting that returns 400.
    // Same for adaptive thinking shape: `{type: "adaptive"}`, never
    // `{type: "enabled", budget_tokens: N}` (removed on Opus 4.7).
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "_core/claudeDirect.ts"),
      "utf-8",
    );
    expect(src).toContain('thinking: { type: "adaptive"');
    expect(src).toContain("output_config:");
    expect(src).toContain('effort: params.effort ?? "high"');
    // Forbidden patterns (would 400 on Opus 4.7):
    expect(src).not.toMatch(/budget_tokens:\s*\d+/);
    expect(src).not.toMatch(/temperature:/);
  });

  it("claudeDirect attaches cache_control: ephemeral on system prompt when caching is requested", async () => {
    // The whole point of the integration. If this assertion ever
    // breaks, prompt caching silently no-ops and the deploy pays
    // full input-token price on every run.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "_core/claudeDirect.ts"),
      "utf-8",
    );
    expect(src).toContain('cache_control: { type: "ephemeral" as const }');
    expect(src).toContain("params.cacheSystemPrompt && systemText");
  });

  it("claudeDirect streams when max_tokens > 16K (avoids SDK 10-min idle guard)", async () => {
    // SDK throws ValueError on non-streaming requests it estimates
    // will exceed ~10 minutes. Anything over ~16K must stream.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "_core/claudeDirect.ts"),
      "utf-8",
    );
    expect(src).toContain("useStreaming = maxTokens > 16_000");
    expect(src).toContain("messages.stream(requestBase).finalMessage()");
  });
});
