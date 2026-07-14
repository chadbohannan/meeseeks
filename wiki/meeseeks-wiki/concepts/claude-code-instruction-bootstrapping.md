# Claude Code Instruction Bootstrapping

How Claude Code loads its instructions and context at startup is a distinct concern from how Meeseeks invokes the binary, so it lives on its own page (split out of the [Claude Code](../systems/claude-code.md)). It matters to Meeseeks because the orchestrator generates per-session settings files and may eventually template other `.claude/` contents (rules, commands) at board or lane scope — and because one deliberate divergence, injecting board context explicitly rather than relying on auto-discovery, is a design decision worth recording.

## The `.claude/` directory

The `.claude/` directory is the control center for a Claude Code instance. It stores instructions, state, and permissions that persist across sessions and control agent behavior.

**`CLAUDE.md`** is the primary instruction file. Claude reads it at the start of every session. It can live in the project root or at `.claude/CLAUDE.md`. Meeseeks does not rely on this auto-discovery for its own board-level context — the board carries a `CONTEXT.md` file (edited in the Board Editor) which the [runtime adapter](../components/runtime.md) reads and prepends to the `--append-system-prompt` preamble, ahead of the lane's `PROCESS.md` and the ticket reference. The rename and explicit injection are intentional: they keep board context observable in the supervisor's recorded preamble rather than hidden inside Claude Code's startup behavior, and they decouple the file's name from a tool-specific convention. Any `CLAUDE.md` files inside the working tree (e.g., the project under development) are still picked up by Claude Code's normal discovery; only the board directory's instruction file has been renamed.

**`rules/`** holds focused markdown files for specific standards (e.g., `testing.md`, `style.md`). Claude treats these as high-priority instructions. Rules can be path-scoped using YAML frontmatter so that, for instance, React component rules only load when Claude is working in `src/components/`. This is more targeted than a monolithic `CLAUDE.md` and avoids wasting tokens on irrelevant instructions.

**`commands/`** contains markdown files that define custom slash commands. Each filename becomes a command (e.g., `review.md` creates `/project:review`). Potentially useful for Meeseeks to define per-board or per-lane workflows as slash commands that agents can invoke.

**`skills/`** houses self-contained toolkits for complex, multi-step workflows. Unlike single-file commands, skills can bundle supporting scripts and references.

**`settings.json`** manages operational control — tool permission allowlists, sandboxing rules, and hooks. This is the file Meeseeks already generates per session; see the [settings file](../systems/claude-code.md#settings-file) section and the [sandboxing runbook](../runbooks/claude-code-sandboxing.md) for details.

**`memory/`** is internal to Claude Code. The agent writes architecture insights, observed patterns, and session history here, accessed via the `/memory` command. Meeseeks does not interact with this directory.

## Three-layer merge and active reload

On launch, Claude Code merges instructions from three layers in priority order:

1. **Global** — `~/.claude/CLAUDE.md`, `~/.claude/rules/`, `~/.claude/settings.json`
2. **Project** — `./.claude/CLAUDE.md`, `./.claude/rules/`, `./.claude/settings.json` in the working directory
3. **Nested** — any `CLAUDE.md` files in subdirectories of the working tree

Project-specific settings override global ones so that each repository follows its own rules. For Meeseeks, this means a board directory with its own `.claude/` tree can carry tailored instructions that automatically apply to any agent spawned there. Note that the board's own `CONTEXT.md` (sibling of `board.yaml`) is *not* picked up by this auto-discovery chain — the orchestrator injects it explicitly so its contents are observable in the recorded preamble. This is the instruction-bootstrapping counterpart to the settings-file precedence chain documented in the [sandboxing runbook](../runbooks/claude-code-sandboxing.md).

Claude Code re-reads instruction and settings files on each tool call. Edits made mid-session — whether by the user, the orchestrator, or another agent — take effect on the very next turn. This active monitoring behavior is significant for orchestrator designs that want to adjust agent permissions or instructions while a session is already running.

## Best practices for instruction files

The following patterns, drawn from expert usage, are relevant to how Meeseeks templates agent environments:

- **Keep CLAUDE.md under 200 lines.** Long instruction files degrade instruction-following accuracy and waste context tokens. Move niche rules to `rules/` with path-scoping so they only load when relevant.
- **Be explicit about commands.** Claude performs better when build, test, and lint commands are listed in `CLAUDE.md` rather than left for the agent to discover by exploring the filesystem.
- **Include verification steps.** Instructions like "run tests after fixing" in `CLAUDE.md` itself produce more reliable behavior than relying on the agent to decide when to verify its work.
- **Keep global config minimal.** Over-populating `~/.claude/` causes context bleed, where rules from one project interfere with another. For Meeseeks, this argues for putting agent instructions at the board or lane level rather than in the user's global config.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-30 | [Claude Context](../sources/Claude%20Context.md) — `.claude/` directory structure, three-layer instruction bootstrapping, active reloading, best practices |
