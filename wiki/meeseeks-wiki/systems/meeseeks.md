# Meeseeks

Meeseeks is a local web-app for supervising agentic instances within development pipelines, providing oversight capabilities for ensuring proper model behavior during development workflows.

The system implements a local, single-process architecture that displays a Kanban view of project data, where each ticket can run an isolated [Claude Code](claude-code.md) instance in a floating console. State is persisted via disk files, permissions are enforced from a YAML config, and runtime status is displayed for each ticket. See the [Architecture Overview](../syntheses/architecture-overview.md) for the decomposition and data flow.

[Claude Code](claude-code.md) is the agentic harness Meeseeks depends on today, and much of this wiki evaluates whether it could be swapped for an interchangeable alternative — the [Pi coding agent](pi.md) or the [LangChain ecosystem](langchain-ecosystem.md). That evaluation is framed at the paradigm level in the [Supervised CLI vs. Framework/Server](../syntheses/harness-paradigms.md) capstone, which is the entry point into the harness-comparison cluster.

## Core Architecture

The system is structured around three primary layers:

- **[Storage](../components/storage.md)**: Pure filesystem operations managing a workspace of workflows, tickets, and registered projects, stored as YAML and Markdown files.
- **[Server](../components/server.md)**: A Fastify-based API serving REST endpoints and WebSocket connections for real-time state synchronization.
- **[Runtime Supervisor](../components/runtime.md)**: Manages isolated Claude Code instances per ticket, handling lifecycle events, stdio transport, and permissions translation. The [runtime concept](../concepts/runtime.md) describes the full lifecycle state machine.

## Data Model

A [workspace](../concepts/project-model.md) registers workflows and projects; a workflow holds tickets in one directory per state. The filesystem layout reflects that with `workspace.yaml` at the root, a `workflow.yaml` in each workflow directory defining its states and their ordering, and `projects/<slug>.yaml` for each registered codebase.

Projects are the notable axis: a project is a codebase whose root points outside the workspace, and a ticket names the project it targets. Workflow and project are therefore orthogonal — one workflow can carry tickets against several codebases — which is what the earlier board-owns-a-codebase model could not express.

## Concurrency Model

The system enforces a single-project operational model — only one project can be open at a time. This simplifies state management and ensures that runtime instances are tied to a single project context.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `README.md` |
| 2026-04-26 | `idea.md` |
| 2026-04-26 | First Slice Design §1 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |