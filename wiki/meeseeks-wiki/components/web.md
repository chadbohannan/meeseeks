# Web UI

The Meeseeks web app is a Vite + React + TypeScript single-page application living in `src/web/`. It consumes the [server's](server.md) REST API and subscribes to its WebSocket hub for live updates. The build emits `dist/web/`, which the same Fastify process serves statically in production with SPA fallback — there is no separate web server.

## Run modes

In development, `npm run dev` runs Vite on `:5173` and Fastify on `:5174` concurrently; Vite proxies `/api` and `/ws` to Fastify so the SPA can use relative URLs in both modes. In production, `npm run build` produces both `dist/server` and `dist/web`, then `npm start` serves the SPA from Fastify itself. The static handler is registered only when `dist/web` exists, so dev mode (where it doesn't) skips it cleanly.

## Module layout

The `src/web/` tree is organized by responsibility rather than by route:

- `lib/api.ts` — typed `fetch` wrapper. One method per endpoint, sharing request/response types from `src/shared/api.ts`. All thrown errors carry the server's `code` and `message` so callers can show toasts directly.
- `lib/ws.ts` — `WsClient` class with auto-reconnect (exponential backoff to 8s) and a fan-out subscription model. A module-level singleton in `hooks/use-ws.ts` ensures one connection per browser tab.
- `hooks/queries.ts` — React Query hooks. Each query keys on its scope (`['board', boardId]`, `['tickets', boardId, laneName]`, etc.) so the WebSocket invalidator can be precise.
- `hooks/use-ws.ts` — installs a subscription on mount and translates each `WsEvent` into targeted `queryClient.invalidateQueries` calls. `project-opened` and `project-closed` invalidate everything; the others invalidate just their scope.
- `routes/` — one file per route. Picker (`/`), boards list (`/boards`), board Kanban (`/boards/:boardId`), ticket detail (`/boards/:boardId/lanes/:laneName/tickets/:filename`).
- `components/` — `AppShell` (top bar with project name + close button), modals (`NewProjectModal`, `NewBoardModal`, `NewLaneModal`), `Kanban`, `TicketCard`, `Modal`, `ErrorBoundary`.
- `store/ui.ts` — a tiny Zustand store for transient UI state (currently just the selected lane on the board route).

## State boundaries

Server state lives entirely in React Query, keyed by scope. Mutations invalidate their own scope on success; the WebSocket invalidator covers everything else, including changes made by other clients or by edits to the filesystem outside the app. Toasts surface errors via `sonner`. UI state — currently just the selected lane — lives in Zustand and does not sync across tabs.

The Kanban view groups tickets into columns by `state.dir` in the order given by `lane.yaml` (which the server returns via `LaneDetail.states`). An "Orphaned" column appears only when at least one ticket has `orphaned === true`, surfacing tickets whose state directory was renamed or removed.

## Scope and deferrals

This slice deliberately omits drag-and-drop (state changes are made via the dropdown on the ticket detail page), rich markdown editing (the body editor is a plain textarea), and any UI tests. The storage and server design spec records these as future work alongside the runtime supervisor and [console UI](console.md) from subsystem 5.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/plans/2026-04-26-web-ui.md` |
| 2026-04-26 | `src/web/` |
