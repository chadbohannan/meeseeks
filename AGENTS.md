# Meeseeks — Agent Guidelines

Meeseeks is a locally-hosted platform for supervising multiple AI agents (like Claude Code) on development work. It solves the attention management problem — humans control focus while agents run in detachable console windows.

## The Wiki is the Primary Knowledge Base

**Read the wiki before the codebase.** This project has a living knowledge base at `wiki/meeseeks-wiki/` that captures architecture decisions, design rationale, and operational patterns. Start there when exploring or making changes.

**Write to the wiki when you learn something.** If you discover why something is designed a certain way, encounter a non-obvious constraint, or solve a tricky problem — add it to the wiki. This project depends on wiki maintenance to stay navigable as complexity grows.

### Wiki Structure

```
wiki/meeseeks-wiki/
├── index.md           # Content catalog — start here
├── log.md             # Chronological record of operations
├── systems/           # Distinct systems (storage, server, etc.)
├── components/        # Individual components and modules
├── concepts/          # Recurring patterns and architectural ideas
├── runbooks/          # Operational procedures
└── syntheses/         # Cross-cutting analyses
```

### Wiki Conventions

- Pages are prose documents with contextual internal links
- Every link appears inside a sentence that explains the relationship
- Source attribution is inline (e.g., citing design specs)
- Reference tables at the bottom corroborate the log
- Filenames: lowercase, hyphenated (e.g., `project-model.md`)

When updating wiki pages, maintain cross-references. Add links to the index for new pages.

## Codebase Structure

```
src/
├── storage/           # Filesystem CRUD layer (YAML + Markdown)
│   ├── project.ts     # project.yaml read/write
│   ├── board.ts       # Board CRUD on disk
│   ├── lane.ts        # Lane CRUD with lane.yaml
│   └── ticket.ts      # Ticket CRUD with frontmatter
├── server/            # Fastify HTTP server + WebSocket hub
│   ├── routes/        # REST API endpoints
│   ├── ws.ts          # WebSocket broadcast hub
│   └── watcher.ts     # Chokidar filesystem watcher
├── runtime/           # Claude Code process supervisor
│   ├── supervisor.ts  # RuntimeSupervisor: spawn, lifecycle, ring buffer
│   ├── claude-code.ts # Adapter: flag assembly, settings file, preamble
│   ├── stream-parser.ts # Stream-json parser for non-interactive mode
│   └── ring-buffer.ts # Circular stdio buffer (default 2 MB)
├── web/               # Vite + React SPA (served by Fastify in production)
└── shared/            # Shared types between server and client
    ├── types.ts       # Domain types
    └── api.ts         # Request/response shapes
```

Storage files import only from `storage/` and `shared/`. Server files import from `storage/` and `shared/` only. Routes read/write through `state.ts`.

## Key Concepts

- **Project Model**: Project → Board → Lane → Ticket hierarchy stored as YAML and Markdown on disk
- **Single-project model**: Only one project open at a time; simplifies state
- **Dismiss-without-kill**: Closing a console window dismisses attention but the agent continues running
- **WebSocket for events**: All real-time state changes broadcast through the hub

## Working with the Code

1. **Understand before implementing**: Read the wiki architecture overview and relevant component pages
2. **Check existing tests**: Tests mirror source structure under `tests/`
3. **Run tests**: `npm test` — Vitest with 10s timeout
4. **Type checking**: No explicit typecheck script; rely on editor integration
5. **Error handling**: Use typed storage errors (`NotFoundError`, `ConflictError`, etc.) from `storage/errors.ts`

## Wiki Maintenance Triggers

Update the wiki when you:
- Discover design rationale that isn't documented
- Encounter a constraint or pattern worth explaining
- Implement a new feature or component
- Find something that will confuse a future developer
- Fix a bug whose cause wasn't obvious

Update the index when you:
- Create a new wiki page
- Revise an existing page's description
- Deprecate a page

## Discovery Layers

Use **code-rag** for vague or exploratory queries about the codebase — natural language topic search across repositories.

Use **the wiki** for architectural understanding, design decisions, and operational knowledge.

Use **grep/glob/read** for specific code location when you know what you're looking for.

## Deferred Features

The current implementation covers: storage layer, REST API, WebSocket hub, filesystem watcher, Claude Code runtime supervisor (PTY + ring buffer + lifecycle hooks), Vite + React web UI with xterm.js console panels.

Deferred (not yet implemented): multi-user access, autonomous triggers, runtime persistence across server restarts.