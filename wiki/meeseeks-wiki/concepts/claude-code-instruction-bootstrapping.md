# Claude Code Instruction Bootstrapping

How Claude Code loads its instructions and context at startup is a distinct concern from how Meeseeks invokes the binary, so it lives on its own page (split out of the [Claude Code](../systems/claude-code.md)). It matters to Meeseeks because the orchestrator generates per-session settings files and may eventually template other `.claude/` contents (rules, commands) at board or lane scope — and because one deliberate divergence, injecting board context explicitly rather than relying on auto-discovery, is a design decision worth recording.

## The `.claude/` directory

The `.claude/` directory is the control center for a Claude Code instance. It stores instructions, state, and permissions that persist across sessions and control agent behavior.

**`CLAUDE.md`** is the primary instruction file. Claude reads it at the start of every session. It can live in the project root or at `.claude/CLAUDE.md`. Meeseeks does not rely on this auto-discovery for its own board-level context — the board carries a `CONTEXT.md` file (edited in the Board Editor) which the [runtime adapter](../components/runtime.md) reads and prepends to the `--append-system-prompt` preamble, ahead of the lane's `PROCESS.md` and the ticket reference. The rename and explicit injection are intentional: they keep board context observable in the supervisor's recorded preamble rather than hidden inside Claude Code's startup behavior, and they decouple the file's name from a tool-specific convention. Any `CLAUDE.md` files inside the working tree (e.g., the project under development) are still picked up by Claude Code's normal discovery; only the board directory's instruction file has been renamed.

**`rules/`** holds focused markdown files for specific standards (e.g., `testing.md`, `style.md`). Claude treats these as high-priority instructions. Rules can be path-scoped using YAML frontmatter so that, for instance, React component rules only load when Claude is working in `src/components/`. This is more targeted than a monolithic `CLAUDE.md` and avoids wasting tokens on irrelevant instructions.

**`commands/`** contains markdown files that define custom slash commands. *(Corrected 2026-07-25: a file at `.claude/commands/review.md` creates `/review`, not `/project:review`; and custom commands have since been **merged into skills** — `.claude/commands/` files keep working and support the same frontmatter, but skills are the recommended form. See the [capability surface](../systems/claude-code.md#capability-surface).)*

**`skills/`** houses self-contained toolkits for complex, multi-step workflows that bundle supporting scripts and references, and — unlike anything else in this directory — load **only when invoked or judged relevant**.

**`settings.json`** manages operational control — tool permission allowlists, sandboxing rules, and hooks. This is the file Meeseeks already generates per session; see the [settings file](../systems/claude-code.md#settings-file) section and the [sandboxing runbook](../runbooks/claude-code-sandboxing.md) for details.

**`memory/`** — *corrected 2026-07-25.* This page previously located Claude Code's agent-written memory at `.claude/memory/` and described it as session history. Both were wrong. Auto memory lives at **`~/.claude/projects/<project>/memory/`**, keyed off the git repository so all worktrees of a repo share one directory, and it is machine-local. See [Two memory systems](#two-memory-systems) below.

## Two memory systems

Claude Code separates instructions **you** write from learnings **Claude** writes, and treats them differently. This distinction is the single most important thing about its memory model:

| | `CLAUDE.md` files | Auto memory |
|---|---|---|
| Written by | You | Claude |
| Contains | Instructions and rules | Learnings and patterns |
| Scope | Project, user, or org | Per repository, shared across worktrees |
| Loaded | Every session, in full | Every session — but only `MEMORY.md`'s first 200 lines / 25 KB |

Auto memory is on by default (`autoMemoryEnabled`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, or relocatable via `autoMemoryDirectory`). Its structure is an **index plus topic files**: `MEMORY.md` is a concise index loaded every session, while `debugging.md`, `api-conventions.md` and friends are *not* loaded at startup and are read on demand. Claude Code actively enforces the index budget — after a write it measures the file and reminds Claude to shorten it, erroring if the index exceeds its read limit because everything past the limit is silently dropped on next load. Files written with YAML frontmatter also get a `modified` ISO-8601 timestamp so both Claude and the user can judge staleness.

That index-plus-topic-files shape is the same [progressive disclosure](deepagents-context-engineering.md) pattern Deep Agents implements as hot/cold memory, arrived at independently — and Claude Code's version is the only one of the three with enforced budget checking.

Subagent memory is deliberately isolated: the main conversation's auto memory is **not** loaded into subagents (a `fork` is the exception, since it inherits the parent conversation), and a subagent can maintain its own separate auto-memory directory.

## Instruction scopes, concatenation, and active reload

There are four `CLAUDE.md` scopes, loaded broadest to most specific:

1. **Managed policy** — `/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS), `/etc/claude-code/CLAUDE.md` (Linux/WSL), or the `claudeMd` key in `managed-settings.json`. Deployed by MDM/Group Policy and **cannot be excluded** by individual settings.
2. **User** — `~/.claude/CLAUDE.md`, `~/.claude/rules/`.
3. **Project** — `./CLAUDE.md` or `./.claude/CLAUDE.md`, `./.claude/rules/`.
4. **Local** — `./CLAUDE.local.md`, gitignored personal overrides.

The critical semantic, and a correction to this page's earlier "three-layer merge in priority order" framing: **all discovered files are concatenated into context rather than overriding each other.** Claude Code walks up the directory tree from the working directory, ordering content from filesystem root down to cwd so the most local instructions are read last, with `CLAUDE.local.md` appended after `CLAUDE.md` at each level. This is *additive layering*, not override — materially different from the override-wins precedence used by [`dcode`'s skill roots](../systems/deep-agents-code.md).

Three further mechanisms matter:

- **Subdirectory files load on demand.** `CLAUDE.md` files *below* the working directory are not loaded at launch; they are included when Claude reads files in those subdirectories. Progressive disclosure again, keyed on location.
- **`.claude/rules/`** holds topic files loaded with the same priority as project `CLAUDE.md`, and a `paths:` frontmatter list of globs scopes a rule so it loads only when Claude touches matching files. Rules directories support symlinks for sharing across projects.
- **`@path` imports** expand into context at launch (max depth 4, code spans and fenced blocks skipped). Imports resolving outside the working directory trigger a one-time approval dialog, since a shared repo could otherwise pull in files you never reviewed. Imports aid organization but **do not reduce context**, since imported files load at launch regardless.

`claudeMdExcludes` (glob patterns, merged across settings layers) skips irrelevant ancestor files in monorepos — though managed policy files can never be excluded.

**`AGENTS.md` is not read.** Claude Code reads `CLAUDE.md` only. The documented interop is to create a `CLAUDE.md` containing `@AGENTS.md` (optionally with Claude-specific instructions below it), or to symlink the two. This is a notable asymmetry with [`dcode`](../systems/deep-agents-code.md), which uses `AGENTS.md` natively *and* reads Claude's `.claude/skills/`: the skills format is a shared standard, but the instruction-file convention is not.

One delivery detail with real consequences: `CLAUDE.md` content is injected **as a user message after the system prompt**, not as part of the system prompt itself — which the docs give as the reason compliance is not guaranteed. Meeseeks' `--append-system-prompt` preamble therefore binds *more* strongly than a `CLAUDE.md` would, which retroactively strengthens the explicit-injection decision recorded above. Project-root `CLAUDE.md` survives `/compact` (re-read from disk and re-injected); nested files do not until Claude next reads that subdirectory.

Claude Code re-reads instruction and settings files on each tool call. For Meeseeks, this means a board directory with its own `.claude/` tree can carry tailored instructions that automatically apply to any agent spawned there. Note that the board's own `CONTEXT.md` (sibling of `board.yaml`) is *not* picked up by this auto-discovery chain — the orchestrator injects it explicitly so its contents are observable in the recorded preamble. This is the instruction-bootstrapping counterpart to the settings-file precedence chain documented in the [sandboxing runbook](../runbooks/claude-code-sandboxing.md).

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
| 2026-07-25 | https://code.claude.com/docs/en/memory — CLAUDE.md scopes and concatenation, auto memory, rules/`paths`, imports, AGENTS.md interop (corrects the 2026-04-30 secondary-source capture) |
