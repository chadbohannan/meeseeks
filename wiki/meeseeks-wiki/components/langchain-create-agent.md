# LangChain `create_agent`

`create_agent` is the entry point of the LangChain framework and the concrete realization of its **Agent = Model + Harness** slogan: it assembles a model, its tools, a system prompt, and a middleware stack into a runnable agent. It is the LangChain analog of what the [Claude Code](../systems/claude-code.md) wraps as a CLI and what Pi implements as `runLoop`, but expressed as a composable object rather than a process. This page covers the harness itself; the runtime it compiles onto is the [LangGraph durable-execution](../concepts/langgraph-durable-execution.md) engine, and its place in the wider stack is mapped in the [LangChain ecosystem](../systems/langchain-ecosystem.md) overview.

## The agent is a loop, the harness is everything around it

The agents documentation (`docs.langchain.com/oss/python/langchain/agents`) defines an agent as "a model calling tools in a loop until a given task is complete," and the harness as "everything around that loop: the model, its prompt, its tools, and any middleware that shapes its behavior." The loop's job, in LangChain's framing, is "to get the model the right context at the right time for the given task" — the same context-management problem the [Pi agentic loop](../concepts/pi-agentic-loop.md) solves with steering and follow-up queues, here solved with middleware hooks.

Crucially, `create_agent` does not run its own event loop. It **compiles** to a LangGraph `StateGraph` — a model node and a tool node wired into the default agent topology — so every agent inherits durable execution, checkpointed threads, streaming, and human-in-the-loop interrupts from the runtime beneath it.

## The four core parameters

At its simplest an agent is `create_agent(model, tools)`. Four parameters cover most configuration:

- **`model`** — a `"provider:model"` identifier string or an initialized model instance, resolved through the [standard model interface](langchain-models.md). This makes model choice a one-string change across every supported provider, and it can be made dynamic at runtime through middleware.
- **`tools`** — any Python callable, LangChain `@tool`, or tool dict, detailed on the [tools](langchain-tools.md) page. The agent's tool set can itself be filtered per-request through middleware.
- **`system_prompt`** — a string or `SystemMessage` shaping the agent's approach; for prompts that depend on runtime state, a dynamic-prompt middleware replaces the static value per model call.
- **`middleware`** — the ordered [middleware](../concepts/langchain-middleware.md) stack that intercepts model and tool calls; this is the primary extension seam and where retries, guardrails, summarization, and approval gates live.

## Structured output as a first-class result

A fifth parameter, `response_format`, makes the agent return a validated schema instead of free text. Per the structured-output documentation, when set to a Pydantic model, dataclass, or JSON schema, the generated data is "captured, validated, and returned in the `'structured_response'` key of the agent's state." LangChain automatically selects a `ProviderStrategy` (native structured output) when the model supports it and falls back to a `ToolStrategy` (structured output via a synthetic tool call) otherwise — a decision read dynamically from the model's [profile data](langchain-models.md). Structured output is covered in depth on the [models](langchain-models.md) page.

## Invocation and state

An agent is called with `agent.invoke({"messages": [...]})` (or `stream`/`astream` for incremental output), and returns a state whose `messages` list is the running conversation. Passing a `thread_id` via the run config checkpoints that state so follow-up turns resume the same history, and passing `context` (typed by a `context_schema`) injects per-run dependencies that tools and middleware read through the [runtime object](../concepts/langgraph-durable-execution.md). Because the returned agent is a compiled graph, it can also be embedded as a node inside a larger LangGraph workflow — the harness and its whole middleware stack travel with it.

## Embedding in a host process (the TypeScript path)

The [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md) identifies two ways Meeseeks could attach to LangChain: as a client of the [Agent Server](langgraph-agent-server.md), or by **embedding** the agent in-process. The embed path is more viable for Meeseeks than earlier notes implied, because `create_agent` is fully first-class in JavaScript/TypeScript — `createAgent` ships in the `langchain` package and `createDeepAgent` in `deepagents` (Node 22+), and the JS Deep Agents surface mirrors the Python one across subagents, backends, skills, memory, and [MCP](../concepts/langchain-mcp.md). Embedding therefore does not force a Python sidecar into a Node platform:

```ts
import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph";

const agent = createAgent({ model, tools, checkpointer: new MemorySaver() });
const stream = await agent.stream(
  { messages: [{ role: "user", content: input }] },
  { streamMode: "updates", configurable: { thread_id } },
);
for await (const chunk of stream) { /* render */ }
```

An embedded agent keeps most of what the runtime provides: **durability** (supply a `checkpointer` — `MemorySaver` for prototyping or a database-backed one for production — and pass a `thread_id`, and the thread resumes across invocations), **streaming** (the same `streamMode` projections and typed event stream), **middleware, guardrails, interrupts, and tools**. What embedding *forgoes* is not durability but the server's coordination layer: [double-texting](langgraph-agent-server.md), background runs with `runs.join`, cron, the managed multi-tenant persistence infrastructure, and the language-agnostic HTTP surface — all of which the docs are explicit are properties of the server, not the bare framework.

For Meeseeks, embedding is the attach point that most resembles its current ownership model: the agent is an in-process library object Meeseeks hosts directly rather than a child process it supervises or a remote service it calls. It inherits the runtime's durability and streaming, but Meeseeks would reimplement the coordination the Agent Server otherwise hands over — queuing/steering and detach-and-resume — itself. This trade is weighed against the client path in the [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md) and generalized in the [harness-paradigms capstone](../syntheses/harness-paradigms.md).

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/agents |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/overview |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/structured-output |
| 2026-07-11 | https://docs.langchain.com/oss/javascript/langchain/quickstart — `createAgent`/`createDeepAgent` in JS, Node 22+ |
| 2026-07-11 | https://docs.langchain.com/oss/javascript/langchain/short-term-memory — `checkpointer` + `thread_id` for embedded persistence |
| 2026-07-11 | https://docs.langchain.com/oss/javascript/langchain/streaming — `agent.stream` with `streamMode` |
