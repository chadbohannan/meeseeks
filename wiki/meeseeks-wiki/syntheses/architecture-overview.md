# Architecture Overview

Meeseeks follows a three-layer architecture in a single Node.js process:

```
┌─────────────────────────────────────┐
│            Web UI (planned)         │
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

**Single-process**: All components run in one Node.js process, started via `npm run dev`. This simplifies deployment and ensures runtimes are co-located with their manager.

**Filesystem as database**: State lives in YAML and Markdown files, providing human-readable persistence and easy version control integration.

**WebSocket for all real-time**: State changes broadcast through the WebSocket hub, keeping clients synchronized with a single connection.

## Deferred Features

The current scope excludes:
- Autonomous triggers and synchronization
- Multi-user access
- Web UI (planned for future)
- Runtime persistence across server restarts

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | [First Slice Design §2](code-rag:meeseeks/docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md:Meeseeks — First Slice Design: Storage, Server, UI, and Runtimes:2. Decomposition context) |
| 2026-04-26 | [First Slice Design §3](code-rag:meeseeks/docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md:Meeseeks — First Slice Design: Storage, Server, UI, and Runtimes:3. Architecture) |