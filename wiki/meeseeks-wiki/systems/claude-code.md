# Claude Code

Claude Code is the CLI agent harness that Meeseeks supervises today, and the reference point against which the two candidate replacements — the [Pi coding agent](pi.md) and the [LangChain ecosystem](langchain-ecosystem.md) — are measured. It is a compiled ELF binary installed at `~/.local/share/claude/versions/<version>` (symlinked from `~/.local/bin/claude`). The [runtime adapter](../components/runtime.md) in `src/runtime/claude-code.ts` is the single place in Meeseeks that knows Claude Code's flag schema; everything else treats it as an opaque process. The adapter resolves the `claude` binary to its full path at startup via `which`, and strips environment variables like `FORCE_COLOR` that leak from the dev toolchain — see [Platform Constraints](../concepts/platform-constraints.md) for details on these workarounds.

This page covers how Meeseeks *invokes and configures* the binary: its operating modes, the flags the adapter assembles, and the settings file it generates. Two adjacent concerns have their own pages: how Claude Code loads its instructions and `.claude/` context is covered in [Claude Code instruction bootstrapping](../concepts/claude-code-instruction-bootstrapping.md), and how Meeseeks reverse-engineers session state from an opaque process — hooks, stream-json events, and the `awaiting-user`/`idle` distinction — is covered in [Claude Code state detection](../concepts/claude-code-state-detection.md). Permission and sandboxing policy lives in the [Claude Code sandboxing runbook](../runbooks/claude-code-sandboxing.md). For a comparative analysis with the Pi coding agent as an alternative integration target, see [Claude Code vs. Pi Runtime Interfaces](../syntheses/claude-vs-pi-runtime-interfaces.md).

## Operating modes

Claude Code has two distinct operating modes that produce fundamentally different output.

**Interactive mode (default).** When spawned without `--print`, Claude Code runs a full TUI built with React Ink. All output is ANSI-encoded terminal rendering sent to the PTY. The `--output-format` and `--input-format` flags are silently ignored in this mode — structured stream-json events never arrive. This is the mode Meeseeks uses in production because it preserves the full terminal experience in xterm.js console panels and supports ongoing interactive sessions.

**Non-interactive mode (`--print`).** When `--print` is passed, Claude Code takes an initial prompt from CLI args or stdin, processes one turn, and exits. Output is structured stream-json to stdout. `--output-format stream-json` and `--input-format stream-json` are only meaningful with `--print` — they are silently ignored without it. Meeseeks does not pass these flags in interactive mode; they will be added to the `--print` code path when the autonomous-trigger feature (batch tickets, scheduled runs) is implemented.

The implication for state detection is significant: in interactive mode the `StreamParser` receives only TUI bytes and can never fire lifecycle transitions. See [state detection](../concepts/claude-code-state-detection.md) for the hooks-and-debounce machinery Meeseeks uses to compensate, and [State transitions in interactive mode](../components/runtime.md#state-transitions-in-interactive-mode) for how the supervisor applies them.

## Flags used by Meeseeks

All flags are assembled in `src/runtime/claude-code.ts:buildSpawnSpec`.

| Flag | Effect | Notes |
|------|--------|-------|
| `--verbose` | Verbose logging | Always set |
| `--model <model>` | Override model | Set from `board.yaml runtime.model`, or from spawn-time request body `model` field (takes precedence). Accepts short aliases (`sonnet`, `opus`, `haiku`) or full model IDs. |
| `--add-dir <path>` | Grant filesystem access | Repeated once per `permissions.yaml allowedPaths` entry; paths resolve relative to lane directory, `~` expands |
| `--settings <file>` | Merge additional settings | Always a per-session JSON file at `<board>/.meeseeks/session-<runtimeId>.json`; removed on exit |
| `--append-system-prompt <text>` | Append to system prompt | Used to inject ticket context (filename, lane, board, process doc) at spawn time; does not trigger a turn |
| Extra args from `board.yaml` | Arbitrary additional flags | Appended last via `runtime.args` |

`--append-system-prompt` is the correct mechanism for injecting context into interactive sessions. Writing JSON to the PTY with `--input-format stream-json` looks like the right approach but does not work: that flag is only processed when `--print` is active, so in interactive mode the JSON appears as literal terminal input noise and is never parsed as a message.

### Notable flags Meeseeks does not currently use

`--permission-mode <mode>` sets the tool-approval policy for the session. Seven modes exist; three are primary for orchestration:

- `dontAsk` — tools pre-approved by `allowedTools`, settings file allow rules, or hooks run automatically; everything else is denied without prompting. This is the soft-sandbox primitive for autonomous agent execution.
- `acceptEdits` — auto-accepts file edits within the working directory and `additionalDirectories`, prompts for other tools. Useful for semi-supervised agents that need human approval for network access or process spawning but can freely modify their workspace.
- `bypassPermissions` — skips all permission checks. Only safe when OS-level sandboxing is enabled, as the sandbox becomes the sole enforcement mechanism.

The other modes (`auto`, `default`, `plan`) are interactive or adaptive modes that don't fit the orchestrator pattern. `dontAsk` is the natural mode for autonomous ticket execution — it is a candidate for future board- or lane-level configuration when Meeseeks implements unattended agent runs. See the [Claude Code sandboxing runbook](../runbooks/claude-code-sandboxing.md) for the full architecture of permission modes, settings file precedence, and OS-level sandboxing layers.

`--effort <level>` controls model reasoning intensity. Levels: `low`, `medium`, `high`, `xhigh`, `max`. Could be exposed alongside the model selector as a spawn-time parameter.

`--worktree [name]` creates a git worktree for the session, optionally with a name. Potentially useful for isolating agent work per ticket, but would require coordination with the host repository's worktree layout.

`--bare` skips hooks, LSP, plugin sync, attribution, auto-memory, background prefetches, keychain reads, and CLAUDE.md auto-discovery. It is documented here because it explicitly enumerates the subsystems that the `--settings` file can influence, including hooks. Meeseeks does not use it because hooks are load-bearing for state signalling.

## Settings file

Every spawned runtime gets a generated settings file at `<boardPath>/.meeseeks/session-<runtimeId>.json`. The file is created before spawn and deleted on exit by `cleanupSettings`. It always contains Notification hooks (the state-signalling mechanism detailed in [state detection](../concepts/claude-code-state-detection.md)); permissions are included when `permissions.yaml` specifies tool rules.

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "curl -sf \"http://127.0.0.1:5174/internal/runtime/<id>/notify?state=idle\"" }]
      }
    ],
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

The `permissions` key is omitted when `allowedTools` and `deniedTools` are both empty. The syntax of the paths inside `allow`/`deny` rules (the `//`, `/`, and `~` prefixes) and their contrast with sandbox path conventions are documented in the [sandboxing runbook](../runbooks/claude-code-sandboxing.md#permission-path-syntax), alongside OS-level sandboxing and `additionalDirectories` — Meeseeks does not currently use either, and both are covered there for future autonomous-execution work.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md` §7.5 |
| 2026-04-28 | `src/runtime/claude-code.ts` — flag assembly, settings file generation |
| 2026-04-28 | Debugging session: removed stream-json flags from interactive mode, FORCE_COLOR stripping |
| 2026-04-28 | `claude -h` — full flag reference |
| 2026-05-03 | https://code.claude.com/docs/en/settings — settings file schema |
