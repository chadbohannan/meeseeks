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

### Method 1: Start server with project path argument

```bash
# Start only the server with a project path
npm run dev:server -- ./my-project
```

The server will attempt to open the project immediately on startup. If the directory does not contain a `project.meeseeks` file, the server starts without an open project and you can create one via the UI or API.

### Method 2: Start full dev stack, open project via UI

```bash
# Start both server and web UI
npm run dev
```

Then open http://localhost:5173 and use the project picker to create or open a project.

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

When you create a project, the server creates the following structure:

```
my-project/
└── project.meeseeks    # created by server on first run
```

Boards and lanes are added by interacting with the REST API or UI.

## Configuration

### project.meeseeks

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
| 2026-04-26 | [First Slice Design §4.1](code-rag:meeseeks/docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md:Meeseeks — First Slice Design: Storage, Server, UI, and Runtimes:4. Filesystem data model:4.1 Config files) |
