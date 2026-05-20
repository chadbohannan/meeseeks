# Web UI

The Meeseeks web app is a Vite + React + TypeScript single-page application living in `src/web/`. It consumes the [server's](server.md) REST API and subscribes to its WebSocket hub for live updates. The build emits `dist/web/`, which the same Fastify process serves statically in production with SPA fallback — there is no separate web server.

## Run modes

In development, `npm run dev` runs Vite on `:5173` and Fastify on `:5174` concurrently; Vite proxies `/api` and `/ws` to Fastify so the SPA can use relative URLs in both modes. In production, `npm run build` produces both `dist/server` and `dist/web`, then `npm start` serves the SPA from Fastify itself. The static handler is registered only when `dist/web` exists, so dev mode (where it doesn't) skips it cleanly.

## Module layout

The `src/web/` tree is organized by responsibility rather than by route:

- `lib/api.ts` — typed `fetch` wrapper. One method per endpoint, sharing request/response types from `src/shared/api.ts`. All thrown errors carry the server's `code` and `message` so callers can show toasts directly.
- `lib/ws.ts` — `WsClient` class with auto-reconnect (exponential backoff to 8s) and a fan-out subscription model. A module-level singleton in `hooks/use-ws.ts` ensures one connection per browser tab.
- `hooks/queries.ts` — React Query hooks. Each query keys on its scope (`['board', boardId]`, `['tickets', boardId, laneName]`, etc.) so the WebSocket invalidator can be precise.
- `hooks/use-ws.ts` — installs a subscription on mount and translates each `WsEvent` into targeted `queryClient.invalidateQueries` calls. Board, lane, and ticket change events invalidate just their scope.
- `routes/` — one file per route. Root (`/`) redirects to `/boards`; boards list (`/boards`), board Kanban (`/boards/:boardId`), board editor (`/boards/:boardId/edit`), ticket detail (`/boards/:boardId/lanes/:laneName/tickets/:filename`). The Board Editor route hosts a left-rail navigation that switches the right pane between One-Shot Prompts, CONTEXT.md, `.claude/skills`, `.claude/bin`, and per-lane configuration.
- `components/` — `AppShell` (top bar with project name and the [Dock](console.md)), `MarkdownEditor` (real markdown editor — replaced the earlier plain textarea), `SkillsEditor` and `BinEditor` (file-list + editor over the [generic file API](server.md)), `PromptsEditor` (markdown editor + run-log tab for [one-shot prompts](../concepts/one-shot-prompts.md)), modals (`NewBoardModal`, `NewLaneModal`, `PromptRunModal`), `Kanban`, `TicketCard`, `Modal`, `ErrorBoundary`.
- `store/ui.ts` — a tiny Zustand store for transient UI state (currently just the selected lane on the board route). `store/runtimes.ts` mirrors the supervisor's runtime registry and `store/prompts.ts` accumulates streaming output for one-shot prompt runs keyed by `runtimeId`.

## State boundaries

Server state lives entirely in React Query, keyed by scope. Mutations invalidate their own scope on success; the WebSocket invalidator covers everything else, including changes made by other clients or by edits to the filesystem outside the app. Toasts surface errors via `sonner`. UI state — currently just the selected lane — lives in Zustand and does not sync across tabs.

The Kanban view groups tickets into columns by `state.dir` in the order given by `lane.yaml` (which the server returns via `LaneDetail.states`). An "Orphaned" column appears only when at least one ticket has `orphaned === true`, surfacing tickets whose state directory was renamed or removed.

## Scope and deferrals

The Kanban now supports drag-and-drop between state columns — `TicketCard` is `draggable` and each column registers `onDragOver`/`onDrop` handlers in `Kanban.tsx`, with the active drop target highlighted. The plain-textarea ticket body has been replaced by `MarkdownEditor`, used by ticket bodies, board CONTEXT.md, lane PROCESS.md, skills files, and one-shot prompts. To stop server-driven refetches from clobbering in-progress typing, the ticket body editor and the `FocusGatedMarkdownEditor` wrapper used for CONTEXT.md and PROCESS.md follow the [focus-gated editor pattern](../concepts/focus-gated-editor.md): local state is authoritative while focused or dirty, external edits are adopted on the next clean snapshot rather than blocked permanently, and `MarkdownEditor` exposes the contenteditable's focus transitions through native `focusin`/`focusout` listeners since React's synthetic focus events don't track Milkdown's Crepe surface reliably. UI tests remain deferred.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/plans/2026-04-26-web-ui.md` |
| 2026-04-26 | `src/web/` |
| 2026-05-03 | `src/web/components/{PromptsEditor,SkillsEditor,BinEditor,MarkdownEditor,Kanban}.tsx`, `routes/BoardEditorRoute.tsx`, `store/prompts.ts` |
| 2026-05-19 | `src/web/components/MarkdownEditor.tsx`, `src/web/routes/{TicketRoute,BoardEditorRoute}.tsx` |
