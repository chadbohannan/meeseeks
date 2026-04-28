# Claude Code Client

Claude Code is the CLI agent harness that Meeseeks supervises. It is a compiled ELF binary installed at `~/.local/share/claude/versions/<version>` (symlinked from `~/.local/bin/claude`). The [runtime adapter](runtime.md) in `src/runtime/claude-code.ts` is the single place in Meeseeks that knows Claude Code's flag schema; everything else treats it as an opaque process.

## Operating modes

Claude Code has two distinct operating modes that produce fundamentally different output.

**Interactive mode (default).** When spawned without `--print`, Claude Code runs a full TUI built with React Ink. All output is ANSI-encoded terminal rendering sent to the PTY. The `--output-format` and `--input-format` flags are silently ignored in this mode — structured stream-json events never arrive. This is the mode Meeseeks uses in production because it preserves the full terminal experience in xterm.js console panels and supports ongoing interactive sessions.

**Non-interactive mode (`--print`).** When `--print` is passed, Claude Code takes an initial prompt from CLI args or stdin, processes one turn, and exits. Output is structured stream-json to stdout. `--output-format stream-json` and `--input-format stream-json` are only meaningful here. This mode is planned for Meeseeks's autonomous-trigger path (batch tickets, scheduled runs) but is not yet used in production.

The implication for state detection is significant: in interactive mode the `StreamParser` receives only TUI bytes and can never fire lifecycle transitions. See [State transitions in interactive mode](runtime.md#state-transitions-in-interactive-mode) for how Meeseeks compensates.

## Flags used by Meeseeks

All flags are assembled in `src/runtime/claude-code.ts:buildSpawnSpec`.

| Flag | Effect | Notes |
|------|--------|-------|
| `--output-format stream-json` | Structured lifecycle events on stdout | No-op in interactive mode; load-bearing for future `--print` path |
| `--input-format stream-json` | Reads JSON messages from stdin | No-op in interactive mode; `--append-system-prompt` is the interactive equivalent |
| `--verbose` | Verbose logging | Always set |
| `--model <model>` | Override model | Set from `board.yaml runtime.model` |
| `--add-dir <path>` | Grant filesystem access | Repeated once per `permissions.yaml allowedPaths` entry; paths resolve relative to lane directory, `~` expands |
| `--settings <file>` | Merge additional settings | Always a per-session JSON file at `<board>/.meeseeks/session-<runtimeId>.json`; removed on exit |
| `--append-system-prompt <text>` | Append to system prompt | Used to inject ticket context (filename, lane, board, process doc) at spawn time; does not trigger a turn |
| Extra args from `board.yaml` | Arbitrary additional flags | Appended last via `runtime.args` |

`--append-system-prompt` is the correct mechanism for injecting context into interactive sessions. Writing JSON to the PTY with `--input-format stream-json` looks like the right approach but does not work: that flag is only processed when `--print` is active, so in interactive mode the JSON appears as literal terminal input noise and is never parsed as a message.

`--bare` is a mode Meeseeks does not use. It skips hooks, LSP, plugin sync, attribution, auto-memory, background prefetches, keychain reads, and CLAUDE.md auto-discovery. It is documented here because it explicitly enumerates the subsystems that the `--settings` file can influence, including hooks.

## Settings file

Every spawned runtime gets a generated settings file at `<boardPath>/.meeseeks/session-<runtimeId>.json`. The file is created before spawn and deleted on exit by `cleanupSettings`. It always contains Notification hooks; permissions are included when `permissions.yaml` specifies tool rules.

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "idle_prompt",
        "hooks": [{ "type": "command", "command": "curl -sf \"http://127.0.0.1:5174/internal/runtime/<id>/notify?state=idle\"" }]
      },
      {
        "matcher": "permission_prompt",
        "hooks": [{ "type": "command", "command": "curl -sf \"http://127.0.0.1:5174/internal/runtime/<id>/notify?state=awaiting-user\"" }]
      }
    ]
  },
  "permissions": {
    "allow": ["Bash", "Edit"],
    "deny": ["Write"]
  }
}
```

The `permissions` key is omitted when `allowedTools` and `deniedTools` are both empty.

## Notification hooks

Claude Code fires `Notification` events at defined points in its lifecycle. Each event runs the configured hook commands before proceeding. Meeseeks uses these to drive supervisor state transitions without parsing TUI output.

| Matcher | When it fires | Meeseeks action |
|---------|--------------|-----------------|
| `idle_prompt` | Agent has finished a turn and is waiting at its main input prompt | `running → idle` via `/internal/runtime/:id/notify?state=idle` |
| `permission_prompt` | Agent is blocked mid-turn on a tool-use approval (numbered choice block) | `running → awaiting-user` via `/internal/runtime/:id/notify?state=awaiting-user` |
| `auth_success` | Authentication completes | Not used by Meeseeks |
| `elicitation_dialog` | Agent asks the user a clarifying question | Not used by Meeseeks |

**`idle_prompt` does not fire on initial startup.** This was confirmed empirically: after spawning with `--append-system-prompt`, Claude Code becomes ready for input without completing a turn, so no `idle_prompt` fires. The `starting → idle` transition is handled by a separate startup debounce in the supervisor (default 2 s of PTY silence after the first output chunk).

Hook commands run synchronously in the agent's context. The `curl -sf` invocation is fire-and-forget from the agent's perspective: `-s` suppresses output, `-f` causes curl to exit non-zero on HTTP errors without printing anything. If the Meeseeks server is unreachable, curl fails silently and Claude Code continues unaffected.

The server port is read from `MEESEEKS_PORT` (default `5174`) at adapter build time, not passed through the spawn context.

## Stream-json event format

Used in non-interactive (`--print`) mode, parsed by `StreamParser` in `src/runtime/stream-parser.ts`.

| Event | `type` | `subtype` | Supervisor transition |
|-------|--------|-----------|----------------------|
| Session init | `system` | `init` | `starting → idle` |
| Assistant message | `assistant` | — | `idle/starting → running` (turn start) |
| User message | `user` | — | marks turn start if not already in turn |
| Turn complete | `result` | `success` / `error` | `running → idle` |

The parser is line-delimited: it splits on `\n`, skips blank lines, and emits `parse-error` for any line that is not valid JSON. In interactive mode, every line is TUI noise, producing a stream of `parse-error` events that the supervisor ignores.

## `awaiting-user` vs `idle`

These are distinct supervisor states with different semantics and different UI implications.

`idle` means the agent has completed a turn and is waiting at its main prompt for the next user message. It is a between-turns state. The UI should surface the conversation input.

`awaiting-user` means the agent is mid-turn, blocked on a tool-use approval. The turn has not ended. Once the user responds (typing a numbered choice in the terminal), PTY data arrives and the supervisor immediately transitions back to `running`. The UI should indicate urgency — the agent is paused mid-work, not resting.

The earlier design assertion that both conditions should collapse into a single `awaiting-user` state was incorrect: the reconnect hydration argument (a client connecting mid-permission-prompt would see `running` and miss the attention signal) favours keeping `awaiting-user` as a real status. But collapsing `idle` into `awaiting-user` loses the semantic distinction that the UI needs to render different controls.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-28 | Session investigation: state signalling, Notification hooks, interactive vs non-interactive mode |
| 2026-04-26 | `docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md` §7.5 |
| 2026-04-28 | `src/runtime/claude-code.ts`, `src/runtime/supervisor.ts` |
