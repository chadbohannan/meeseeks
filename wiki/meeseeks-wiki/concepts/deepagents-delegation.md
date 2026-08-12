# Deep Agents Delegation: Sync, Async, and Dynamic Subagents

Delegation is one of the four capability categories [Deep Agents](../systems/deep-agents.md) is built around, and it exists in three distinct forms that are easy to conflate. This page separates them: **synchronous** subagents that block the supervisor, **async** subagents that run as independent background jobs on an Agent Protocol server, and **dynamic** subagents dispatched from [interpreter](deepagents-interpreters.md) code. It also covers the streaming projection that makes delegated work observable, which is what turns delegation from a black box into something a UI can render.

The shared motivation is context isolation: a subagent runs in its own context window and returns only its result, so heavy intermediate work never pollutes the supervisor's history. That is the delegation half of [context engineering](agent-memory.md). Deep Agents' particular choice — a supervisor dispatching stateless or task-scoped workers that report back rather than converse as peers — is one point in the wider design space the [multi-agent frameworks catalog](multi-agent-frameworks.md) surveys; it sits closest to the conversation-driven/manager-delegation pattern rather than the peer-to-peer handoff model OpenAI Swarm or CAMEL use, and its read-mostly, report-by-reference shape is exactly the condition the [swarm-tax synthesis](../syntheses/swarm-tax-multi-agent-cost-benefit.md) identifies as making multi-agent delegation worth its token premium rather than a pure tax.

## Synchronous subagents

The default. The supervisor calls a `task` tool with a `subagent_type`, the subagent runs to completion, and the supervisor blocks until it returns. Subagents are declared as dictionaries with `name`, `description`, and `system_prompt`, optionally overriding `tools`, `middleware`, `interrupt_on`, and `skills`. A built-in general-purpose subagent handles basic fan-out with no configuration, and can be overridden by defining one with the same name — the trick [`dcode`](../systems/deep-agents-code.md) documents for routing all delegated work to a cheaper model.

Synchronous subagents are stateless: no state persists between invocations. They are the right choice when the supervisor genuinely needs the result before it can continue.

## Async subagents

Async subagents (preview in `deepagents` 0.5.0) invert the execution model. `start_async_task` returns a task ID **immediately** and the supervisor continues talking to the user while work proceeds in the background. The supervisor gets five tools — `start_async_task`, `check_async_task`, `update_async_task`, `cancel_async_task`, `list_async_tasks` — and the middleware handles thread creation, run management, and state persistence underneath.

The architectural fact that distinguishes them: **each async subagent is a run on an Agent Protocol server**, not an in-process call. Every subagent is stateful, maintaining its own thread across interactions. The lifecycle is explicit:

- **Launch** creates a thread on the server, starts a run with the task description as input, and returns the thread ID as the task ID.
- **Check** fetches run status, retrieving thread state to extract the final output if the run succeeded.
- **Update** creates a new run on the same thread with an *interrupt* multitask strategy — the previous run is interrupted and the subagent restarts with full conversation history plus the new instructions, keeping the same task ID. This is what "mid-flight steering" means concretely.
- **Cancel** calls `runs.cancel()` and marks the task cancelled.
- **List** fetches live status for non-terminal tasks in parallel, serving terminal statuses (`success`, `error`, `cancelled`) from cache.

**Transport is chosen by the presence of a `url`.** Omit it and the LangGraph SDK uses ASGI transport — in-process function calls, no network latency, no extra auth — requiring all graphs to be registered in the same `langgraph.json`. Supply a `url` and calls go over HTTP to a remote Agent Protocol server, authenticated for LangGraph deployments via `LANGSMITH_API_KEY`. This yields three deployment shapes: single (all co-deployed, the recommended start), split (supervisor and subagents on separate servers for independent scaling), and hybrid (some of each).

### The state-channel detail worth stealing

Task metadata lives in a **dedicated `async_tasks` state channel** on the supervisor's graph, deliberately separate from message history. The reasoning is precise and generalizable: deep agents compact their message history when the context window fills, so task IDs stored only in tool messages would be *lost during summarization*. A dedicated channel guarantees the supervisor can always recall its tasks through `list_async_tasks`, however many rounds of compaction have occurred. Each entry records task ID, agent name, thread ID, run ID, status, and `created_at`/`last_checked_at`/`last_updated_at` timestamps.

This is a genuinely instructive pattern for any orchestrator: **durable handles to outstanding work must not live in a channel subject to lossy compression.** It is the same class of problem the [attention-economics synthesis](../syntheses/attention-economics.md) identifies when it observes that a 2 MB lossy ring buffer gives Meeseeks a memory shorter than its own workflows.

### Documented failure modes

The docs are unusually candid about model-behaviour failures, and the mitigations are all prompt-level, which says something about where the abstraction leaks. Supervisors tend to **poll immediately after launch**, collapsing async back into blocking — the middleware injects system-prompt rules against it. They **report stale status** from conversation history instead of re-checking, so the middleware asserts that "task statuses in conversation history are always stale." They **truncate task IDs**, breaking `check` and `cancel`. And launches **queue rather than run** when the local worker pool is exhausted: a supervisor with three concurrent tasks needs four slots, hence `langgraph dev --n-jobs-per-worker 10`.

## Dynamic subagents

The third form dispatches subagents from *code* rather than from tool calls. With interpreter middleware installed, a `task()` global becomes available and the agent writes an orchestration script — loops, `Promise.all` batches, conditional refinement — instead of emitting one `task` call at a time. This is covered in full on the [interpreters](deepagents-interpreters.md) page; the reason it belongs in a delegation taxonomy is that it changes *who decides the fan-out*: the model authors a dispatch policy once, rather than acting as the dispatcher on every turn.

## Observing delegated work: `stream.subagents`

Deep Agents adds a subagent projection on top of LangGraph [streaming](langchain-streaming.md), giving one stream handle per delegated `task` call. The projection is lazy — it discovers subagent tasks first, and message, tool-call, and value streams open only when accessed on a handle. Each handle exposes `name` (the `subagent_type` the coordinator selected), `messages`, `subagents` (nested invocations), `output`, `path` (namespace), `status` (`started`, `completed`, `failed`, `interrupted`), and `tool_calls` scoped to that subagent.

The distinction the docs draw is the useful one: **`stream.subgraphs` shows graph execution structure; `stream.subagents` shows product-level task delegations.** The latter is what a user-facing UI should consume, because it hides internal graph nodes and surfaces the subagent concept directly. That is precisely the projection `dcode` renders as its live dynamic-subagents panel, grouped into phases by dispatch.

For interleaved consumption there are three options: `asyncio.gather` over `astream_events` in async code, `stream.interleave("messages", "subagents")` in sync code, or — when exact arrival order across coordinator and all subagents matters — iterating raw protocol events and switching on `namespace` to identify the source.

For an orchestrator like Meeseeks, this is the concrete shape of the structured alternative to scraping a PTY: a nested, typed, per-subagent event tree with lifecycle status, which the [frontend rendering](langchain-frontend-rendering.md) page shows rendered through the TypeScript `useStream` SDK.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/async-subagents |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/event-streaming |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/subagents |
