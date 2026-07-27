# Deep Agents Interpreters and Programmatic Tool Calling

Interpreters give a [Deep Agent](../systems/deep-agents.md) a programmable in-memory workspace *inside* the agent loop. The agent writes JavaScript, the runtime executes it, and only the relevant result returns to the model — intermediate values never enter the context window. This page covers the interpreter runtime, programmatic tool calling (PTC), dynamic subagents, and the persistence and security model. The feature is in beta and requires `langchain-quickjs>=0.2.0` with Python 3.11+.

The framing the docs use is a clean division of labour against [sandboxes](../systems/deep-agents.md): sandboxes are a code-first way of *acting on an environment* (shell commands, dependency installs, file edits), while interpreters are a code-first way of *composing tools, preserving state, and deciding what information returns to the model*. They solve different problems and compose.

## The problem: fixed tool-call batches

The motivating argument is worth stating precisely, because it explains a structural limit of ordinary tool calling. A model can emit several tool calls in one turn, but **that batch is fixed the moment it is emitted**. Nothing in it can loop, branch on a result, retry a failure, or feed one call's output into the next without another model turn — and every result returns to the model's context. The model also decides how many calls to issue, so asking it to dispatch work across hundreds of items is unreliable: it tends to cover a sample rather than every item.

Interpreters move orchestration into code, so the model reasons about *what* to do rather than about every intermediate step. That reframing — from the model as dispatcher to the model as author of a dispatch script — is the conceptual core, and it is the same inversion noted on the [`dcode`](../systems/deep-agents-code.md) page, where fan-out becomes code the agent writes rather than an orchestration a supervisor performs.

The docs give an explicit selection table: one or two simple external calls → ordinary tool calling; pure in-memory loops, branches, retries, or data transforms → interpreter; many external tool calls orchestrated from code → interpreter with PTC; many independent units of work or recursive analysis → interpreter with dynamic subagents; shell, package installs, tests, or OS filesystem access → sandboxes.

## How it works

`CodeInterpreterMiddleware` adds an `eval` tool to the agent. The agent writes JavaScript and calls `eval`; the developer never calls the interpreter directly. Code runs in a [QuickJS](https://github.com/quickjs-ng/quickjs) context, `console.log`/`warn`/`error` are captured, and the value of the last expression is returned. Because it is [middleware](langchain-middleware.md), this is model-agnostic — it does not depend on any provider-specific code-execution API.

By default interpreter code has **no access to the host filesystem, network, shell, package manager, or clock**. It can compute, hold state, and write to the console, and nothing more. Exactly two bridges cross that boundary, and both are explicit:

- **Tools**, via programmatic tool calling (off until enabled with an allowlist).
- **Subagents**, via a `task()` global (on by default whenever the agent has subagents configured; disable with `subagents=False`).

## Programmatic tool calling

PTC exposes selected agent tools inside the interpreter under a `tools` namespace, as async functions. Tool names are converted to camelCase while the input object still follows the tool's schema, so a tool named `web_search` becomes `tools.webSearch({...})`. Enabling it requires an explicit allowlist — `CodeInterpreterMiddleware(ptc=["web_search"])` — and the agent can then fan out with ordinary JavaScript:

```ts
const topics = ["retrieval", "memory", "evaluation"];
const results = await Promise.all(
  topics.map((topic) => tools.webSearch({ query: `${topic} best practices 2025` })),
);
results.join("\n\n");
```

The value is token efficiency: intermediate results are filtered or aggregated in code, and the model sees only the final output rather than every intermediate value.

**One caveat carries real safety weight.** The docs warn that PTC calls execute through the interpreter bridge and *do not go through the normal tool-calling path*, so `interrupt_on` approval workflows **are not enforced per PTC-invoked tool call**. Any [human-in-the-loop](human-in-the-loop.md) gate a developer believes is protecting a tool is bypassed when that tool is reached through PTC. This is the sharpest sharp edge on the page, and it is why the docs insist the PTC allowlist be treated as a permission boundary in its own right. The same limitation is echoed in `dcode`'s [approval modes](../systems/deep-agents-code.md), where Auto review explicitly does not cover actions inside delegated subagents or configured `js_eval` fan-out.

## Dynamic subagents

When subagents are configured, the interpreter exposes a `task()` global that dispatches them from code, turning fan-out into a loop:

```ts
const reviews = await Promise.all(
  paths.map((path) => task({ description: `Review ${path}`, subagentType: "reviewer" })),
);
```

The documented use cases are fan-out-and-synthesize (same work across many items, then combine), verification (send findings to independent verifier subagents and keep only confirmed results), and recursive workflows (hold a working set in interpreter variables, select slices, call subagents, refine). This is the SDK-level mechanism behind the `dcode` "workflow" trigger, where asking for a workflow prompts the agent to write an orchestration script rather than grind through the work itself.

## Persistence

The `mode` parameter controls cross-turn state:

- **`"thread"`** (default) — state persists across `eval` calls *and* across agent turns. The middleware snapshots interpreter state after each turn and restores it before the next.
- **`"turn"`** — state persists across multiple `eval` calls within one turn, then resets.
- **`"call"`** — each `eval` runs in a fresh REPL.

Under `mode="thread"` the lifecycle is: turn starts and the latest snapshot is restored; the agent calls `eval` one or more times sharing one live context (no snapshot between them); the turn finishes and an updated snapshot is written to graph state; the next turn resumes from it.

Two limits matter. **Snapshots retain serializable data only** — functions, classes, and other unserializable runtime objects become inaccessible after restore, raising an error on access. And **snapshots preserve interpreter memory, not outside-world effects**: restoring a prior snapshot does not undo side effects from a tool called through PTC, only the variables that recorded the result.

Notably, cross-turn persistence does **not** require a checkpointer. But because snapshots live in graph state, adding one captures them in checkpoint history too — which is what makes interpreter state participate in [durable execution](langgraph-durable-execution.md) and [time travel](human-in-the-loop.md).

## Security

The docs are unusually direct about what this is not. Interpreter code runs in an **embedded QuickJS context, not a separate VM or process** — in Python via `quickjs-rs`, which documents the same-process execution boundary. The guidance is to treat interpreters as "a capability-scoped execution layer, not a host-memory isolation boundary," and to run agents in isolated worker processes or containers for untrusted code while keeping the PTC allowlist narrow.

Capabilities are deny-by-default: JavaScript execution, top-level `await`, and console capture are available; agent tools, filesystem, network, and wall-clock access are not, each requiring deliberate exposure through PTC; shell commands and OS-level execution are never available and require a [sandbox backend](deepagents-backends.md) instead. This layering — a scoped interpreter for composition, a sandbox for environment access — is the same containment philosophy that distinguishes Deep Agents from [Claude Code](../systems/claude-code.md)'s process-level OS sandboxing described in the [sandboxing runbook](../runbooks/claude-code-sandboxing.md): policy is enforced inside the harness, per capability, rather than around the whole process.

## Configuration

`CodeInterpreterMiddleware` accepts `memory_limit` (default 64 MB QuickJS heap per thread), `timeout` (5.0s per `eval`), `tool_name` (default `"eval"`), `capture_console` (default true), `max_result_chars` (4000, truncating result/error/stdout returned to the model), `ptc` (allowlist, `None` = disabled), `max_ptc_calls` (256 per `eval`; `None` only in trusted environments), `subagents` (true), `mode` (`"thread"`), and `max_snapshot_bytes` (defaults to `memory_limit`, dropping oversized snapshots).

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/interpreters |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/dynamic-subagents |
