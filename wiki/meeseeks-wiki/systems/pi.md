# Pi

Pi (`pi-mono`) is a coding agent Meeseeks has evaluated as an **interchangeable harness** — a candidate replacement for the [Claude Code](claude-code.md) dependency, sitting alongside the [LangChain ecosystem](langchain-ecosystem.md) as one of three integration targets. Like Claude Code and unlike LangChain, it is a self-contained CLI process an orchestrator spawns and drives over stdio; unlike Claude Code, it exposes a structured bidirectional control protocol rather than a PTY-plus-hooks surface. This page frames Pi as a system and routes to its internals and the comparative analyses; the substance of whether Meeseeks should adopt it lives in the [Claude Code vs. Pi runtime comparison](../syntheses/claude-vs-pi-runtime-interfaces.md).

## Shape of the codebase

Pi is a Node.js runtime spanning over 8,000 semantic units across three core packages: `agent` (the dependency-light turn engine), `AI` (provider abstraction), and `coding-agent` (the CLI, modes, sessions, and extensions). The architectural centre is a strict split between a **stateless functional loop** and a **stateful orchestrating class**, documented in depth as the [Pi agentic loop](../concepts/pi-agentic-loop.md) and read as a set of reusable design decisions in the [Pi agentic loop design patterns](../syntheses/pi-agentic-loop-design-patterns.md) synthesis.

## Four invocation modes

`resolveAppMode` (`packages/coding-agent/src/main.ts`) selects one of four modes, and which one an orchestrator picks determines the entire integration surface:

- **Interactive** — a full TUI via the ProcessTerminal framework; rich terminal rendering suitable for console panels, but no structured events and no programmatic control.
- **Print** — plain text on stdout with a 0/1 exit code; one-shot, non-interactive.
- **JSON** — LF-delimited JSON events on stdout; structured output, one direction.
- **RPC** — JSON-L over stdin/stdout, bidirectional, with 30+ typed commands (`RpcCommand` in `packages/coding-agent/src/modes/rpc/rpc-types.ts`) covering prompting, steering, model selection (`set_model`, `cycle_model`, `get_available_models`), and session control.

The [runtime comparison](../syntheses/claude-vs-pi-runtime-interfaces.md) works through the consequence for Meeseeks: the RPC mode is the richest control surface of any candidate harness, but it produces JSON-L rather than ANSI, so an adapter would have to synthesize terminal output from structured events — the same rendering trade-off the [LangChain frontend rendering](../concepts/langchain-frontend-rendering.md) analysis reaches from the other side. Interactive and RPC are mutually exclusive: Pi offers a TUI *or* structured control, never both at once.

## Control seams, permissions, and sessions

Pi's programmability is **in-process**: the agentic loop is studded with JavaScript callbacks (`transformContext`, `getApiKey`, `convertToLlm`, the steering/follow-up queues, `beforeToolCall`/`afterToolCall`) rather than the external shell hooks Claude Code fires. That is precisely the gap that complicates external orchestration — there is no `curl`-to-the-server equivalent to signal lifecycle state, so a supervisor must either monitor the RPC event stream or extend Pi with a notification mechanism it does not ship. Tool permissions are coarse — global `--tools`/`--no-tools` with no per-operation gating, filesystem scoping, or OS sandboxing, in contrast to Claude Code's allow/deny rules and [bubblewrap/Seatbelt sandboxing](../runbooks/claude-code-sandboxing.md). Sessions, however, are richer: a `SessionManager` stores versioned JSONL sessions with new/resume/fork/import navigation managed by `AgentSessionRuntime`, where Claude Code exposes no session persistence at all.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-30 | `code-rag: pi-mono/packages/coding-agent/src/modes/rpc/rpc-types.ts:RpcCommand` |
| 2026-04-30 | `code-rag: pi-mono/packages/coding-agent/src/main.ts:resolveAppMode` |
| 2026-06-28 | `code-rag: pi-mono/packages/agent/src/agent-loop.ts:runLoop` |
| 2026-04-30 | `code-rag: pi-mono/packages/coding-agent/src/core/session-manager.ts:SessionManager` |
