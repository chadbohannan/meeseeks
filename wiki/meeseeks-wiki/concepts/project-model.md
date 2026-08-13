# Project Model

Meeseeks organizes work in a four-level hierarchy: Workspace → Board → Lane → Ticket, with Projects as a cross-cutting fifth concept selectable per ticket.

> **In flight (2026-08-12):** the term *project* is being split in two. The top-level container described below is now called a **Workspace**, and *Project* is being reclaimed for a selectable per-codebase configuration so that one Development or Incident Response board can serve many codebases. The [workspace/project decoupling design](../../../docs/superpowers/specs/2026-08-12-workspace-project-decoupling-design.md) records the full plan; phases 1 and 2 have landed and are described here. Phases 3–5 (ticket binding, UI, migration) are not yet implemented.

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

## Permissions

`permissions.yaml` in lane directories controls what an agent can do. Allowed paths generate `--add-dir` flags, and allowed/denied tools generate a JSON settings file. Because both lanes and projects now carry permission blocks, `PermissionsConfig` moved from `src/runtime/types.ts` to `src/shared/types.ts` — storage owns reading these configs and may not import from `runtime/`, so the type had to live somewhere both layers can reach. The design's forthcoming union-with-deny-wins resolution across the two sources is described in the [decoupling spec](../../../docs/superpowers/specs/2026-08-12-workspace-project-decoupling-design.md); until phase 3 lands, only lane permissions reach a spawn.

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