# Workspace Setup

Getting a Meeseeks checkout running, and what the server creates the first time
it opens a workspace. The layout this page produces is described in
[Project Model](../concepts/project-model.md); an existing board-era workspace
needs [Board-to-Workflow Migration](board-to-workflow-migration.md) first.

## Prerequisites

- Node.js v22.x or higher
- npm

## Installation

```bash
git clone <repository-url>
cd meeseeks
npm install        # or: make install
```

## Development Commands

`make help` lists these; the Makefile is the preferred entry point because its
`dev` targets print what they exposed and on which addresses.

| Command | Description |
|---------|-------------|
| `make dev` | Server + web UI, dev UI bound to every interface |
| `make dev-local` | Same, bound to loopback only |
| `make dev-tailnet` | Same, bound to this host's tailnet address only |
| `make dev-server` / `npm run dev:server` | Fastify server alone, hot reload via `tsx watch` |
| `make dev-web` / `npm run dev:web` | Vite dev server alone |
| `make build` / `npm run build` | Build server (`dist/server`) and SPA (`dist/web`) |
| `make start` / `npm start` | Run the production server |
| `make test` / `npm test` | Run all tests once with Vitest |
| `make test-watch` / `npm run test:watch` | Tests in watch mode |
| `make typecheck` / `npm run typecheck` | Type-check both the server and web projects |
| `npm run migrate` | Board-era migration CLI — see its runbook |
| `make wiki-lint` / `make wiki-links` | Check wiki internal links and index coverage |

`make dev` puts the dev UI on every interface and Meeseeks has no
authentication, so the network it is on is the whole boundary. What that
exposes, how to narrow it, and why the bare hostname has to be named in
`allowedHosts` are covered in
[Reaching the Dev Server From Another Device](dev-server-access.md).

## Opening a Workspace

The server opens exactly one workspace at startup. `openWorkspace`
(`src/storage/open.ts`) creates `workspace.yaml` when the directory has none and
seeds it with a starter Development workflow — see
[Onboarding Seeding](../concepts/onboarding-seeding.md). Everything after that
is a plain read: `readWorkspace` never creates anything and throws
`NotFoundError` on a directory with no `workspace.yaml`.

### Default: the XDG data directory

```bash
make dev        # workspace is ~/.local/share/meeseeks (or $XDG_DATA_HOME/meeseeks)
```

The default is created if absent. It is deliberately not `process.cwd()`: run
from inside a checkout, a cwd default silently turned the source tree into the
workspace it was supervising.

### An explicit path

```bash
npm run dev:server -- ./my-workspace
```

An explicit path must already exist — the server exits with an error rather than
creating it, so a typo fails loudly instead of spawning a workspace somewhere
unintended. `meeseeks .` therefore still works for pointing a server at a
checkout on purpose, which is why the repo's `.gitignore` covers the workspace
files as a backstop.

Open http://localhost:5173. The app redirects to `/workflows` and the sidebar
lists the workspace's workflows, projects, and settings.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEESEEKS_PORT` | `5174` | Port for the Fastify server. Also how a spawned agent's hooks find the server. |
| `MEESEEKS_HOST` | `127.0.0.1` | Bind address for the Fastify server |
| `MEESEEKS_DEV_HOST` | `0.0.0.0` | Bind address for the Vite dev server only |
| `MEESEEKS_DEV_ALLOWED_HOSTS` | — | Comma-separated extra `Host` headers the dev server accepts |
| `XDG_DATA_HOME` | `~/.local/share` | Parent of the default workspace directory |

```bash
MEESEEKS_PORT=8080 npm run dev:server
```

## Directory Structure

A freshly opened workspace, after seeding:

```
my-workspace/
├── workspace.yaml              # registries, optional models and default runtime
└── workflows/
    └── development/            # the seeded starter workflow
        ├── workflow.yaml
        ├── PROCESS.md
        └── <state dirs>/       # one per state, holding ticket Markdown
```

Registering a project adds `projects/<slug>.yaml`; prompts live in `prompts/*.md`
at the workspace root. Both are created on first use through the UI or REST API.

## Configuration

### workspace.yaml

```yaml
name: My Workspace
workflows:
  - workflows/development     # relative to the workspace root, or absolute
projects:
  - projects/meeseeks.yaml
models:                       # optional; defaults to the Opus/Sonnet/Haiku aliases
  - { value: opus, label: Opus }
runtime:                      # optional workspace-wide default
  harness: claude-code
  provider: anthropic
  model: opus
  args: []
  env: {}
```

### workflow.yaml (per workflow)

```yaml
states:
  - { dir: todo,  name: Todo }
  - { dir: doing, name: Doing }
  - { dir: done,  name: Done }
runtime:                      # optional; overrides the workspace default
  harness: claude-code
  provider: anthropic
  model: opus
```

### projects/&lt;slug&gt;.yaml (per project)

A project is a codebase, decoupled from any workflow. Its `root` points outside
the workspace by design.

```yaml
name: Meeseeks
root: ~/workspace/meeseeks
color: '#38bdf8'              # optional; tints tickets bound to this project
contextFile: ~/workspace/meeseeks/CLAUDE.md   # or inline `context:`
permissions:
  allowedPaths: [./vendor]    # relative entries resolve against this root
  allowedTools: ['Read(~/workspace/meeseeks/**)']
  deniedTools: []
```

### permissions.yaml (optional, per workflow)

Same three keys, resolved against the workflow directory. A ticket's effective
policy is the union of its workflow's and its project's — neither can revoke the
other's grants, and denials from either side win. One exception worth knowing:
one-shot prompt runs spawn with permissions bypassed, so `deniedTools` does not
bind them. See [One-Shot Prompts](../concepts/one-shot-prompts.md).

## Production Deployment

```bash
make build && make start
```

The Fastify server serves the built SPA statically from `dist/web` on the
configured port (default 5174). The static handler is registered only when
`dist/web` exists.

## Testing

```bash
npm test
npm test -- tests/storage/project.test.ts
npm run test:watch
```

## tsx watch exclusions

`dev:server` excludes `workflows/**`, `prompts/**`, `projects/**`,
`*.pre-migrate/**`, `wiki/**`, and `**/.claude/**`. These name every directory
the running server writes into: without them a ticket move, a prompt run, a
migration backup, or an agent editing the wiki restarts the server under the
user. The same list appears in the Makefile's `DEV_SERVER` variable and the two
have to stay in step. See
[Platform Constraints](../concepts/platform-constraints.md#tsx-watch-scope) for
why this matters.

## Development Workflow

1. **Initial setup**: `make install`
2. **Start development**: `make dev`
3. **Type checking**: `make typecheck` (run before committing)
4. **Testing**: `make test` (run before committing)
5. **Production build**: `make build && make start`

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `package.json` |
| 2026-04-26 | `src/server/index.ts` |
| 2026-04-26 | First Slice Design §4.1 (`docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`) |
| 2026-04-28 | Debugging session: tsx watch exclusions, make dev, platform constraints |
| 2026-08-23 | Rewritten for the workspace model: `Makefile`, `src/storage/open.ts`, `src/storage/project.ts`, `src/storage/workflow.ts`, `vite.config.ts` |
