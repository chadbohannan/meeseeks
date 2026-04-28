# Project Setup

## Prerequisites

- Node.js v22.x or higher
- npm

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd meeseeks

# Install dependencies
npm install
```

## Development Commands

The project uses the following npm scripts defined in `package.json`:

| Command | Description |
|---------|-------------|
| `npm run dev` | Runs both server and web UI concurrently in development mode |
| `npm run dev:server` | Runs only the Fastify server with hot reload via `tsx watch` |
| `npm run dev:web` | Runs only the Vite dev server for the React SPA |
| `npm run build` | Builds both server and web for production |
| `npm run build:server` | Compiles TypeScript server to `dist/server` |
| `npm run build:web` | Builds the React SPA to `dist/web` |
| `npm start` | Runs the production server from `dist/server/index.js` |
| `npm test` | Runs all tests once with Vitest |
| `npm run test:watch` | Runs tests in watch mode |
| `npm run typecheck` | Type-checks both server and web TypeScript code |

## Initialize a Project

The server always opens a project at startup. If no `project.yaml` (or legacy `project.meeseeks`) exists in the resolved directory, `project.yaml` is auto-created with the directory basename as the project name.

### Start with current directory (default)

```bash
# Start both server and web UI — uses process.cwd() as the project
npm run dev
```

Open http://localhost:5173 — the app lands on the boards list for the current directory.

### Start with an explicit project path

```bash
# Start only the server with a specific project path
npm run dev:server -- ./my-project
```

If `./my-project` does not exist, the server exits with an error. If it exists but has no `project.yaml`, one is created automatically.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEESEEKS_PORT` | `5174` | Port for the Fastify server |
| `MEESEEKS_HOST` | `127.0.0.1` | Host address to bind the server |

Example:
```bash
MEESEEKS_PORT=8080 npm run dev:server
```

## Directory Structure

When you point the server at a new directory, it creates the following structure:

```
my-project/
└── project.yaml    # auto-created by server if absent
```

Boards and lanes are added by interacting with the REST API or UI.

## Configuration

### project.yaml

```yaml
name: My Project
boards:
  - boards/my-board    # path relative to project file, or absolute
```

### board.yaml (per board)

```yaml
runtime:
  harness: claude-code
  provider: anthropic
  model: claude-opus-4-7
  args: []                  # extra CLI args appended to spawn
  env: {}                   # extra env vars merged into spawn env
```

### lane.yaml (per lane)

```yaml
states:
  - { dir: todo,  name: Todo }
  - { dir: doing, name: Doing }
  - { dir: done,  name: Done }
```

### permissions.yaml (optional, per lane)

```yaml
allowedPaths:
  - /allowed/dir
allowedTools:
  - Read
  - Write
deniedTools:
  - Bash
```

## Production Deployment

```bash
# Build everything
npm run build

# Start production server
npm start
```

In production, the Fastify server serves the built web UI statically from `dist/web` on the configured port (default 5174). The static handler is registered only when `dist/web` exists.

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/storage/project.test.ts

# Run tests in watch mode during development
npm run test:watch
```

## Development Workflow

1. **Initial setup**: `npm install`
2. **Start development**: `npm run dev` (runs both server and web)
3. **Type checking**: `npm run typecheck` (run before committing)
4. **Testing**: `npm test` (run before committing)
5. **Production build**: `npm run build && npm start`

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `package.json` |
| 2026-04-26 | `src/server/index.ts` |
| 2026-04-26 | First Slice Design §4.1 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
