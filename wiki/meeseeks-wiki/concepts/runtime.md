# Runtime Supervisor

## Working directory vs. project root

A ticket runtime's cwd is the **workspace root**, not the project's repository, even though the agent's actual code work happens in the repository. This is deliberate. Claude Code resolves `.claude/settings.json`, `.claude/skills/`, and `.claude/bin/` relative to cwd, and the workspace carries exactly that configuration plus symlinks into shared resources. Moving cwd into the codebase would silently drop those skills and helper binaries, or force Meeseeks to write a `.claude/` directory into the user's repository.

The workflow collapse moved this up one level: cwd used to be the board directory, so each board needed its own `.claude/`. One workspace-level `.claude/` now serves every workflow. The preamble names the workflow's directory explicitly for the same reason the project root is named — an agent that assumed cwd was its workflow would write process files into the workspace root.

Instead the project root is delivered two ways: as an `--add-dir` flag, and as a generated sentence appended to the system prompt — "Project `X` is rooted at `/path`. Your working directory is the Meeseeks workspace; perform code work in the project root." The preamble orders segments most-stable to most-specific: project context, the workflow's process doc, then the two generated sentences (where to work, which ticket) adjacent at the end. Project context leads because it is the most cacheable segment.

This formalizes a pattern that predated it. Before the refactor, the meeseeks board's own `CONTEXT.md` ended with a hand-written line stating where the codebase lived — project configuration expressed as prose to an agent. That file is gone: a project's `context`/`contextFile` carries it now, and the migration folds each board's CONTEXT.md into its workflows' `PROCESS.md`. See the [project model](project-model.md) for the config that replaced it.

The runtime supervisor manages isolated Claude Code instances. Each runtime declares a `kind`: `ticket` runtimes are bound to a single [ticket](project-model.md) and run interactively in a PTY; `prompt` runtimes are short-lived non-interactive `--print` runs of a stored [one-shot prompt](one-shot-prompts.md). Both kinds share the supervisor's stdio transport, ring buffer, stream-json parser, and termination semantics.

## Lifecycle States

Runtimes transition through defined states: `starting` (spawned but not yet initialized), `idle` (finished a turn, waiting at main prompt), `running` (token generation or tool execution in progress), `awaiting-user` (mid-turn, blocked on a tool-use permission prompt), `terminating` (shutdown in progress), `exited` (clean termination), and `errored` (unexpected failure). The full lifecycle is `starting → idle → running ↔ idle → (terminating →) exited | errored`, with `running ↔ awaiting-user` as a mid-turn branch.

## Spawning

For a ticket runtime, the supervisor resolves configuration (the ticket's project config, the workflow's `workflow.yaml` and `permissions.yaml`, and the workspace defaults behind both), builds a harness invocation with `--append-system-prompt` injecting the ticket reference and any process doc, spawns a pseudo-terminal via `node-pty`, and begins streaming stdio over the WebSocket.

For a prompt runtime, the supervisor reads the prompt body from `<workspace>/prompts/<name>.md`, builds a `--print --output-format stream-json` invocation that passes the body as a positional argv argument, spawns a child process with piped stdio (no PTY), and accumulates `message-text` events into a JSONL run log under `<workspace>/prompts/.logs/<slug>/runs.jsonl`. See [One-Shot Prompts](one-shot-prompts.md) for details.

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