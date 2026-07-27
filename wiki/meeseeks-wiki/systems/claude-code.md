# Claude Code

Claude Code is the CLI agent harness that Meeseeks supervises today, and the reference point against which the two candidate replacements — the [Pi coding agent](pi.md) and the [LangChain ecosystem](langchain-ecosystem.md) — are measured. It is a compiled ELF binary installed at `~/.local/share/claude/versions/<version>` (symlinked from `~/.local/bin/claude`). The [runtime adapter](../components/runtime.md) in `src/runtime/claude-code.ts` is the single place in Meeseeks that knows Claude Code's flag schema; everything else treats it as an opaque process. The adapter resolves the `claude` binary to its full path at startup via `which`, and strips environment variables like `FORCE_COLOR` that leak from the dev toolchain — see [Platform Constraints](../concepts/platform-constraints.md) for details on these workarounds.

This page covers two things: how Meeseeks *invokes and configures* the binary — its operating modes, the flags the adapter assembles, and the settings file it generates — and, since a 2026-07-25 review, Claude Code's own [capability surface](#capability-surface) as a coding agent, independent of how Meeseeks drives it. Two adjacent concerns have their own pages: how Claude Code loads its instructions and `.claude/` context is covered in [Claude Code instruction bootstrapping](../concepts/claude-code-instruction-bootstrapping.md), and how Meeseeks reverse-engineers session state from an opaque process — hooks, stream-json events, and the `awaiting-user`/`idle` distinction — is covered in [Claude Code state detection](../concepts/claude-code-state-detection.md). Permission and sandboxing policy lives in the [Claude Code sandboxing runbook](../runbooks/claude-code-sandboxing.md). For a comparative analysis with the Pi coding agent as an alternative integration target, see [Claude Code vs. Pi Runtime Interfaces](../syntheses/claude-vs-pi-runtime-interfaces.md).

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

`--effort <level>` controls model reasoning intensity. Levels: `low`, `medium`, `high`, `xhigh`, `max`, plus `ultracode` and `auto` (the last two added since the original April 2026 capture). Could be exposed alongside the model selector as a spawn-time parameter.

`--worktree [name]` creates a git worktree for the session, optionally with a name. Potentially useful for isolating agent work per ticket, but would require coordination with the host repository's worktree layout.

`--bare` skips hooks, LSP, plugin sync, attribution, auto-memory, background prefetches, keychain reads, and CLAUDE.md auto-discovery. It is documented here because it explicitly enumerates the subsystems that the `--settings` file can influence, including hooks. Meeseeks does not use it because hooks are load-bearing for state signalling.

## Capability surface

*Added 2026-07-25 from the live docs. Everything above this section was captured in April 2026 through a narrow "what flags does the adapter assemble" lens, which left most of the product undocumented here. Several claims elsewhere in this wiki rested on that omission and were wrong; they are corrected in place and noted below.*

### Goals — Claude Code persists objectives across turns

`/goal [condition|clear]` sets a goal and **Claude keeps working across turns until the condition is met**. With no argument it shows the current or most recently achieved goal; `clear`/`stop`/`off`/`reset`/`none`/`cancel` removes an active one.

This is a direct analogue of [`dcode`'s goals and rubrics](deep-agents-code.md), and its existence corrects a claim previously made on that page. The two differ in emphasis rather than kind: `dcode` drafts explicit acceptance criteria for inline review and grades each turn against them with a configurable grader model and iteration ceiling, while Claude Code takes a condition and works until it is satisfied. Convergent design, arrived at independently.

### Sessions, checkpoints, and branching

The wiki previously asserted that Claude Code "exposes no session persistence at all." That was **false**, and the surface is in fact rich:

| Command | Behaviour |
|---|---|
| `/resume` (`--resume`) | Return to an earlier conversation |
| `--continue` | Resume the session for the current directory |
| `/rewind` | Roll **code and conversation** back to a checkpoint, or summarize part of the conversation |
| `/clear [name]` | Start fresh, optionally labelling the previous conversation for later resumption. Aliases `/reset`, `/new` |
| `/branch [name]` | Branch the conversation at this point to try a different direction without losing the original |
| `/fork [prompt]` | Copy the conversation into a new background session and keep working here |
| `/background` (`/bg`) | Detach the current session to run as a background agent, freeing the terminal |

`/rewind` is the notable one: rolling back *code alongside conversation* to a checkpoint is time-travel with filesystem effects, which is more than the [LangGraph checkpoint replay](../concepts/human-in-the-loop.md) this wiki treats as the framework paradigm's distinguishing feature. And `/background` is native **dismiss-without-kill**: detaching a session to keep running while the terminal is freed is exactly the gesture the [console](../components/console.md) page builds out of panel lifecycle and a ring buffer — available inside the harness Meeseeks already supervises.

### Skills — and the merge with custom commands

**Custom commands have been merged into skills.** `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way; existing `commands/` files keep working but skills are recommended because they support supporting files, invocation control, and automatic loading.

Critically, **Claude Code skills follow the [Agent Skills](https://agentskills.io) open standard** — the same standard [Deep Agents](deep-agents.md) implements. This reframes what the [`dcode`](deep-agents-code.md) page describes as LangChain "treating Anthropic's formats as an interoperable substrate": it is a shared open standard both vendors implement, not one copying the other. Claude Code extends it with invocation control, subagent execution, and dynamic context injection.

The progressive-disclosure property is explicit in the docs: "a skill's body loads only when it's used, so long reference material costs almost nothing until you need it." A matching caution applies once loaded — skill content "stays in context across turns, so every line is a recurring token cost." That is the same hot/cold economics the [context-engineering](../concepts/deepagents-context-engineering.md) page documents for Deep Agents.

Frontmatter fields worth knowing:

- `description` — drives automatic loading.
- `disable-model-invocation` — manual-only; also blocks preloading into subagents and, since v2.1.196, blocks firing from a scheduled task.
- `user-invocable: false` — hide from the `/` menu (background knowledge only).
- `allowed-tools` / `disallowed-tools` — pre-approve or remove tools for the invoking turn; the grant clears on the next message.
- `context: fork` plus `agent` and `background` — run the skill in an isolated subagent (see below).
- `hooks` — hooks scoped to this skill's lifecycle.
- `paths` — **glob patterns limiting when the skill auto-activates**, so a skill loads only when working on matching files.
- `arguments` — named arguments bound positionally, expanded as `$name`.

`${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` substitute into both the markdown body and Bash rules in `allowed-tools`, which is what lets a skill run a bundled script without a permission prompt.

`paths` deserves emphasis: it is *conditional* progressive disclosure, gating auto-activation on the files in play rather than on the model's judgement of the description. That is a mechanism neither Deep Agents nor `dcode` documents.

### Delegation and background work

`context: fork` runs a skill in an isolated subagent that does **not** inherit conversation history — the skill content becomes the subagent's prompt. It runs in the background by default, with the result arriving in the conversation on completion; `background: false` waits within the invoking turn instead (before v2.1.218, forked skills always blocked).

Alongside that, several bundled skills and commands are themselves orchestration primitives: `/batch <instruction>` fans large-scale changes across a codebase in parallel, `/deep-research <question>` is a dynamic workflow fanning out web searches, `/subtask` hands a side task to a subagent, `/loop [interval] [prompt]` runs a prompt repeatedly, and `/tasks` lists background work and subagents.

### Other surface the adapter view missed

**Model and effort.** `/model` switches models mid-session — correcting another stale claim, that model choice is a "static flag at spawn." `/effort` accepts `low`, `medium`, `high`, `xhigh`, `max`, plus `ultracode` and `auto` (the page above lists only the first five). `/fast` toggles fast mode; `/advisor` enables an advisor model.

**Observability.** `/context [all]` visualizes context usage, `/usage` (alias `/cost`) reports tokens and cost, and `/insights` generates an analysis report across sessions — a first-party version of what the [LangSmith tracing runbook](../runbooks/tracing-meeseeks-sessions-to-langsmith.md) proposes bolting on.

**Session portability.** `/teleport` pulls a web session into the terminal, `/remote-control` continues a session from another device, and `/desktop` and `/mobile` move it between apps. Sessions are not bound to the terminal that started them.

**Quality workflows.** `/code-review`, `/security-review`, `/verify`, and `/simplify` ship as bundled skills.

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
| 2026-07-25 | https://code.claude.com/docs/en/commands — built-in commands and bundled skills; `/goal`, session/checkpoint commands |
| 2026-07-25 | https://code.claude.com/docs/en/skills — skills/custom-command merge, Agent Skills standard, frontmatter reference, subagent execution |
