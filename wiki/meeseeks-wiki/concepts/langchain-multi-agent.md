# LangChain Multi-Agent Patterns

Multi-agent systems "coordinate specialized components to tackle complex workflows," but the multi-agent documentation (`docs.langchain.com/oss/python/langchain/multi-agent`) opens with a caution worth keeping: "not every complex task requires this approach — a single agent with the right (sometimes dynamic) tools and prompt can often achieve similar results." At the center of the design is [context engineering](agent-memory.md) — deciding what each agent sees — which is why these patterns are built from the same [subgraph](langgraph-graph-api.md), [middleware](langchain-middleware.md), and [`Command`](../components/langchain-tools.md) primitives as the rest of the framework rather than a separate multi-agent runtime.

## Why reach for multiple agents

The docs reduce "we need multi-agent" to three underlying wants: **context management** (surface specialized knowledge without overflowing one context window), **distributed development** (independent teams owning components with clear boundaries), and **parallelization** (concurrent specialized workers). The failure modes that justify it are concrete: a single agent with too many [tools](../components/langchain-tools.md) makes poor tool choices; tasks need extensive domain-specific context; or capabilities must unlock only after sequential conditions are met.

## The five patterns

| Pattern | How it works | Best for |
|---------|--------------|----------|
| **Subagents** | A main agent coordinates subagents exposed as tools; all routing passes through it. | Distributed development, parallelization, multi-hop delegation. |
| **Handoffs** | Behaviour changes dynamically on state: a tool call updates a state variable that triggers routing or reconfigures the current agent's tools and prompt. | Multi-hop flows and direct user interaction. |
| **Skills** | Specialized prompts and knowledge loaded on demand while a single agent stays in control. | Multi-hop work and direct user interaction with low overhead. |
| **Router** | A classification step directs input to one or more specialized agents, then synthesizes their results. | Parallel fan-out and distributed development. |
| **Custom workflow** | A bespoke [LangGraph](langgraph-graph-api.md) flow mixing deterministic logic and agentic nodes, embedding the other patterns as nodes. | Anything the fixed patterns don't cover. |

## Handoffs and the `Command` mechanism

The handoffs pattern is the clearest illustration of how these are *not* separate processes talking over a network. A tool returns a `Command` that updates a `current_step` (or similar) state field; a `wrap_model_call` [middleware](langchain-middleware.md) reads that field and swaps the system prompt and tool set for the next model call. The "handoff" is a state transition inside one compiled graph, not an inter-process message — a sharp contrast with how a Meeseeks-style orchestrator would coordinate several independent Claude Code processes, each an opaque PTY.

## Subagents and the Deep Agents connection

The subagents pattern — a supervisor delegating to workers running in **isolated context windows** — is important enough that it is packaged as prebuilt infrastructure. The subagent [middleware](langchain-middleware.md) supplies subagents through a `task` tool, and the [Deep Agents](../systems/deep-agents.md) harness makes coordinator-worker delegation, [skills](../systems/deep-agents.md), planning, and a virtual filesystem its default architecture. For an orchestrator evaluating LangChain, this means multi-agent coordination is available either as composable primitives (subgraphs + `Command` + middleware) or as a batteries-included harness, without leaving the framework.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/multi-agent |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/multi-agent/subagents |
