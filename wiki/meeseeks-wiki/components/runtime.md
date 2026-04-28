# Runtime Supervisor

The runtime supervisor in `src/runtime/` spawns and watches per-ticket Claude Code processes. A single `RuntimeSupervisor` instance lives on `ServerState`; the supervisor owns each runtime's pty, ring buffer, and stream-json parser, and emits three events that the [server WS hub](server.md) broadcasts to clients: `runtime-spawned`, `runtime-status`, `runtime-stdio`. Clients render stdio in floating [console panels](console.md). See the [Runtime Supervisor concept](../concepts/runtime.md) for the full lifecycle state machine and design rationale.

## Lifecycle

States transition `starting → idle → running ↔ idle → (terminating →) exited | errored`. The `StreamParser` in `src/runtime/stream-parser.ts` watches Claude's stream-json output: a `system/init` event flips `starting → idle`, `assistant` or `user` events mark `running`, and `result` events mark `idle`. Unexpected exit transitions to `errored` unless a prior explicit terminate had already set `terminating`.

## Adapter

`src/runtime/claude-code.ts` is the only place that knows Claude Code's flag schema. It compiles `permissions.yaml` into repeated `--add-dir <path>` flags plus a generated `<board>/.meeseeks/session-<runtimeId>.json` referenced via `--settings`. The settings file is removed when the runtime exits. Allowed paths resolve relative to the lane directory; `~` expands. `board.yaml`'s `runtime.model`, `runtime.args`, `runtime.env` are merged into argv/env. The adapter also renders the initial-prompt preamble (ticket filename, lane, board, and process doc path) and passes it as `--append-system-prompt` in argv so the agent has the ticket reference before the user types anything. Injecting it via stdin (`--input-format stream-json`) does not work because that flag is only effective with `--print` (non-interactive mode); writing JSON to the PTY in interactive mode produces terminal noise but the agent never sees it as a message.

## Spawn override

The supervisor accepts an injectable `spawnFn` for tests. Production uses the lazy default (`require('node-pty').spawn`); tests substitute a child_process-backed wrapper that runs `bin/stub-harness.mjs`, a small Node script emitting scripted stream-json. This keeps the supervisor unit-testable on machines that haven't built node-pty. Each runtime owns a `RingBuffer` (default 2 MB) that stores raw stdio bytes in a circular `Buffer`; when capacity is exceeded, old bytes are overwritten and `droppedBytes` is incremented.

## Termination

`terminate(id)` sends SIGTERM, waits 5 seconds (configurable via `termKillMs`), then SIGKILL. The `terminate` method registers an `onExit` handler to resolve immediately if the process exits before the timeout, avoiding unnecessary SIGKILL. `terminateAll()` is invoked from `ServerState.close()`, so closing a project (or switching projects) reaps every active runtime.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/plans/2026-04-26-runtime-and-console.md` |
| 2026-04-26 | `src/runtime/` |
