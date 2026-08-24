# Project Model

Meeseeks organizes work in a three-level hierarchy: Workspace → Workflow → Ticket, with Projects as a cross-cutting concept selectable per ticket.

Two refactors produced that shape, and both are complete. The [workspace/project decoupling](../../../docs/superpowers/specs/2026-08-12-workspace-project-decoupling-design.md) split the old top-level "project" into a **Workspace** and reclaimed *Project* for a selectable per-codebase configuration. The [board collapse](../../../docs/superpowers/specs/2026-08-13-workflow-collapse-design.md) then removed the Board level entirely, promoting lanes to workspace-level **Workflows** — the two axes a ticket sits on are now the process it follows and the codebase it touches, and neither is a container for the other. Existing installations reach this layout through the [board-to-workflow migration](../runbooks/board-to-workflow-migration.md).

## Workspace

A workspace is the top-level container, defined by a `workspace.yaml` file at its root. It holds the workspace name, a `workflows:` list of directory entries, a `projects:` list registering project config files, an optional `models:` list, and an optional default `runtime:` block. Only one workspace can be open at a time. If the file does not exist, `openWorkspace` (`src/storage/open.ts`) creates it at server startup with the directory basename as the name and both registries empty; `readWorkspace` itself is a pure read and throws `NotFoundError` on a directory that has no workspace. There is deliberately no fallback to the board-era `project.yaml`: reading one would surface a config whose `boards:` key this code no longer understands, presenting an empty workspace as if it were a valid one, so a missing file is the honest signal.

Registration and presence on disk are separate. A `workflows:` entry whose directory is missing is reported with `available: false` rather than dropped, so a mistyped or half-deleted workflow stays visible instead of silently vanishing — the same principle `listProjects` applies to project configs.

### Selectable models

The model picker shown when starting a ticket runtime or a one-shot prompt is driven by the project, not hardcoded in the UI. The server exposes `GET /api/models`, which returns the project's model list; both the ticket view and the prompts editor fetch it through a shared `useModels` query and render whatever comes back. The list comes from an optional `models:` key in `workspace.yaml` (each entry a `{ value, label }` pair, where `value` is passed verbatim to `claude-code --model`). When that key is absent or contains no valid entries, the server falls back to `DEFAULT_MODELS` — the bare aliases `opus`, `sonnet`, and `haiku`. The default deliberately uses aliases rather than pinned version ids (e.g. `claude-opus-4-7`) so that a newly released model is picked up by `claude-code` without editing source; the alias-to-version resolution happens downstream in the harness, which is also why a generated `runtime.model` defaults to `opus`. A workspace that needs to pin a specific version (or expose gateway-specific ids) overrides the list in `workspace.yaml`. This was the motivating constraint behind the design: in a corporate setup where Claude Code authenticates through a gateway with no reusable `ANTHROPIC_API_KEY`, the live Models API (`GET /v1/models`) is unreachable, so aliases plus a config override are the practical substitute for querying Anthropic's catalog directly.

## Project

A project is a named codebase configuration with no workflows or tickets of its own, stored as `projects/<slug>.yaml` under the workspace and registered in the workspace config's `projects:` list. Its required `root` key points at a codebase that deliberately lives *outside* the workspace, which is why `src/storage/project.ts` gives it dedicated validation — expand `~`, resolve to absolute, reject empty — rather than routing it through `resolveWithin` like every other path in the storage layer. Optional keys cover a display `color`, a `context` document (inline, or via `contextFile` resolved relative to the config file), and a `permissions` block.

The project id is the config filename minus its extension, which is why `slugifyProjectPath` exists alongside `slugifyWorkflowPath`: workflows name a directory, projects name a file, and reusing the workflow slugifier would turn `projects/meeseeks.yaml` into the id `meeseeks-yaml`. That id is deliberately stable across renames — `updateProject` changes the config contents but never the filename, because tickets will reference the id and a rename would orphan them.

Registered entries whose config file is missing or malformed are reported as `available: false` rather than dropped from `listProjects`, on the principle that a visible misconfiguration beats a silently shorter list. The same flag covers a `root` that does not exist or is not a directory — the most likely configuration error, and one that otherwise surfaces only as confusing agent behavior.

## Workflow

A workflow is a process a ticket moves through — Development, Incident Response — held as a directory registered in the workspace's `workflows:` list. Its `workflow.yaml` carries a display name, an ordered array of states (each mapping to a subdirectory where tickets live), and an optional `runtime:` block; `PROCESS.md` beside it is injected into every agent spawned for one of its tickets, and `permissions.yaml` scopes what those agents may do.

Runtime resolution is whole-block, not per-field: a workflow either defines `runtime:` or inherits the workspace default entire. Per-field merging would let a workflow pin `model` while silently inheriting an `env` it never saw, which is exactly the kind of partial inheritance that makes spawn behavior impossible to reason about from either file alone. Because an inherited block is otherwise indistinguishable from a declared one in the editor, `WorkflowDetail` carries a `runtimeInherited` flag purely so the UI can say which it is — the same provenance discipline the permission resolver applies below.

Workflows sit at the workspace level rather than under a board because a board and a workflow were the same thing described twice. The [collapse design](../../../docs/superpowers/specs/2026-08-13-workflow-collapse-design.md) records the argument; its practical consequence is that the agent's working directory is now the workspace root, so a single `.claude/` — and a single `prompts/` — serves every workflow instead of being duplicated per board.

## Ticket

A ticket is a unit of work, stored as a Markdown file in a workflow's state directory. Ticket filenames follow the `YYYY-MM-DDTHHmm-<slug>.md` pattern with a base36 collision suffix.

A ticket names its project through a `project:` frontmatter key holding a project *slug*, never a path — moving a repository therefore edits one project config rather than every ticket. Assignment is optional, but a ticket without a resolvable project cannot start a runtime: the spawn route rejects both the unassigned case and a slug naming a project that no longer exists, because neither yields a root to point the agent at. A dangling slug is left in place when a project is deleted rather than being rewritten across every workflow, on the grounds that a visible broken reference beats a silent mass edit.

One property of `src/storage/ticket.ts` made this cheap: unknown frontmatter keys already round-trip through an `extra` bag in `parse`/`serialize`. A `project:` key written by hand or by migration survives every read-modify-write path even in builds that predate the feature, which is what lets the migration phase run ahead of the code that understands it.

## Permissions

`permissions.yaml` in workflow directories controls what an agent can do. Allowed paths generate `--add-dir` flags, and allowed/denied tools generate a JSON settings file. Because both workflows and projects now carry permission blocks, `PermissionsConfig` moved from `src/runtime/types.ts` to `src/shared/types.ts` — storage owns reading these configs and may not import from `runtime/`, so the type had to live somewhere both layers can reach.

The two sources are combined by `resolvePermissions` in `src/runtime/permissions.ts`, which unions all three fields and adds no precedence logic of its own. That works because the three fields are not symmetric once they reach the harness: `allowedPaths` becomes `--add-dir` and is a purely additive capability grant with no counterpart that revokes a directory; `allowedTools` becomes `permissions.allow`, an *auto-approve* list whose absence means "ask the human" rather than "blocked"; and only `deniedTools` becomes a hard block, which Claude Code resolves over allow regardless of origin. Restriction therefore lives exclusively in `deniedTools`, so a union lets an Incident Response workflow and a project each enforce a floor that the other cannot undo.

The rejected alternative was wholesale replacement — project permissions overriding the workflow's when present. It was discarded because replacement triggers on the *presence* of a block rather than on intent: adding an `allowedPaths` entry to a project, an edit purely about filesystem reach, would silently delete that workflow's deny list.

Two consequences are worth knowing. First, relative `allowedPaths` entries need different resolution bases depending on their source — a workflow's `../shared` resolves against the workflow directory, a project's `./vendor` against the project root — so paths are made absolute *before* the union; a merged list has no way to recover which base an entry needed. This is why `PermissionSource` carries its own `base`. Second, auto-approvals leak across contexts: a project allowing `Bash(npm:*)` auto-approves it on every workflow, and the only remedy is a deny, because Claude Code offers no way to express "make this ask again."

The cost of over-restriction differs sharply between the two runtime kinds. A ticket runtime is an interactive PTY, so a non-approved tool prompts, the `permission_prompt` hook fires, and the console moves to `awaiting-user` — recoverable. A prompt run uses `--print`, where nothing can answer, so the call is refused outright. Prompts are the case where `allowedTools` is load-bearing rather than merely convenient.

Provenance survives resolution: each effective entry carries the origins that contributed it, which powers `GET /api/tickets/:workflowName/:filename/permissions`. That endpoint calls the same `resolvePermissions` the supervisor calls, deliberately — a preview computed by a parallel implementation would eventually disagree with what actually spawns.

## Watcher interaction

Adding a `projects/` directory to the workspace exposed a latent bug in `src/server/watcher.ts`. Its path classifier used to end with a generic fallthrough treating any `<dir>/<file>` as a board change, so `projects/meeseeks.yaml` broadcast a `board-changed` event for a nonexistent board with the id `projects`. The immediate fix was ordering — test the projects branch *before* the fallthrough — but that only held as long as nobody added another top-level directory.

The collapse removed the fallthrough outright instead. Every classified path now lives under `workflows/`, so the classifier returns early on anything else rather than guessing, and the class of bug is gone rather than avoided. This is worth noting because the ordering constraint it replaced was invisible from the code: nothing marked the last branch as a catch-all.

A related trap affects tests rather than production: the watcher runs with `usePolling` and `ignoreInitial`, so a file created while chokidar's initial scan is still in progress is classified as pre-existing and silently skipped. Watcher tests must let the scan settle before mutating the tree, otherwise they fail in a way that looks like a broken classifier.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `idea.md` |
| 2026-04-26 | First Slice Design §4 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-06-08 | `src/storage/project.ts`, `src/server/routes/projects.ts`, `src/web/components/PromptsEditor.tsx`, `src/web/routes/TicketRoute.tsx` |
| 2026-08-12 | Workspace/Project Decoupling Design (`docs/superpowers/specs/2026-08-12-workspace-project-decoupling-design.md`) |
| 2026-08-12 | `src/storage/workspace.ts`, `src/storage/project.ts`, `src/server/routes/projects.ts`, `src/server/watcher.ts`, `src/shared/types.ts` |