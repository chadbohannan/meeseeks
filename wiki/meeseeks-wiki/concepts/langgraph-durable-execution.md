# LangGraph Durable Execution

LangGraph is the runtime beneath every LangChain agent, and its execution model is what makes LangChain interesting to Meeseeks: it provides, as native runtime primitives, the four capabilities the [Meeseeks Runtime Supervisor](../components/runtime.md) currently reconstructs by hand around an opaque Claude Code process — durable execution, streaming, human-in-the-loop, and persistence. This page describes those primitives; the [LangChain ecosystem](../systems/langchain-ecosystem.md) page situates them in the wider stack, and the [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md) draws out what they mean for an orchestrator. It is the LangChain counterpart to the [Pi agentic loop](pi-agentic-loop.md) analysis.

## The loop is a compiled graph

Where Pi's loop is a hand-written `runLoop` driver and Claude Code's is opaque inside a binary, LangChain's `create_agent` **compiles** to a LangGraph `StateGraph` — a graph of nodes (a model node, a tool node) connected by edges, executed by LangGraph's Pregel engine. The agent loop (model → tools → model until no tool calls remain) is the default topology, but because it is a graph, the same agent can be dropped into a larger `StateGraph` as a node or subgraph, and every middleware hook still runs. This is a structural inversion of the CLI model: the agent is not a process to be driven from outside but a graph object composed and invoked in-process, or served behind the [Agent Server](../components/langgraph-agent-server.md).

## State, threads, and checkpointers

Execution state is an explicit, typed object (the agent's `AgentState`, minimally a `messages` list) that flows through the graph. Persistence has two complementary systems, per the persistence documentation (`docs.langchain.com/oss/python/langgraph/persistence`):

- **Checkpointers** snapshot the thread's graph state at each step. They are short-term, thread-scoped memory keyed by a `thread_id` passed in the run config, and they are what make execution *durable*: if a worker is interrupted, the run resumes from the last checkpoint rather than from the beginning. Backends range from `InMemorySaver` (prototyping) to `AsyncPostgresSaver` (production). Checkpointing is the persistence half of durability; the step-level half — per-node retries, timeouts, and error handlers that absorb failures without losing the run — is covered in [LangGraph fault tolerance](langgraph-fault-tolerance.md).
- **Stores** persist application-defined key-value data *across* threads — long-term memory for user preferences, facts, and shared knowledge.

A `thread_id` is therefore a durable, resumable conversation handle. This directly addresses the Meeseeks deferred feature of *runtime persistence across server restarts*: under Claude Code, a killed process loses its session; under LangGraph with a Postgres checkpointer, the thread survives and any run can resume from its last checkpoint.

## Human-in-the-loop via interrupts

Human oversight is a first-class runtime mechanism, not a UI convention. The `HumanInTheLoopMiddleware` (`docs.langchain.com/oss/python/langchain/human-in-the-loop`) checks each tool call against a policy and, when review is required, issues a LangGraph **interrupt** that halts execution and saves state through the checkpointer, so the pause is durable and survives a restart. A human resumes with one of four decisions: `approve` (run as proposed), `edit` (modify arguments first), `reject` (skip and return feedback to the model), or `respond` (return a synthetic tool result for "ask user" tools). A `when` predicate can gate interrupts on tool arguments — for example, pausing only writes outside a workspace directory, or only SQL that is not a read-only `SELECT`. This is a far richer permission-and-approval seam than Claude Code's allow/deny rules and prompt hooks, and unlike Claude Code it requires no external notification plumbing because the interrupt *is* the state.

## Streaming as typed projections

Rather than raw ANSI bytes (Claude Code) or a single JSON-L event union (Pi), LangGraph streams structured modes: `updates` (state deltas after each agent step), `messages` (`(token, metadata)` tuples as the LLM generates), and `custom` (arbitrary signals a tool emits through the runtime stream writer). LangChain v1.3 adds an event-streaming API of typed projections — separate iterators for messages, values, tool calls, and subgraphs — so a consumer reads the projection it wants instead of branching on a chunk's `stream_mode`. For an orchestrator this is both a gift and a cost: the state signals Meeseeks scrapes from Claude Code's PTY and hooks are available structurally, but there is no terminal rendering to feed xterm.js directly — the same rendering gap Pi's RPC mode creates.

## Runtime: dependency injection and execution identity

LangGraph exposes a `Runtime` object (`docs.langchain.com/oss/python/langchain/runtime`) to tools and middleware carrying: **context** (static per-invocation dependencies like a user id or db connection, declared via `context_schema` and passed at invoke time — dependency injection rather than globals); a **store** for long-term memory; a **stream writer** for custom streaming; **execution info** (thread id, run id, attempt number); and **server info** (assistant id, graph id, authenticated user) which is populated only when running under the [Agent Server](../components/langgraph-agent-server.md) and is `None` in local/embedded use. The `context` seam is how a Meeseeks-style orchestrator would inject per-ticket or per-lane configuration into an agent run without restarting anything — a capability Claude Code approximates only through its `--settings` file and Pi lacks entirely.

## Graph API vs. Functional API

LangGraph offers two authoring styles over the same runtime: the explicit **Graph API** (`StateGraph`, nodes, edges) and a **Functional API** for expressing the same durable execution as ordinary control flow. Notably, the Agent Server can deploy graphs authored outside LangGraph — agents built with other frameworks (e.g. Strands, Google ADK) can be wrapped through the Functional API — which widens what an Agent-Server-based Meeseeks adapter could supervise beyond LangChain agents alone.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/overview |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/persistence |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/human-in-the-loop |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/streaming |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/runtime |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/agents |
