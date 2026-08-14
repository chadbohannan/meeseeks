# Board-to-Workflow Migration

This runbook covers moving an existing workspace from the board-era layout (`project.yaml` plus `boards/<board>/lanes/<lane>`) to the current one (`workspace.yaml` plus `workflows/<workflow>` and `projects/<slug>.yaml`). It is the final phase of the [board collapse](../../../docs/superpowers/specs/2026-08-13-workflow-collapse-design.md), and until it runs, a build of the collapsed code cannot open a board-era workspace at all: the server finds `boards:` where it expects `workflows:` and reports an empty workspace. The resulting model is described in [Project Model](../concepts/project-model.md).

## Running it

```
npm run migrate -- --dry-run          # report the plan, write nothing
npm run migrate                        # apply
npm run migrate -- /path/to/workspace --project-root ~/code/thing
```

The workspace defaults to the current directory. Always dry-run first — the report names every collision and assumption before anything moves.

## What it does

The migration reads `project.yaml`, then for each registered board: copies every lane to `workflows/<lane>`, renames `lane.yaml` to `workflow.yaml`, prepends the board's context document to the lane's `PROCESS.md`, and copies the board's `runtime:` block into each of its workflows. It then moves the board's `prompts/` and `.claude/{skills,bin}` to the workspace root, folds the board's `.claude/settings.json` grants into a generated `projects/<name>.yaml`, tags every ticket with that project's slug, and merges the resulting registries into `workspace.yaml`.

Each board's runtime block lands in its own workflows, so no board's configuration is discarded and there is no tiebreak to get wrong. Nothing is promoted to a workspace-level default: picking one board's runtime to govern every future workflow is a choice the migration has no basis to make, and `resolveWorkflowRuntime` already falls back cleanly when no default exists.

## Why it copies rather than moves

Originals are copied and then renamed with a `.pre-migrate` suffix, never deleted. This is not general caution. The workspace `.gitignore` excludes `boards/` and `project.yaml` — deliberately, since a workspace hosted inside the repository it supervises would otherwise commit its own operational state — which means none of the migrated data is in version control. The backup directory is the only way back.

`project.yaml` is also what makes the operation idempotent: its absence means the work is done, so a second run reports "already migrated" and touches nothing. No marker file or schema version is needed.

## What it refuses to decide

Three classes of ambiguity are reported rather than resolved, and the dry-run output is where they surface.

**Prompt and skill collisions.** Two boards may each define `lint.md`. Unlike a lane, whose id derives from a registry entry and can be suffixed safely, a prompt is referenced by filename — suffixing would leave the workspace with two prompts and no way to tell which one anything meant. The first writer wins, the loser stays intact in the backup, and the collision is printed.

**`MEESEEKS_LANE_PATH` references.** The variable is now `MEESEEKS_WORKFLOW_PATH`. This is the one rename that escapes the codebase: a `PROCESS.md` or a script under `.claude/bin` may name the old variable, and whether an occurrence is safe to edit depends on what reads it. Occurrences are listed, never rewritten.

**The project root.** A board never recorded which codebase it worked on, so the generated project config assumes the workspace root and says so in the report. Pass `--project-root` when that is wrong.

## Three things the design got wrong about real disk

The migration was specified before the workspace was inspected, and the spec's own closing note warns that this phase is where the real layout *is* the problem. It was right.

**`workspace.yaml` can already exist.** The server creates one on first read of any directory, and a workflow made since then is real user data. The migration merges its registries into whatever is there rather than writing the file fresh — and counts directories already sitting under `workflows/` as taken names even when they are unregistered, since copying a lane on top of one would silently fuse two workflows.

**The board's context file is `CLAUDE.md`, not `CONTEXT.md`.** Boards created before that rename kept the old name, and the board reader that used to migrate it on access disappeared with boards. Both names are accepted.

**That context cannot be promoted to a workspace-root `CLAUDE.md`.** The harness reads that path natively from its working directory, which is now the workspace root — and where the workspace is also a repository, the file is already the repository's own agent instructions. Folding the board context into each workflow's `PROCESS.md` preserves the text without overwriting anything. This is the same cwd-resolution behavior described in [Claude Code instruction bootstrapping](../concepts/claude-code-instruction-bootstrapping.md), applied in the opposite direction: what made a board's `.claude/` work automatically is what makes a workspace's `CLAUDE.md` dangerous to write.

## Symlinks

Relative symlinks are rewritten to absolute targets resolved against their *original* location. A board-era `wiki -> ../../wiki` denotes a different directory once the link sits two levels shallower, and the failure is silent — a dangling `wiki` produces an agent that reports no knowledge base rather than an error anyone sees. This is the one behavior worth checking by hand after a migration.

## Verifying

Start the server and confirm the workspace opens: `GET /api/workflows` should list every migrated workflow with `available: true` and correct per-state ticket counts, and `GET /api/projects` should show the generated project with `available: true`. A workflow that appears with `available: false` is registered but missing on disk — the registry and the filesystem disagree, which the model surfaces rather than hides.

One thing migration deliberately preserves is a pinned `runtime.model`. A board pinned to a version id that no longer exists carries that id into its workflows unchanged, because silently rewriting someone's pinned model would be a worse failure than a visible one. Check `workflow.yaml` against the workspace's `models:` list after migrating an old board.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-08-14 | Collapsing Boards into Workflows §7 (`docs/superpowers/specs/2026-08-13-workflow-collapse-design.md`) |
| 2026-08-14 | `src/storage/migrate.ts`, `scripts/migrate.ts`, `tests/storage/migrate.test.ts` |
