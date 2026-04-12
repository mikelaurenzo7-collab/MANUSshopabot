# orchAIstrate - OSS Gems Research

## Evaluated Open Source Tools

### Tier 1: Legendary (50k+ stars) - Direct Integration Candidates

| Tool | Stars | Purpose for orchAIstrate | Verdict |
|------|-------|----------------------|---------|
| **@shopify/shopify-api** | Official | Shopify Admin API client with TypeScript, OAuth, webhooks | **MUST USE** — official SDK for Shopify store management |
| **BullMQ** | 6k+ | Redis-based job queue for workflow task execution | **STRONG FIT** — but we don't have Redis in our stack, would need to add |
| **sharp** | 29k+ | High-performance image processing (resize, convert, optimize) | **USEFUL** — for product image optimization in Architect/Hype-Man workflows |
| **node-cron** | 3k+ | Cron-based task scheduling | **USEFUL** — for scheduled inventory checks, price monitoring |

### Tier 2: Excellent (10k+ stars) - Architecture References

| Tool | Stars | Purpose | Verdict |
|------|-------|---------|---------|
| **LangChain.js** | 15k+ | Agent framework with tool use, chains, memory | **OVERKILL** — we already have a custom workflow engine with LLM integration. Adding LangChain would add complexity without clear benefit since our invokeLLM helper already handles what we need |
| **LangGraph.js** | 3k+ | Graph-based agent orchestration | **INTERESTING** — but our state machine approach is simpler and sufficient |

### Tier 3: Solid (1k+ stars) - Potential Future Integrations

| Tool | Stars | Purpose | Verdict |
|------|-------|---------|---------|
| **shopify-api-node** (MONEI) | 1.8k+ | Alternative Shopify client | **SKIP** — official SDK is better maintained |
| **Spree Commerce** | 13k+ | Open-source ecommerce platform | **NOT RELEVANT** — we orchestrate existing platforms, not build one |

## CTO Decision: What to Integrate

1. **@shopify/shopify-api** — Install this for production-grade Shopify API calls (products, orders, fulfillment, webhooks). Our current raw HTTP approach works but the official SDK handles rate limiting, pagination, and webhook verification.

2. **node-cron** — Install for scheduled agent tasks (inventory monitoring, price checks, social post scheduling). Lightweight, zero-dependency.

3. **sharp** — Already available in the sandbox. Can be used for product image optimization in workflows.

4. **Skip BullMQ** — Would need Redis infrastructure. Our database-backed workflow queue is sufficient for MVP. Can upgrade later when we need horizontal scaling.

5. **Skip LangChain** — Our custom workflow engine + invokeLLM is more tailored to our needs. LangChain adds abstraction without clear value for our specific use case.
