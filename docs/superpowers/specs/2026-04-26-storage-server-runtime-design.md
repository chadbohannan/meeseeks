# Meeseeks — First Slice Design: Storage, Server, UI, and Runtimes

**Date:** 2026-04-26
**Scope:** Subsystems 1–5 of the Meeseeks decomposition: filesystem storage, runtime supervisor, local web server, Kanban UI, and detachable console UI. Subsystem 6 (autonomous triggers, sync) is explicitly deferred.

## 1. Goals and non-goals

**Goals.** Deliver a single-process locally-hosted application that:
- Opens a Project (a folder containing a `project.meeseeks` config) and lets the user navigate Boards → Lanes → Tickets in a Kanban-style UI.
- Persists all data as markdown files and YAML configs in a folder hierarchy on disk; ticket state is encoded by which state-folder a ticket file lives in.
- Spawns Claude Code as a per-ticket Runtime, presents it as a floating xterm.js console inside the SPA, and supports the dismiss-without-kill gesture central to idea.md.
- Translates a Lane's `permissions.yaml` into Claude Code's permission configuration at spawn time so the harness enforces the allowlist.
- Surfaces Runtime lifecycle status (`starting | running | idle | terminating | exited | errored`) on the Ticket card.

**Non-goals (this slice).** Autonomous-trigger Runtimes, scheduled or webhook-triggered prompts, sync integrations, knowledge-base ingestion, drag-and-drop Kanban, rich markdown editor, theming, runtime persistence across server restart, multi-user / auth, harnesses other than Claude Code (config is designed to extend but only Claude Code is exercised).

## 2. Decomposition context

idea.md describes a system with these subsystems:
1. Storage and data model
2. Runtime supervisor
3. Web app shell
4. Kanban UI
5. Detachable console UI
6. Autonomous triggers and sync

This slice ships 1–5. Subsystem 6 is deferred because it is downstream of 2 working at all and is independently scoped.

## 3. Architecture

A single Node.js process hosts both the HTTP/WebSocket API and serves the web UI bundle. Modules:

- **`storage/`** — pure filesystem layer. No HTTP, no global state. Functions accept absolute paths and return plain data. Independently unit-testable against `fs.mkdtemp` directories.
- **`runtime/`** — Runtime supervisor. Spawns and supervises agent harness processes, holds in-memory ring buffers of stdio per Runtime, parses Claude Code's `--output-format stream-json` for lifecycle events, translates `permissions.yaml` into harness flags. No Fastify imports.
- **`server/`** — Fastify HTTP server + WebSocket hub. Wraps `storage/` and `runtime/` with a REST API, broadcasts filesystem-watcher and runtime events over WebSocket. Holds at most one open project at a time.
- **`web/`** — Vite + React + TypeScript SPA. Project picker, Kanban view, ticket detail/editor, MDI floating console panels.
- **`shared/`** — TypeScript types used by both server and web (API request/response shapes, WebSocket event shapes).

**Runtime model.** One server process. One open project at a time. Switching project closes the watcher and any active runtimes (this slice — option A from the brainstorm), then opens the new one. UI bundle is served by the same Fastify process in production.

**Stack.**
- Backend: Node.js + TypeScript, Fastify, `ws` (WebSocket), `chokidar` (filesystem watch), `node-pty` (pty for runtime console), `gray-matter` (frontmatter), `js-yaml`.
- Frontend: Vite, React, TypeScript, React Router, React Query, Zustand (small UI store), Tailwind CSS, xterm.js, sonner (toasts).
- Tests: Vitest. No Playwright in this slice.

## 4. Filesystem data model

```
my-project/                       # any folder the user picks; contains project.meeseeks
├── project.meeseeks              # YAML
└── boards/                       # default location for new boards
    └── my-board/                 # a Board (folder)
        ├── CLAUDE.md             # agent context (read by harness, untouched by Meeseeks)
        ├── board.yaml            # runtime config for this Board
        └── lanes/
            └── feature-work/     # a Lane (folder)
                ├── lane.yaml     # ordered states
                ├── PROCESS.md    # agent process doc (untouched by Meeseeks)
                ├── permissions.yaml  # path/tool allowlist consumed by runtime adapter
                ├── todo/
                │   └── 2026-04-26T1430-fix-login.md
                ├── doing/
                └── done/
```

State folder names are not numerically prefixed; `lane.yaml` is authoritative for order and display name.

### 4.1 Config files

**`project.meeseeks`**
```yaml
name: My Project
boards:
  - boards/my-board    # path relative to project file, or absolute
```

Recents and other app preferences are NOT in `project.meeseeks` (project files travel between users). Recents live in app-level config: `~/.config/meeseeks/recents.json` (XDG-style; sensible Windows/macOS fallbacks).

**`board.yaml`**
```yaml
runtime:
  harness: claude-code
  provider: anthropic       # | bedrock | vertex
  model: claude-opus-4-7
  args: []                  # extra CLI args appended to spawn
  env: {}                   # extra env vars merged into spawn env
```

**`lane.yaml`**
```yaml
states:
  - { dir: todo,  name: Todo }
  - { dir: doing, name: Doing }
  - { dir: done,  name: Done }
```

**`permissions.yaml`**
```yaml
allowedPaths:
  - ../my-repo
  - ~/notes
allowedTools:
  - Bash
  - Edit
  - Write
deniedTools: []
```

Translated at spawn into Claude Code's `--add-dir` flags and a generated session settings file containing the allow/deny rules.

### 4.2 Tickets

Markdown with YAML frontmatter:

```markdown
---
title: Fix login bug
created: 2026-04-26T14:30:00Z
updated: 2026-04-26T14:30:00Z
---
Body of the ticket as markdown.
```

**Filename convention.** `YYYY-MM-DDTHHmm-<slug>.md` (e.g. `2026-04-26T1430-fix-login.md`). On collision the suffix `-<6-char-base36>` is appended. No frontmatter `id` field is generated in this slice; we will add one only if a concrete need arises.

**Stable reference.** A ticket is referenced by `<boardId>/<laneName>/<filename>`; state folder is omitted because it changes when the ticket moves. `boardId` is a slug derived from the entry's path in `project.meeseeks` (collision-resolved by suffix).

### 4.3 Required vs. optional files

Required: `project.meeseeks`, `lane.yaml`, the lane state folders. Expected but tolerated if absent: `CLAUDE.md`, `PROCESS.md`, `board.yaml`, `permissions.yaml`. When `board.yaml` is missing, the runtime adapter uses defaults (`harness: claude-code`, provider/model from environment). When `permissions.yaml` is missing, no allowlist is passed (Claude Code's own defaults apply).

## 5. HTTP API

All paths under `/api`. JSON in/out. Errors are `{ error: { code, message } }` with codes including `PROJECT_NOT_OPEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_INPUT`, `INVALID_LANE`, `PATH_UNSAFE`, `RUNTIME_BUSY`, `HARNESS_ERROR`. HTTP status maps accordingly.

**Projects**
- `GET  /projects/recent`
- `POST /projects/open` — `{ path }`
- `POST /projects/close`
- `POST /projects/create` — `{ path, name }`
- `GET  /projects/current`

**Boards**
- `GET    /boards`
- `POST   /boards` — `{ name, path? }`
- `GET    /boards/:boardId`
- `PATCH  /boards/:boardId` — `{ name? }`
- `DELETE /boards/:boardId` — `{ deleteFiles?: boolean }` (default false: only removes from `project.meeseeks`)

**Lanes**
- `POST   /boards/:boardId/lanes` — `{ name, states: [{dir, name}] }`
- `GET    /boards/:boardId/lanes/:laneName`
- `PATCH  /boards/:boardId/lanes/:laneName` — `{ name?, states? }` (states edits handled by adding/removing/renaming/reordering folder entries)
- `DELETE /boards/:boardId/lanes/:laneName` — `{ deleteFiles?: boolean }`

**Tickets**
- `GET    /boards/:boardId/lanes/:laneName/tickets` — flat list with `{ filename, state, title, created, updated }`
- `POST   /boards/:boardId/lanes/:laneName/tickets` — `{ title, state, body? }`
- `GET    /boards/:boardId/lanes/:laneName/tickets/:filename`
- `PATCH  /boards/:boardId/lanes/:laneName/tickets/:filename` — `{ title?, body?, state? }`
- `DELETE /boards/:boardId/lanes/:laneName/tickets/:filename`

**Runtimes**
- `POST   /tickets/:boardId/:laneName/:filename/runtime` — spawn (or return existing) runtime for ticket. Returns `{ runtimeId, status }`.
- `GET    /runtimes`
- `GET    /runtimes/:id`
- `DELETE /runtimes/:id` — terminate.

## 6. WebSocket protocol

Single endpoint `/ws`. Envelope `{ type, payload }`.

**On connect:** server sends `project-opened` (with full snapshot) or `project-closed`, plus a `runtime-spawned` event for each currently active runtime so reconnecting clients hydrate state.

**Server → client:**
- `project-opened` — `{ project, boards }`
- `project-closed` — `{}`
- `board-changed` — `{ boardId, kind: 'created' | 'updated' | 'deleted' }`
- `lane-changed` — `{ boardId, laneName, kind }`
- `ticket-changed` — `{ boardId, laneName, filename, state, kind }`
- `runtime-spawned` — `{ runtimeId, ticketRef, pid, status }`
- `runtime-status` — `{ runtimeId, status, exitCode? }`
- `runtime-stdio` — `{ runtimeId, data }` (base64-encoded raw bytes)

**Client → server:**
- `runtime-input` — `{ runtimeId, data }` (base64-encoded keystrokes for the pty)

**Filesystem-event coalescing.** Watcher events are debounced ~50ms; the rename pair from a state-folder move surfaces as a single `ticket-changed` with `kind: 'updated'`.

**Self-originated changes.** When the server itself writes via API, it does not suppress the resulting watcher events. Clients are idempotent against duplicate updates and treat their own API responses as authoritative for the request they made.

## 7. Runtime supervisor

### 7.1 Lifecycle and statuses

States: `starting | running | idle | terminating | exited | errored`.

- `starting` — spawn issued, pty not yet ready, harness has not emitted its first event.
- `running` — agent is generating tokens (between user-input event and turn-end event in stream-json).
- `idle` — turn ended (stream-json result event seen); waiting for next input. This is the meaningful "ready for human" signal from idea.md.
- `terminating` — SIGTERM sent, awaiting exit.
- `exited` — process gone, exit code captured.
- `errored` — spawn failure, harness crash, or stream parse failure.

### 7.2 Spawning

Triggered by `POST /tickets/:ref/runtime`. If a Runtime already exists for the ticket and is not in a terminal state, return it. Otherwise:

1. Resolve Board, Lane, Ticket; load `board.yaml`, `lane.yaml`, `permissions.yaml`.
2. Build harness invocation via the `claude-code` adapter (Section 7.5).
3. Spawn under `node-pty` with cwd = Board path. Environment includes `MEESEEKS_TICKET_PATH`, `MEESEEKS_BOARD_PATH`, `MEESEEKS_LANE_PATH`, plus board.yaml's `env`.
4. Construct an initial prompt preamble and inject it as the first turn input (Section 7.6).
5. Begin pty stdio buffering and stream-json parsing.

### 7.3 Stdio transport

Shared WebSocket carries every Runtime's stdio multiplexed by `runtimeId`. Frames are `runtime-stdio` events with base64 raw bytes. Backpressure: server buffers up to 1 MB per runtime past a slow client and then drops oldest frames; the client xterm receives a "[output truncated]" notice when re-attaching past a drop.

Client input flows through the same WebSocket via `runtime-input`. This is the only client-initiated WebSocket message in this slice.

### 7.4 History buffer and console reattach

Each Runtime owns an in-memory ring buffer (default 2 MB raw bytes). On console (re)open, the server replays the buffer to the requesting client before the live stream resumes. This implements the dismiss-without-kill gesture: closing the console does nothing to the Runtime; reopening replays since-spawn output (subject to ring cap) plus all subsequent live frames.

### 7.5 Pty + structured-event rendering (spike)

We commit to **pty-rendered console + structured event stream for lifecycle**. The exact Claude Code flag combination that gives both a faithful TUI and parseable lifecycle events is a small implementation spike. Two candidate arrangements:

- Single pty process with `--output-format stream-json --input-format stream-json` and a small TUI re-renderer in xterm.js that interprets the JSON as a terminal stream.
- Pty-rendered Claude Code for the user-facing console plus a side channel exposing structured events (e.g. via a wrapper command or a sidecar parser).

The implementation plan begins with this spike. The design is not blocked on the choice; both options yield the same external contract (xterm.js console + lifecycle events).

### 7.6 Ticket awareness

Two channels, used together:
- **Environment variables.** `MEESEEKS_TICKET_PATH`, `MEESEEKS_BOARD_PATH`, `MEESEEKS_LANE_PATH`. Available to MCP servers and tools.
- **Initial-prompt preamble.** The first input sent to the harness is a prefixed system-style message, visible to the user in the console:
  > "You are working on ticket `<filename>` in lane `<laneName>` of board `<boardName>`. Ticket file: `<absolute path>`. Lane process doc: `<absolute path>`."

The preamble is sent automatically; the user does not need to type a first prompt. They see Claude's response and direct the agent from there.

### 7.7 Permissions translation

`permissions.yaml` is compiled into Claude Code spawn config:

- `allowedPaths` → repeated `--add-dir <path>` flags. Paths resolve relative to the Lane folder; `~` expands.
- `allowedTools` / `deniedTools` → a generated session settings file (`.meeseeks/session-<runtimeId>.json` under the Board) referenced via Claude Code's settings flag, containing rule entries like `{ "permissions": { "allow": [...], "deny": [...] } }`. Exact rule names follow Claude Code's documented schema; the adapter is the only place that knows them.

If `permissions.yaml` is absent, no `--add-dir` flags and no generated settings file are added. The translator is the seam: per-harness adapters subclass it.

### 7.8 Termination

`DELETE /runtimes/:id` sends SIGTERM, waits 5 seconds, sends SIGKILL if still alive. UI shows a confirmation modal before issuing the call. Status transitions `running|idle → terminating → exited`.

### 7.9 Restart-on-crash

None this slice. Unexpected exit transitions status to `errored`; the console panel stays open showing final output until the user dismisses it.

### 7.10 Cross-restart persistence

None this slice (option A from the brainstorm). All Runtimes are children of the Meeseeks server process and die with it. Switching projects and closing the project also terminate active Runtimes.

## 8. Web UI

**Routes.**
- `/` — Project picker. Recents list (clickable entries with availability badge) plus "Open folder" (uses File System Access API where available, falls back to a path input field) and a "New project" form.
- `/board/:boardId` — Board view. Lane selector (dropdown when multiple lanes); under it a Kanban grid with one column per state in `lane.yaml` order. Cards show title, updated timestamp, and a Runtime status dot when one is bound. Click a card → ticket route. Header has buttons for Add Lane / Edit Lane / Rename Board.
- `/board/:boardId/ticket/:filename` — Ticket detail. Title field, state dropdown, markdown body in a plain textarea (no rich editor this slice), Save and Delete buttons. State change on save invokes the move under the hood.

**Drag-and-drop is out of scope.** Moving a ticket = open it, change state dropdown, save.

**MDI console panels.** Floating draggable, resizable, minimizable panels rendered in the SPA, hosted independently of the route. xterm.js inside each panel; a dock bar at the bottom of the viewport lists all live Runtimes and their statuses. Closing a panel is the dismiss gesture; the Runtime continues. Reopening from the Ticket card replays history.

**Live updates.** A single `useWebSocket` hook subscribes to `/ws` and invalidates React Query caches based on event type/scope. Runtime stdio events route directly to the matching xterm instance.

**Errors.** API errors surface as toast notifications via `sonner`. Inline form validation for create/edit fields.

**Styling.** Tailwind CSS. Functional layout, no theming work this slice.

## 9. Repo layout

```
meeseeks/
├── package.json                  # single package, no workspaces
├── tsconfig.json                 # base
├── tsconfig.server.json          # extends; emits to dist/server
├── vite.config.ts                # builds web → dist/web; proxies /api and /ws in dev
├── src/
│   ├── server/
│   │   ├── index.ts              # Fastify entry; CLI arg parsing
│   │   ├── routes/
│   │   │   ├── projects.ts
│   │   │   ├── boards.ts
│   │   │   ├── lanes.ts
│   │   │   ├── tickets.ts
│   │   │   └── runtimes.ts
│   │   ├── ws.ts
│   │   ├── watcher.ts
│   │   └── app-config.ts         # ~/.config/meeseeks/recents.json
│   ├── storage/
│   │   ├── project.ts
│   │   ├── board.ts
│   │   ├── lane.ts
│   │   ├── ticket.ts
│   │   ├── paths.ts              # resolution + traversal safety
│   │   └── types.ts
│   ├── runtime/
│   │   ├── supervisor.ts         # spawn, terminate, lifecycle, ring buffer
│   │   ├── claude-code.ts        # adapter: argv/env/settings from board.yaml + permissions.yaml
│   │   ├── stream-parser.ts      # consumes stream-json; emits status events
│   │   └── types.ts
│   ├── shared/
│   │   ├── api.ts
│   │   └── events.ts
│   └── web/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/
│       ├── components/
│       │   └── console/          # xterm panel, MDI dock, drag/resize
│       ├── hooks/
│       │   └── use-runtime.ts
│       └── lib/                  # api client, ws client
└── tests/
    ├── storage/
    ├── server/
    └── runtime/
```

**Run modes.**
- `npm run dev` — Vite on `:5173`, Fastify on `:5174`; Vite proxies `/api` and `/ws`.
- `npm run build` — builds web to `dist/web`, server to `dist/server`.
- `npm start` — runs `dist/server/index.js`; serves `dist/web` as static.

**CLI.** `meeseeks [project-path]`. With a path, opens that project on startup. Without, starts at the picker.

## 10. Testing

Vitest, three suites:

- **`tests/storage/`** — pure FS layer against tmp directories: project/board/lane/ticket CRUD, ticket move between states, datetime filename collision handling, frontmatter round-trip, path-traversal rejection, missing/extra-files behavior.
- **`tests/server/`** — boots Fastify against a tmp project: full API contract per route, error codes, WebSocket event emission on filesystem changes (write file, assert client event within timeout), watcher debounce, runtime API endpoints exercised against a stub harness (a tiny script that emits scripted stream-json and reads stdin).
- **`tests/runtime/`** — supervisor in isolation: spawn/terminate/exit/error transitions, ring-buffer cap and replay, stream-parser turn-end detection, SIGTERM→SIGKILL escalation, `permissions.yaml` → harness-flag translation.

No web UI tests in this slice — manual testing only. Playwright is a future cycle.

## 11. Error handling and edge cases

Pure-layer functions throw typed errors (`NotFoundError`, `ConflictError`, `InvalidInputError`, `PathSafetyError`, `InvalidLaneError`, `HarnessError`). The Fastify error handler maps them to the JSON envelope. Anything else is a 500 with a generic message and a logged stack.

Specific cases the design commits to:

- **Missing `lane.yaml`** — lane returns `INVALID_LANE` with the missing-file reason; UI shows a fixable error rather than crashing.
- **State folder in `lane.yaml` but missing on disk** — auto-created on read (idempotent), so hand-edited config "just works."
- **Ticket file in a state folder not listed in `lane.yaml`** — surfaced in lane listing with `orphaned: true`; UI shows an "Unsorted" pseudo-column. Move-to-known-state resolves it.
- **Filename collision** — datetime prefix is `YYYY-MM-DDTHHmm`; on collision append `-<6-char-base36>`.
- **Project path no longer exists / unreadable** — open fails cleanly; recents entry preserved but flagged unavailable.
- **Project closed mid-request** — in-flight requests complete against captured handles; subsequent ones return `PROJECT_NOT_OPEN`.
- **External edits during a write** — last writer wins on body. For ticket moves, if source no longer exists, `NOT_FOUND` rather than silent no-op.
- **`project.meeseeks` references a missing board path** — board appears with `available: false`; opening it returns the actionable error.
- **Spawn failure (harness binary missing, env unsupported)** — runtime status `errored`; error surfaced via `runtime-status` event and a toast.
- **Runtime output during disconnected client** — buffered to ring buffer; replayed on reattach (subject to cap).
- **Removing a state from `lane.yaml` while tickets exist in it** — rejected with `CONFLICT` unless the request includes `force: true`; with force, tickets in the removed state become `orphaned: true` and surface in the "Unsorted" pseudo-column.
- **Generated session settings files** — written under `<board>/.meeseeks/` (a directory Meeseeks owns); cleaned up on Runtime exit. Added to a default `.gitignore` when a Board is created.

## 12. Out of scope (explicitly deferred)

- Subsystem 6 in full: autonomous-trigger Runtimes, schedules, webhook triggers, per-trigger locks, sync integrations, inbound triage, knowledge-base ingestion.
- Drag-and-drop Kanban, rich markdown editor, theming.
- Runtime persistence across server restart.
- Multi-user / auth / remote access.
- Per-Ticket runtime config overrides (Board-level only).
- Harnesses other than Claude Code (config shape designed to extend, not yet exercised).
- Schema migration for `project.meeseeks`, `board.yaml`, `lane.yaml`. Fields added later are defaulted on read.
