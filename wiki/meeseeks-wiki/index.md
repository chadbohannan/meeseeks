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
- [Project Model](concepts/project-model.md) — Projects, boards, lanes, and tickets
- [Runtime Supervisor](concepts/runtime.md) — Claude Code runtime lifecycle management

## Runbooks
- [Project Setup](runbooks/project-setup.md) — installation, development commands, environment variables, and production deployment

## Syntheses
- [Architecture Overview](syntheses/architecture-overview.md) — system decomposition and data flow