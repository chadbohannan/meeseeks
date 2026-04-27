# Wiki Index

## Systems
- [Meeseeks](systems/meeseeks.md) — agent supervision platform for development pipelines

## Components
- [Storage](components/storage.md) — filesystem storage layer with YAML persistence
- [Server](components/server.md) — Fastify server with REST API and WebSocket hub
- [Web UI](components/web.md) — Vite + React SPA: project picker, Kanban board, ticket editor, WebSocket-driven live updates
- [Runtime Supervisor](components/runtime.md) — per-ticket Claude Code process supervisor with ring buffer + stream-json parser
- [Console (MDI panels)](components/console.md) — xterm.js panels with dismiss-without-kill gesture

## Concepts
- [Project Model](project-model.md) — Projects, boards, lanes, and tickets
- [Runtime Supervisor](runtime.md) — Claude Code runtime lifecycle management

## Runbooks
- [Project Setup](runbooks/project-setup.md) — initializing a new Meeseeks project

## Syntheses
- [Architecture Overview](syntheses/architecture-overview.md) — system decomposition and data flow