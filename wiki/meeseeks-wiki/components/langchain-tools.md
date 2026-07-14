# LangChain Tools

Tools are what let an agent act: they "fetch real-time data, execute code, query external databases, and take actions in the world," per the tools documentation (`docs.langchain.com/oss/python/langchain/tools`). A tool is a callable with a well-defined input/output schema that is passed to a model; the model decides when to invoke it and with what arguments. In [`create_agent`](langchain-create-agent.md), tools are the second core parameter, and their execution is the "tool" half of the model-tool loop.

## Definition

The `@tool` decorator turns a typed Python function into a tool, taking its name, description, and argument schema from the signature and docstring. Schemas can be elaborated with Pydantic for validation, and certain argument names are reserved for injected runtime values rather than model-supplied ones. This is the direct analog of how Claude Code and Pi expose built-in tools, except that here the tool set is application-defined and passed in at agent construction.

## Accessing context: the `ToolRuntime` seam

Tools reach beyond their arguments through a `ToolRuntime` parameter, which the framework injects and the model never sees. Through it a tool can read:

- **State** — the live agent state, including `messages` and any custom fields a [middleware](../concepts/langchain-middleware.md) added to the state schema.
- **Context** — static per-invocation dependencies (user id, db connection) declared via `context_schema` and passed at invoke time; this is LangChain's [dependency-injection](../concepts/langgraph-durable-execution.md) mechanism, keeping tools testable instead of reaching for globals.
- **Store** — cross-thread [long-term memory](../concepts/agent-memory.md) for reading and writing durable facts.
- **Stream writer** — a channel to emit custom streaming updates (e.g. "Fetched 10/100 records") that surface in the agent's [stream](../concepts/langchain-streaming.md).
- **Execution info and server info** — thread id, run id, attempt number, and (only under the [Agent Server](langgraph-agent-server.md)) assistant id and authenticated user.

## Return values and `Command`

A tool can return a string (human-readable, becomes a `ToolMessage`), an object (structured data for the model to inspect), or a **`Command`** — a value that writes directly to agent state, optionally alongside a message. `Command` is how a tool influences control flow rather than merely returning data: it can update a state field that a middleware later routes on, which is the backbone of the state-machine style of [multi-agent](../concepts/langchain-multi-agent.md) handoffs. Tool errors are handled through middleware (e.g. the prebuilt tool-retry) rather than in each tool body.

## Dynamic tool selection

The tool set need not be fixed at construction. Because "too many tools may overwhelm the model and increase errors; too few limit capabilities," LangChain supports selecting tools per model call — filtering pre-registered tools by authentication state, user permissions, feature flags, or conversation stage inside a `wrap_model_call` middleware that calls `request.override(tools=...)`. This is a capability neither Claude Code nor Pi exposes: the available toolset adapts to runtime state on every model turn.

## Headless tools: execution off the server

A **headless tool** is schema-only — registered with the agent so the model can call it, but with no in-process implementation. When the model calls one, the run **interrupts** with a payload `{"type": "tool", "tool_call": {...}}` instead of executing; the actual work happens elsewhere (a browser, another service, a human step), and the graph resumes with the tool result. This is the mechanism for tools that must run "where your user's app runs" — browser APIs, on-device/private data, or latency-sensitive local operations — and it reuses the same interrupt/resume machinery as [human-in-the-loop](../concepts/human-in-the-loop.md).

## MCP tools

LangChain agents consume tools from [Model Context Protocol](../concepts/langchain-mcp.md) servers through the `langchain-mcp-adapters` library. A `MultiServerMCPClient` aggregates tools across several servers (each over `stdio` or `http` transport) and exposes them as ordinary LangChain tools; it is stateless by default (a fresh session per call) with an opt-in stateful-session mode. Beyond tools, the adapters also surface MCP resources and prompts, and support tool interceptors, progress notifications, and elicitation. This matters to Meeseeks because MCP is the shared extension substrate across all three candidate harnesses — Claude Code, Pi, and LangChain each speak it.

## Prebuilt and server-side tools

LangChain ships a large catalog of prebuilt tools and toolkits (web search, code interpreters, database access) usable without custom code. Separately, some providers execute **server-side tools** (web search, code interpreters) inside their own infrastructure, requiring no local hosting — enabled through the [model](langchain-models.md) interface rather than defined as LangChain tools.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/tools |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/mcp |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/runtime |
