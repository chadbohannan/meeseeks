# Meeseeks

Meeseeks is a local web-app for supervising agentic instances within development pipelines, providing oversight capabilities for ensuring proper model behavior during development workflows.

The system implements a local, single-process architecture that displays a Kanban view of project data, where each ticket can run an isolated [Claude Code](../components/runtime.md) instance in a floating console. State is persisted via disk files, permissions are enforced from a YAML config, and runtime status is displayed for each ticket. See the [Architecture Overview](../syntheses/architecture-overview.md) for the decomposition and data flow.

## Core Architecture

The system is structured around three primary layers:

- **[Storage](../components/storage.md)**: Pure filesystem operations managing a hierarchical data model of projects, boards, lanes, and tickets stored as YAML and Markdown files.
- **[Server](../components/server.md)**: A Fastify-based API serving REST endpoints and WebSocket connections for real-time state synchronization.
- **[Runtime Supervisor](../components/runtime.md)**: Manages isolated Claude Code instances per ticket, handling lifecycle events, stdio transport, and permissions translation. The [runtime concept](../concepts/runtime.md) describes the full lifecycle state machine.

## Data Model

Projects are organized hierarchically: a [Project](../concepts/project-model.md) contains multiple Boards, each Board contains multiple Lanes, and each Lane contains multiple Tickets. The filesystem layout reflects this structure with `project.yaml` at the root, `board.yaml` files in board directories, and `lane.yaml` files defining lane states and their ordering.

## Concurrency Model

The system enforces a single-project operational model — only one project can be open at a time. This simplifies state management and ensures that runtime instances are tied to a single project context.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `README.md` |
| 2026-04-26 | `idea.md` |
| 2026-04-26 | First Slice Design §1 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |