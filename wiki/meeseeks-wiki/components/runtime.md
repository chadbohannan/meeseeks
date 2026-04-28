# Runtime Supervisor

The runtime supervisor in `src/runtime/` spawns and watches per-ticket Claude Code processes. A single `RuntimeSupervisor` instance lives on `ServerState`; the supervisor owns each runtime's pty, ring buffer, and stream-json parser, and emits three events that the [server WS hub](server.md) broadcasts to clients: `runtime-spawned`, `runtime-status`, `runtime-stdio`. Clients render stdio in floating [console panels](console.md). See the [Runtime Supervisor concept](../concepts/runtime.md) for the full lifecycle state machine and design rationale.

## Lifecycle

States transition `starting → idle → running ↔ idle → (terminating →) exited | errored`. The `StreamParser` in `src/runtime/stream-parser.ts` watches Claude's stream-json output: a `system/init` event flips `starting → idle`, `assistant` or `user` events mark `running`, and `result` events mark `idle`. Unexpected exit transitions to `errored` unless a prior explicit terminate had already set `terminating`.

## Adapter

`src/runtime/claude-code.ts` is the only place that knows Claude Code's flag schema. It compiles `permissions.yaml` into repeated `--add-dir <path>` flags plus a generated `<board>/.meeseeks/session-<runtimeId>.json` referenced via `--settings`. The settings file is removed when the runtime exits. Allowed paths resolve relative to the lane directory; `~` expands. `board.yaml`'s `runtime.model`, `runtime.args`, `runtime.env` are merged into argv/env. The adapter also renders the initial-prompt preamble (ticket filename, lane, board, and process doc path) and passes it as `--append-system-prompt` in argv so the agent has the ticket reference before the user types anything. Injecting it via stdin (`--input-format stream-json`) does not work because that flag is only effective with `--print` (non-interactive mode); writing JSON to the PTY in interactive mode produces terminal noise but the agent never sees it as a message.

## Spawn override

The supervisor accepts an injectable `spawnFn` for tests. Production uses the lazy default (`require('node-pty').spawn`); tests substitute a child_process-backed wrapper that runs `bin/stub-harness.mjs`, a small Node script emitting scripted stream-json. This keeps the supervisor unit-testable on machines that haven't built node-pty. Each runtime owns a `RingBuffer` (default 2 MB) that stores raw stdio bytes in a circular `Buffer`; when capacity is exceeded, old bytes are overwritten and `droppedBytes` is incremented.

## State transitions in interactive mode

The runtime is spawned in interactive PTY mode without `--print`, so Claude
Code emits its TUI to stdout rather than stream-json. `system/init`,
`assistant`, and `result` events never arrive, and `StreamParser` cannot
advance the state machine on its own. Two mechanisms compensate.

**Notification hooks (primary).** The adapter always generates a
`session-<runtimeId>.json` settings file that injects `Notification` hooks:

- `idle_prompt` → calls `GET /internal/runtime/:id/notify?state=idle`. This
  fires when Claude Code finishes a turn and is waiting at its main prompt,
  driving `running → idle`. It does not fire on initial startup — see the
  startup debounce entry below.
- `permission_prompt` → calls `GET /internal/runtime/:id/notify?state=awaiting-user`.
  This fires when Claude Code is blocked mid-turn on a tool-use approval,
  driving `running → awaiting-user`.

The `/internal/runtime/:id/notify` route delegates to
`supervisor.notifyState()`. The `awaiting-user` status is a distinct
mid-turn state — not a synonym for `idle`. Once the user responds in the
terminal, PTY data arrives and drives `awaiting-user → running`.

**PTY data (activity signal).** Any data arriving on the PTY while the
runtime is `idle` or `awaiting-user` immediately transitions to `running`.
This check runs before `StreamParser.feed` so the parser's own transitions
(in non-interactive mode) always win on the same data chunk.

**Startup debounce (`starting → idle`).** `idle_prompt` does not fire on
initial startup — it only fires after a completed turn. To handle the
`starting → idle` transition, the first PTY data chunk while in `starting`
arms a debounce timer (default 2 s). When the timer fires with no further
PTY data, the runtime transitions to `idle`. Subsequent `notifyState` calls
(from the hook) cancel the timer immediately. The debounce value is
configurable via `SupervisorOptions.startingDebounceMs`.

**Stream-json (non-interactive mode).** The adapter still passes
`--output-format stream-json --input-format stream-json` so that when the
runtime is spawned with `--print` — expected for autonomous triggers and
scripted agent runs — `StreamParser` drives state transitions exactly as
designed. Do not remove `StreamParser` or these flags; they are load-bearing
for the planned non-interactive path even though they are no-ops in
interactive mode.

## Termination

`terminate(id)` sends SIGTERM, waits 5 seconds (configurable via `termKillMs`), then SIGKILL. The `terminate` method registers an `onExit` handler to resolve immediately if the process exits before the timeout, avoiding unnecessary SIGKILL. `terminateAll()` is invoked from `ServerState.close()`, so closing a project (or switching projects) reaps every active runtime.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/plans/2026-04-26-runtime-and-console.md` |
| 2026-04-26 | `src/runtime/` |
