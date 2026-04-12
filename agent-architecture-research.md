# Agent Architecture Research - Beast Bots

## Key Findings

### From Deloitte (Nov 2025) - AI Agent Orchestration
- Progressive "autonomy spectrum": humans in the loop → on the loop → out of the loop
- Supervisor agent pattern: dedicated supervisor coordinates specialized worker agents
- Most advanced businesses in 2026 shifting toward human-on-the-loop orchestration
- Agent orchestration needed depends on: criticality, dependencies, task predictability, targeted resilience
- Some modules benefit from sequential agents (one's output → another's input)
- Other modules leverage parallel or collaborative agents

### From McKinsey (Jan 2026) - Agentic Commerce Automation Curve
- Six-level automation curve from basic rules to full autonomy
- AI agents could mediate $3-5 TRILLION of global consumer commerce by 2030
- Willingness to delegate varies by: ticket size, emotional salience, identity signaling, regret risk
- Key insight: "optimal delegation, not maximum autonomy"
- B2B: authority flows from procurement policies, agents operate within defined policies
- Consumer: delegation is personal, authorized to save time/money

### From Invimatic (Jan 2026) - Multi-Agent Systems for SaaS
- Three patterns: Orchestrator-Led, Peer-to-Peer, Hierarchical
- Orchestrator-Led: Manager Agent assigns tasks to Worker Agents
- Best for: complex workflows with clear task decomposition

### Architecture Decision: Agent-to-Store Relationship

**Option A: 1 Agent Instance Per Store (Dedicated)**
- Pros: Simple mental model, clear isolation, easy to reason about
- Cons: Doesn't scale, can't cross-optimize, users with 5 stores manage 15 agents

**Option B: 3 Global Agents Per User (Shared across all stores)**
- Pros: Cross-store intelligence, unified view, simpler UX
- Cons: Need store-aware routing, more complex state management

**Option C: 3 Agent Types × N Stores = N Agent Instances (Hybrid)**
- Pros: Dedicated attention per store, but typed specialization
- Cons: Explosion of instances, complex management

## CTO DECISION: Option B - Three Global Agents, Store-Aware

**Rationale:**
1. Users think in terms of "my marketing agent" not "my Shopify store 1 marketing agent"
2. Cross-store intelligence is a MASSIVE competitive advantage (e.g., Hype-Man can compare which store performs better for a product category)
3. The Architect can recommend which platform to launch a new store on based on data from all connected stores
4. The Merchant can optimize inventory across stores (if same product on Shopify + Amazon, route to the platform with better margins)
5. Simpler UX: 3 agents to manage, not 3×N
6. Aligns with Deloitte's "supervisor agent" pattern — each agent is a supervisor over its domain across all stores
7. Task routing is store-aware: when a task targets a specific store, the agent knows which platform API to call

**Implementation:**
- Each agent type (Architect, Merchant, Hype-Man) is a singleton per user
- Tasks are scoped to a store (storeId) or global (cross-store analysis)
- Agent workflows have a "target" field: specific store, all stores, or no store (research tasks)
- The orchestration engine routes API calls through platform-specific adapters
