# Server

The server layer exposes the [Storage](storage.md) operations via a Fastify REST API and manages WebSocket connections for real-time state synchronization.

## Components

### REST API

All endpoints are under `/api`, accepting and returning JSON. Errors follow `{ error: { code, message } }` envelope format. Key route modules:

- `src/server/routes/projects.ts` — `GET /projects/recent`, `POST /projects/open`, `DELETE /projects`, `POST /projects`, `GET /projects`
- `src/server/routes/boards.ts` — `GET /boards`, `POST /boards`, `GET /boards/:id`, `PATCH /boards/:id`, `DELETE /boards/:id`
- `src/server/routes/lanes.ts` — `POST /boards/:boardId/lanes`, `GET /boards/:boardId/lanes/:laneId`, `PATCH /boards/:boardId/lanes/:laneId`, `DELETE /boards/:boardId/lanes/:laneId`
- `src/server/routes/tickets.ts` — `GET /boards/:boardId/lanes/:laneId/tickets`, `POST /boards/:boardId/lanes/:laneId/tickets`, `GET /boards/:boardId/lanes/:laneId/tickets/:ticketId`, `PATCH /boards/:boardId/lanes/:laneId/tickets/:ticketId`, `DELETE /boards/:boardId/lanes/:laneId/tickets/:ticketId`
- `src/server/routes/runtimes.ts` — `GET /runtimes`, `POST /boards/:boardId/lanes/:laneId/tickets/:ticketId/runtime`, `DELETE /runtimes/:id`, `GET /runtimes/:id/snapshot`, plus the internal `GET /internal/runtime/:id/notify` endpoint that hooks call to signal `idle`/`awaiting-user`
- `src/server/routes/prompts.ts` — board-scoped prompt CRUD plus run + logs for [one-shot prompts](../concepts/one-shot-prompts.md): `GET/PUT/DELETE /boards/:boardId/prompts/:name`, `GET /boards/:boardId/prompts`, `POST /boards/:boardId/prompts/:name/run`, `GET /boards/:boardId/prompts/:name/logs`. The run handler attaches per-request supervisor listeners that accumulate `runtime-message` text and append a JSONL entry on terminal status
- `src/server/routes/files.ts` — generic namespaced file API for `.claude/` subtrees: `GET /boards/:boardId/files/:namespace`, `GET/POST/PATCH/DELETE /boards/:boardId/files/:namespace/*`. Currently only the `skills` and `bin` namespaces are exposed (`hooks` and `prompts` namespaces are reserved in `NAMESPACE_DIRS` but not yet allow-listed; one-shot prompts use a dedicated route under `<board>/prompts/`, not the `.claude/prompts` namespace)

Routes broadcast WebSocket events on mutations (create, update, delete) via the WsHub.

### WebSocket Hub

`src/server/ws.ts` implements `WsHub`, a class that manages connected clients and broadcasts state changes. The endpoint is at `/ws`; on connect, `registerWs` immediately replays all active runtimes by sending a `runtime-spawned` event for each so a freshly connected client sees the full current state. `WsHub` maintains a `Set<WebSocket>` and broadcasts JSON-serialized events to every socket whose `readyState === OPEN`.

### Server State

`src/server/state.ts` exports `ServerState` class managing the open project's lifecycle — opening, closing, and status queries.

## Entry Point

`src/server/index.ts:main` initializes Fastify, registers all routes and the WebSocket handler, optionally opens a project from CLI argument, and starts listening on a configured port.

## Startup

The server runs via `npm run dev:server` (or `npm run dev` to run both server and web UI concurrently). It accepts a project path as a CLI argument to immediately open on startup: `npm run dev:server -- ./my-project`. See the [Project Setup](../runbooks/project-setup.md) runbook for full command details.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `src/server` |
| 2026-04-26 | `src/server/routes` |
| 2026-04-26 | First Slice Design §5 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-04-26 | First Slice Design §6 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-05-03 | `src/server/routes/prompts.ts`, `src/server/routes/files.ts`, `src/server/routes/runtimes.ts` |