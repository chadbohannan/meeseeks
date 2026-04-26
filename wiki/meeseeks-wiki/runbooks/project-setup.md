# Project Setup

## Prerequisites

- Node.js v22.x or higher
- npm

## Initialize a Project

```bash
# Create project directory
mkdir my-project
cd my-project

# Start Meeseeks server with the project
npm run dev -- ./my-project
```

## Directory Structure

The server creates the following structure:

```
my-project/
└── project.meeseeks    # created by server on first run
```

Add boards and lanes by interacting with the REST API or future UI.

## Configuration

### project.meeseeks

```yaml
name: My Project
allowedPaths:
  - /path/to/code
runtime:
  model: claude-3-5-sonnet-20241022
  args: []
  env: {}
```

### board.yaml (per board)

```yaml
runtime:
  model: claude-3-5-sonnet-20241022
  args: []
  env: {}
```

### permissions.yaml (optional)

```yaml
allowedPaths:
  - /allowed/dir
allowedTools:
  - Read
  - Write
deniedTools:
  - Bash
```

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | [First Slice Design §4.1](code-rag:meeseeks/docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md:Meeseeks — First Slice Design: Storage, Server, UI, and Runtimes:4. Filesystem data model:4.1 Config files) |