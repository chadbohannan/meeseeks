# Human-in-the-Loop and Time Travel

Human-in-the-loop (HITL) and time travel are two capabilities LangGraph builds on the same foundation — the [checkpointer](langgraph-durable-execution.md) — and together they are the most orchestration-relevant part of the runtime. HITL lets a run pause for a human decision and resume durably; time travel lets a run be replayed or forked from any past checkpoint. Both are things the [Meeseeks Runtime Supervisor](../components/runtime.md) can only approximate around an opaque Claude Code process, and both are analysed as LangChain advantages in the [harness synthesis](../syntheses/langchain-as-meeseeks-harness.md).

## Interrupts: the pause primitive

The interrupts documentation (`docs.langchain.com/oss/python/langgraph/interrupts`) describes the low-level mechanism. Calling `interrupt(payload)` inside a node **pauses graph execution**: LangGraph saves the exact graph state through the persistence layer and "waits indefinitely until you resume." Three things make it work:

- A **checkpointer** persists state so the pause survives, even in an error state.
- A **`thread_id`** in the run config is the persistent cursor — reusing it resumes the same checkpoint, a new value starts a fresh thread.
- The **payload** (any JSON-serializable value) is surfaced to the caller; resuming with a `Command` makes that resume value the return value of `interrupt()` inside the node.

Unlike static breakpoints that pause before or after a named node, interrupts are **dynamic** — placed anywhere in code and gated on application logic. Under [event streaming](langchain-streaming.md), interrupt payloads appear on `stream.interrupts` and `stream.interrupted` flags the pause, so a client sees the pause as a structured event rather than a hang. On the frontend, that structured pause is rendered as an approve/reject/edit card and resumed with `stream.submit`, as detailed in [LangChain frontend rendering](langchain-frontend-rendering.md).

## HITL middleware: interrupts as an approval policy

Most agents do not call `interrupt()` directly; they use the `HumanInTheLoopMiddleware` ([middleware](langchain-middleware.md)), which checks each tool call against a policy and interrupts when review is required. A human resumes with one of four decisions — **approve** (run as proposed), **edit** (change arguments first), **reject** (skip and return feedback to the model), or **respond** (return a synthetic tool result for "ask user" tools) — and a `when` predicate can gate interrupts on a call's arguments, for example pausing only writes outside a workspace or only non-`SELECT` SQL. This is a strictly richer approval surface than Claude Code's allow/deny rules plus notification hooks, and because the interrupt *is* the persisted state, it needs no external notification plumbing to be observed.

## Time travel: replay and fork

Because every super-step writes a checkpoint, LangGraph can revisit the past (`docs.langchain.com/oss/python/langgraph/use-time-travel`):

- **Replay** — resume from a prior checkpoint. Nodes *before* it are not re-executed (their results are saved); nodes *after* it re-run, including LLM calls, API requests, and interrupts, which may produce different results. Replay is genuine re-execution, not a cache read; replaying from the final checkpoint is a no-op.
- **Fork** — branch from a prior checkpoint *with modified state* to explore an alternative path, leaving the original branch intact.

This is the LangGraph analog of Pi's session `fork`/`clone` RPC commands, but generalized: any checkpoint in any thread is a branch point. For an orchestrator, fork-from-checkpoint is a primitive Meeseeks has no equivalent of today — a way to try an alternative continuation of an agent run without discarding the original.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/interrupts |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/human-in-the-loop |
| 2026-07-11 | https://docs.langchain.com/oss/python/langgraph/use-time-travel |
