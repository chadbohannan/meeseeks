# Meeseeks

Locally-hosted platform for supervising multiple AI agents on development work. You control attention — agents run in detachable console windows that you can open and dismiss without interrupting the agent. One person, many agents running in parallel.

## Key features

- **Multi-agent supervision** — spawn Claude Code agents on tickets, watch them run, dismiss consoles without killing the process
- **Kanban board** — Project → Board → Lane → Ticket hierarchy; move tickets through states as work progresses
- **Board context (CLAUDE.md editor)** — each board has a `CLAUDE.md` that governs agent behavior; edit it directly in the UI via the **Context** tab in the board editor
- **File-based storage** — everything is YAML + Markdown on disk; no database, fully inspectable and version-controllable
- **Live updates** — WebSocket-driven; board and ticket state reflect filesystem changes in real time

> **Context management:** When you open a board's editor and click **Context**, you're editing the `CLAUDE.md` that Claude Code reads as its system-level instructions for every agent on that board. Use it to set conventions, restrict scope, or inject project knowledge. Changes take effect on the next agent spawn.

## Quick start

```bash
npm install

# Open current directory as a project
npm run dev
```

Open http://localhost:5173. If the directory has no `project.yaml`, one is created automatically using the directory name.

To open a specific directory:

```bash
npm run dev:server -- ./path/to/project
```

## Project structure

Meeseeks organizes work as: **Project → Board → Lane → Ticket**. Everything is stored as YAML and Markdown on disk — no database.

```
my-project/
├── project.yaml          # project config (auto-created if absent)
└── boards/
    └── my-board/
        ├── board.yaml    # runtime settings (Claude model, env, etc.)
        └── lanes/
            └── my-lane/
                ├── lane.yaml        # states: todo, doing, done
                ├── todo/
                └── doing/
                    └── 2026-01-01T1200-my-ticket.md
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Server + web UI in dev mode |
| `npm run dev:server` | Server only (hot reload) |
| `npm run dev:web` | Web UI only (Vite) |
| `npm run build` | Production build |
| `npm start` | Run production build |
| `npm test` | Run test suite |
| `npm run typecheck` | Type-check server + web |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `MEESEEKS_PORT` | `5174` | Fastify server port |
| `MEESEEKS_HOST` | `127.0.0.1` | Bind address |

## Tech

- **Server**: Node.js, Fastify, WebSocket, Chokidar
- **Web**: React, Vite, React Query, React Router, Tailwind, xterm.js
- **Storage**: YAML + Markdown on disk
- **Tests**: Vitest
