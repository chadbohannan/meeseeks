# Project Model

Meeseeks organizes work in a four-level hierarchy: Workspace → Board → Lane → Ticket, with Projects as a cross-cutting fifth concept selectable per ticket.

> **In flight (2026-08-12):** the term *project* is being split in two. The top-level container described below is now called a **Workspace**, and *Project* is being reclaimed for a selectable per-codebase configuration so that one Development or Incident Response board can serve many codebases. The [workspace/project decoupling design](../../../docs/superpowers/specs/2026-08-12-workspace-project-decoupling-design.md) records the full plan; phases 1–3 have landed, so a shared board is fully functional through the API. Phases 4–5 (web UI, migration) are not yet implemented.

## Workspace

A workspace is the top-level container, defined by a `project.yaml` file at its root (the filename is unchanged for now; a `workspace.yaml` fallback chain arrives with the migration phase). It contains global configuration: the workspace name, the board list, and (since phase 2) a `projects:` list registering project config files. Only one workspace can be open at a time. Older projects may use a `project.meeseeks` file instead — the server reads this as a backwards-compatible fallback but never creates it; `project.yaml` is always the canonical name for new projects. If neither file exists in the resolved directory, the server auto-creates `project.yaml` with the directory basename as the project name.

### Selectable models

The model picker shown when starting a ticket runtime or a one-shot prompt is driven by the project, not hardcoded in the UI. The server exposes `GET /api/models`, which returns the project's model list; both the ticket view and the prompts editor fetch it through a shared `useModels` query and render whatever comes back. The list comes from an optional `models:` key in `project.yaml` (each entry a `{ value, label }` pair, where `value` is passed verbatim to `claude-code --model`). When that key is absent or contains no valid entries, the server falls back to `DEFAULT_MODELS` — the bare aliases `opus`, `sonnet`, and `haiku`. The default deliberately uses aliases rather than pinned version ids (e.g. `claude-opus-4-7`) so that a newly released model is picked up by `claude-code` without editing source; the alias-to-version resolution happens downstream in the harness, which is also why `board.yaml` now defaults its `runtime.model` to `opus`. A project that needs to pin a specific version (or expose gateway-specific ids) overrides the list in `project.yaml`. This was the motivating constraint behind the design: in a corporate setup where Claude Code authenticates through a gateway with no reusable `ANTHROPIC_API_KEY`, the live Models API (`GET /v1/models`) is unreachable, so aliases plus a config override are the practical substitute for querying Anthropic's catalog directly.

## Project

A project is a named codebase configuration with no lanes or tickets of its own, stored as `projects/<slug>.yaml` under the workspace and registered in the workspace config's `projects:` list. Its required `root` key points at a codebase that deliberately lives *outside* the workspace, which is why `src/storage/project.ts` gives it dedicated validation — expand `~`, resolve to absolute, reject empty — rather than routing it through `resolveWithin` like every other path in the storage layer. Optional keys cover a display `color`, a `context` document (inline, or via `contextFile` resolved relative to the config file), and a `permissions` block.

The project id is the config filename minus its extension, which is why `slugifyProjectPath` exists alongside `slugifyBoardPath`: boards name a directory, projects name a file, and reusing the board slugifier would turn `projects/meeseeks.yaml` into the id `meeseeks-yaml`. That id is deliberately stable across renames — `updateProject` changes the config contents but never the filename, because tickets will reference the id and a rename would orphan them.

Registered entries whose config file is missing or malformed are reported as `available: false` rather than dropped from `listProjects`, on the principle that a visible misconfiguration beats a silently shorter list. The same flag covers a `root` that does not exist or is not a directory — the most likely configuration error, and one that otherwise surfaces only as confusing agent behavior.

## Board

A board represents a workflow context (e.g., a feature or sprint). Each board has a `board.yaml` containing runtime settings. Boards live as directories under the workspace root.

## Lane

A lane represents a stage in the workflow (e.g., todo, in-progress, done). Lanes are defined in `lane.yaml` with an ordered array of states. Each state maps to a subdirectory where tickets live.

## Ticket

A ticket is a unit of work, stored as a Markdown file in a lane state directory. Ticket filenames follow `YYYY-MM-DDTHHmm-<slug>.md` pattern with base36 collision suffix.

A ticket names its project through a `project:` frontmatter key holding a project *slug*, never a path — moving a repository therefore edits one project config rather than every ticket. Assignment is optional, but a ticket without a resolvable project cannot start a runtime: the spawn route rejects both the unassigned case and a slug naming a project that no longer exists, because neither yields a root to point the agent at. A dangling slug is left in place when a project is deleted rather than being rewritten across every board, on the grounds that a visible broken reference beats a silent mass edit.

One property of `src/storage/ticket.ts` made this cheap: unknown frontmatter keys already round-trip through an `extra` bag in `parse`/`serialize`. A `project:` key written by hand or by migration survives every read-modify-write path even in builds that predate the feature, which is what lets the migration phase run ahead of the code that understands it.

## Permissions

`permissions.yaml` in lane directories controls what an agent can do. Allowed paths generate `--add-dir` flags, and allowed/denied tools generate a JSON settings file. Because both lanes and projects now carry permission blocks, `PermissionsConfig` moved from `src/runtime/types.ts` to `src/shared/types.ts` — storage owns reading these configs and may not import from `runtime/`, so the type had to live somewhere both layers can reach.

The two sources are combined by `resolvePermissions` in `src/runtime/permissions.ts`, which unions all three fields and adds no precedence logic of its own. That works because the three fields are not symmetric once they reach the harness: `allowedPaths` becomes `--add-dir` and is a purely additive capability grant with no counterpart that revokes a directory; `allowedTools` becomes `permissions.allow`, an *auto-approve* list whose absence means "ask the human" rather than "blocked"; and only `deniedTools` becomes a hard block, which Claude Code resolves over allow regardless of origin. Restriction therefore lives exclusively in `deniedTools`, so a union lets an Incident Response lane and a project each enforce a floor that the other cannot undo.

The rejected alternative was wholesale replacement — project permissions overriding the lane's when present. It was discarded because replacement triggers on the *presence* of a block rather than on intent: adding an `allowedPaths` entry to a project, an edit purely about filesystem reach, would silently delete that lane's deny list.

Two consequences are worth knowing. First, relative `allowedPaths` entries need different resolution bases depending on their source — a lane's `../shared` resolves against the lane directory, a project's `./vendor` against the project root — so paths are made absolute *before* the union; a merged list has no way to recover which base an entry needed. This is why `PermissionSource` carries its own `base`. Second, auto-approvals leak across contexts: a project allowing `Bash(npm:*)` auto-approves it on every board, and the only remedy is a deny, because Claude Code offers no way to express "make this ask again."

The cost of over-restriction differs sharply between the two runtime kinds. A ticket runtime is an interactive PTY, so a non-approved tool prompts, the `permission_prompt` hook fires, and the console moves to `awaiting-user` — recoverable. A prompt run uses `--print`, where nothing can answer, so the call is refused outright. Prompts are the case where `allowedTools` is load-bearing rather than merely convenient.

Provenance survives resolution: each effective entry carries the origins that contributed it, which powers `GET /api/tickets/:boardId/:laneName/:filename/permissions`. That endpoint calls the same `resolvePermissions` the supervisor calls, deliberately — a preview computed by a parallel implementation would eventually disagree with what actually spawns.

## Watcher interaction

Adding a `projects/` directory to the workspace required a fix in `src/server/watcher.ts`. Its path classifier ends with a generic fallthrough treating any `<dir>/<file>` as a board change, so `projects/meeseeks.yaml` would have broadcast a `board-changed` event for a nonexistent board with the id `projects`. The projects branch therefore has to be tested *before* that fallthrough, not appended after it — an ordering constraint that is invisible from the code unless you know the fallthrough is a catch-all.

A related trap affects tests rather than production: the watcher runs with `usePolling` and `ignoreInitial`, so a file created while chokidar's initial scan is still in progress is classified as pre-existing and silently skipped. Watcher tests must let the scan settle before mutating the tree, otherwise they fail in a way that looks like a broken classifier.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `idea.md` |
| 2026-04-26 | First Slice Design §4 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-06-08 | `src/storage/project.ts`, `src/server/routes/projects.ts`, `src/web/components/PromptsEditor.tsx`, `src/web/routes/TicketRoute.tsx` |
| 2026-08-12 | Workspace/Project Decoupling Design (`docs/superpowers/specs/2026-08-12-workspace-project-decoupling-design.md`) |
| 2026-08-12 | `src/storage/workspace.ts`, `src/storage/project.ts`, `src/server/routes/projects.ts`, `src/server/watcher.ts`, `src/shared/types.ts` |