# Meeseeks — Project Model Simplification Design

**Date:** 2026-04-27

## Overview

Remove the project picker UI and replace it with server-side project resolution at startup. The server always has a project open; the UI always starts at the boards list. The project file is renamed from `project.meeseeks` to `project.yaml` with backwards-compatible fallback.

## Motivation

The original spec modeled project selection as a UI concern — users pick from a list of recent projects or enter a path. In practice, Meeseeks runs against a single working directory at a time, making a picker an unnecessary layer of friction. The CLI already supports a path argument; extending that to a default-to-cwd model eliminates the picker entirely.

## Scope

### In scope

- Server startup project resolution (arg → cwd → auto-create)
- `project.yaml` as the canonical filename with `project.meeseeks` fallback
- Removal of project open/close/recents API routes
- Removal of picker UI, project modals, and associated dead code
- Redirect from `/` to `/boards`

### Out of scope

- Migration tooling for renaming `project.meeseeks` files
- Multi-project support
- Any changes to boards, lanes, tickets, or runtimes

---

## Section 1: Server Startup & Project Resolution

On startup, the server resolves the project directory in this order:

1. `process.argv[2]` if provided
2. `process.cwd()` otherwise

If the resolved directory does not exist, the server exits with a clear error message and non-zero exit code.

The server then calls the updated `readProject()` which handles file discovery and auto-creation (see Section 2).

The "no project open" state is removed from `ServerState`. A project is always open after startup completes successfully. The following are deleted:

- `ServerState.open()` and `ServerState.close()` methods (replaced by constructor-time initialization)
- `project-opened` and `project-closed` WebSocket event broadcasts
- `POST /api/projects/open` route
- `POST /api/projects/close` route
- `GET /api/projects/recents` route
- `AppConfig` recents tracking (the class may be deleted entirely if recents is its only responsibility)

The `GET /api/projects/current` route is retained — clients fetch project metadata on load to display the project name in the header.

---

## Section 2: Storage Layer

`readProject(dir: string)` in `src/storage/project.ts` is updated to:

1. Check for `project.yaml` in `dir` — use it if found
2. Fall back to `project.meeseeks` — use it if found (read-only compatibility; no rename or migration)
3. If neither exists, create `project.yaml` with `{ name: path.basename(dir), boards: [] }` and return the new project metadata

`writeProject()` always writes to `project.yaml`. Existing `project.meeseeks` files are read but never written; they remain unchanged on disk until the user renames them manually.

All other storage functions operate relative to the project path and are unaffected by this change.

---

## Section 3: Web UI

### Router (`App.tsx`)

- Remove `PickerRoute` import and route
- Replace `<Route path="/" element={<PickerRoute />} />` with `<Navigate to="/boards" replace />`

### AppShell (`components/AppShell.tsx`)

- Remove the "Close" button and the `useCloseProject` hook call
- Change the "Meeseeks" logo link from `href="/"` to `href="/boards"`
- Retain the project name display (still fetched via `useCurrentProject`)

### Dead code deletion

| File | Action |
|------|--------|
| `src/web/routes/PickerRoute.tsx` | Delete |
| `src/web/components/NewProjectModal.tsx` | Delete |
| `hooks/queries.ts` — `useOpenProject` | Delete |
| `hooks/queries.ts` — `useCloseProject` | Delete |
| `hooks/queries.ts` — `useRecents` | Delete |
| `hooks/queries.ts` — `useCurrentProject` | Retain |

No changes to `BoardsRoute`, `BoardRoute`, `TicketRoute`, `Kanban`, `TicketCard`, or any console/runtime components.

---

## Data Flow After Change

```
Server starts
  └─ resolve dir (argv[2] ?? cwd)
  └─ readProject(dir)
       ├─ found project.yaml → open
       ├─ found project.meeseeks → open (compat)
       └─ neither → create project.yaml, open
  └─ ServerState initialized with project (always set)

Browser loads
  └─ App mounts → GET /api/projects/current → project name in header
  └─ Navigate to /boards
  └─ BoardsRoute renders board list (empty state + "New board" button if zero boards)
```

---

## Backwards Compatibility

| Scenario | Behavior |
|----------|----------|
| Directory has `project.yaml` | Normal open |
| Directory has `project.meeseeks` | Read and open; file stays as-is |
| Directory has both | `project.yaml` wins |
| Directory has neither | `project.yaml` auto-created with directory name |
| Directory does not exist | Server exits with error |

---

## Files Touched

| File | Change |
|------|--------|
| `src/storage/project.ts` | Filename resolution + auto-create logic |
| `src/server/index.ts` | Startup resolution (arg vs cwd), remove watcher/recents on close |
| `src/server/state.ts` | Remove open/close lifecycle; project always set at construction |
| `src/server/app-config.ts` | Delete if recents-only; otherwise remove recents methods |
| `src/server/routes/projects.ts` | Delete open/close/recents routes; retain current |
| `src/web/App.tsx` | Remove PickerRoute, add Navigate redirect |
| `src/web/components/AppShell.tsx` | Remove Close button, fix logo link |
| `src/web/routes/PickerRoute.tsx` | Delete |
| `src/web/components/NewProjectModal.tsx` | Delete |
| `src/web/hooks/queries.ts` | Remove useOpenProject, useCloseProject, useRecents |
