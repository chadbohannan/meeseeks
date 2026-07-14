# Pi Agentic Loop — Design Patterns

The [Pi agentic loop](../concepts/pi-agentic-loop.md) is small — a couple of functions in `pi-mono/packages/agent/src/agent-loop.ts` plus the `Agent` class — but it is a dense example of how to build an agent runtime that stays testable, embeddable, and provider-agnostic. This page reads the loop as an exercise in design patterns, both to document *why* it is shaped the way it is and to inform what a [Meeseeks](../systems/meeseeks.md) adapter would inherit if it ever targeted Pi instead of [Claude Code](../systems/claude-code.md). The recurring theme is a strict split between **mechanism** (a pure, stateless loop) and **policy/state** (an orchestrating class and a config object of injected behaviours).

## Functional Core, Imperative Shell

The most important pattern is the separation between `runLoop` and the `Agent` class. `runLoop` (and the `runAgentLoop` / `runAgentLoopContinue` drivers) is effectively a *functional core*: given a context, a config, and an emit sink, it computes the conversation forward and returns the new messages. It owns no persistent state — the working `context` is a shallow copy, and nothing survives the call. The `Agent` class is the *imperative shell*: it holds the canonical `_state.messages`, the `activeRun`, the abort controller, and the message queues, and it adapts the loop's event stream into mutable state via `processEvents`.

This is the classic "functional core, imperative shell" arrangement, and it buys two concrete things. First, the loop is trivially testable: drive it with a fake `streamFn` and fake tools, collect the emitted events, assert on the returned messages — no globals, no lifecycle. Second, the same loop can be embedded behind different shells (a CLI's interactive mode, an RPC server, a one-shot `--print` invocation) without change, which is precisely why Pi can offer [four invocation modes](claude-vs-pi-runtime-interfaces.md) over one engine.

## Strategy via Configuration Object

`AgentLoopConfig` is a *strategy bundle* — a struct of injected functions that parameterize every decision point the loop would otherwise hard-code: `convertToLlm` (how to serialize to a provider), `transformContext` (how to compress/rewrite history), `getApiKey` (how to obtain credentials), `getSteeringMessages` / `getFollowUpMessages` (where queued input comes from), and `beforeToolCall` / `afterToolCall` (interception). The loop expresses *control flow*; the config supplies *behaviour*. This is dependency injection used to keep the `agent` package dependency-light — it knows nothing about any concrete LLM SDK, because the provider arrives as the `streamFn` parameter (defaulting to `streamSimple`) and the conversion arrives as `convertToLlm`.

The `toolExecution` strategy is a smaller instance of the same idea, with a notable composition rule: the global `"parallel" | "sequential"` setting can be *overridden upward* by any single tool that declares `executionMode: "sequential"`. Safety wins over throughput — one tool that must not run concurrently downgrades the whole batch. This is a deliberate "most-restrictive-wins" merge rather than a simple global flag.

## Event Sourcing / Observer

The loop never returns a result and lets the caller poll; it *emits a stream of events* (`agent_start`, `turn_start`, `message_start/update/end`, `tool_execution_start/update/end`, `turn_end`, `agent_end`) through an `AgentEventSink` callback. The entry functions wrap this in an `EventStream` that resolves to the final messages. This Observer/event-sourced shape is what makes the loop renderer-agnostic: a TUI, an HTML exporter, an RPC JSON-L feed, and the `Agent` class's own state reducer all subscribe to the same event vocabulary and interpret it differently.

It also decouples *liveness* from *history*. The `message_update` events carry a snapshot of the partially-assembled assistant message on every delta, while `streamAssistantResponse` simultaneously keeps `context.messages` consistent by replacing the last element in place. Observers that want streaming get it; observers that only want final state read the resolved messages. The parallel tool executor pushes this further: `tool_execution_end` events fire in *completion order* for responsiveness, but persisted `toolResult` messages are ordered by *assistant source order* for determinism. The same run is presented two ways depending on whether you care about latency or reproducibility.

## Producer/Consumer Queues for Concurrent Input

Steering and follow-up are implemented as two `PendingMessageQueue` producer/consumer buffers, polled by the loop at well-defined points: steering at the **top of every turn** (so interjections merge into the live exchange) and follow-ups **only after the inner loop would exit** (so they start a fresh exchange once the agent settles). The `QueueMode` (`"all"` vs. one-at-a-time `drain()`) is a small policy knob on consumption granularity.

This is how Pi resolves the inherent race in a long-running agent: the user wants to type while the agent works, but the model call is mid-flight. Rather than locking or interrupting, the loop defines **safe injection points** and queues input until one is reached. The two-queue distinction (merge-now vs. run-after) is a genuine semantic choice surfaced all the way up to the RPC `steer` and `follow_up` commands.

## Cooperative Cancellation

Cancellation uses the standard `AbortSignal` pattern threaded uniformly: `Agent.abort()` trips the `activeRun`'s `AbortController`, and the single signal propagates into `streamAssistantResponse` (and onward to the provider fetch) and into every `prepareToolCall` / `executePreparedToolCall`. There is no bespoke "stop flag" — the loop leans on the platform primitive so that in-flight network and tool work observe the same cancellation. The model's own `stopReason` (`aborted` / `error`) is then handled as a first-class early-exit branch in `runLoop`, so an aborted stream produces a clean `turn_end`/`agent_end` rather than a thrown exception bubbling through the stream.

## Guard Clauses as State-Machine Invariants

The `Agent` class encodes a small state machine through guard clauses rather than an explicit state enum. `prompt()` throws if `activeRun` is set (forcing callers toward `steer()`/`followUp()`); `continue()` refuses to re-run from an assistant message unless there is queued steering or follow-up to drain; `agentLoopContinue` rejects an empty context or an assistant-terminated one. These preconditions make illegal transitions unrepresentable at the call site and keep the loop's own body free of defensive state checks — the invariants are enforced at the boundary.

## Pipeline Decomposition of Tool Calls

Each tool invocation is decomposed into a `prepareToolCall` → `executePreparedToolCall` → `finalizeExecutedToolCall` pipeline, with `createToolResultMessage` and the `emit*` helpers as terminal stages. This staging is what lets the parallel and sequential executors share identical semantics while differing only in scheduling: preparation (including the blocking `beforeToolCall` hook and the `immediate` short-circuit) runs in deterministic source order, while only the middle execution stage is parallelized. Splitting "decide whether/how to run" from "actually run" from "record the result" is what makes the concurrency safe to reason about.

## Implications for Meeseeks

For an orchestrator, the payoff and the cost of these patterns are the same fact: **the loop is structured around an in-process event sink and in-process strategy callbacks.** Everything an orchestrator wants — turn boundaries, tool lifecycle, streaming content, steering/follow-up injection, abort — already exists as a clean seam, but every seam is a JavaScript function call, not a wire protocol or a shell hook. The [Claude Code vs. Pi runtime comparison](claude-vs-pi-runtime-interfaces.md) reaches the same conclusion from the outside: Pi's RPC mode is essentially a thin transport bolted onto these seams, which is why an RPC-based Meeseeks adapter is the more viable path — it would be consuming this exact event vocabulary over JSON-L rather than fighting the [PTY-and-hooks model](../components/runtime.md) that Claude Code forces.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:runLoop` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:streamAssistantResponse` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:executeToolCallsParallel` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent.ts:Agent` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent.ts:PendingMessageQueue` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent.ts:Agent:continue` |
