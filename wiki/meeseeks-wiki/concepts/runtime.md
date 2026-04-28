# Runtime Supervisor

The runtime supervisor manages isolated Claude Code instances that execute within [Tickets](project-model.md). Each runtime is tied to a single ticket and provides a controlled execution environment with stdio transport and permission enforcement.

## Lifecycle States

Runtimes transition through defined states: `starting` (spawned but not yet initialized), `idle` (finished a turn, waiting at main prompt), `running` (token generation or tool execution in progress), `awaiting-user` (mid-turn, blocked on a tool-use permission prompt), `terminating` (shutdown in progress), `exited` (clean termination), and `errored` (unexpected failure). The full lifecycle is `starting → idle → running ↔ idle → (terminating →) exited | errored`, with `running ↔ awaiting-user` as a mid-turn branch.

## Spawning

When a runtime is started for a ticket, the supervisor:
1. Resolves configuration files (project.yaml, board.yaml, permissions.yaml)
2. Builds a harness with appropriate flags (including `--append-system-prompt` to inject ticket context as a system-prompt addition)
3. Spawns a pseudo-terminal (PTY)
4. Begins streaming stdio via WebSocket

## Stdio Transport

The WebSocket connection multiplexes all runtime I/O using `runtimeId` in `runtime-stdio` events with base64-encoded raw bytes. The server enforces backpressure — each runtime owns a ring buffer (default 2 MB) that stores raw stdio bytes; when capacity is exceeded, old bytes are overwritten and the client is notified on re-attach via `droppedBytes`.

## History Buffer

Runtimes maintain an in-memory ring buffer of output. When a client re-attaches to a console, the buffer is replayed, allowing users to dismiss a console without killing the session.

## Termination

`DELETE /runtimes/:id` sends SIGTERM, waits 5 seconds, then escalates to SIGKILL. The runtime transitions through `terminating` to `exited`.

## Persistence

Runtimes are tied to the Meeseeks server process — they terminate when the server stops. Switching projects or closing the current project also terminates active runtimes.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | First Slice Design §7 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |