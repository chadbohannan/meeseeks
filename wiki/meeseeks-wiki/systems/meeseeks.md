# Meeseeks

Meeseeks is a web application designed for supervising agentic models within development pipelines, providing oversight capabilities for ensuring proper model behavior during development workflows.

The system implements a local, single-process architecture that displays a Kanban view of project data, where each ticket can run an isolated [Claude Code](runtime.md) instance in a floating console. State is persisted via disk files, permissions are enforced from a YAML config, and runtime status is displayed for each ticket.

## Core Architecture

The system is structured around three primary layers:

- **[Storage](components/storage.md)**: Pure filesystem operations managing a hierarchical data model of projects, boards, lanes, and tickets stored as YAML and Markdown files.
- **[Server](components/server.md)**: A Fastify-based API serving REST endpoints and WebSocket connections for real-time state synchronization.
- **Runtime Supervisor**: Manages isolated Claude Code instances per ticket, handling lifecycle events, stdio transport, and permissions translation.

## Data Model

Projects are organized hierarchically: a [Project](project-model.md) contains multiple Boards, each Board contains multiple Lanes, and each Lane contains multiple Tickets. The filesystem layout reflects this structure with `project.meeseeks` at the root, `board.yaml` files in board directories, and `lane.yaml` files defining lane states and their ordering.

## Concurrency Model

The system enforces a single-project operational model — only one project can be open at a time. This simplifies state management and ensures that runtime instances are tied to a single project context.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | [README.md](code-rag:meeseeks/README.md:meeseeks) |
| 2026-04-26 | [idea.md](code-rag:meeseeks/idea.md:Meeseeks Concept) |
| 2026-04-26 | [First Slice Design](code-rag:meeseeks/docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md:Meeseeks — First Slice Design: Storage, Server, UI, and Runtimes:1. Goals and non-goals) |