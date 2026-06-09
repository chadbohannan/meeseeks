# Project Model

Meeseeks organizes work in a four-level hierarchy: Project → Board → Lane → Ticket.

## Project

A project is the top-level container, defined by a `project.yaml` file at its root. It contains global configuration like the project name and board list. Only one project can be open at a time. Older projects may use a `project.meeseeks` file instead — the server reads this as a backwards-compatible fallback but never creates it; `project.yaml` is always the canonical name for new projects. If neither file exists in the resolved directory, the server auto-creates `project.yaml` with the directory basename as the project name.

### Selectable models

The model picker shown when starting a ticket runtime or a one-shot prompt is driven by the project, not hardcoded in the UI. The server exposes `GET /api/models`, which returns the project's model list; both the ticket view and the prompts editor fetch it through a shared `useModels` query and render whatever comes back. The list comes from an optional `models:` key in `project.yaml` (each entry a `{ value, label }` pair, where `value` is passed verbatim to `claude-code --model`). When that key is absent or contains no valid entries, the server falls back to `DEFAULT_MODELS` — the bare aliases `opus`, `sonnet`, and `haiku`. The default deliberately uses aliases rather than pinned version ids (e.g. `claude-opus-4-7`) so that a newly released model is picked up by `claude-code` without editing source; the alias-to-version resolution happens downstream in the harness, which is also why `board.yaml` now defaults its `runtime.model` to `opus`. A project that needs to pin a specific version (or expose gateway-specific ids) overrides the list in `project.yaml`. This was the motivating constraint behind the design: in a corporate setup where Claude Code authenticates through a gateway with no reusable `ANTHROPIC_API_KEY`, the live Models API (`GET /v1/models`) is unreachable, so aliases plus a config override are the practical substitute for querying Anthropic's catalog directly.

## Board

A board represents a workflow context (e.g., a feature or sprint). Each board has a `board.yaml` containing runtime settings. Boards live as directories under the project root.

## Lane

A lane represents a stage in the workflow (e.g., todo, in-progress, done). Lanes are defined in `lane.yaml` with an ordered array of states. Each state maps to a subdirectory where tickets live.

## Ticket

A ticket is a unit of work, stored as a Markdown file in a lane state directory. Ticket filenames follow `YYYY-MM-DDTHHmm-<slug>.md` pattern with base36 collision suffix.

## Permissions

`permissions.yaml` in lane directories controls what an agent can do. Allowed paths generate `--add-dir` flags, and allowed/denied tools generate a JSON settings file.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `idea.md` |
| 2026-04-26 | First Slice Design §4 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-06-08 | `src/storage/project.ts`, `src/server/routes/projects.ts`, `src/web/components/PromptsEditor.tsx`, `src/web/routes/TicketRoute.tsx` |