# Server

The server layer exposes the [Storage](storage.md) operations via a Fastify REST API and manages WebSocket connections for real-time state synchronization.

## Components

### REST API

All endpoints are under `/api`, accepting and returning JSON. Errors follow `{ error: { code, message } }` envelope format. Key route modules:

- `src/server/routes/workspace.ts` — `GET /api/workspace`, `GET /api/models`
- `src/server/routes/workflows.ts` — `GET /api/workflows`, `POST /api/workflows`, `GET/PATCH/DELETE /api/workflows/:workflowName`
- `src/server/routes/projects.ts` — `GET /api/projects`, `POST /api/projects`, `GET/PATCH/DELETE /api/projects/:projectId`, plus `POST /api/projects/detect`, which inspects a codebase root and returns proposals without writing anything (see [Onboarding Seeding](../concepts/onboarding-seeding.md))
- `src/server/routes/tickets.ts` — `GET/POST /api/workflows/:workflowName/tickets`, `GET/PATCH/DELETE /api/tickets/:workflowName/:filename`
- `src/server/routes/runtimes.ts` — `GET /api/runtimes`, `POST /api/tickets/:workflowName/:filename/runtime`, `DELETE /api/runtimes/:id`, `GET /api/runtimes/:id/snapshot`, `GET /api/tickets/:workflowName/:filename/permissions` (the effective policy a spawn would use, resolved by the same code the supervisor calls), plus the internal `GET /internal/runtime/:id/notify` endpoint that hooks call to signal `idle`/`awaiting-user`
- `src/server/routes/prompts.ts` — workspace-scoped prompt CRUD plus run + logs for [one-shot prompts](../concepts/one-shot-prompts.md): `GET/PUT/DELETE /api/prompts/:name`, `GET /api/prompts`, `POST /api/prompts/:name/run`, `GET /api/prompts/:name/logs`. The run handler attaches per-request supervisor listeners that accumulate `runtime-message` text and append a JSONL entry on terminal status
- `src/server/routes/files.ts` — generic namespaced file API for `.claude/` subtrees: `GET /api/files/:namespace`, `GET/POST/PATCH/DELETE /api/files/:namespace/*`. Currently only the `skills` and `bin` namespaces are exposed (`hooks` and `prompts` are reserved in `NAMESPACE_DIRS` but not allow-listed; one-shot prompts use the dedicated route above against `<workspace>/prompts/`, not the `.claude/prompts` namespace)

Ticket and runtime paths lead with the resource rather than nesting under the
workflow because a ticket is addressed by workflow *and* filename, and the
workflow collapse removed the board segment that made a nested form read
naturally.

Routes broadcast WebSocket events on mutations (create, update, delete) via the WsHub.

### WebSocket Hub

`src/server/ws.ts` implements `WsHub`, a class that manages connected clients and broadcasts state changes. The endpoint is at `/ws`; on connect, `registerWs` immediately replays all active runtimes by sending a `runtime-spawned` event for each so a freshly connected client sees the full current state. `WsHub` maintains a `Set<WebSocket>` and broadcasts JSON-serialized events to every socket whose `readyState === OPEN`.

### Server State

`src/server/state.ts` exports the `ServerState` class. It holds the one open workspace's `WorkspaceMeta`, owns the `RuntimeSupervisor`, and on `shutdown` terminates every runtime and stops the filesystem watcher. There is no open/close cycle: the workspace is resolved once at startup and lives for the process, which is what `require()` and `peek()` returning the same state records.

## Entry Point

`src/server/index.ts:main` resolves the workspace directory (CLI argument, else the XDG default), calls `openWorkspace` to create and seed it if this is first contact, starts the filesystem watcher, then initializes Fastify, registers all routes and the WebSocket handler, and listens on the configured port.

## Startup

The server runs via `npm run dev:server` (or `npm run dev` to run both server and web UI concurrently). It accepts a workspace path as a CLI argument: `npm run dev:server -- ./my-workspace`. An explicit path must already exist; only the XDG default is created for you. See the [Workspace Setup](../runbooks/project-setup.md) runbook for full command details.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `src/server` |
| 2026-04-26 | `src/server/routes` |
| 2026-04-26 | First Slice Design §5 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-04-26 | First Slice Design §6 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-05-03 | `src/server/routes/prompts.ts`, `src/server/routes/files.ts`, `src/server/routes/runtimes.ts` |
| 2026-08-23 | `src/server/routes` after the workspace/workflow rename, `src/server/state.ts`, `src/server/index.ts` |
