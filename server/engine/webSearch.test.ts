import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { model, tavilySearch } = vi.hoisted(() => ({
  model: vi.fn(),
  tavilySearch: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: model };
  },
}));
vi.mock("../_core/env", () => ({
  ENV: {
    anthropicApiKey: "scripted-model-only",
    anthropicModel: "claude-opus-4-7",
    tavilyApiKey: "",
    webSearchProvider: "",
  },
}));
vi.mock("../adapters/tools", () => ({
  getToolAdapter: () => ({ search: tavilySearch }),
}));

import { ENV } from "../_core/env";
import { runAgentLoop } from "../_core/claudeAgentLoop";
import { getAgentToolset } from "./agentToolsets";
import {
  PARALLEL_SEARCH_URL,
  PARALLEL_SEARCH_USER_AGENT,
} from "../adapters/tools/parallelSearch";

const names = [
  "architect.competitor_stalker_v0",
  "merchant.repricer_v0",
  "social.trend_hunter_v0",
];
const set = () => getAgentToolset(names[0])!;
const resultData = () => ({
  results: [
    {
      title: "Competitor",
      url: "https://example.com/watch?q=1",
      excerpts: ["A useful watch competitor."],
      publish_date: "2026-10-01",
    },
  ],
});
let requests: Array<{
  method: string;
  body: any;
  signal: AbortSignal | null | undefined;
}>;
let reply: any;
let textOnly: boolean;
let eventStream: boolean;
let missingTool: boolean;
let protocolError: boolean;
let httpStatus: number;
let hang: boolean;
let started: (() => void) | undefined;

beforeEach(() => {
  ENV.tavilyApiKey = "";
  ENV.webSearchProvider = "";
  vi.clearAllMocks();
  requests = [];
  reply = resultData();
  textOnly = false;
  eventStream = false;
  missingTool = false;
  protocolError = false;
  httpStatus = 200;
  hang = false;
  started = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      expect(String(url)).toBe(PARALLEL_SEARCH_URL);
      const headers = new Headers(init?.headers);
      expect(headers.get("user-agent")).toBe(PARALLEL_SEARCH_USER_AGENT);
      expect(headers.has("authorization")).toBe(false);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({
        method: init?.method ?? "GET",
        body,
        signal: init?.signal,
      });
      if (init?.method === "GET") return new Response(null, { status: 405 });
      if (body?.method === "notifications/initialized")
        return new Response(null, { status: 202 });
      let result: any;
      if (body?.method === "initialize") {
        result = {
          protocolVersion: body.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "fixture", version: "1" },
        };
      } else if (body?.method === "tools/list") {
        result = {
          tools: missingTool
            ? []
            : [{ name: "web_search", inputSchema: { type: "object" } }],
        };
      } else if (body?.method === "tools/call") {
        started?.();
        if (protocolError)
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32603, message: "fixture protocol error" },
          });
        if (hang)
          return new Promise((_resolve, reject) => {
            const abort = () => reject(init.signal.reason);
            if (init.signal.aborted) abort();
            else init.signal.addEventListener("abort", abort, { once: true });
          });
        if (httpStatus !== 200)
          return new Response("Service error", { status: httpStatus });
        result = reply?.isError
          ? reply
          : {
              content: [{ type: "text", text: JSON.stringify(reply) }],
              ...(textOnly ? {} : { structuredContent: reply }),
            };
      } else {
        return new Response(null, { status: 202 });
      }
      const envelope = { jsonrpc: "2.0", id: body.id, result };
      if (eventStream)
        return new Response(
          `event: message\ndata: ${JSON.stringify(envelope)}\n\n`,
          { headers: { "Content-Type": "text/event-stream" } }
        );
      return Response.json(envelope);
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const search = (input: Record<string, unknown> = {}, context?: any) =>
  set().dispatch(
    "web_search",
    { query: "watch competitor research", ...input },
    context
  ) as Promise<any>;

describe("registered web_search with the real MCP HTTP transport", () => {
  it.each(names)(
    "uses anonymous Parallel from %s and preserves URL/snippet shape",
    async name => {
      const output: any = await getAgentToolset(name)!.dispatch(
        "web_search",
        { query: "watch competitors" },
        { sessionId: "stable-session" }
      );
      expect(output).toMatchObject({
        ok: true,
        answer: null,
        results: [
          {
            url: "https://example.com/watch?q=1",
            content: "A useful watch competitor.",
            score: null,
            publishedDate: "2026-10-01",
          },
        ],
      });
      expect(requests.filter(r => r.body).map(r => r.body.method)).toEqual(
        expect.arrayContaining(["initialize", "tools/list", "tools/call"])
      );
      const call = requests.find(r => r.body?.method === "tools/call")!.body;
      expect(call.params).toEqual({
        name: "web_search",
        arguments: {
          objective: "watch competitors",
          search_queries: ["watch competitors"],
          session_id: "stable-session",
          model_name: ENV.anthropicModel,
        },
      });
      expect(tavilySearch).not.toHaveBeenCalled();
    }
  );

  it("accepts JSON text responses and bounds result count and excerpts", async () => {
    textOnly = true;
    reply.results = Array.from({ length: 5 }, () => ({
      ...resultData().results[0],
      excerpts: ["x".repeat(2000)],
    }));
    const output = await search({ maxResults: 2 });
    expect(output.results).toHaveLength(2);
    expect(output.results[0].content).toHaveLength(1200);
  });

  it("handles Streamable HTTP event-stream responses", async () => {
    eventStream = true;
    expect(await search()).toMatchObject({
      ok: true,
      results: [{ url: "https://example.com/watch?q=1" }],
    });
  });

  it("rejects missing tool discovery and JSON-RPC errors", async () => {
    missingTool = true;
    expect(await search()).toMatchObject({
      ok: false,
      error: expect.stringContaining("does not advertise"),
    });
    expect(requests.some(r => r.body?.method === "tools/call")).toBe(false);
    missingTool = false;
    protocolError = true;
    expect(await search()).toMatchObject({
      ok: false,
      error: expect.stringContaining("fixture protocol error"),
    });
  });

  it("preserves configured Tavily and all its options", async () => {
    ENV.tavilyApiKey = "saved-tavily-choice";
    tavilySearch.mockResolvedValue({
      query: "q",
      answer: "Tavily answer",
      results: [],
      responseTimeMs: 1,
    });
    expect(
      await search({
        searchDepth: "advanced",
        topic: "news",
        includeDomains: ["example.com"],
        excludeDomains: ["other.com"],
      })
    ).toMatchObject({ ok: true, answer: "Tavily answer" });
    expect(tavilySearch).toHaveBeenCalledWith(
      { tool: "tavily", apiKey: "saved-tavily-choice" },
      "watch competitor research",
      expect.objectContaining({
        searchDepth: "advanced",
        topic: "news",
        includeDomains: ["example.com"],
        excludeDomains: ["other.com"],
      })
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("supports an explicit Parallel override despite configured Tavily", async () => {
    ENV.tavilyApiKey = "saved-tavily-choice";
    ENV.webSearchProvider = "parallel";
    expect((await search()).ok).toBe(true);
    expect(tavilySearch).not.toHaveBeenCalled();
  });

  it.each(["disabled", "invalid", "tavily"])(
    "respects %s without any fallback/network",
    async provider => {
      ENV.webSearchProvider = provider;
      expect((await search()).ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
      expect(tavilySearch).not.toHaveBeenCalled();
    }
  );

  it("does not fall back after configured Tavily fails", async () => {
    ENV.tavilyApiKey = "saved-tavily-choice";
    tavilySearch.mockRejectedValue(new Error("Tavily refused"));
    expect(await search()).toMatchObject({
      ok: false,
      error: expect.stringContaining("Tavily refused"),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { searchDepth: "advanced" },
    { topic: "news" },
    { includeDomains: ["example.com"] },
    { excludeDomains: ["example.com"] },
  ])(
    "rejects unsupported options instead of ignoring them: %j",
    async input => {
      expect(await search(input)).toMatchObject({
        ok: false,
        error: expect.stringContaining("require Tavily"),
      });
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each(["", "a".repeat(401)])(
    "rejects invalid queries before network",
    async query => {
      expect((await search({ query })).ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each([429, 500])(
    "returns HTTP %s failure without trying Tavily",
    async status => {
      httpStatus = status;
      expect((await search()).ok).toBe(false);
      expect(tavilySearch).not.toHaveBeenCalled();
    }
  );

  it("rejects MCP tool errors", async () => {
    reply = {
      isError: true,
      content: [{ type: "text", text: "quota exhausted" }],
    };
    expect(await search()).toMatchObject({
      ok: false,
      error: expect.stringContaining("Parallel MCP search failed"),
    });
  });

  it.each([
    { wrong: [] },
    { results: [{ url: "javascript:alert(1)", excerpts: [] }] },
  ])("rejects malformed output or unsafe URL: %j", async bad => {
    reply = bad;
    expect((await search()).ok).toBe(false);
  });

  it("cancels before starting a request", async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await search({}, { signal: controller.signal })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts in-flight HTTP when the caller cancels", async () => {
    const controller = new AbortController();
    hang = true;
    const entered = new Promise<void>(resolve => {
      started = resolve;
    });
    const pending = search({}, { signal: controller.signal });
    await entered;
    controller.abort(new DOMException("cancelled", "AbortError"));
    expect((await pending).ok).toBe(false);
    expect(
      requests.find(r => r.body?.method === "tools/call")!.signal!.aborted
    ).toBe(true);
  });

  it("enforces the shared 30-second deadline on an in-flight search", async () => {
    const original = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => original(25));
    hang = true;
    expect((await search()).ok).toBe(false);
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(
      requests.find(r => r.body?.method === "tools/call")!.signal!.aborted
    ).toBe(true);
  });
});

function toolTurn(name = "web_search") {
  return {
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "call1",
        name,
        input: { query: "watch competitors" },
      },
    ],
    usage: {},
  };
}
function textTurn(text: string) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: {},
  };
}

describe("scripted model turns through the real agent loop and registered dispatcher", () => {
  it("feeds search URLs and snippets back to the next model turn", async () => {
    model
      .mockResolvedValueOnce(toolTurn())
      .mockImplementationOnce(async request => {
        const returned = JSON.parse(request.messages.at(-1).content[0].content);
        expect(returned).toMatchObject({
          ok: true,
          results: [
            {
              url: "https://example.com/watch?q=1",
              content: "A useful watch competitor.",
            },
          ],
        });
        return textTurn(`Competitor: ${returned.results[0].url}`);
      });
    const output = await runAgentLoop({
      systemPrompt: "Research",
      userPrompt: "Find competitors",
      tools: set().tools,
      dispatch: set().dispatch,
    });
    expect(output.text).toBe("Competitor: https://example.com/watch?q=1");
    expect(output.toolCallCount).toBe(1);
    expect(output.toolCalls[0].resultSnippet).toContain("example.com");
    expect(
      requests.find(r => r.body?.method === "tools/call")!.body.params.arguments
        .session_id
    ).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("keeps a stable session across research turns", async () => {
    model
      .mockResolvedValueOnce(toolTurn())
      .mockResolvedValueOnce(toolTurn())
      .mockResolvedValueOnce(textTurn("Done"));
    await runAgentLoop({
      systemPrompt: "Research",
      userPrompt: "Find competitors",
      tools: set().tools,
      dispatch: set().dispatch,
    });
    const calls = requests.filter(r => r.body?.method === "tools/call");
    expect(calls).toHaveLength(2);
    expect(calls[0].body.params.arguments.session_id).toBe(
      calls[1].body.params.arguments.session_id
    );
  });

  it("rejects a model request for a tool that was not offered", async () => {
    model
      .mockResolvedValueOnce(toolTurn())
      .mockImplementationOnce(async request => {
        expect(request.messages.at(-1).content[0].is_error).toBe(true);
        expect(request.messages.at(-1).content[0].content).toContain(
          "not allowed"
        );
        return textTurn("Search was not permitted");
      });
    await runAgentLoop({
      systemPrompt: "Research",
      userPrompt: "Find competitors",
      tools: [],
      dispatch: set().dispatch,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns provider errors to the model without falling back", async () => {
    httpStatus = 500;
    model
      .mockResolvedValueOnce(toolTurn())
      .mockImplementationOnce(async request => {
        expect(JSON.parse(request.messages.at(-1).content[0].content).ok).toBe(
          false
        );
        return textTurn("Search unavailable");
      });
    const output = await runAgentLoop({
      systemPrompt: "Research",
      userPrompt: "Find competitors",
      tools: set().tools,
      dispatch: set().dispatch,
    });
    expect(output.text).toBe("Search unavailable");
    expect(tavilySearch).not.toHaveBeenCalled();
  });

  it("passes cancellation to the model and stops before calling a tool", async () => {
    const controller = new AbortController();
    model.mockImplementationOnce(async (_request, options) => {
      expect(options.signal).toBe(controller.signal);
      controller.abort();
      return toolTurn();
    });
    await expect(
      runAgentLoop({
        systemPrompt: "Research",
        userPrompt: "Find competitors",
        tools: set().tools,
        dispatch: set().dispatch,
        signal: controller.signal,
      })
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
