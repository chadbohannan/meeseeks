# Runtime Supervisor

The runtime supervisor in `src/runtime/` spawns and watches per-ticket Claude Code processes. A single `RuntimeSupervisor` instance lives on `ServerState`; the supervisor owns each runtime's pty, ring buffer, and stream-json parser, and emits three events that the [server WS hub](server.md) broadcasts to clients: `runtime-spawned`, `runtime-status`, `runtime-stdio`. Clients render stdio in floating [console panels](console.md). See the [Runtime Supervisor concept](../concepts/runtime.md) for the full lifecycle state machine and design rationale.

## Lifecycle

States transition `starting → idle → running ↔ idle → (terminating →) exited | errored`. The `StreamParser` in `src/runtime/stream-parser.ts` watches Claude's stream-json output: a `system/init` event flips `starting → idle`, `assistant` or `user` events mark `running`, and `result` events mark `idle`. Unexpected exit transitions to `errored` unless a prior explicit terminate had already set `terminating`.

## Adapter

`src/runtime/claude-code.ts` is the only place that knows Claude Code's flag schema. It compiles `permissions.yaml` into repeated `--add-dir <path>` flags plus a generated `<board>/.meeseeks/session-<runtimeId>.json` referenced via `--settings`. The settings file is removed when the runtime exits. Allowed paths resolve relative to the lane directory; `~` expands. `board.yaml`'s `runtime.model`, `runtime.args`, `runtime.env` are merged into argv/env. The adapter also renders the initial-prompt preamble (ticket filename, lane, board, and process doc path) and passes it as `--append-system-prompt` in argv so the agent has the ticket reference before the user types anything. Injecting it via stdin (`--input-format stream-json`) does not work because that flag is only effective with `--print` (non-interactive mode); writing JSON to the PTY in interactive mode produces terminal noise but the agent never sees it as a message.

## Spawn override

The supervisor accepts an injectable `spawnFn` for tests. Production uses the lazy default (`require('node-pty').spawn`); tests substitute a child_process-backed wrapper that runs `bin/stub-harness.mjs`, a small Node script emitting scripted stream-json. This keeps the supervisor unit-testable on machines that haven't built node-pty. Each runtime owns a `RingBuffer` (default 2 MB) that stores raw stdio bytes in a circular `Buffer`; when capacity is exceeded, old bytes are overwritten and `droppedBytes` is incremented.

## State transitions in interactive mode

The runtime is spawned in interactive PTY mode without `--print`, so Claude Code emits its TUI to stdout rather than stream-json. `system/init`, `assistant`, and `result` events never arrive, and `StreamParser` cannot advance the state machine on its own. Three mechanisms compensate.

**Hooks (sole authority for idle/awaiting-user).** The adapter generates a `session-<runtimeId>.json` settings file that injects hooks for state signalling. Claude Code's [hook system](claude-code-client.md#hook-system) provides events at multiple lifecycle points; Meeseeks uses three:

- `Stop` → calls `GET /internal/runtime/:id/notify?state=idle`. This fires immediately when Claude finishes responding, before post-turn housekeeping (compaction, memory sync, plugin tasks). It provides the responsive `running → idle` transition.
- `Notification` with matcher `idle_prompt` → same endpoint. This fires later, after post-turn housekeeping completes, serving as a backstop. Whichever fires first wins; the second is a no-op.
- `Notification` with matcher `permission_prompt` → calls `GET /internal/runtime/:id/notify?state=awaiting-user`. This fires when Claude Code is blocked mid-turn on a tool-use approval.

The `/internal/runtime/:id/notify` route delegates to `supervisor.notifyState()`. Only hooks drive `idle` and `awaiting-user` transitions — PTY output is not used as a state signal because Claude Code's TUI emits periodic redraws (cursor positioning, status bar updates) even when idle, which would immediately override hook-driven state changes.

**Enter-key detection (`idle → running`).** There is no "turn started" hook in Claude Code — `UserPromptSubmit` fires when the user submits through Claude Code's own prompt UI, but Meeseeks sends input through the PTY, so that event never fires. Instead, `writeInput` checks for a carriage return byte (0x0d, the Enter key) and transitions `idle → running` when detected. This filters out stray keystrokes and mouse events while catching actual prompt submissions.

**Startup debounce (`starting → running`).** Neither `Stop` nor `idle_prompt` fires on initial startup — they only fire after a completed turn. To handle the initial transition out of `starting`, the first PTY data chunk while in `starting` arms a debounce timer (default 2 s). When the timer fires with no further PTY data, the runtime transitions to `running` (not `idle`, since we only know the agent is idle when it tells us via a hook). Subsequent `notifyState` calls cancel the timer immediately. The debounce value is configurable via `SupervisorOptions.startingDebounceMs`.

**Pending resize.** Resize calls during `starting` are queued rather than rejected, since the PTY file descriptor may not be fully initialized. When the runtime transitions out of `starting`, the queued resize is applied automatically.

**Stream-json (non-interactive mode).** The `--output-format stream-json` and `--input-format stream-json` flags are not passed in interactive mode — they are `--print`-only flags and have no effect without it. When autonomous triggers or scripted agent runs are implemented using `--print`, these flags will need to be added to that code path so `StreamParser` can drive state transitions. Do not remove `StreamParser`; it is load-bearing for the planned non-interactive path.

## Resize and input guards

PTY resize and input calls are guarded against invalid lifecycle states. `resize()` rejects calls when the runtime is `exited`, `errored`, `terminating`, or `starting` — the last because the PTY file descriptor may not be fully initialized during startup, and an `ioctl` resize on a half-ready fd produces EBADF. `writeInput()` similarly rejects `exited`, `errored`, and `terminating`. Both methods wrap the underlying PTY call in a try/catch so that a dying process cannot crash the supervisor. See [Platform Constraints](../concepts/platform-constraints.md) for the macOS-specific conditions that made these guards necessary.

## Termination

`terminate(id)` sends SIGTERM, waits 5 seconds (configurable via `termKillMs`), then SIGKILL. The `terminate` method registers an `onExit` handler to resolve immediately if the process exits before the timeout, avoiding unnecessary SIGKILL. `terminateAll()` is invoked from `ServerState.close()`, so closing a project (or switching projects) reaps every active runtime.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/plans/2026-04-26-runtime-and-console.md` |
| 2026-04-26 | `src/runtime/` |
| 2026-04-28 | Debugging session: chokidar/node-pty fix, resize guards, stream-json flag correction |
