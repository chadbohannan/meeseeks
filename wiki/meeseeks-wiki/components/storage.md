# Storage

The storage layer provides pure filesystem operations for all data persistence in Meeseeks. It handles the model described in [Project Model](../concepts/project-model.md) — a workspace holding workflows, tickets, and project registrations — as structured files on disk, with YAML for configuration and Markdown for ticket content.

## Directory Structure

Each entity type lives in its own directory with associated config files:

- **Workspace root**: `workspace.yaml` (name, `workflows:` and `projects:` registries, optional `models:` and default `runtime:`)
- **Workflow**: a directory holding `workflow.yaml` (state ordering, optional `runtime:`), `PROCESS.md`, optional `permissions.yaml`, and one directory per state
- **Project**: `projects/<slug>.yaml` — a codebase registration whose `root` points *outside* the workspace, with optional `color`, `context`/`contextFile`, and `permissions`

Tickets are Markdown files inside a workflow's state directories. A workflow's
registry entry may be absolute, so a workflow need not live under
`<workspace>/workflows/`.

## Key Modules

- `src/storage/workspace.ts` — `workspace.yaml` read/write and the registry mutators. `readWorkspace` is a pure read and throws `NotFoundError` on a directory with no config
- `src/storage/open.ts` — `openWorkspace`: the one seam that creates and seeds a workspace, called at server startup. Kept out of `workspace.ts` so the read path has no side effect and the `workspace -> seed -> workflow` cycle does not close
- `src/storage/seed.ts` — `ensureWorkspaceSeeded`, idempotent via the registry rather than a flag
- `src/storage/workflow.ts` — workflow CRUD, `workflow.yaml` state management, `resolveWorkflowPath` (registry lookup, not a path join), and runtime resolution against the workspace default
- `src/storage/project.ts` — project config CRUD under `projects/`, including the deliberate exemption of `root` from `resolveWithin`
- `src/storage/detect.ts` — `detectProjectDefaults`: reads a codebase root and returns reviewable `Detection` proposals. Writes nothing, to either the config or the repository it inspects
- `src/storage/templates.ts` — onboarding scaffolding (see [Onboarding Seeding](../concepts/onboarding-seeding.md)): the starter Development workflow, its PROCESS.md, the state-aware PROCESS.md generator, and `STARTER_PERMISSIONS` with its `{root}` placeholder
- `src/storage/migrate.ts` — the board-era migration, driven by `scripts/migrate.ts`. See [Board-to-Workflow Migration](../runbooks/board-to-workflow-migration.md)
- `src/storage/ticket.ts` — ticket creation, frontmatter parsing, state moves, `readStates`
- `src/storage/paths.ts` — `resolveWithin` for path traversal safety, `expandHome`, `slugifyWorkflowPath`, `slugifyProjectPath`, `buildTicketFilename`, `buildPromptFilename`
- `src/storage/io.ts` — the two helpers every module above needs: `exists` and `dumpYaml`. `dumpYaml` centralizes `lineWidth: -1`, which is load-bearing rather than cosmetic — these files are meant to be hand-edited, and folding turns a long path into a `>-` block scalar
- `src/storage/prompts.ts` — workspace-scoped one-shot prompt files under `<workspace>/prompts/*.md` plus an append-only JSONL run log under `<workspace>/prompts/.logs/<slug>/runs.jsonl`. See [One-Shot Prompts](../concepts/one-shot-prompts.md) for the lifecycle this storage backs.
- `src/storage/files.ts` — generic namespaced file CRUD used by the [generic file routes](server.md) for `.claude/skills` and `.claude/bin` content. Supports nested file paths under each namespace with traversal safety.

## Error Handling

Custom typed errors in `src/storage/errors.ts` provide predictable failure modes:

- `NotFoundError` — requested entity doesn't exist
- `ConflictError` — resource already exists  
- `InvalidInputError` — input fails validation
- `PathSafetyError` — path escapes project boundary (code: `PATH_UNSAFE`)
- `InvalidWorkflowError` — workflow structure fails validation; also carries a `reason` field
- `ProjectNotOpenError` — operation requires an open workspace

The `StorageErrorCode` discriminated union (`'NOT_FOUND' | 'CONFLICT' | 'INVALID_INPUT' | 'PATH_UNSAFE' | 'INVALID_WORKFLOW' | 'PROJECT_NOT_OPEN'`) types all error codes as string literals for exhaustive handling. Each error class extends `StorageError` and fixes its code: `NotFoundError` always carries `'NOT_FOUND'`, `ConflictError` carries `'CONFLICT'`, and so on.

## Ticket Filenames

Tickets follow the pattern `YYYY-MM-DDTHHmm-<slug>.md` with a base36 suffix appended on collision. Stable references use `<workflowName>/<filename>` format, omitting the state folder — which is what lets a ticket move between states without any reference to it going stale.

## Frontmatter Tolerance and Folder-Authoritative State

Tickets are co-edited by Meeseeks, by the user's text editor, and by supervised agents that may rewrite frontmatter aggressively. `parse` in `ticket.ts` tolerates malformed or missing frontmatter rather than throwing: an unparseable YAML block, or one missing `title`, falls back to a title derived from the filename (stripping the `YYYY-MM-DDTHHmm-` prefix) and synthetic `created`/`updated` timestamps. `listTickets` consequently surfaces every `.md` file in a state directory regardless of its frontmatter shape, and folder placement — not a `status:` field — is the sole authority for which workflow state a ticket belongs to.

Unknown frontmatter keys are preserved across updates. `parse` partitions data into the known fields (`title`, `created`, `updated`, `color`) and an `extra` map; `serialize` writes `extra` back ahead of the known keys, so JIRA URLs, assignees, priorities, or any other fields an external agent has added survive an in-app edit. `updateTicket` additionally re-parses its own serialized output and returns the normalized body in the response so callers can compare it against subsequent reads — see the [focus-gated editor pattern](../concepts/focus-gated-editor.md) for why this matters when the same file is being rewritten by the [filesystem watcher](server.md).

## Required vs Optional Files

The only mandatory files are `workspace.yaml`, each workflow's `workflow.yaml`, and its state folders. Missing optional files — `permissions.yaml`, `PROCESS.md`, a workflow-level `runtime:` — fall back to defined defaults or to the workspace level.

## Onboarding Defaults

Neither a fresh workspace nor a fresh project arrives blank. `openWorkspace`
seeds a first workspace with a ready-to-use **Development** workflow through the
normal `createWorkflow` path, carrying a filled-in PROCESS.md; a user-created
workflow instead gets `workflowProcessTemplate`, which generates a "first
action" preamble plus one fill-in section per state they defined. Registering a
project applies `starterPermissions`, which grants read-only access to that
root and nothing else — read access and write access are different decisions,
and registering a codebase implies only the first.

The templates are deliberately generic: org-specific machinery (JIRA proxy
frontmatter, `.claude/bin` discipline, code-rag globs) seen on the mature
workflows in this repo is left for users to add rather than baked in. See
[Onboarding Seeding](../concepts/onboarding-seeding.md) for the seam and its
constraints, and the [design spec](../../../docs/superpowers/specs/2026-08-14-onboarding-seeding-design.md)
for the workspace audit behind the starter set.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | Storage and Server Implementation Plan (`docs/superpowers/plans/2026-04-26-storage-and-server.md`) |
| 2026-04-26 | First Slice Design §4 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-04-26 | `src/storage` |
| 2026-05-03 | `src/storage/prompts.ts`, `src/storage/files.ts`, `src/storage/paths.ts` |
| 2026-05-19 | `src/storage/ticket.ts`, `tests/storage/ticket.test.ts` |
| 2026-06-09 | `src/storage/templates.ts`, `src/storage/board.ts`, `src/storage/lane.ts` (onboarding defaults) |
| 2026-08-23 | `src/storage` after the workspace/workflow collapse: `workspace.ts`, `open.ts`, `seed.ts`, `workflow.ts`, `project.ts`, `detect.ts`, `migrate.ts`, `io.ts` |
