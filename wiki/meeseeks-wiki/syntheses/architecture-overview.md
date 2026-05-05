# Architecture Overview

The [Meeseeks](../systems/meeseeks.md) system follows a three-layer architecture in a single Node.js process:

```
┌─────────────────────────────────────┐
│            Web UI                   │
│  - Vite + React SPA                 │
│  - xterm.js console panels          │
└──────────────┬──────────────────────┘
               │ HTTP/WebSocket
┌──────────────▼──────────────────────┐
│     Server (Fastify + ws)           │
│  - REST routes for CRUD             │
│  - WebSocket hub for events         │
│  - ServerState for lifecycle        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Storage (filesystem)          │
│  - Project, Board, Lane, Ticket     │
│  - YAML + Markdown on disk          │
└─────────────────────────────────────┘
```

## Key Design Decisions

**Single-project model**: Only one project can be open at a time, simplifying state management and tying runtimes to a clear project context.

**Single-process**: All components run in one Node.js process. In development, `npm run dev` starts both the Fastify server and the [Vite web dev server](../components/web.md) concurrently. In production, `npm run build && npm start` builds and serves the application from a single process. See the [Project Setup](../runbooks/project-setup.md) runbook for all available commands.

**Filesystem as database**: State lives in YAML and Markdown files, providing human-readable persistence and easy version control integration.

**WebSocket for all real-time**: State changes broadcast through the WebSocket hub, keeping clients synchronized with a single connection.

## Deferred Features

The current scope excludes:
- Autonomous triggers and scheduling (the non-interactive `--print` plumbing exists — [one-shot prompts](../concepts/one-shot-prompts.md) are the first consumer — but no scheduler drives it)
- Multi-user access
- Runtime persistence across server restarts

The [Web UI](../components/web.md), [Console panels](../components/console.md), and [one-shot prompts](../concepts/one-shot-prompts.md) are implemented; see their pages for scope and known limitations.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | First Slice Design §2 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-04-26 | First Slice Design §3 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |