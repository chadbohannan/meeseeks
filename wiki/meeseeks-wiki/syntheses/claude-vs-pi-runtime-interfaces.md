# Claude Code vs. Pi Runtime Interface Comparison

[Claude Code](../systems/claude-code.md) and [Pi](../systems/pi.md) (`pi-mono`) are both CLI agent harnesses that an orchestrator like Meeseeks could supervise. Their runtime interface surfaces differ substantially, creating gaps in both directions. This synthesis compares them as integration targets for a process supervisor in the style of the [Meeseeks Runtime Supervisor](../components/runtime.md). A third candidate — the [LangChain ecosystem](../systems/langchain-ecosystem.md) — breaks this page's bilateral, process-supervisor framing entirely, because it is a framework and HTTP service rather than a supervisable CLI; that category difference and the attach-point choice it forces are analysed separately in [LangChain as a Meeseeks harness](langchain-as-meeseeks-harness.md). Stepping up one level, the [harness-paradigms capstone](harness-paradigms.md) argues that Claude Code and Pi are two variations of a single *supervised-CLI* paradigm set against LangChain's *framework/server* paradigm — and treats this page as its account of the variation *within* the CLI paradigm.

The analysis draws on code-rag search of the `pi-mono` repository; the Pi coding agent spans over 8,000 semantic units across three core packages (`agent`, `AI`, `coding-agent`) with four invocation modes, a 30-command RPC protocol, and an in-process extension hook system. The event surface compared throughout this page is produced by Pi's [agentic loop](../concepts/pi-agentic-loop.md), whose internal structure — and the [design patterns](pi-agentic-loop-design-patterns.md) behind it — explains why its control seams are in-process callbacks rather than the external hooks an orchestrator would prefer.

## Process Model

Claude Code is a compiled ELF binary spawned as a PTY child process. Output is raw ANSI terminal rendering (interactive mode) or stream-json events (`--print` mode). The Meeseeks adapter in `src/runtime/claude-code.ts:buildSpawnSpec` is the single place that knows Claude Code's flag schema — everything else treats it as an opaque process.

Pi is a Node.js runtime that supports four modes selected by `resolveAppMode` in `packages/coding-agent/src/main.ts`:
- **Interactive**: full TUI via the ProcessTerminal framework
- **Print**: plain text output on stdout, exit code 0/1
- **JSON**: LF-delimited JSON events on stdout
- **RPC**: JSON-L over stdin/stdout, bidirectional, with 30+ command types defined in `packages/coding-agent/src/modes/rpc/rpc-types.ts:RpcCommand`

## State Detection and Lifecycle Signalling

Claude Code's [hook system](../concepts/claude-code-state-detection.md#hook-system) provides the foundation for state detection. Meeseeks injects three hooks via a per-session settings file: `Stop` and `Notification` (`idle_prompt`, `permission_prompt`) fire `curl` commands to the Meeseeks server's `/internal/runtime/:id/notify` endpoint. These external shell-based notifications are load-bearing — in interactive mode, PTY output is TUI rendering that cannot be parsed for state.

Pi's extension system (`packages/coding-agent/docs/extensions.md`) provides a richer event surface — `agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `tool_call`, `tool_result`, `input`, `before_agent_start`, `context`, `before_provider_request`, `after_provider_response`, `session_shutdown`, `session_before_switch`, `session_compact`, and more. However, these are all in-process JavaScript callbacks — there is no built-in mechanism to fire external shell commands or HTTP requests.

**Gap**: Pi lacks external hook notifications. To signal state changes to an orchestrator, a consumer must either run in RPC mode and monitor the event stream, or implement custom extension logic that reaches out over the network. Interactive mode provides rich TUI rendering but no structured state events at all.

## Permission and Sandboxing

Claude Code provides a layered permission model that makes it viable for supervised autonomous execution (see the [Claude Code Sandboxing runbook](../runbooks/claude-code-sandboxing.md)):

- **Permission modes**: `dontAsk` (soft-sandbox: pre-approved tools run, everything else denied without prompting), `acceptEdits`, `bypassPermissions`
- **Rules**: per-session allow/deny rules in the settings file, per-tool matchers (e.g. `Read(path/**)`)
- **Filesystem scoping**: `--add-dir <path>` extends the working directory; `additionalDirectories` in settings grants access to named paths
- **OS-level sandboxing**: bubblewrap (Linux) / Seatbelt (macOS) for enforcement that covers not just built-in tools but also Bash subprocesses, closing the deny-rule bypass (`Read(.env)` deny blocks the Read tool but not `cat .env`)

Pi controls tools at a global level via `--tools <csv>` and `--no-tools`. There is no per-operation permission gating, no filesystem scoping beyond the working directory, and no OS-level sandboxing integration. The `RpcCommand` type defines no permission-oriented commands.

**Gap**: Pi has no equivalent of `dontAsk`, allow/deny rules, `--add-dir`, or OS sandboxing. For autonomous agent execution in an orchestrator, the tool set is the only restriction mechanism.

## Programmatic Control Surface

Claude Code exposes no structured control protocol. The Meeseeks supervisor drives the agent by writing raw terminal input through the PTY (`writeInput`) and detecting state transitions via hooks. There is no way to programmatically set the model, trigger compaction, abort a turn, inspect session state, or manage sessions beyond what can be typed at a prompt.

Pi's RPC mode (`packages/coding-agent/src/modes/rpc/rpc-client.ts:RpcClient`) exposes 30+ typed commands:

| Category | Commands |
|----------|----------|
| Prompting | `prompt`, `steer`, `follow_up`, `abort` |
| Session | `new_session`, `get_state`, `switch_session`, `fork`, `clone`, `get_fork_messages`, `get_last_assistant_text`, `set_session_name`, `get_messages` |
| Model | `set_model`, `cycle_model`, `get_available_models` |
| Thinking | `set_thinking_level`, `cycle_thinking_level` |
| Queue modes | `set_steering_mode`, `set_follow_up_mode` |
| Compaction | `compact`, `set_auto_compaction` |
| Retry | `set_auto_retry`, `abort_retry` |
| Bash | `bash`, `abort_bash` |
| Export/stats | `get_session_stats`, `export_html` |
| Commands | `get_commands` |

Additionally, the Extension UI Protocol supports dialog methods (`select`, `confirm`, `input`, `editor`) with request/response correlation via an `id` field, and fire-and-forget methods (`notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`). Commands are sent as JSON-L on stdin; responses and events stream back on stdout.

**Gap**: Claude Code has no structured control protocol. All agent interaction goes through the PTY as raw terminal input. This constrains what an orchestrator can do beyond basic prompt/response — model changes, session inspection, and compaction control require typing commands at the terminal prompt.

## Protocol Incompatibility: TUI vs. Programmatic Control

This is the most consequential gap for an orchestrator that wants both terminal rendering and structured control.

Claude Code's PTY-based approach gives Meeseeks both raw terminal output (for xterm.js console panels) and input capability, at the cost of structured control. The orchestrator sees what the user would see. See the [Runtime Supervisor](../components/runtime.md) for how Meeseeks compensates with hooks and enter-key detection.

Pi forces a choice between two modes that do not overlap:
- **RPC mode** provides structured control and events, but produces JSON-L on stdout — not ANSI terminal rendering. An orchestrator would need a custom renderer that paints xterm.js from structured message events rather than raw escape sequences.
- **Interactive mode** produces a full TUI (suitable for console panels), but emits no structured events and exposes no programmatic control. The orchestrator would need external hook notifications (which Pi lacks) to track state.

A hypothetical Pi adapter for Meeseeks would need to consume the RPC JSON-L event stream and synthesize terminal output from structured content, or extend Pi interactive mode with an external notification mechanism. Neither path exists today.

## Settings and Session Persistence

Claude Code accepts a `--settings <file>` flag pointing to a JSON file that merges hooks, permissions, and sandbox configuration. Meeseeks creates a per-runtime settings file at `<board>/.meeseeks/session-<runtimeId>.json` and deletes it on exit.

Pi stores sessions as versioned JSONL files with a `SessionManager` class (`packages/coding-agent/src/core/session-manager.ts`). There is no equivalent of `--settings` for injecting per-session configuration — extensions and tools are loaded once at startup. Session replacement (new, resume, fork, import) is managed by `AgentSessionRuntime` rather than the session itself.

**Gap**: Pi cannot accept a per-session settings injection, limiting an orchestrator's ability to customize agent behaviour per ticket or lane without restarting the process.

## Summary of Gaps

| Surface | Claude Code | Pi | Direction |
|---------|------------|-----|-----------|
| External hook notifications | Shell commands (curl) fire on lifecycle events | In-process JS callbacks only | CC → Pi |
| Permission model | `dontAsk`, allow/deny rules, `--add-dir`, OS sandbox | Global tool enable/disable only | CC → Pi |
| Programmatic control | Raw PTY input only | 30+ RPC commands, bidirectional JSON-L | Pi → CC |
| Extension UI protocol | None | Dialog methods + fire-and-forget | Pi → CC |
| Per-session config injection | `--settings <file>` | Not supported | CC → Pi |
| Concurrent TUI + structured control | PTY (TUI) + hooks (state) | RPC or TUI, not both | Both directions |
| Session persistence | None exposed | JSONL files, fork/tree navigation | Pi → CC |
| Multi-provider model cycling | Static flag at spawn | `cycle_model`, `get_available_models` via RPC | Pi → CC |
| Auto-retry on errors | None | Configurable auto-retry with `abort_retry` | Pi → CC |

## Implications for Meeseeks

The Meeseeks [Runtime Supervisor](../components/runtime.md) is tightly coupled to Claude Code's integration surface: PTY spawn, hooks for state signalling, enter-key detection, startup debounce, and raw terminal I/O. Supporting Pi as an alternative agent harness would require a fundamentally different adapter:

1. **A new RPC-based adapter** that spawns a Pi process in RPC mode, maps `RpcCommand` types to supervisor operations, and synthesizes terminal output from structured `message_start`/`message_update`/`message_end` events rather than consuming raw PTY bytes.
2. **Or extended Pi interactive mode** with external hook notifications — the adapter would need Pi to fire shell commands or HTTP requests on lifecycle events, similar to how Claude Code's `Stop` and `Notification` hooks work.

Neither path is trivial. The first path is more viable (RPC mode already provides the complete control surface) but requires rethinking how the web UI renders agent output — structured events instead of ANSI escape sequences.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-30 | `code-rag: pi-mono/packages/coding-agent/src/modes/rpc/rpc-types.ts:RpcCommand` |
| 2026-04-30 | `code-rag: pi-mono/packages/coding-agent/src/modes/rpc/rpc-client.ts:RpcClient` |
| 2026-04-30 | `code-rag: pi-mono/packages/coding-agent/src/core/agent-session.ts:AgentSession` |
| 2026-04-30 | `code-rag: pi-mono/packages/coding-agent/docs/extensions.md:Extensions:Events:Lifecycle Overview` |
| 2026-04-30 | `code-rag: pi-mono/packages/coding-agent/docs/sdk.md:SDK:Core Concepts:AgentSession` |
| 2026-04-30 | `code-rag: pi-mono/packages/coding-agent/docs/rpc.md:RPC Mode` |