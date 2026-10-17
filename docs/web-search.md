# Store Bot web search

The registered competitor research, repricing and trend research toolsets expose
`web_search`. An unconfigured installation uses
[Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp) at
`https://search.parallel.ai/mcp`, with free anonymous search powered by Fast mode.
No search account or API key is required. Agent-loop workflows still need their
existing `ANTHROPIC_API_KEY` and `useAgentLoop` activation.

If `TAVILY_API_KEY` is set, search continues to use Tavily. You can explicitly
select a provider with `WEB_SEARCH_PROVIDER=parallel` or
`WEB_SEARCH_PROVIDER=tavily`, or prevent search requests with
`WEB_SEARCH_PROVIDER=disabled`. Restart the server after changing environment
settings. Invalid settings, missing explicitly selected credentials and provider
errors return a structured error to the agent without trying another provider.

Parallel returns ranked URLs and excerpts in the existing result shape, with
`answer: null` and `score: null`. `maxResults` caps the returned list; the service
may return fewer results. Queries are limited to 400 characters, excerpts to
1,200 characters per result, and a request has a 30-second deadline including
MCP initialization and tool discovery. Agent-loop cancellation also cancels its
Parallel request. Queries go to the selected provider; anonymous service limits
can return errors, which are passed back to the agent.

Parallel supports basic general search here. Advanced depth, `topic: "news"`,
`includeDomains` and `excludeDomains` require Tavily and produce a clear error
when Parallel is selected. The agent's existing `scout_url` tool still uses
Firecrawl to read a particular page; this integration adds search only.

For example, an existing workflow using `architect.competitor_stalker_v0` can
call `web_search` with `{"query":"minimalist watch competitors","maxResults":3}`
and reason from the returned `results[].url` and `results[].content`. It can then
call `scout_url` if it needs full page content and Firecrawl is configured.
Workflow activation and the offered tool list continue to control tool access.
