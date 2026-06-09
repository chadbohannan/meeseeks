# Storage

The storage layer provides pure filesystem operations for all data persistence in Meeseeks. It handles the four-level hierarchy described in the [Project Model](../concepts/project-model.md) — projects, boards, lanes, and tickets — as structured files on disk, with YAML for configuration and Markdown for ticket content.

## Directory Structure

Each entity type lives in its own directory with associated config files:

- **Project root**: `project.yaml` (YAML config; legacy `project.meeseeks` accepted as fallback)
- **Board**: `board.yaml` (runtime settings, allowed paths)
- **Lane**: `lane.yaml` (state ordering), state directories (todo, in-progress, done)

Tickets are stored as Markdown files within lane state directories.

## Key Modules

- `src/storage/project.ts` — project metadata read/write, `project.yaml` serialization
- `src/storage/board.ts` — board creation, `board.yaml` defaults, `DEFAULT_BOARD_YAML` factory
- `src/storage/lane.ts` — lane CRUD, `lane.yaml` state management, `readLaneStates`, `updateLaneStates`
- `src/storage/templates.ts` — onboarding scaffolding (see [Onboarding Defaults](#onboarding-defaults)): the board CONTEXT.md skeleton, the seeded Development lane definition, and the state-aware PROCESS.md generator
- `src/storage/ticket.ts` — ticket creation, frontmatter parsing, state moves, `readStates`
- `src/storage/paths.ts` — `resolveWithin` for path traversal safety, `slugifyBoardPath`, `buildTicketFilename`, `buildPromptFilename`
- `src/storage/prompts.ts` — board-scoped one-shot prompt files under `<board>/prompts/*.md` plus an append-only JSONL run log under `<board>/prompts/.logs/<slug>/runs.jsonl`. See [One-Shot Prompts](../concepts/one-shot-prompts.md) for the lifecycle this storage backs.
- `src/storage/files.ts` — generic namespaced file CRUD used by the [generic file routes](server.md) for `.claude/skills` and `.claude/bin` content. Supports nested file paths under each namespace with traversal safety.

## Error Handling

Custom typed errors in `src/storage/errors.ts` provide predictable failure modes:

- `NotFoundError` — requested entity doesn't exist
- `ConflictError` — resource already exists  
- `InvalidInputError` — input fails validation
- `PathSafetyError` — path escapes project boundary (code: `PATH_UNSAFE`)
- `ProjectNotOpenError` — operation requires open project

The `StorageErrorCode` discriminated union (`'NOT_FOUND' | 'CONFLICT' | 'INVALID_INPUT' | 'PATH_UNSAFE' | 'INVALID_LANE' | 'PROJECT_NOT_OPEN'`) types all error codes as string literals for exhaustive handling. Each error class extends `StorageError` and fixes its code: `NotFoundError` always carries `'NOT_FOUND'`, `ConflictError` carries `'CONFLICT'`, and so on. `InvalidLaneError` additionally exposes a `reason` field for validation detail.

## Ticket Filenames

Tickets follow the pattern `YYYY-MM-DDTHHmm-<slug>.md` with a base36 suffix appended on collision. Stable references use `<boardId>/<laneName>/filename` format, omitting the state folder.

## Frontmatter Tolerance and Folder-Authoritative State

Tickets are co-edited by Meeseeks, by the user's text editor, and by supervised agents that may rewrite frontmatter aggressively. `parse` in `ticket.ts` tolerates malformed or missing frontmatter rather than throwing: an unparseable YAML block, or one missing `title`, falls back to a title derived from the filename (stripping the `YYYY-MM-DDTHHmm-` prefix) and synthetic `created`/`updated` timestamps. `listTickets` consequently surfaces every `.md` file in a state directory regardless of its frontmatter shape, and folder placement — not a `status:` field — is the sole authority for which lane state a ticket belongs to.

Unknown frontmatter keys are preserved across updates. `parse` partitions data into the known fields (`title`, `created`, `updated`, `color`) and an `extra` map; `serialize` writes `extra` back ahead of the known keys, so JIRA URLs, assignees, priorities, or any other fields an external agent has added survive an in-app edit. `updateTicket` additionally re-parses its own serialized output and returns the normalized body in the response so callers can compare it against subsequent reads — see the [focus-gated editor pattern](../concepts/focus-gated-editor.md) for why this matters when the same file is being rewritten by the [filesystem watcher](server.md).

## Required vs Optional Files

The only mandatory files are `project.yaml`, `lane.yaml`, and lane state folders. Missing optional files like `board.yaml` or `permissions.yaml` cause the system to fall back to defined defaults.

## Onboarding Defaults

A freshly created board no longer arrives blank. `createBoard` writes a structured CONTEXT.md (from `boardContextTemplate` in `templates.ts`) that explains the file-as-state model and prompts the user for the context worth supplying, then seeds a ready-to-use **Development** lane (states `todo → in-progress → review → done`) through the normal `createLane` path. The seeded lane carries a filled-in PROCESS.md; `createLane` accepts an optional `processDoc` override for exactly this purpose. When a user adds their own lane, `createLane` falls back to `laneProcessTemplate`, which generates a "first action" preamble plus one fill-in section per state the user defined — replacing the former single-line stub. The templates are deliberately generic: org-specific machinery (JIRA proxy frontmatter, `.claude/bin` discipline, code-rag globs) seen on the mature boards in this repo is left for users to add rather than baked in. See the [design spec](../../../docs/superpowers/specs/2026-06-09-onboarding-defaults-design.md) for the rationale and the conventions it was extrapolated from.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | Storage and Server Implementation Plan (`docs/superpowers/plans/2026-04-26-storage-and-server.md`) |
| 2026-04-26 | First Slice Design §4 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-04-26 | `src/storage` |
| 2026-05-03 | `src/storage/prompts.ts`, `src/storage/files.ts`, `src/storage/paths.ts` |
| 2026-05-19 | `src/storage/ticket.ts`, `tests/storage/ticket.test.ts` |
| 2026-06-09 | `src/storage/templates.ts`, `src/storage/board.ts`, `src/storage/lane.ts` (onboarding defaults) |