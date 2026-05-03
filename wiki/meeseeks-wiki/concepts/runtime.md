# Runtime Supervisor

The runtime supervisor manages isolated Claude Code instances. Each runtime declares a `kind`: `ticket` runtimes are bound to a single [ticket](project-model.md) and run interactively in a PTY; `prompt` runtimes are short-lived non-interactive `--print` runs of a stored [one-shot prompt](one-shot-prompts.md). Both kinds share the supervisor's stdio transport, ring buffer, stream-json parser, and termination semantics.

## Lifecycle States

Runtimes transition through defined states: `starting` (spawned but not yet initialized), `idle` (finished a turn, waiting at main prompt), `running` (token generation or tool execution in progress), `awaiting-user` (mid-turn, blocked on a tool-use permission prompt), `terminating` (shutdown in progress), `exited` (clean termination), and `errored` (unexpected failure). The full lifecycle is `starting → idle → running ↔ idle → (terminating →) exited | errored`, with `running ↔ awaiting-user` as a mid-turn branch.

## Spawning

For a ticket runtime, the supervisor resolves configuration files (project.yaml, board.yaml, permissions.yaml), builds a harness invocation with `--append-system-prompt` injecting the ticket reference and any process doc, spawns a pseudo-terminal via `node-pty`, and begins streaming stdio over the WebSocket.

For a prompt runtime, the supervisor reads the prompt body from `<board>/prompts/<name>.md`, builds a `--print --output-format stream-json` invocation that passes the body as a positional argv argument, spawns a child process with piped stdio (no PTY), and accumulates `message-text` events into a JSONL run log under `<board>/prompts/.logs/<slug>/runs.jsonl`. See [One-Shot Prompts](one-shot-prompts.md) for details.

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