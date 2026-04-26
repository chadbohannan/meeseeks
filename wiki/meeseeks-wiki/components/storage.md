# Storage

The storage layer provides pure filesystem operations for all data persistence in Meeseeks. It handles projects, boards, lanes, and tickets as structured files on disk, with YAML for configuration and Markdown for ticket content.

## Directory Structure

Each entity type lives in its own directory with associated config files:

- **Project root**: `project.meeseeks` (YAML config)
- **Board**: `board.yaml` (runtime settings, allowed paths)
- **Lane**: `lane.yaml` (state ordering), state directories (todo, in-progress, done)

Tickets are stored as Markdown files within lane state directories.

## Key Modules

- `src/storage/project.ts` — project metadata read/write, `project.meeseeks` serialization
- `src/storage/board.ts` — board creation, `board.yaml` defaults, `DEFAULT_BOARD_YAML` factory
- `src/storage/lane.ts` — lane CRUD, `lane.yaml` state management, `readLaneStates`, `updateLaneStates`
- `src/storage/ticket.ts` — ticket creation, frontmatter parsing, state moves, `readStates`
- `src/storage/paths.ts` — `resolveWithin` for path traversal safety, `slugifyBoardPath`, `buildTicketFilename`

## Error Handling

Custom typed errors in `src/storage/errors.ts` provide predictable failure modes:

- `NotFoundError` — requested entity doesn't exist
- `ConflictError` — resource already exists  
- `InvalidInputError` — input fails validation
- `PathSafetyError` — path escapes project boundary (code: `PATH_UNSAFE`)
- `ProjectNotOpenError` — operation requires open project

The `StorageErrorCode` discriminated union types all error codes as string literals for exhaustive handling.

## Ticket Filenames

Tickets follow the pattern `YYYY-MM-DDTHHmm-<slug>.md` with a base36 suffix appended on collision. Stable references use `<boardId>/<laneName>/filename` format, omitting the state folder.

## Required vs Optional Files

The only mandatory files are `project.meeseeks`, `lane.yaml`, and lane state folders. Missing optional files like `board.yaml` or `permissions.yaml` cause the system to fall back to defined defaults.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | [Storage and Server Implementation Plan](code-rag:meeseeks/docs/superpowers/plans/2026-04-26-storage-and-server.md:Storage and Server Implementation Plan:Task 8: Lane CRUD with `lane.yaml`) |
| 2026-04-26 | [First Slice Design §4](code-rag:meeseeks/docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md:Meeseeks — First Slice Design: Storage, Server, UI, and Runtimes:4. Filesystem data model) |
| 2026-04-26 | [`src/storage`](code-rag:meeseeks/src/storage) |