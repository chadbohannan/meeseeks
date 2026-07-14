# Agent Memory and Context Engineering

Memory is "a system that remembers information about previous interactions," and in LangChain it splits cleanly along the same seam as the [LangGraph persistence layer](langgraph-durable-execution.md): short-term memory scoped to one conversation thread, and long-term memory spanning all of them. Above both sits **context engineering** — the discipline of getting the right information into the model at the right time — which the documentation calls "the number one job of AI Engineers" and "the number one blocker for more reliable agents." This page digests all three, because together they are LangChain's answer to the context-management problem the [Pi agentic loop](pi-agentic-loop.md) addresses with its steering/follow-up queues and `transformContext` hook.

## Why context, not the model, is usually the problem

The context-engineering documentation (`docs.langchain.com/oss/python/langchain/context-engineering`) makes a sharp claim: when agents fail, it is usually not because the model is incapable but because "the 'right' context was not passed to the LLM." LangChain's abstractions are designed around this. It distinguishes three data sources by scope:

- **Runtime context** — static configuration for a conversation (user id, API keys, db connections, permissions), injected via `context_schema`.
- **State** — short-term memory scoped to the conversation (current messages, uploaded files, auth status, tool results).
- **Store** — long-term memory across conversations (user preferences, extracted insights, historical data).

And it distinguishes what you control by lifetime: **transient** context (what the model sees for a single call — messages, tools, prompt, response format) versus **persistent** context (what is saved in state across turns). The lever for all of it is [middleware](langchain-middleware.md): every context-engineering technique in the docs is expressed as a middleware hook that updates context or jumps to a different lifecycle step.

## Short-term memory: threads and checkpointers

Short-term memory is the conversation history within a single **thread** — "similar to the way email groups messages in a single conversation." It is added by passing a `checkpointer` to [`create_agent`](../components/langchain-create-agent.md); the agent then stores its [messages](langchain-messages.md) in graph state, persisted to a database (or memory) so the thread can be resumed at any time. State updates when the agent is invoked or a step completes, and is read at the start of each step.

The hard problem short-term memory creates is context-window pressure: long histories may not fit, and even when they do, models "get distracted by stale or off-topic content" while paying in latency and cost. LangChain's answers are middleware-based — **summarization** middleware condenses old turns, and **context-editing** middleware clears stale tool outputs while preserving recent ones — so trimming history is a configured policy rather than manual bookkeeping.

## Long-term memory: the store

Long-term memory persists across threads and sessions. It is built on [LangGraph stores](langgraph-durable-execution.md), which "save data as JSON documents organized by namespace and key," and is added by passing a `store` to `create_agent` (an `InMemoryStore` for prototyping, a Postgres-backed store in production). Tools and middleware read and write it through the [`ToolRuntime`](../components/langchain-tools.md) `store` handle — for example, saving a user's preferences under a `("users",)` namespace on one session and recalling them on the next. Under the [Agent Server](../components/langgraph-agent-server.md), the store is provisioned and injected by the platform rather than configured in graph code.

## Why this matters for Meeseeks

Both memory systems are native runtime features here, whereas Meeseeks currently has neither for its Claude Code sessions — a killed process loses its short-term state entirely, and there is no cross-session store. Adopting a LangChain-based harness would move conversation durability and cross-ticket memory from something Meeseeks would have to build (its deferred "runtime persistence" feature) into platform-provided infrastructure, as spelled out in the [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md).

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/context-engineering |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/short-term-memory |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/long-term-memory |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/persistence |
