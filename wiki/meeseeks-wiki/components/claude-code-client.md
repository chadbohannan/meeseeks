# Claude Code Client

Claude Code is the CLI agent harness that Meeseeks supervises. It is a compiled ELF binary installed at `~/.local/share/claude/versions/<version>` (symlinked from `~/.local/bin/claude`). The [runtime adapter](runtime.md) in `src/runtime/claude-code.ts` is the single place in Meeseeks that knows Claude Code's flag schema; everything else treats it as an opaque process. The adapter resolves the `claude` binary to its full path at startup via `which`, and strips environment variables like `FORCE_COLOR` that leak from the dev toolchain — see [Platform Constraints](../concepts/platform-constraints.md) for details on these workarounds.

For a comparative analysis with the Pi coding agent as an alternative integration target, see [Claude Code vs. Pi Runtime Interfaces](../syntheses/claude-vs-pi-runtime-interfaces.md).

## The `.claude/` directory

The `.claude/` directory is the control center for a Claude Code instance. It stores instructions, state, and permissions that persist across sessions and control agent behavior. Understanding its structure matters for Meeseeks because the orchestrator generates per-session settings files and may eventually template other directory contents (rules, commands) at board or lane scope.

**`CLAUDE.md`** is the primary instruction file. Claude reads it at the start of every session. It can live in the project root or at `.claude/CLAUDE.md`. Meeseeks does not rely on this auto-discovery for its own board-level context — the board carries a `CONTEXT.md` file (edited in the Board Editor) which the runtime adapter reads and prepends to the `--append-system-prompt` preamble, ahead of the lane's `PROCESS.md` and the ticket reference. The rename and explicit injection are intentional: they keep board context observable in the supervisor's recorded preamble rather than hidden inside Claude Code's startup behavior, and they decouple the file's name from a tool-specific convention. Any `CLAUDE.md` files inside the working tree (e.g., the project under development) are still picked up by Claude Code's normal discovery; only the board directory's instruction file has been renamed.

**`rules/`** holds focused markdown files for specific standards (e.g., `testing.md`, `style.md`). Claude treats these as high-priority instructions. Rules can be path-scoped using YAML frontmatter so that, for instance, React component rules only load when Claude is working in `src/components/`. This is more targeted than a monolithic `CLAUDE.md` and avoids wasting tokens on irrelevant instructions.

**`commands/`** contains markdown files that define custom slash commands. Each filename becomes a command (e.g., `review.md` creates `/project:review`). Potentially useful for Meeseeks to define per-board or per-lane workflows as slash commands that agents can invoke.

**`skills/`** houses self-contained toolkits for complex, multi-step workflows. Unlike single-file commands, skills can bundle supporting scripts and references.

**`settings.json`** manages operational control — tool permission allowlists, sandboxing rules, and hooks. This is the file Meeseeks already generates per session; see [Settings file](#settings-file) and the [sandboxing runbook](../runbooks/claude-code-sandboxing.md) for details.

**`memory/`** is internal to Claude Code. The agent writes architecture insights, observed patterns, and session history here, accessed via the `/memory` command. Meeseeks does not interact with this directory.

### Instruction bootstrapping

On launch, Claude Code merges instructions from three layers in priority order:

1. **Global** — `~/.claude/CLAUDE.md`, `~/.claude/rules/`, `~/.claude/settings.json`
2. **Project** — `./.claude/CLAUDE.md`, `./.claude/rules/`, `./.claude/settings.json` in the working directory
3. **Nested** — any `CLAUDE.md` files in subdirectories of the working tree

Project-specific settings override global ones so that each repository follows its own rules. For Meeseeks, this means a board directory with its own `.claude/` tree can carry tailored instructions that automatically apply to any agent spawned there. Note that the board's own `CONTEXT.md` (sibling of `board.yaml`) is *not* picked up by this auto-discovery chain — the orchestrator injects it explicitly so its contents are observable in the recorded preamble.

Claude Code re-reads instruction and settings files on each tool call. Edits made mid-session — whether by the user, the orchestrator, or another agent — take effect on the very next turn. This active monitoring behavior is significant for orchestrator designs that want to adjust agent permissions or instructions while a session is already running.

### Best practices for instruction files

The following patterns, drawn from expert usage, are relevant to how Meeseeks templates agent environments:

- **Keep CLAUDE.md under 200 lines.** Long instruction files degrade instruction-following accuracy and waste context tokens. Move niche rules to `rules/` with path-scoping so they only load when relevant.
- **Be explicit about commands.** Claude performs better when build, test, and lint commands are listed in `CLAUDE.md` rather than left for the agent to discover by exploring the filesystem.
- **Include verification steps.** Instructions like "run tests after fixing" in `CLAUDE.md` itself produce more reliable behavior than relying on the agent to decide when to verify its work.
- **Keep global config minimal.** Over-populating `~/.claude/` causes context bleed, where rules from one project interfere with another. For Meeseeks, this argues for putting agent instructions at the board or lane level rather than in the user's global config.

## Operating modes

Claude Code has two distinct operating modes that produce fundamentally different output.

**Interactive mode (default).** When spawned without `--print`, Claude Code runs a full TUI built with React Ink. All output is ANSI-encoded terminal rendering sent to the PTY. The `--output-format` and `--input-format` flags are silently ignored in this mode — structured stream-json events never arrive. This is the mode Meeseeks uses in production because it preserves the full terminal experience in xterm.js console panels and supports ongoing interactive sessions.

**Non-interactive mode (`--print`).** When `--print` is passed, Claude Code takes an initial prompt from CLI args or stdin, processes one turn, and exits. Output is structured stream-json to stdout. `--output-format stream-json` and `--input-format stream-json` are only meaningful with `--print` — they are silently ignored without it. Meeseeks does not pass these flags in interactive mode; they will be added to the `--print` code path when the autonomous-trigger feature (batch tickets, scheduled runs) is implemented.

The implication for state detection is significant: in interactive mode the `StreamParser` receives only TUI bytes and can never fire lifecycle transitions. See [State transitions in interactive mode](runtime.md#state-transitions-in-interactive-mode) for how Meeseeks compensates.

## Flags used by Meeseeks

All flags are assembled in `src/runtime/claude-code.ts:buildSpawnSpec`.

| Flag | Effect | Notes |
|------|--------|-------|
| `--verbose` | Verbose logging | Always set |
| `--model <model>` | Override model | Set from `board.yaml runtime.model`, or from spawn-time request body `model` field (takes precedence). Accepts short aliases (`sonnet`, `opus`, `haiku`) or full model IDs (e.g. `claude-sonnet-4-6`). |
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

The other modes (`auto`, `default`, `plan`) are interactive or adaptive modes that don't fit the orchestrator pattern. `dontAsk` is the natural mode for autonomous ticket execution — it is a candidate for future board- or lane-level configuration when Meeseeks implements unattended agent runs.

See the [Claude Code Sandboxing runbook](../runbooks/claude-code-sandboxing.md) for the full architecture of permission modes, settings file precedence, and OS-level sandboxing layers.

`--effort <level>` controls model reasoning intensity. Levels: `low`, `medium`, `high`, `xhigh`, `max`. Could be exposed alongside the model selector as a spawn-time parameter.

`--worktree [name]` creates a git worktree for the session, optionally with a name. Potentially useful for isolating agent work per ticket, but would require coordination with the host repository's worktree layout.

`--bare` skips hooks, LSP, plugin sync, attribution, auto-memory, background prefetches, keychain reads, and CLAUDE.md auto-discovery. It is documented here because it explicitly enumerates the subsystems that the `--settings` file can influence, including hooks. Meeseeks does not use it because hooks are load-bearing for state signalling.

## Settings file

Every spawned runtime gets a generated settings file at `<boardPath>/.meeseeks/session-<runtimeId>.json`. The file is created before spawn and deleted on exit by `cleanupSettings`. It always contains Notification hooks; permissions are included when `permissions.yaml` specifies tool rules.

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

The `permissions` key is omitted when `allowedTools` and `deniedTools` are both empty.

### Permission path syntax

Paths inside `allow` and `deny` rules use a distinct resolution scheme that differs from sandbox filesystem paths. The prefix determines how the path is resolved:

| Prefix | Resolution |
|--------|-----------|
| `//path` | Absolute — from filesystem root (e.g. `Read(//home/chad/src/**)`) |
| `/path` or `./path` | Project-relative — resolved from the settings file's project root |
| `~/path` | Home directory — expands `~` to `$HOME` |

This means a settings file at `boards/meeseeks-board/.claude/settings.json` can grant cross-tree read access with an absolute `//`-prefixed path, or use `~/workspace/meeseeks/**` as a shorter equivalent to a full absolute path. Project-relative `/` paths are convenient for deny rules scoped to the current project (e.g. `Read(./.env)`). Note that sandbox filesystem paths (`sandbox.allow`, `sandbox.deny`) use standard POSIX conventions — `/tmp` is absolute there — which is the opposite of permission rule syntax where a single `/` is project-relative.

## Sandboxing and Extended Filesystem Access

Claude Code supports two mechanisms for controlling filesystem access beyond basic allow/deny rules: OS-level sandboxing and `additionalDirectories`.

**OS-level sandboxing** (bubblewrap on Linux, Seatbelt on macOS) provides OS-enforced filesystem and network isolation that covers not just Claude Code's direct tool calls but also any scripts or subprocesses spawned via Bash. This closes a critical gap: deny rules block built-in tools but don't prevent Bash subprocesses from circumventing them (e.g., `Read(.env)` deny blocks the Read tool but not `cat .env`). Sandboxing is configured in settings files:

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true
  }
}
```

With sandboxing enabled, `autoAllowBashIfSandboxed` automatically allows the Bash tool because the OS-level restrictions make it safe to run shell commands within the sandbox.

**`additionalDirectories`** grants a Claude Code instance access to paths outside its working directory. By default, an instance only accesses its working directory; this setting extends that scope. Common use cases include monorepo cross-package access (reading shared types or utilities from another package), shared configuration files outside the project root, or inspecting build artifacts managed by external tools.

```json
{
  "permissions": {
    "additionalDirectories": ["/shared/libs", "/shared/types"],
    "allow": [
      "Read(/shared/libs/**)",
      "Read(/shared/types/**)"
    ]
  }
}
```

`acceptEdits` mode applies to paths inside the working directory and `additionalDirectories`. Paths outside that scope still prompt.

Meeseeks does not currently use either sandboxing or `additionalDirectories`. These are documented for future implementation when autonomous ticket execution requires tighter isolation or controlled cross-lane access. See the [Claude Code Sandboxing runbook](../runbooks/claude-code-sandboxing.md) for the full architecture.

## Hook system

Claude Code exposes a rich hook system with events spanning the full session lifecycle. Hooks are configured via the settings file and fire shell commands at defined points. Meeseeks uses a small subset of these to drive supervisor state transitions without parsing TUI output.

### Available hook events

Claude Code provides events at three cadences: once per session, once per turn, and on every tool call inside the agentic loop.

**Session lifecycle:** `SessionStart`, `Setup`, `SessionEnd` — fire at session boundaries. `SessionStart` matchers include `startup`, `resume`, `clear`, `compact`.

**Per-turn:** `UserPromptSubmit` (before Claude processes a prompt — can block), `UserPromptExpansion` (slash command expansion), `Stop` (Claude finishes responding), `StopFailure` (turn ends due to API error).

**Tool execution:** `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `PermissionRequest`, `PermissionDenied` — all accept tool name matchers (`Bash`, `Edit`, `Write`, etc.).

**Notification:** `Notification` — fires when Claude Code sends a notification. Matchers: `idle_prompt`, `permission_prompt`, `auth_success`, `elicitation_dialog`.

**Subagents:** `SubagentStart`, `SubagentStop`, `TeammateIdle` — fire during agent delegation.

**Tasks:** `TaskCreated`, `TaskCompleted` — fire when Claude creates or completes a task.

**Config/files:** `ConfigChange`, `FileChanged`, `CwdChanged`, `InstructionsLoaded` — fire on external state changes.

**Compaction:** `PreCompact`, `PostCompact` — fire around context compaction.

**Worktrees:** `WorktreeCreate`, `WorktreeRemove` — fire during worktree lifecycle.

**MCP:** `Elicitation`, `ElicitationResult` — fire during MCP server interactions.

The full reference is at [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks).

### Hooks used by Meeseeks

The adapter in `src/runtime/claude-code.ts` injects three hooks via the per-session settings file:

| Hook event | Matcher | When it fires | Meeseeks action |
|------------|---------|--------------|-----------------|
| `Stop` | *(none)* | Claude finishes responding (end of turn, before post-turn housekeeping) | `→ idle` via `/internal/runtime/:id/notify?state=idle` |
| `Notification` | `idle_prompt` | Agent is waiting at its main input prompt (fires after post-turn housekeeping) | `→ idle` via `/internal/runtime/:id/notify?state=idle` |
| `Notification` | `permission_prompt` | Agent is blocked mid-turn on a tool-use approval | `→ awaiting-user` via `/internal/runtime/:id/notify?state=awaiting-user` |

Both `Stop` and `idle_prompt` set `idle` — whichever fires first wins. `Stop` fires immediately when Claude finishes its response; `idle_prompt` fires later, after post-turn work (compaction, memory sync, plugin tasks) completes. In practice `Stop` provides the responsive transition and `idle_prompt` serves as a backstop.

**`idle_prompt` does not fire on initial startup.** After spawning with `--append-system-prompt`, Claude Code becomes ready for input without completing a turn, so no `idle_prompt` fires. The `starting → running` transition is handled by a separate startup debounce in the supervisor (default 2 s of PTY silence after the first output chunk).

**`UserPromptSubmit` is not used.** It fires when the user submits a prompt through Claude Code's own prompt UI, but Meeseeks sends input through the PTY via `writeInput`, so this event never fires for Meeseeks-supervised sessions. The `idle → running` transition is instead driven by detecting a carriage return (Enter key) in `writeInput`.

Hook commands run synchronously in the agent's context. The `curl -sf` invocation is fire-and-forget from the agent's perspective: `-s` suppresses output, `-f` causes curl to exit non-zero on HTTP errors without printing anything. If the Meeseeks server is unreachable, curl fails silently and Claude Code continues unaffected.

The server port is read from `MEESEEKS_PORT` (default `5174`) at adapter build time, not passed through the spawn context.

## Stream-json event format

Used in non-interactive (`--print`) mode, parsed by `StreamParser` in `src/runtime/stream-parser.ts`.

| Event | `type` | `subtype` | Supervisor transition (prompt runtime) |
|-------|--------|-----------|----------------------------------------|
| Session init | `system` | `init` | `starting → running` |
| Turn start | `assistant` or `user` | — | `starting → running` (if still starting) |
| Message text | `result` | — | captured as `lastMessage`; no state change |

Note: these transitions apply to prompt (non-interactive) runtimes. For ticket (interactive) runtimes, `init` transitions `starting → idle` instead, and `result` is not handled — idle/awaiting-user transitions come exclusively from hooks. Process exit drives the terminal `exited`/`errored` transition in both kinds.

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
| 2026-04-28 | Debugging session: removed stream-json flags from interactive mode, FORCE_COLOR stripping |
| 2026-04-28 | `claude -h` — full flag reference |
| 2026-04-29 | Web documentation on soft-sandboxing Claude Code instances in orchestrators |
| 2026-04-30 | [Claude Context](../sources/Claude%20Context.md) — `.claude/` directory structure, instruction bootstrapping, and best practices |
| 2026-05-03 | https://code.claude.com/docs/en/settings — permission path resolution: `//` absolute, `/` project-relative, `~` home; contrast with sandbox path conventions |
