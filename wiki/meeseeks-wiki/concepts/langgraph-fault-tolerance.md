# LangGraph Fault Tolerance

The syntheses in this wiki lean repeatedly on LangGraph being "durable by construction" when arguing it would retire Meeseeks' deferred [runtime-persistence](../syntheses/langchain-as-meeseeks-harness.md) feature. This page grounds that claim in the actual mechanism. Durability is not only checkpointing; it is also what happens when an individual step *fails*. LangGraph's fault-tolerance model (`docs.langchain.com/oss/python/langgraph/fault-tolerance`) gives every node three composable recovery mechanisms — retries, timeouts, and error handlers — that a bare supervised process like Claude Code does not have and that the Meeseeks [Runtime Supervisor](../components/runtime.md) does not attempt.

## Three mechanisms, fixed order

When a node attempt raises any exception — including a `NodeTimeoutError` — the mechanisms compose in a fixed order: the **retry policy** decides whether to re-run, and only after retries are exhausted does the **error handler** run; if there is no handler, the exception bubbles up. `set_node_defaults` configures all three once for every node instead of repeating them per `add_node`. This is a per-*step* resilience model, which is the important contrast: Claude Code either succeeds or the whole process exits, and Meeseeks' supervisor responds to exit by tearing the runtime down (see the termination path below).

## Retries

A `RetryPolicy` on `add_node` re-runs a failed attempt with exponential backoff. Its defaults are opinionated: `max_attempts=3`, `initial_interval=0.5s`, `backoff_factor=2.0`, `max_interval=128s`, and jitter on. The default `retry_on` (`default_retry_on`) retries on *any* exception **except** a curated list of programming errors (`ValueError`, `TypeError`, `RuntimeError`, `OSError`, `LookupError`, and similar) — the reasoning being that those signal bugs, not transient failures. For HTTP libraries like `requests` and `httpx` it retries only on 5xx status codes, and `NodeTimeoutError` is retryable by default. Custom logic is a callable: wrap `default_retry_on` to subtract or add exception types.

A node can inspect its own retry state through `runtime.execution_info.node_attempt` (1-indexed) — the documented pattern is switching to a fallback API once the primary keeps failing. That `execution_info` object (available even without a retry policy) also carries `thread_id`, `run_id`, `checkpoint_id`, and `task_id`, tying a failing attempt back to the durable thread it belongs to.

## Timeouts

The `timeout=` parameter caps a single attempt's duration, and it distinguishes two kinds of clock:

- **`run_timeout`** — a hard wall-clock cap on one attempt, never refreshed. On expiry LangGraph raises `NodeTimeoutError`, **clears the failed attempt's writes**, and hands off to the retry policy.
- **`idle_timeout`** — a progress-resetting cap that fires only when the node stops making observable progress. Under the default `refresh_on="auto"` the idle clock resets on state writes, stream output, child-task scheduling, stream-writer calls, or any LangChain callback event (LLM tokens, tool calls) from the node or its descendants. `refresh_on="heartbeat"` narrows the reset source to explicit `runtime.heartbeat()` calls, for long-running work with "chatty subordinates" you don't want to count as progress.

The idle-timeout concept is worth noting against Meeseeks' own crude timing heuristics: the supervisor infers `running` from a 2-second startup debounce on quiet PTY output (`src/runtime/supervisor.ts`). LangGraph's idle timeout is the principled version of the same instinct — "has this step gone quiet too long?" — but driven by structured progress signals rather than raw byte silence, and used to *cancel and retry* rather than to guess a status label. (Node timeouts apply to async nodes only; sync nodes with a timeout are rejected at compile time.)

## Error handlers and graceful shutdown

After retries are exhausted, a node-level error handler runs with a `NodeError`, and can update state and issue a `Command(goto=...)` to route the graph somewhere recovery-aware rather than crashing the run. Separately, LangGraph supports stopping a run cleanly at a super-step boundary and resuming later — graceful shutdown — which is the durability guarantee the [checkpointer/thread model](langgraph-durable-execution.md) rests on: a run interrupted between super-steps resumes from its last checkpoint.

## Why this sharpens the Meeseeks comparison

Meeseeks' fault handling is coarse and terminal. The supervisor's `terminate` path sends `SIGTERM`, waits `termKillMs` (default 5s), then `SIGKILL` (`src/runtime/supervisor.ts`); on unexpected exit it marks the runtime `errored` and deletes it. There is no retry, no per-step timeout, no recovery routing — a failed Claude Code process is simply gone, and because scrollback lives in a volatile ring buffer, its work is unrecoverable. Per-node retries, timeouts, and error handlers are precisely the resilience an orchestrator would otherwise have to build around an opaque agent, and they are the substantive content behind "durable by construction" — not just that state is saved, but that failures are absorbed at the step level and runs resume rather than restart. This is the durability half of the argument the [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md) makes; the [Graph API and Pregel runtime](langgraph-graph-api.md) is where the nodes these policies attach to are defined.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/fault-tolerance |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/persistence |
