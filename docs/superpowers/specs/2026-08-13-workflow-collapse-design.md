# Meeseeks — Collapsing Boards into Workflows

**Date:** 2026-08-13
**Status:** Implemented (phases 1–4)
**Migration runbook:** [Board-to-Workflow Migration](../../../wiki/meeseeks-wiki/runbooks/board-to-workflow-migration.md)
**Follows:** [Workspace/Project Decoupling](2026-08-12-workspace-project-decoupling-design.md)

## Overview

The project refactor removed the reason boards existed. A board used to be the unit that bound a process to a codebase — its `CONTEXT.md` said what the code was, its `.claude/` carried the tooling, and the agent's working directory was the board folder. Now that a project supplies the codebase, the board is a container holding one thing of substance: its lanes.

This change deletes the board level. Lanes move to the top of the hierarchy — and are **renamed to workflows** (see below) — with everything a board carried moving either up to the workspace or down into each workflow.

After this change the hierarchy is: **Workspace → Workflow → Ticket**, with **Project** still selectable per ticket.

> **Terminology.** Throughout this document, *workflow* is the new name for what the current code calls a *lane*. Passages describing today's on-disk layout or existing source still say *lane*, since that is what is actually there until this change lands.

### Why lanes are renamed to workflows

"Lane" is a kanban word: it meant *a column-group within a board*. With the board deleted, the noun describes a relationship to a thing that no longer exists — a chapter with no book. What it now denotes is a named process with ordered states, a process document, permissions, and a runtime. That is a workflow.

The rename is scoped into this change rather than deferred because it is nearly free here and expensive later. Phases 1–3 already rewrite `boardId` out of every route, param, WebSocket event, storage signature, and SPA component; the identifiers being renamed are largely the same ones. Doing it separately later means a second full-surface rename with no other reason to touch those files.

## Motivation

Boards and lanes were never peers. A board owned six things a lane did not, and every one of them existed to serve the board's real job — being the agent's working directory:

| Board asset | Why it was there | Where it goes |
| --- | --- | --- |
| `board.yaml` `runtime:` | harness, provider, model, args, env | **stays per-workflow** (see below) |
| `CONTEXT.md` | first segment of every agent preamble | folded into each workflow's `PROCESS.md` |
| `.claude/` | `settings.json`, `skills/`, `bin/` — resolved from cwd | workspace (one copy) |
| `prompts/` + `.logs/` | one-shot prompts and run history | workspace |
| `.meeseeks/` | generated per-runtime settings files | workspace |
| symlinks, `.gitignore` | e.g. `wiki -> ../../wiki` reaching into the repo | workspace |

Everything bound to cwd is better held once at the workspace than duplicated per workflow. What remains — states, a process document, permissions, and the runtime block — is what a lane already was, plus one thing that never needed to be higher.

### What `.claude/` actually contains

Inspecting the real workspace rather than an imagined one changes two decisions, so it is recorded here:

```
boards/meeseeks-board/.claude/
  settings.json         permissions, every entry scoped to /home/chad/workspace/meeseeks/**
  settings.local.json   accreted "always allow" choices, written by the agent
  skills/               empty
  bin/code-rag.sh       one MCP shim
```

`settings.json` is **project data in the wrong file** — it predates the project axis and is a hand-rolled version of what `projects/meeseeks.yaml` now holds. Claude Code merges settings sources, so those grants are today silently additive to the ones Meeseeks generates and passes via `--settings`. Migration folds them into the project config and deletes the file, collapsing two sources into one. `settings.local.json` is agent-written churn, not config, and is left alone.

That leaves a shim script and an empty directory — genuinely workspace-scoped. The hazard of workflows sharing `skills/` is currently hypothetical, which is why no UI mitigation is designed for it (see §5).

## Decisions

Settled by interview; load-bearing for everything below.

| Question | Decision |
| --- | --- |
| Workspace-level (shared) | `prompts/`, `.claude/` (skills, bin), optional default `runtime:` |
| Per-workflow | `workflow.yaml` (states + `runtime:`), `PROCESS.md`, `permissions.yaml`, ticket state dirs |
| `CONTEXT.md` | Ceases to exist. Board context folds into each workflow's `PROCESS.md`. |
| Agent cwd | Workspace root. Workflows are subdirectories, named in preamble and env. |
| Workflow discovery | Explicit `workflows:` list in `workspace.yaml`, mirroring today's `boards:` |
| Prompts | Workspace-level, with an **optional** workflow picker; choosing a workflow applies that workflow's permissions |
| Settings UI | Shared editors stay on the workflow editor |
| Routing | `/workflows/:workflowName/…`; old `/boards/*` URLs are not preserved |
| Migration | Deferred to the end; built against fresh workspaces first |

### Why cwd moves to the workspace root

The previous design deliberately kept cwd on the board because Claude Code resolves `.claude/settings.json`, `.claude/skills/`, and `.claude/bin/` relative to it. That constraint does not disappear — it relocates. With workflows at the top level, keeping cwd on the workflow would force a `.claude/` directory into every workflow, so a skill added for one pipeline would have to be copied into all of them.

Pointing cwd at the workspace root satisfies the same constraint with one copy. It also composes with the project work already shipped: the workflow, like the project, becomes a location the agent is *told* about rather than one implied by its process. Both are `--add-dir`-and-preamble facts now, which makes the runtime story uniform instead of special-cased.

A further benefit is native: Claude Code reads `CLAUDE.md`/`AGENTS.md` from the working directory, so a workspace-root context file is picked up **without Meeseeks managing it at all**. This is why no workspace-level `CONTEXT.md` is introduced to replace the board's — the harness already provides that slot, and duplicating it in Meeseeks-managed config would create two competing sources of workspace context.

### Why `runtime:` does *not* move up with it

An earlier draft promoted the `runtime:` block to the workspace alongside `.claude/`. That was wrong, and the migration rule was the tell: it read "the first board's `runtime:` block is promoted," silently discarding every other board's. When a migration needs an arbitrary tiebreak, the target model has usually lost information the source model carried.

It lost it for no reason. cwd had to move because `.claude/`, skills, and bin resolve from the filesystem — a hard constraint. But `runtime:` is only spawn parameters: harness, provider, model, args, env. Nothing in it is path-resolved, so it has no cwd coupling and rode up on a constraint that does not apply to it. Today `boards/incident-response` can run a different model than `boards/development`; promoting the block would have removed that with no compensating benefit.

`runtime:` therefore stays in `workflow.yaml`, with an optional workspace-level block as the default for workflows that omit it. Migration keeps every board's block instead of choosing one.

### Why `CONTEXT.md` folds into `PROCESS.md`

Board context answered "what is this codebase" — a question the project now answers, and better, because it answers it per codebase rather than per pipeline. What is left in a typical board `CONTEXT.md` is process framing, which is what `PROCESS.md` is for. Keeping both would leave two per-workflow documents with no crisp boundary between them.

Migration concatenates the board's `CONTEXT.md` above each of its lanes' `PROCESS.md`, so nothing is lost — it lands in the document that survives.

## Scope

### In scope

- `workspace.yaml`: `workflows:` list, and an optional default `runtime:` block
- `workflow.yaml`: gains the `runtime:` block from `board.yaml`, falling back to the workspace default
- Lanes relocated to `<workspace>/workflows/<workflow>/` and renamed throughout, registered and slug-identified like boards were
- `src/storage/lane.ts` → `workflow.ts`; `lane.yaml` → `workflow.yaml`; `laneName` → `workflowName` across storage, routes, WS events, and the SPA
- Deletion of `src/storage/board.ts`, `src/server/routes/boards.ts`, and the board concept in types, events, and the SPA
- Prompts and the skills/bin file namespaces rescoped from board to workspace
- Runtime: cwd at the workspace root, workflow stated in the preamble, `MEESEEKS_BOARD_PATH` replaced
- REST surface reshaped to `/api/workflows/...`; WebSocket events lose `boardId`
- SPA: flat workflow list in the sidebar, workflow editor absorbing the board editor, `/workflows/...` routes
- An optional workflow picker on prompt runs

### Out of scope

- Migration of existing on-disk workspaces (deferred — see §7)
- Per-workflow `.claude/` (skills and bin stay workspace-wide — see below)
- Any change to projects, ticket frontmatter, or permission resolution semantics
- Nested or grouped workflows

### Why `.claude/` is not split per workflow

The costs are asymmetric. Skill leakage across workflows is a soft failure — a skill visible in a workflow that does not need it costs some context and a small chance of spurious invocation. Splitting is a hard structural cost: `.claude/` re-multiplies, `bin/code-rag.sh` becomes N copies that drift, and the cwd decision above reverses.

The per-workflow escape hatch already exists. `PROCESS.md` is per-workflow and injected into every preamble, so a workflow needing different behavior has a mechanism today. A workflow-specific *skill* would add only on-demand invocation over always-on context — a narrow gap, and not one worth restructuring the filesystem to close before anything occupies `skills/` at all.

Revisit only if a workflow needs skills another workflow must not see. That is the one case that genuinely requires cwd back on the workflow.

### Known consequence of deferring migration (resolved by Phase 4)

Until §7 is written, **a build of this change cannot open the existing `~/workspace/meeseeks` workspace** — it has `boards:` where the new code expects `workflows:`, and its lanes are one level too deep and under the old name. Development and testing run against freshly created workspaces. This is the accepted cost of sequencing migration last, and it means the migration phase is not optional polish: it is what makes the real workspace usable again.

---

## Section 1: Target Layout

```
~/meeseeks-workspace/
  workspace.yaml          # name, workflows[], projects[], models[], default runtime{}
  CLAUDE.md               # optional; read natively by the harness, not managed by Meeseeks
  .claude/                # skills/, bin/ — one copy, resolves from cwd
  .meeseeks/              # generated per-runtime settings files
  prompts/                # one-shot prompts
    .logs/
  projects/
    meeseeks.yaml
  workflows/
    development/
      workflow.yaml           # name, states[], runtime{}
      PROCESS.md          # absorbs the old board CONTEXT.md
      permissions.yaml
      todo/  doing/  done/
    incident-response/
```

### `workspace.yaml`

```yaml
name: chad-workspace
workflows:
  - workflows/development
  - workflows/incident-response
projects:
  - projects/meeseeks.yaml
models:
  - { value: opus, label: Opus }
runtime:                  # default only; a workflow.yaml runtime: block wins
  harness: claude-code
  provider: anthropic
  model: opus
  args: []
  env: {}
```

Resolution is whole-block, not per-field: a workflow either defines `runtime:` or inherits the workspace default entire. Per-field merging would let a workflow pin `model` while silently inheriting an `env` it never saw, which is the kind of partial inheritance that makes spawn behavior hard to reason about from either file alone.

`workflows:` deliberately mirrors the existing `boards:` contract — path entries resolved against the workspace, slugified into ids by a `slugifyWorkflowPath` helper, with the same collision suffixing and the same `available: false` state when a directory is missing. Reusing that shape means `listWorkflows` can be adapted from `listBoards` rather than invented, and the "registered but missing" diagnostic behavior carries over unchanged.

---

## Section 2: Storage Layer

**Deleted:** `src/storage/board.ts` in full. Its useful parts move:

| From `board.ts` | To |
| --- | --- |
| `createBoard` scaffolding | `createWorkflow` (was `createLane`; gains `PROCESS.md` seeding from the board template) |
| `readBoardName` / `updateBoardName` | the `name` field already in `lane.yaml`, now `workflow.yaml` |
| `renameBoard` / `deleteBoardFolder` | `renameWorkflow` / `deleteWorkflowFolder` (were the lane equivalents) |
| `readBoardContextContent` / `writeBoardContextContent` | Deleted — `PROCESS.md` accessors already exist |
| `DEFAULT_BOARD_YAML` `runtime:` | `DEFAULT_WORKSPACE_YAML` (as the default) and `DEFAULT_WORKFLOW_YAML` |

**`src/storage/workspace.ts`** gains `workflows: string[]` in `WorkspaceConfig`, an optional `runtime?: RuntimeConfig` default block (the type is renamed from `BoardRuntimeConfig['runtime']`), and `addWorkflowToWorkspace` / `removeWorkflowFromWorkspace` / `listWorkflows` / `getWorkflow` adapted from the board equivalents. The board functions are removed.

**`src/storage/lane.ts` is renamed to `workflow.ts`**, and with it every exported identifier: `listLanes` → `listWorkflows`, `createLane` → `createWorkflow`, `lanePath` → `workflowPath`, and so on. `STARTER_LANE` / `STARTER_LANE_PROCESS` in `templates.ts` follow. `lane.yaml` on disk becomes `workflow.yaml`.

Beyond the rename it changes in two ways. It switches from `lanePath(boardPath, laneName)` to resolving against the workspace's `workflows:` registry, so every exported function loses its `boardPath` parameter in favor of a resolved absolute workflow path. And it gains an optional `runtime?: RuntimeConfig` in `workflow.yaml` plus a `resolveWorkflowRuntime(workflow, workspace)` helper returning the workflow's block when present and the workspace default otherwise. Returning `null` when neither exists keeps the "no runtime configured" case explicit rather than synthesizing a silent default at spawn time.

**`src/storage/prompts.ts`** and **`src/storage/files.ts`** take a workspace root where they took a board path. The `NAMESPACE_DIRS` mapping (`skills → .claude/skills`, `bin → .claude/bin`) is unchanged; only its base moves.

**`src/storage/ticket.ts`** is unaffected apart from losing `boardPath` from its signatures and taking `workflowName` where it took `laneName` — tickets already live at `<lane>/<state>/<file>.md`, and that shape is unchanged.

---

## Section 3: Runtime Layer

Changes to `buildSpawnSpec` in `src/runtime/claude-code.ts`:

1. **`cwd` becomes the workspace root.** This is the substantive change; everything else follows from it.
2. **No `--add-dir` for the workflow.** It is inside the workspace and therefore already in scope. The project's `--add-dir` is unaffected, as are resolved permission paths.
3. **Preamble** drops the board-context segment and gains a workflow-location sentence, keeping the same most-stable-to-most-specific ordering:
   ```
   projectContext        (what this codebase is)
   processDoc            (how this workflow works — now includes former board context)
   projectLocation       (where the code is)
   ticketContext         (which workflow, which ticket, absolute ticket path)
   ```
   `ticketContext` already names the workflow; it is reworded to drop the board and to state the workflow directory explicitly, since the workflow is no longer the working directory.
4. **Environment:** `MEESEEKS_BOARD_PATH` is removed, `MEESEEKS_WORKSPACE_PATH` added, and `MEESEEKS_LANE_PATH` renamed to `MEESEEKS_WORKFLOW_PATH`. `MEESEEKS_TICKET_PATH` and the project vars are unchanged. The env rename is the one part of this that reaches outside Meeseeks — anything a `PROCESS.md` or skill scripts against `MEESEEKS_LANE_PATH` breaks silently, so migration greps the workspace for the old name and reports hits rather than rewriting them.
5. **Settings file** moves from `<board>/.meeseeks/session-<id>.json` to `<workspace>/.meeseeks/session-<id>.json`.
6. **Runtime config** comes from `resolveWorkflowRuntime` rather than the board. The call site changes shape but not semantics — harness, provider, model, args, and env are consumed exactly as before.

`resolvePermissions` is untouched. Workflow permissions still resolve their relative `allowedPaths` against the workflow directory, which remains a real path — only its depth changed.

`buildPromptSpawnSpec` gets the same cwd and env treatment. Its permission sources become the **optional** workflow (when one is picked) plus the project, replacing today's board-level `permissions.yaml`, which has no successor.

---

## Section 4: Server API

Route reshaping is mechanical but wide. `boardId` disappears from every path, param, and body.

```
GET    /api/workflows                                  (was /api/boards)
POST   /api/workflows
GET    /api/workflows/:workflowName
PATCH  /api/workflows/:workflowName
DELETE /api/workflows/:workflowName

GET    /api/workflows/:workflowName/tickets
POST   /api/workflows/:workflowName/tickets
GET    /api/workflows/:workflowName/tickets/:filename       (+ PATCH, DELETE)

POST   /api/tickets/:workflowName/:filename/runtime
GET    /api/tickets/:workflowName/:filename/permissions

GET    /api/files/:namespace                        (was /api/boards/:boardId/files/...)
GET    /api/files/:namespace/*                      (+ POST, PATCH, DELETE)

GET    /api/prompts                                 (was /api/boards/:boardId/prompts)
GET    /api/prompts/:name                           (+ PUT, DELETE)
POST   /api/prompts/:name/run                       body: { model?, projectId?, workflowName? }
GET    /api/prompts/:name/logs
```

`src/server/routes/boards.ts` is deleted and `workflows.ts` absorbs its CRUD. WebSocket events lose the board dimension:

```ts
| { type: 'workflow-changed';    payload: { workflowName: string; kind: ChangeKind } }
| { type: 'ticket-changed';  payload: { workflowName: string; filename: string; state: string; kind: ChangeKind } }
| { type: 'prompts-changed'; payload: { name: string; kind: ChangeKind } }
```

`board-changed` is removed. `TicketRef` in `src/shared/runtime.ts` drops `boardId`, which ripples into runtime summaries and every client-side runtime lookup.

**The watcher needs care.** `src/server/watcher.ts` classifies paths by looking for a `lanes` segment and treating the prefix before it as a board entry. With workflows directly under the workspace, that index becomes 0 for every workflow path and the board-prefix logic disappears. The generic `<dir>/<file>` board fallthrough — already the source of one bug during the project work — is deleted outright rather than adapted, since there is no longer a board for it to describe. The `projects/` branch added previously must keep being checked first.

---

## Section 5: Web UI

- **Sidebar** flattens from Board → Lane → State to Workflow → State. `boardCollapseKey` is deleted; `laneCollapseKey` becomes `workflowCollapseKey` and loses its `boardId` argument. Persisted collapse state keyed the old way simply does not match, which fails safe to expanded.
- **`BoardRoute`, `BoardsRoute`, `BoardEditorRoute`, `NewBoardModal`** are deleted. `NewLaneModal` becomes `NewWorkflowModal`, the sole creation affordance, and gains the state-list configuration the board modal never needed. `LaneRoute` and the rest of the lane-named components rename in step.
- **Workflow editor** (`/workflows/:workflowName/edit`) hosts `PROCESS.md`, `permissions.yaml`, `runtime:`, and state configuration — plus the skills, bin, and prompts editors that were on the board editor. The runtime section shows whether the workflow defines its own block or is inheriting the workspace default, since an inherited block is otherwise indistinguishable from a defined one.
- **`store/ui.ts`**: `projectFilter` is keyed by `workflowName` instead of `boardId`. Existing persisted filters key on board ids and will simply not match, which fails safe — an unmatched key reads as "All".

### Shared editors

The skills, bin, and prompts editors edit workspace-wide state while living on a workflow page. An earlier draft mitigated this with a persistent "Workspace-wide" chip warning that changes affect every workflow. That is dropped: a label explaining that a control does something surprising is worse than a control that does not surprise, and the underlying collision it guarded against does not currently exist — `skills/` is empty, `bin/` holds one shim, and permissions are resolved per spawn from workflow and project rather than from a shared file.

The editors are labelled by what they edit (workspace skills, workspace prompts) as any editor should be. If `skills/` fills up and workflows start contending over it, that is the signal to revisit per-workflow `.claude/` above — not to add a warning.

---

## Section 6: Phasing

**Phase 1 — Storage.** `workspace.yaml` gains `workflows:` and an optional default `runtime:`; `workflow.yaml` gains its own `runtime:` plus `resolveWorkflowRuntime`; workflows resolve from the registry; `board.ts` deleted; prompts and file namespaces rescoped. Storage tests updated. No server or UI changes yet, so the app is broken at the end of this phase — this is the one phase that does not stand alone, and it should land together with Phase 2 if that is uncomfortable.

**Phase 2 — Runtime and server.** cwd, preamble, env, settings-file path; route reshaping; WS payloads; watcher simplification; `boards.ts` deleted. The API is fully functional at the end of this phase.

**Phase 3 — Web UI.** Sidebar, routes, workflow editor, deletion of board components, component and store renames.

**Phase 4 — Migration.** Old layout → new, in one pass covering both this change and the deferred project migration (see below). Landed as `src/storage/migrate.ts` behind `npm run migrate`, with three corrections forced by the workspace on disk: `workspace.yaml` may already exist and is merged rather than overwritten; the board context file is `CLAUDE.md` as often as `CONTEXT.md`; and an unregistered directory under `workflows/` counts as a name collision. Section 7 below is the original plan and is left unedited as the record of what was specified.

## Section 7: Migration (deferred)

> **Implemented 2026-08-14.** Kept as written for the record; see Phase 4 above for where reality diverged.

Written last, but the shape is known and worth recording now because it constrains earlier phases.

A single migration takes today's on-disk layout to the final one:

1. `project.yaml` → `workspace.yaml`, with `boards:` rewritten as `workflows:`. No `runtime:` promotion — see step 2.
2. For each board, for each of its lanes: move `<board>/lanes/<lane>` to `<workspace>/workflows/<lane>`, rename its `lane.yaml` to `workflow.yaml`, prepend the board's `CONTEXT.md` to its `PROCESS.md`, and copy the board's `runtime:` block into it. Every board's block survives, so no board's configuration is discarded and there is no tiebreak.
3. Move `<board>/prompts/` and `<board>/.claude/{skills,bin}` to the workspace root.
4. Create `projects/<name>.yaml` from the workspace root path.
5. Fold `<board>/.claude/settings.json` `permissions.allow`/`deny` into that project config, then remove the file. It was additive to the generated settings, so behavior is preserved by moving rather than dropping it. `settings.local.json` is agent-written churn and is left in place.
6. Tag every ticket with `project:` (the deferred project migration, folded in here).

Three hazards this must handle, none of which arise in the current single-board workspace but all of which are cheap to get right and expensive to retrofit:

- **Name collisions.** Two boards may each have a lane called `dev`. Collisions need suffixing, and tickets do not reference lane names so the rename is safe.
- **Prompt and skill collisions.** Two boards may define `lint.md`. Unlike lanes, there is no id indirection to protect here, so a collision must be reported rather than silently resolved.
- **Relative symlinks.** `boards/meeseeks-board/wiki -> ../../wiki` changes depth when the lane moves. As in the earlier design, symlinks are resolved against their original location and rewritten absolute. This failure is silent — a dangling wiki link produces an agent that simply cannot find the knowledge base — so it gets an explicit test.

Migration remains non-destructive: originals are renamed with a `.pre-migrate` suffix rather than deleted.

## Testing

- **Storage:** workflow registry resolution and collision suffixing; `available: false` for a missing workflow directory; prompts and file namespaces resolving against the workspace. `resolveWorkflowRuntime` in all three cases — workflow block present (wins), workflow block absent (workspace default), neither present (`null`) — including that a workflow block is taken whole rather than merged field-wise with the default.
- **Runtime:** `cwd` is the workspace root; no workflow `--add-dir` is emitted; preamble segment order with the workflow sentence present; `MEESEEKS_WORKSPACE_PATH` set and `MEESEEKS_BOARD_PATH` absent; settings file written under the workspace; workflow-relative `allowedPaths` still resolve against the workflow.
- **Server:** every reshaped route; WS payloads carry no `boardId`; watcher emits `workflow-changed` for `workflows/<workflow>/workflow.yaml` and `ticket-changed` for `workflows/<workflow>/<state>/<file>.md`, and still emits `project-changed` for `projects/*.yaml`.
- **Prompts:** a run with no workflow uses project-only permissions; a run with a workflow unions that workflow's permissions.
- **Migration:** lane name collisions suffixed; `lane.yaml` renamed to `workflow.yaml` with contents preserved; prompt collisions reported not merged; `CONTEXT.md` prepended to `PROCESS.md`; relative symlinks rewritten to correct absolute targets; **each** board's `runtime:` block landing in its own workflows with none discarded; board `.claude/settings.json` grants appearing in the project config and the file removed while `settings.local.json` survives; re-running is idempotent.

## Open Risks

- **Phase 1 does not stand alone.** Storage changes break the server until Phase 2 lands. Landing them as one commit is the safer option if a broken intermediate state is unacceptable.
- **The real workspace is unusable until Phase 4.** Accepted consequence of deferring migration; noted here so it is not a surprise mid-refactor.
- **Shared editors on a workflow page remain a discoverability compromise.** With `skills/` empty and `bin/` holding one shim there is little to collide over today, but a user could still edit workspace state from a workflow page believing it workflow-scoped. If that proves confusing in use, promoting these editors to their own route is a small, self-contained follow-up — and a better answer than a warning label.
- **The rename widens the blast radius of Phases 1–3.** Renaming `lane` → `workflow` alongside the structural change means a compiler error during those phases could come from either. The mitigation is ordering, not caution: within each phase, do the mechanical rename as its own commit, get it green, then make the structural change. A broken build after a pure rename is a different kind of problem than one after a semantic change, and keeping them separable is worth the extra commit.
- **`MEESEEKS_LANE_PATH` is the one rename that escapes the codebase.** Process docs and skills may reference it. Migration reports occurrences rather than rewriting them, since it cannot know what is safe to edit.
- **Two decisions in the first draft were made without reading the workspace on disk** — promoting `runtime:` to the workspace, and designing a UI mitigation for collisions in an empty `skills/` directory. Both are corrected above. The general lesson applies most to Phase 4, where the real layout *is* the problem: inspect before designing.
