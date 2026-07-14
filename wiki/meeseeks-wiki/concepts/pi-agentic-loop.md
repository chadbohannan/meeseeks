# Pi Agentic Loop

The agentic loop is the engine that turns a single user prompt into an autonomous multi-turn session: it calls the model, executes whatever tools the model requests, feeds the results back, and repeats until the model stops asking for tools. In the [Pi coding agent](../systems/pi.md) (`pi-mono`), this loop lives in the dependency-light `agent` package (`packages/agent/src/agent-loop.ts`) and is deliberately decoupled from the model provider, the tool implementations, and the UI. Understanding it matters to Meeseeks because the loop's event surface — not its internals — is what an orchestrator like the [Meeseeks Runtime Supervisor](../components/runtime.md) would have to consume to supervise Pi, as analysed in the [Claude Code vs. Pi runtime comparison](../syntheses/claude-vs-pi-runtime-interfaces.md).

## Entry Points

The loop is exposed as two functions that both return an `EventStream<AgentEvent, AgentMessage[]>` — a push stream of lifecycle events that resolves to the final message array when the run ends. `agentLoop(prompts, context, config)` starts a fresh exchange from a set of prompt messages. `agentLoopContinue(context, config)` resumes an existing conversation; it guards that the context is non-empty and that the last message is *not* an assistant message (you can only continue from a user or tool-result message, never re-run a completed assistant turn). Both are thin wrappers: they create the stream, fire the internal `runAgentLoop` / `runAgentLoopContinue` driver with an `emit` callback that pushes onto the stream, and call `stream.end(messages)` on completion. The loop never owns the transport — it only emits events.

## The Driver: `runLoop`

After `runAgentLoop` appends the prompts to a working copy of the context and emits the opening `agent_start` / `turn_start` / prompt-message events, all real work happens in `runLoop`. It is a **nested double loop**:

### Inner loop — the turn engine

The inner `while (hasMoreToolCalls || pendingMessages.length > 0)` loop drives one **turn** per iteration. A turn is one model response plus any tool execution it triggers:

1. **Emit `turn_start`** (suppressed on the very first turn, which the entry function already opened).
2. **Inject pending messages.** Any *steering* messages — user input that arrived mid-run via `config.getSteeringMessages()` — are pushed into the live context and replayed as `message_start`/`message_end` before the model is called, so the model sees them as part of the conversation.
3. **Stream the assistant response** via `streamAssistantResponse` (see below).
4. **Bail on failure.** If the assistant message's `stopReason` is `error` or `aborted`, the loop emits a final `turn_end` and `agent_end` and returns immediately — no tool execution, no retry at this layer.
5. **Detect tool calls.** It filters the assistant message content for `toolCall` parts. If there are any, it runs `executeToolCalls`; the returned tool-result messages are appended to both the live context and the `newMessages` accumulator. `hasMoreToolCalls` is set to `!batch.terminate` — i.e. the loop intends to run again to let the model react to tool output, unless the batch signalled termination.
6. **Emit `turn_end`** carrying the assistant message and its `toolResults`.
7. **Re-poll steering** at the end of every turn, so user input is picked up at the next turn boundary.

When the model returns a turn with **no tool calls**, `hasMoreToolCalls` stays false, no new steering is pending, and the inner loop exits. This is the normal "the agent is done" condition — termination is implicit in the model's behaviour, not an explicit stop command.

### Outer loop — follow-ups

The outer `while (true)` exists to handle work queued *after* the agent would otherwise stop. When the inner loop exits, it calls `config.getFollowUpMessages()`. If follow-ups exist, they become the next `pendingMessages` and the outer loop `continue`s, restarting the inner loop. Otherwise it breaks and emits `agent_end`. This is what distinguishes a *follow-up* (a fresh instruction processed once the agent settles) from *steering* (an interjection merged into the current run).

## Streaming a Turn: `streamAssistantResponse`

This function is where the loop meets the model provider, and it is written to keep the live context consistent at every delta so that an observer reading `context.messages` mid-stream always sees the best-known state:

- It optionally runs `config.transformContext` (e.g. context compaction) and then `config.convertToLlm` to map Pi's `AgentMessage[]` into provider-native `Message[]`, decoupling the loop's message model from any single provider's wire format.
- It resolves the API key lazily through `config.getApiKey(provider)` on every turn — important for expiring/rotating tokens.
- It consumes the provider's streaming events (`start`, `text_delta`, `thinking_delta`, `toolcall_delta`, `done`, `error`, …). On `start` it pushes a partial assistant message into the context; on each delta it **replaces the last context element** with the updated partial and emits a `message_update` carrying both the raw provider event and a snapshot of the assembled message. On `done`/`error` it swaps in the finalized message and emits `message_end`.
- It carefully handles the case where no partial was ever added (e.g. an immediate error), synthesizing the `message_start` so consumers always see a matched start/end pair.

The thinking/text/toolcall delta types flowing through here are why Pi can render streaming reasoning and incremental tool-call arguments — the assembled `partial` always reflects everything received so far.

## Tool Execution

`executeToolCalls` chooses a strategy: it runs **sequentially** if `config.toolExecution === "sequential"` *or if any* requested tool declares `executionMode: "sequential"` — one sequential-marked tool forces the whole batch sequential. Otherwise it runs in **parallel** (the default).

Both paths share the same per-call pipeline — `prepareToolCall` → `executePreparedToolCall` → `finalizeExecutedToolCall` — and emit the same `tool_execution_start` → (optional `tool_execution_update`) → `tool_execution_end` events, followed by a `toolResult` message per call. The difference is scheduling and ordering:

- **Sequential** awaits each call fully before starting the next; events and persisted messages share one order.
- **Parallel** first issues every `tool_execution_start` and runs `prepareToolCall` in source order (so preflight/permission decisions are deterministic), then resolves the actual executions concurrently via `Promise.all`. A `prepareToolCall` may resolve as `immediate` (e.g. a blocked or cached call) and skip execution entirely. Crucially, `tool_execution_end` events fire in **completion order** (as each tool finishes), but the persisted `toolResult` messages are emitted in **assistant source order** — observers see liveness, history stays deterministic.

### Early termination

A tool can return `terminate: true` to hint that the automatic follow-up model call should be skipped. But `shouldTerminateToolBatch` only returns true when **every** finalized result in the batch sets `terminate` — a mixed batch always continues. This is the only way tool execution (rather than the model) can end the loop.

## Interception Hooks

The loop is studded with in-process hooks that make it programmable without forking: `transformContext` (rewrite history before each model call), `getApiKey` (lazy credential resolution), `convertToLlm` (provider mapping), `getSteeringMessages` / `getFollowUpMessages` (the two injection queues), and `beforeToolCall` / `afterToolCall` (the latter wrapped inside `prepareToolCall`/`finalizeExecutedToolCall`). `beforeToolCall` runs after `tool_execution_start` and argument validation and can block a call; `afterToolCall` runs after execution and before `tool_execution_end`. These are all JavaScript callbacks — there is no external/shell hook surface, which is exactly the [gap that complicates external orchestration](../syntheses/claude-vs-pi-runtime-interfaces.md) described in the runtime comparison.

## The Stateful Wrapper: the `Agent` class

`runLoop` is a pure function over its config and context; it holds no state between invocations. The `Agent` class (`packages/agent/src/agent.ts`) is the stateful façade that most callers use. It owns the canonical message history (`_state.messages`), tracks an `activeRun` (with its `AbortController`), and maintains two `PendingMessageQueue` instances — a steering queue and a follow-up queue — whose `drain()` behaviour is governed by a `QueueMode`: `"all"` drains the whole queue at once, otherwise it dispenses one message at a time. It wires those queues into the loop config's `getSteeringMessages`/`getFollowUpMessages` and translates the loop's event stream into agent state updates (`isStreaming`, `streamingMessage`, `pendingToolCalls`) via `processEvents`.

The class enforces the single-run invariant: `prompt()` throws if `activeRun` is set, directing callers to `steer()` or `followUp()` to enqueue instead. `continue()` inspects the last message — if it is an assistant message it drains steering, then follow-ups, then errors; otherwise it calls `runContinuation()`, which invokes `runAgentLoopContinue` against a context snapshot. `abort()` simply trips the active run's `AbortController`, and the signal threads all the way down through `streamAssistantResponse` and every tool execution.

This separation — a stateless functional loop plus a stateful orchestrating class — is the central structural decision of Pi's agent runtime and is examined further in the [Pi agentic loop design patterns](../syntheses/pi-agentic-loop-design-patterns.md) analysis.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:runLoop` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:runAgentLoop` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:streamAssistantResponse` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:executeToolCalls` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:executeToolCallsParallel` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:executeToolCallsSequential` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:agentLoop` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent.ts:Agent` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent.ts:PendingMessageQueue` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/README.md:Event Flow:With Tool Calls` |
