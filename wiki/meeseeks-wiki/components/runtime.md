# Runtime Supervisor

The runtime supervisor in `src/runtime/` spawns and watches per-ticket Claude Code processes. A single `RuntimeSupervisor` instance lives on `ServerState`; the supervisor owns each runtime's pty, ring buffer, and stream-json parser, and emits three events that the [server WS hub](server.md) broadcasts to clients: `runtime-spawned`, `runtime-status`, `runtime-stdio`.

## Lifecycle

States transition `starting → idle → running ↔ idle → (terminating →) exited | errored`. The first `system/init` line from Claude's stream-json output flips `starting → idle`; subsequent `assistant` or `user` events mark `running`, and `result` events mark `idle`. Unexpected exit transitions to `errored` unless a prior explicit terminate had already set `terminating`.

## Adapter

`src/runtime/claude-code.ts` is the only place that knows Claude Code's flag schema. It compiles `permissions.yaml` into repeated `--add-dir <path>` flags plus a generated `<board>/.meeseeks/session-<runtimeId>.json` referenced via `--settings`. The settings file is removed when the runtime exits. Allowed paths resolve relative to the lane directory; `~` expands. `board.yaml`'s `runtime.model`, `runtime.args`, `runtime.env` are merged into argv/env. The adapter also renders the initial-prompt preamble (env-var ticket context plus a user-visible message) which the supervisor sends as the first stream-json `user` frame so the agent has the ticket reference before the user types anything.

## Spawn override

The supervisor accepts an injectable `spawnFn` for tests. Production uses the lazy default (`require('node-pty').spawn`); tests substitute a child_process-backed wrapper that runs `bin/stub-harness.mjs`, a small Node script emitting scripted stream-json. This keeps the supervisor unit-testable on machines that haven't built node-pty.

## Termination

`terminate(id)` sends SIGTERM, waits 5 seconds, then SIGKILL. `terminateAll()` is invoked from `ServerState.close()`, so closing a project (or switching projects) reaps every active runtime.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/plans/2026-04-26-runtime-and-console.md` |
| 2026-04-26 | `src/runtime/` |
