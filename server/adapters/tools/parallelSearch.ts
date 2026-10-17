/** Anonymous Parallel Search MCP, used by the agent's web_search dispatcher. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AgentToolContext } from "../../_core/claudeAgentLoop";
import type { SearchResult } from "./types";

export const PARALLEL_SEARCH_URL = "https://search.parallel.ai/mcp";
export const PARALLEL_SEARCH_USER_AGENT =
  "Shop_a_Bot/1.0.0 (+https://github.com/mikelaurenzo7-collab/MANUSshopabot)";
const TIMEOUT_MS = 30_000;

const searchResponse = z.object({
  results: z.array(
    z.object({
      url: z
        .string()
        .url()
        .refine(url => /^https?:\/\//i.test(url)),
      title: z.string().nullable().optional(),
      excerpts: z.array(z.string()),
      publish_date: z.string().nullable().optional(),
    })
  ),
});

export async function searchParallel(
  query: string,
  maxResults: number,
  modelName: string,
  context?: AgentToolContext
): Promise<SearchResult> {
  const start = Date.now();
  // One deadline covers initialization, discovery and search, including HTTP reads.
  const signal = context?.signal
    ? AbortSignal.any([context.signal, AbortSignal.timeout(TIMEOUT_MS)])
    : AbortSignal.timeout(TIMEOUT_MS);
  signal.throwIfAborted();
  const client = new Client({ name: "shopabots", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(PARALLEL_SEARCH_URL),
    {
      requestInit: { headers: { "User-Agent": PARALLEL_SEARCH_USER_AGENT } },
      fetch: (url, init) =>
        fetch(url, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([signal, init.signal])
            : signal,
        }),
      reconnectionOptions: {
        maxRetries: 0,
        initialReconnectionDelay: 1000,
        maxReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1,
      },
    }
  );
  try {
    await client.connect(transport, { signal, timeout: TIMEOUT_MS });
    const tools = await client.listTools({}, { signal, timeout: TIMEOUT_MS });
    if (!tools.tools.some(tool => tool.name === "web_search")) {
      throw new Error("Parallel MCP does not advertise web_search");
    }
    const response = CallToolResultSchema.parse(
      await client.callTool(
        {
          name: "web_search",
          arguments: {
            objective: query,
            search_queries: [query],
            ...(context?.sessionId ? { session_id: context.sessionId } : {}),
            model_name: modelName,
          },
        },
        undefined,
        { signal, timeout: TIMEOUT_MS }
      )
    );
    if (response.isError) {
      throw new Error(
        "Parallel MCP search failed; try again later or explicitly configure Tavily"
      );
    }
    // MCP servers can return structuredContent or a JSON text content block.
    const text = response.content.find(block => block.type === "text");
    const data = searchResponse.parse(
      response.structuredContent ??
        JSON.parse(text?.type === "text" ? text.text : "null")
    );
    return {
      query,
      answer: null,
      results: data.results.slice(0, maxResults).map(hit => ({
        title: hit.title ?? "",
        url: hit.url,
        content: hit.excerpts.join("\n").slice(0, 1_200),
        score: null,
        publishedDate: hit.publish_date ?? null,
      })),
      responseTimeMs: Date.now() - start,
    };
  } finally {
    await client.close();
  }
}
