# Meeseeks — Workspace / Project Decoupling Design

**Date:** 2026-08-12
**Status:** Implemented (phases 1–4)

## Overview

Today a board carries both the *process* (lanes, states, process docs) and the *project identity* (working directory, context, permissions). Because the two are fused, running the same Development or Incident Response process against a second codebase requires cloning the entire board. This design splits them.

After this change:

- A **workspace** is the top-level container. It holds boards and a registry of projects.
- A **project** is a named configuration — a repo root, a context document, a permission set — with no lanes or tickets of its own.
- A **board** keeps the pipeline (lanes, states, process docs, prompts, runtime harness settings) and becomes project-agnostic.
- A **ticket** names its project in frontmatter. One Development board holds tickets from every project.

## Motivation

The current on-disk state is already a hand-rolled version of this design. `boards/meeseeks-board/` contains a `wiki -> ../../wiki` symlink reaching back into the repo, and its `CLAUDE.md` ends with the line:

> The meeseeks project is located at `~/workspace/meeseeks`.

That sentence is project configuration expressed as prose to an agent. The refactor formalizes it: the project's `root` becomes structured data the supervisor turns into an `--add-dir` flag and a preamble sentence, rather than something a human writes into each board's context file.

## Decisions

These were settled by interview and are load-bearing for everything below.

| Question | Decision |
| --- | --- |
| Ticket → project binding | `project:` key in ticket frontmatter. Tickets stay in board lane state dirs. |
| Top-level container | Workspace root with `workspace.yaml` (boards + projects) and a `projects/` registry directory. |
| What moves to the project | Repo root, `CONTEXT.md`, `permissions.yaml`. |
| What stays on the board | The whole `runtime:` block — harness, provider, model, args, env — plus lanes, process docs, prompts. |
| Agent cwd | **Unchanged.** cwd stays the board path. The project root is delivered via `--add-dir` and the preamble. |
| Permission layering | Union all three fields across project and lane; deny beats allow via Claude Code's native precedence. Either side can enforce a floor; neither can undo the other's denial. |
| Board/project eligibility | Every workspace project is selectable on every board. No allowlists. |
| Board UI | Project badge on each card, plus a project filter in the board header. Columns stay per-state. |
| Ticket assignment | Optional. A ticket with no project cannot start a runtime. |
| One-shot prompts | Project-aware — the run modal gains a project selector next to the model picker. |
| Existing data | Auto-migrate schema on open; relocate the workspace out of the repo as a separate, confirmed operation. |

### Why cwd stays the board

The earlier instinct was to make the project root the agent's cwd. That breaks board-level agent configuration: `boards/meeseeks-board/.claude/` holds `settings.json`, `skills/`, and `bin/code-rag.sh`, and Claude Code resolves all of those relative to cwd. Moving cwd into the project repo would silently drop the board's skills and helper binaries, or require writing a `.claude/` directory into the user's actual codebase.

Keeping cwd on the board preserves every existing mechanism — `.claude/`, the wiki symlink, `.meeseeks/` session files — and reduces the runtime change to two additive lines in the spawn spec. The cost is that the agent must be *told* where the project lives rather than being started there, which is exactly the pattern already in production use.

## Scope

### In scope

- `workspace.yaml` schema and the `projects/` registry
- Project storage module, types, REST routes, and WebSocket events
- `project:` frontmatter on tickets: read, write, promote to a known key
- Runtime and prompt spawn changes: project `--add-dir`, preamble sentence, permission resolution
- Board UI: project badge, header filter, project picker on ticket create/edit and prompt run
- Project editor UI (root path, context, permissions)
- Auto-migration of the config schema on workspace open
- A guided, confirmed workspace relocation flow with symlink repair

### Out of scope

- Board-level project allowlists
- Per-project boards or lanes
- Moving prompts to the workspace level (they stay board-scoped, just project-aware)
- Multi-workspace support — one workspace open at a time, as today
- Any change to the ring buffer, stream parser, or console panel internals

---

## Section 1: On-Disk Layout

Target layout, with the workspace living outside any project repo:

```
~/meeseeks-workspace/
  workspace.yaml
  boards/
    development/
      board.yaml            # runtime: harness/provider/model/args/env  (unchanged)
      CONTEXT.md            # process context only — "how this pipeline works"
      .claude/              # board-level agent config (cwd-resolved, unchanged)
      prompts/
      lanes/
        feature-lane/
          lane.yaml
          PROCESS.md
          permissions.yaml  # process-level policy, unioned with the project's
          todo/
            2026-08-12T1030-fix-auth.md
    incident-response/
  projects/
    meeseeks.yaml
    code-rag.yaml
```

### `workspace.yaml`

```yaml
name: chad-workspace
boards:
  - boards/development
  - boards/incident-response
projects:
  - projects/meeseeks.yaml
  - projects/code-rag.yaml
models:                     # unchanged, workspace-wide model picker list
  - { value: opus, label: Opus }
```

`boards:` keeps its current semantics exactly — a list of path entries, absolute or workspace-relative, slugified into ids by `slugifyBoardPath`. `projects:` is a parallel list resolved the same way.

### `projects/<slug>.yaml`

```yaml
name: meeseeks
root: ~/workspace/meeseeks     # tilde and relative paths expanded at read time
color: "#4f9"                  # optional, drives the card badge
context: |                     # optional inline context, or omit and use contextFile
  This project is the Meeseeks agent supervision platform.
  The wiki is at wiki/meeseeks-wiki/ — read it before the codebase.
contextFile: CONTEXT.md        # optional, resolved relative to the project config dir
permissions:
  allowedPaths:
    - ~/workspace/meeseeks
    - ~/workspace/shared-libs
  allowedTools: []
  deniedTools: []
```

`root` is the only required key beyond `name`. A project whose `root` does not exist on disk is surfaced as `available: false`, mirroring how `BoardSummary.available` already works — the picker shows it greyed rather than hiding it, so a missing checkout is diagnosable rather than invisible.

### Ticket frontmatter

```markdown
---
title: Fix auth token refresh
created: 2026-08-12T10:30:00.000Z
updated: 2026-08-12T10:30:00.000Z
project: meeseeks
---
```

`project` holds the project **slug**, not a path — so moving a repo only edits one project config file. A slug naming a project that no longer exists renders as an "unknown project" badge and blocks runtime start, same as unassigned.

---

## Section 2: Storage Layer

### Naming migration

`src/storage/project.ts` currently means *workspace*. The rename is mechanical but touches many imports, so it lands as its own step before any behavior changes (see Phase 1).

| Current | Becomes |
| --- | --- |
| `src/storage/project.ts` | `src/storage/workspace.ts` |
| `ProjectConfig`, `ProjectMeta` | `WorkspaceConfig`, `WorkspaceMeta` |
| `readProject`, `writeProject` | `readWorkspace`, `writeWorkspace` |
| `addBoardToProject`, `removeBoardFromProject` | `addBoardToWorkspace`, `removeBoardFromWorkspace` |
| `OpenProjectState` (`server/state.ts`) | `OpenWorkspaceState` |
| `GET /api/projects/current` | `GET /api/workspace` |

`ProjectConfig`/`ProjectMeta` names are then *reused* for the new concept, which is why the rename must complete first — doing both at once produces a window where the same identifier means two things.

### New module: `src/storage/project.ts` (rewritten)

```ts
export interface ProjectConfig {
  name: string;
  root: string;                    // expanded absolute path
  color?: string;
  context?: string;
  contextFile?: string;
  permissions?: PermissionsConfig;
}

export interface ProjectSummary {
  projectId: string;               // slug, from the config filename
  name: string;
  root: string;
  color?: string;
  available: boolean;              // root exists and is a directory
}

export interface ProjectDetail extends ProjectSummary {
  contextContent: string | null;   // resolved from context | contextFile
  permissions: PermissionsConfig | null;
}

listProjects(workspaceRoot): Promise<ProjectSummary[]>
getProject(workspaceRoot, projectId): Promise<ProjectDetail>
createProject(workspaceRoot, { name, root, ... }): Promise<ProjectSummary>
updateProject(workspaceRoot, projectId, patch): Promise<ProjectDetail>
deleteProject(workspaceRoot, projectId): Promise<void>
```

`listProjects` mirrors the existing `listBoards` shape closely — same slug-collision handling, same `available` stat check — so the two read as siblings.

Deleting a project does not touch tickets. Their `project:` keys become dangling, which the UI surfaces as unknown-project badges. This is deliberate: silently rewriting ticket files across every board during a delete is a worse failure mode than a visible dangling reference.

**Path safety:** `root` intentionally escapes the workspace, so it must *not* go through `resolveWithin`. It gets its own validation — expand `~`, resolve to absolute, reject empty, and stat it. Everything else (config file locations, `contextFile`) stays under `resolveWithin(workspaceRoot, ...)`.

### `src/storage/ticket.ts`

`project` joins `KNOWN_FM_KEYS` alongside `title`, `created`, `updated`, `color`, and gains a field on `FrontMatter`, `TicketSummary`, and `TicketDetail`.

Note a useful property of the current implementation: unknown frontmatter keys already round-trip through the `extra` bag in `parse`/`serialize`. That means a `project:` key written into a ticket file by hand or by migration survives every existing read-modify-write path *before* this change ships — so migration can safely run ahead of the code that understands it.

`createTicket` accepts an optional `project`; `updateTicket` accepts it as a patch field so reassignment works from the editor.

### `src/storage/lane.ts`

Unchanged. `permissions.yaml` keeps its current shape, stays where it is, and continues to be consulted for every runtime — it is now one of two contributing sources rather than the only one. Existing lane configs need no edits, and the all-empty default shipped by `createLane` contributes nothing to the union, so behavior for a lane nobody has configured is identical to today.

---

## Section 3: Runtime Layer

### Permission resolution

The three fields in `PermissionsConfig` are not symmetric, and treating them as one thing is the mistake this section exists to avoid. Once they reach Claude Code:

| Field | Becomes | Real semantics |
| --- | --- | --- |
| `allowedPaths` | `--add-dir <path>` | Additive capability grant. Expands what is in scope. There is no denied-path counterpart — a directory cannot be subtracted. |
| `allowedTools` | `permissions.allow` | Auto-approve list. Absence from it does **not** block a tool; it means "ask the human." A friction knob, not a safety knob. |
| `deniedTools` | `permissions.deny` | Hard block. Deny beats allow in Claude Code. This is the only real guardrail of the three. |

Because restriction lives exclusively in `deniedTools`, and deny is already unconditional, a plain union across project and lane produces the desired authority without any precedence logic of our own:

```ts
interface PermissionSource {
  origin: 'project' | 'lane';
  base: string;                    // project root, or lane path
  config: PermissionsConfig | null;
}

function resolvePermissions(sources: PermissionSource[]): ResolvedPermissions | null;
```

The union carries one subtlety that a naive merge gets wrong. Relative entries in `allowedPaths` mean different things depending on which file they came from: a lane's `../shared` is relative to the lane directory (today's behavior, `claude-code.ts:23`), while a project's `./vendor` is relative to that project's root. **Paths must therefore be expanded to absolute against their own source's base before the union**, not after — otherwise a merged list has no way to know which base each entry needs. This is why `resolvePermissions` takes sources with provenance rather than two bare `PermissionsConfig` values.

Provenance is retained on the resolved output rather than discarded, since the resolved-permissions view in Section 5 needs to attribute every effective entry back to the file that contributed it:

```ts
interface ResolvedPermissions {
  allowedPaths: Array<{ value: string; origin: 'project' | 'lane' }>;  // absolute
  allowedTools: Array<{ value: string; origin: 'project' | 'lane' }>;
  deniedTools:  Array<{ value: string; origin: 'project' | 'lane' }>;
}
```

De-duplication keeps the first occurrence and records both origins when a value appears in each. `buildSpawnSpec` consumes only the `value` fields, so the existing `--add-dir` and settings-file construction is otherwise unchanged — except that it no longer performs relative-path resolution itself, that having moved into `resolvePermissions`.

The consequences are worth stating explicitly, because they are the point:

- An Incident Response lane's `deniedTools: [Write, Edit, Bash]` holds for every project on that board. The lane enforces a floor.
- A project's `deniedTools: [Bash]` holds on every board. The project enforces a floor too.
- Neither side can undo the other's denial, because Claude Code resolves deny over allow regardless of which config contributed the entry.
- `allowedPaths` unions, which is the only sensible behavior for an additive grant: the project contributes its repo, the lane contributes shared tooling directories.

The rejected alternative was wholesale replacement — project permissions overriding lane permissions when present. It was discarded because replacement triggers on the *presence* of a `permissions` block rather than on intent: adding `allowedPaths: [~/workspace/shared-libs]` to a project, an edit purely about filesystem reach, would silently delete that lane's deny list. A safety property that evaporates as a side effect of an unrelated config edit is the worst available failure shape.

**Interactive vs. non-interactive asymmetry.** The cost of over-restriction differs sharply between the two runtime kinds, and this is why union is the right default for `allowedTools` specifically. Ticket runtimes are interactive PTY sessions: a non-approved tool prompts, the `permission_prompt` hook fires, and the console moves to `awaiting-user` — recoverable, and a human answering is the product's whole premise. Prompt runs use `--print`, where no human can answer; the call is refused rather than prompted and the agent is simply blocked. Since prompts become project-aware in this design, a union of auto-approvals is what keeps a shared prompt from stalling on a refused tool under one project but not another.

**Known cost.** Auto-approvals leak across contexts: a project allowing `Bash(npm:*)` means npm auto-approves on the Incident Response board too, where the intent may have been to prompt for everything. The remedy is that lane's deny list, which is coarser than "just make it ask." This is accepted, and mitigated by the resolved-permissions view in Section 5.

### Spawn context

`SpawnContext` and `PromptSpawnContext` in `src/runtime/types.ts` each gain:

```ts
project: {
  projectId: string;
  name: string;
  root: string;
  contextContent: string | null;
} | null;
```

### `buildSpawnSpec` changes

Three additive changes in `src/runtime/claude-code.ts`, all guarded on `ctx.project`:

1. **Add the project root as an allowed directory**, before the existing permission paths:
   ```ts
   if (ctx.project) argv.push('--add-dir', ctx.project.root);
   ```
   The resolved `allowedPaths` — already absolute, already unioned across project and lane — then flow through the existing loop. The `resolveAllowedPath` helper (`claude-code.ts:23`) is deleted from this file, its `expandHome` and relative-base logic having moved into `resolvePermissions` where the per-source base is known. Lane-relative entries keep resolving against `lanePath` exactly as today, so no existing configuration changes meaning.

2. **Prepend project context and a location sentence to the preamble.** Assembly order becomes:
   ```
   projectContext        (what this codebase is)
   boardContext          (how this pipeline works)
   processDoc            (what this lane requires)
   projectLocation       (where to work)
   ticketContext         (which ticket)
   ```
   The location sentence is generated, not authored:
   > Project `meeseeks` is rooted at `~/workspace/meeseeks`. Your working directory is the board folder; perform code work in the project root.

   Project context comes first because it is the most stable and most cacheable segment; the ticket reference comes last because it is the most specific. The two generated sentences sit adjacent at the end so the agent reads *where* and *what* together.

3. **Environment:** add `MEESEEKS_PROJECT_ROOT` and `MEESEEKS_PROJECT_NAME` next to the existing `MEESEEKS_TICKET_PATH` / `MEESEEKS_BOARD_PATH` / `MEESEEKS_LANE_PATH`.

`cwd` remains `ctx.boardPath`. The settings file stays at `<boardPath>/.meeseeks/session-<runtimeId>.json`. The `runtime:` block still comes from `board.yaml`. Nothing else in the spawn path moves.

### `buildPromptSpawnSpec`

Same three changes. Prompts already accept a `model` override at run time; `projectId` becomes a second optional run-time parameter carried the same way. Run logs under `prompts/.logs/<name>/` gain the project slug in their metadata so a shared prompt's history stays attributable per project.

### Runtime routes

`POST /api/tickets/:boardId/:laneName/:filename/runtime` reads the ticket's frontmatter, resolves the project, and returns **HTTP 400** with a clear message if the ticket has no project or names an unknown one. The UI disables the button in that state, so this is a guard rather than an expected path.

`POST /api/prompts/:boardId/:name/run` accepts `{ model?, projectId? }`. A prompt run with no project is permitted — a prompt like "lint the wiki" may legitimately be board-only — and simply spawns without the project additions.

---

## Section 4: Server API

New routes, following existing conventions in `src/server/routes/`:

```
GET    /api/projects              → { projects: ProjectSummary[] }
GET    /api/projects/:id          → { project: ProjectDetail }
POST   /api/projects              → create
PATCH  /api/projects/:id          → update (name, root, color, context, permissions)
DELETE /api/projects/:id          → unregister + delete config file
```

Renamed: `GET /api/projects/current` → `GET /api/workspace`. This route rename is the reason the storage rename must land first — the old path would otherwise collide with the new project collection.

Ticket routes gain `project` on create and update bodies. `GET /api/boards/:boardId` responses carry each ticket's `project` field; **filtering happens client-side**. Board ticket counts are already small and fully loaded, and client-side filtering keeps the filter instant and avoids a cache-key dimension in the query layer.

WebSocket events gain `project-created`, `project-updated`, `project-deleted`, broadcast through the existing hub in `src/server/ws.ts`.

The chokidar watcher in `src/server/watcher.ts` gains the `projects/` directory so external edits to project configs propagate. It does **not** watch project roots — those are user codebases, potentially huge, and nothing in Meeseeks' model depends on their contents changing.

---

## Section 5: Web UI

### Project badge and filter

`TicketCard.tsx` renders a small project badge using the project's `color`. This is distinct from the existing per-ticket `color` frontmatter, which continues to drive the card's border accent — the two are complementary, not competing, and a ticket's own color still wins on the border.

`BoardRoute.tsx` gains a header control: `Project: [All ▾]`, listing every workspace project plus "Unassigned". Selection is client-side filtering over already-loaded tickets, persisted per board in the existing `store/ui.ts` so a filter survives navigation.

### Project picker

- **New-ticket flow** — a project selector defaulting to the board's current filter selection when one is active, otherwise the last-used project (persisted in `store/ui.ts`). Not required.
- **`TicketRoute.tsx`** — a project selector alongside the existing title/color controls, allowing reassignment.
- **Start Runtime button** — disabled with an explanatory tooltip when the ticket has no project or names an unknown one. This is the enforcement point for the "optional, but required to run" decision.
- **`PromptRunModal.tsx`** — a project selector beside the existing model picker.

### Resolved-permissions view

Union means two files contribute to one effective policy, which is the one real cost of the Section 3 decision. A read-only panel makes that cost visible rather than latent: the effective `allowedPaths`, `allowedTools`, and `deniedTools` for a runtime, each entry tagged with the file that contributed it, and entries contributed by both shown once with both origins.

It lives as a tab in the console panel (`components/console/Panel.tsx`, alongside the existing context tab) and is served by `GET /api/tickets/:boardId/:laneName/:filename/permissions`, which runs the same `resolvePermissions` the supervisor uses. Reusing the identical function is the point — a preview computed by a parallel implementation would eventually disagree with what actually spawned, which is worse than no preview.

Because the endpoint is pure resolution with no spawn, it also answers the question "what *would* this ticket run with" before anything starts, which is the moment a misconfigured deny list is cheapest to catch.

### Project editor

A new route at `/projects` and `/projects/:id`, reachable from `Sidebar.tsx`. It reuses the established editor patterns: `MarkdownEditor.tsx` for project context (subject to the same focus-gating as board context, per the focus-gated-editor concept), and a permissions form matching the existing lane permissions surface. Root path entry gets an existence check with inline feedback, since a mistyped root is the most likely configuration error and produces confusing agent behavior rather than an obvious failure.

---

## Section 6: Migration

Migration splits into two independent operations. This split is a deliberate departure from a single auto-migrate step: rewriting config in place is safe and can happen silently, but **moving a user's directories is not** and must be confirmed.

### 6a. Schema migration — automatic, on workspace open

Triggered when the server resolves a directory containing `project.yaml` (or legacy `project.meeseeks`) with no `projects:` key. Steps:

1. Copy `project.yaml` to `project.yaml.bak` before any write.
2. Write `workspace.yaml` with the existing `name`, `boards`, and `models` carried over verbatim. Leave the old file in place — `readWorkspace` prefers `workspace.yaml`, falls back to `project.yaml`, then `project.meeseeks`, extending the fallback chain that already exists.
3. Create `projects/` and derive one project from the workspace root: `name` from the workspace name, `root` = the workspace root path.
4. Walk every board's lane state directories and add `project: <slug>` to each ticket's frontmatter, preserving all other keys.
5. Log the migration to stderr and emit a `workspace-migrated` WS event so the UI can show a one-time notice.

Step 4 is the only step that touches ticket files. It is safe against partial failure — re-running is idempotent, since a ticket that already has a `project` key is skipped.

The derived project's root is the workspace root, which for the current repo is `~/workspace/meeseeks` — correct as-is, because the workspace currently *is* the project repo. Adding a second project then requires no data movement at all, only a new config file. This is why relocation is not a prerequisite for getting value from the refactor.

### 6b. Workspace relocation — explicit and confirmed

The workspace currently lives inside one of its own projects, which is conceptually wrong once a second project exists: `~/workspace/meeseeks/boards/` would hold tickets for `code-rag`. Relocation fixes this, but it moves directories and rewrites symlinks, so it runs only on explicit request.

Shape: a CLI subcommand (`meeseeks relocate <target>`) plus a UI entry point, both with a mandatory dry-run report listing every move, every symlink rewrite, and every config edit before anything is touched.

Steps:

1. Verify the target directory does not exist or is empty.
2. Move `boards/`, `projects/`, and `workspace.yaml` to the target.
3. **Repair relative symlinks.** `boards/meeseeks-board/wiki -> ../../wiki` resolves to `~/workspace/meeseeks/wiki` today and would dangle after the move. Each symlink under a board is read, resolved against its *original* location, and rewritten as an absolute path to the same target.
4. Rewrite relative `boards:` entries in `workspace.yaml` if needed; project `root` entries are already absolute and need no change.
5. Leave the original directories in place, renamed with a `.pre-relocate` suffix rather than deleted. The user removes them once satisfied.

Step 3 is the step most likely to be forgotten and the one whose failure is quietest — a dangling wiki symlink produces an agent that simply can't find the knowledge base, with no error at spawn time. It gets an explicit test.

---

## Section 7: Phasing

Each phase leaves the system working and testable. Phases 1–3 are strictly sequential; 4 and 5 can proceed in parallel once 3 lands.

**Phase 1 — Workspace rename.** Pure rename, no behavior change. `storage/project.ts` → `storage/workspace.ts`, all types and call sites, `GET /api/projects/current` → `GET /api/workspace`. Existing tests pass unchanged apart from imports. Ships independently and de-risks everything after it.

**Phase 2 — Project storage and API.** New `storage/project.ts`, `projects/` registry, CRUD routes, WS events, watcher coverage. Nothing consumes projects yet. Fully unit-testable in isolation.

**Phase 3 — Ticket binding and runtime.** `project` frontmatter through storage, types, and ticket routes; spawn-spec changes for tickets and prompts; `resolvePermissions` with provenance and the permissions preview endpoint; the 400 guard on unassigned runtime starts. This is the phase that delivers the actual capability — after it, a shared board works via API even without UI.

**Phase 4 — Web UI.** Badge, filter, pickers, disabled-start affordance, project editor route, prompt run modal selector, resolved-permissions console tab.

**Phase 5 — Migration.** Auto schema migration on open, then the relocation command with dry-run and symlink repair.

## Testing

Tests mirror source structure under `tests/`, run with Vitest.

- **Storage:** project CRUD, slug collisions, `available` for a missing root, `~` expansion, rejection of an empty or non-directory root, `project` frontmatter round-trip including a ticket carrying unrelated extra keys.
- **Runtime:** `buildSpawnSpec` emits `--add-dir <projectRoot>`; preamble segment order; `cwd` is still `boardPath`.
- **Permission resolution** — the highest-value tests in this design, since the failure mode is silent:
  - a lane's `deniedTools` survives a project that defines a full permissions block (the guardrail-floor property);
  - a project's `deniedTools` survives a lane that allows the same tool (the inverse floor);
  - a tool present in one side's `allow` and the other side's `deny` ends up denied;
  - lane-relative `allowedPaths` still resolve against `lanePath`, and project-relative against the project root, **in the same union** — the provenance-base test;
  - `~` expansion works for both sources;
  - de-duplicated entries report both origins;
  - both sides null yields null, so a board with no project and an empty lane config emits no settings `permissions` key at all (preserving today's behavior at `claude-code.ts:64`).
- **Server:** runtime start returns 400 for unassigned and unknown-project tickets; the permissions preview endpoint returns exactly what a spawn would use; project WS events fire; ticket responses carry `project`.
- **Migration:** schema migration is idempotent; tickets with a pre-existing `project` key are untouched; a backup is written; relative symlinks are rewritten to correct absolute targets on relocation; dry-run mutates nothing.

## Open Risks

- **Dangling project references.** Deleting a project leaves tickets pointing at a missing slug. Mitigated by visible badges and a blocked start button rather than silent behavior, but there is no bulk-reassign tool in this scope.
- **Board CONTEXT.md content drift.** Existing board context files contain project-specific prose (the meeseeks board's does today). Migration does not attempt to split them — the derived project's context starts empty, and the user moves prose across by hand. Automated splitting would be guesswork on free-form Markdown.
- **Auto-approval leakage.** Union means a project's `allowedTools` apply on every board, so a project allowing `Bash(npm:*)` auto-approves npm on the Incident Response board too. The only remedy is that lane's `deniedTools`, which blocks outright rather than restoring a prompt — there is no "make this ask again" expression in Claude Code's model. If this bites, the follow-up is a lane-level `promptTools` concept implemented by omitting entries from the merged allow list, which requires subtraction and is deliberately deferred.
- **`allowedPaths` grants are one-way.** Nothing can revoke a directory once any source grants it, since `--add-dir` has no counterpart. A project cannot scope a permissive lane down to its own repo. This is a property of the harness, not of this design, but it means path grants deserve more review than tool grants.
