# Claude Code State Detection

Meeseeks supervises Claude Code as an opaque process, which creates its hardest problem: knowing *what the agent is doing* when the only output is a TUI. This page documents the machinery the [Runtime Supervisor](../components/runtime.md) uses to reverse-engineer session state — the hook system, the stream-json event format, and the `awaiting-user`/`idle` distinction. It was split out of the [Claude Code](../systems/claude-code.md) page because state detection is a self-contained concern and the single most-cited part of the Claude Code integration: the same reverse-engineering is what the [Claude Code vs. Pi comparison](../syntheses/claude-vs-pi-runtime-interfaces.md) and the [LangChain harness synthesis](../syntheses/langchain-as-meeseeks-harness.md) measure their candidates against, since both alternatives deliver structurally what Meeseeks here scrapes by hand.

## Hook system

Claude Code exposes a rich hook system with events spanning the full session lifecycle. Hooks are configured via the [settings file](../systems/claude-code.md#settings-file) and fire shell commands at defined points. Meeseeks uses a small subset of these to drive supervisor state transitions without parsing TUI output.

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

Hook commands run synchronously in the agent's context. The `curl -sf` invocation is fire-and-forget from the agent's perspective: `-s` suppresses output, `-f` causes curl to exit non-zero on HTTP errors without printing anything. If the Meeseeks server is unreachable, curl fails silently and Claude Code continues unaffected. The server port is read from `MEESEEKS_PORT` (default `5174`) at adapter build time, not passed through the spawn context. This external-`curl`-hook design is precisely what the [LangSmith tracing runbook](../runbooks/tracing-meeseeks-sessions-to-langsmith.md) notes the LangSmith Claude Code plugin also grew from before it became a plugin.

## Stream-json event format

Used in non-interactive (`--print`) mode, parsed by `StreamParser` in `src/runtime/stream-parser.ts`. This is the one path where Claude Code emits structured events rather than TUI bytes — see [operating modes](../systems/claude-code.md#operating-modes).

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
| 2026-04-28 | `src/runtime/claude-code.ts`, `src/runtime/supervisor.ts`, `src/runtime/stream-parser.ts` |
| 2026-04-28 | `claude -h` — full flag reference; hook event inventory |
