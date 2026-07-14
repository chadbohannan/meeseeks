# LangChain Streaming

Streaming is how an agent surfaces work in progress rather than a single blocking result, and for an orchestrator it is the substitute for scraping a terminal: the structured events LangChain streams are the state signals a [Meeseeks-style supervisor](../components/langgraph-agent-server.md) would consume in place of Claude Code's ANSI PTY output. LangChain inherits its streaming stack from [LangGraph](langgraph-durable-execution.md), which is why the same modes appear whether you call an agent directly or through the [Agent Server](../components/langgraph-agent-server.md).

## Stream modes

The base streaming API (`docs.langchain.com/oss/python/langchain/streaming`) exposes three modes, passed to `stream`/`astream`:

- **`updates`** — a state delta after each agent step. If several nodes run in one step, each update streams separately. This is the "agent progress" signal: an `AIMessage` with tool-call requests, then a `ToolMessage` with the result, then the final response.
- **`messages`** — `(token, metadata)` tuples as any LLM node generates, giving token-by-token output.
- **`custom`** — arbitrary data a tool emits through the [`ToolRuntime`](../components/langchain-tools.md) stream writer, e.g. `"Fetched 10/100 records"`.

Multiple modes can be requested at once. Reasoning/thinking tokens stream through the `messages` channel for models that expose them, carried as [reasoning content blocks](langchain-messages.md).

## Event streaming: typed projections

LangChain v1.3 adds **event streaming** through `stream_events(..., version="v3")`, which the docs recommend for new applications. Instead of one interleaved stream of `stream_mode` tuples that the consumer must branch on, it returns a run object with **separate typed iterators per projection** — `messages`, `tool_calls`, `values`, and subgraphs — so each can be consumed independently. A caller can iterate `stream.messages` for token text and `stream.tool_calls` for tool activity without disentangling them, and `stream.output` resolves to the final state. There is also an `interleave(...)` helper to merge chosen projections back into one ordered stream when that is what a renderer wants.

This projection model is the structural analog of Pi's single `EventStream<AgentEvent>` union, but split by concern rather than discriminated by a `type` field — and it is deliberately shaped for UI consumption, which is why LangChain's own [frontend rendering SDK](langchain-frontend-rendering.md) reads it through a `useStream` React hook.

## The rendering consequence for Meeseeks

Streaming is a gift and a cost in equal measure, and the cost is the same one Pi's RPC mode imposes. The structured signals Meeseeks reverse-engineers from Claude Code's PTY and hooks are here available natively — run progress, tool activity, token deltas, custom updates — but there is no ANSI terminal rendering to pipe into an xterm.js [console panel](../components/console.md). A LangChain adapter would either synthesize terminal-looking output from `messages`/`updates` projections or, following LangChain's grain, render agent state in React instead of a terminal emulator. The React path has a first-party, TypeScript implementation detailed in [LangChain frontend rendering](langchain-frontend-rendering.md); the trade-off is examined in full in the [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md).

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/streaming |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/event-streaming |
