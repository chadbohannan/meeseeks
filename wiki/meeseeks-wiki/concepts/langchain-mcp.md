# Model Context Protocol in LangChain

The Model Context Protocol (MCP) is "an open protocol that standardizes how applications provide tools and context to LLMs" (`docs.langchain.com/oss/python/langchain/mcp`). It matters to this wiki beyond LangChain itself: MCP is the **shared extension substrate** across all three candidate harnesses — Claude Code, the [Pi coding agent](../systems/pi.md), and LangChain all consume MCP tools — so an orchestrator's tool integrations are portable across a harness swap in a way little else is. This page digests how LangChain agents speak MCP.

## Consuming MCP servers

LangChain agents use MCP tools through the `langchain-mcp-adapters` library. A `MultiServerMCPClient` aggregates tools across one or more servers and exposes them as ordinary LangChain [tools](../components/langchain-tools.md) that pass straight into [`create_agent`](../components/langchain-create-agent.md). Each server is reached over a **transport** — `stdio` for a local subprocess or `http` for a remote server — and the client is **stateless by default**: every tool invocation opens a fresh `ClientSession`, runs the tool, and cleans up, with an opt-in **stateful session** mode for servers that need connection continuity.

## Beyond tools

MCP carries more than tool definitions, and the adapters surface the rest:

- **Resources** — server-hosted context loaded by URI (all resources from a server, or specific ones).
- **Prompts** — named, argument-parameterized prompt templates loaded from the server and dropped into a workflow's message list.
- **Tool interceptors** — wrap tool calls to rewrite arguments or results, composing inner-and-outer around execution.
- **Progress notifications, logging, and elicitation** — streamed progress from long-running tools, server-side logs, and elicitation (a tool asking the caller for additional input mid-execution, which the caller can accept with data, decline, or cancel).

## MCP across the ecosystem

MCP appears at every layer. [Deep Agents](../systems/deep-agents.md) fully supports MCP for connecting databases, APIs, and filesystems, and its `dcode` CLI ships MCP tooling. The [Agent Server](../components/langgraph-agent-server.md) can itself be exposed as an MCP endpoint, and LangSmith offers a remote MCP server over its own data. This ubiquity is the strategic point for Meeseeks: because MCP is provider- and harness-neutral, tool investments made against Claude Code today would carry forward to a LangChain- or Pi-based harness tomorrow, softening the lock-in that the [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md) otherwise weighs.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/mcp |
| 2026-07-11 | https://docs.langchain.com/oss/python/deepagents/mcp |
