# Wiki Index

## Systems
- [Meeseeks](systems/meeseeks.md) — agent supervision platform for development pipelines

## Components
- [Storage](components/storage.md) — filesystem storage layer with YAML persistence
- [Server](components/server.md) — Fastify server with REST API and WebSocket hub
- [Web UI](components/web.md) — Vite + React SPA: project picker, Kanban board, ticket editor, WebSocket-driven live updates
- [Runtime Supervisor](components/runtime.md) — per-ticket Claude Code process supervisor with ring buffer, stream parser, resize guards
- [Claude Code Client](components/claude-code-client.md) — Claude Code CLI integration: modes, flags, settings file, Notification hooks, stream-json events
- [Console (MDI panels)](components/console.md) — xterm.js panels with dismiss-without-kill gesture

## Concepts
- [Project Model](concepts/project-model.md) — Projects, boards, lanes, and tickets
- [Runtime Supervisor](concepts/runtime.md) — Claude Code runtime lifecycle management
- [Platform Constraints](concepts/platform-constraints.md) — macOS-specific incompatibilities: chokidar/node-pty, node-pty version, tsx watch scope, env leakage

## Runbooks
- [Project Setup](runbooks/project-setup.md) — installation, development commands, environment variables, and production deployment
- [Claude Code Sandboxing](runbooks/claude-code-sandboxing.md) — permission modes, settings file precedence, OS-level sandboxing, and folder-scoped constraints for orchestrated agents

## Syntheses
- [Architecture Overview](syntheses/architecture-overview.md) — system decomposition and data flow
- [Claude Code vs. Pi Runtime Interfaces](syntheses/claude-vs-pi-runtime-interfaces.md) — comparative gap analysis of Claude Code and Pi-mono as orchestrator integration targets