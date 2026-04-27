# Project Model Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the project picker UI and replace it with automatic server-side project resolution at startup, renaming the project file from `project.meeseeks` to `project.yaml` with backwards-compatible fallback.

**Architecture:** The server always resolves and opens a project on startup (from CLI arg or cwd), removing all open/close/recents API surface. `ServerState` holds the project at construction time rather than optionally. The web UI redirects `/` to `/boards` and removes the picker, modals, and related dead code.

**Tech Stack:** Node.js, TypeScript, Fastify, React, React Query, Vitest

---

### Task 1: Update storage layer (`src/storage/project.ts`)

**Files:**
- Modify: `src/storage/project.ts`
- Modify: `tests/storage/project.test.ts`

- [ ] **Step 1: Write failing tests for new `readProject` behaviour**

Replace the existing `readProject` describe block in `tests/storage/project.test.ts` with:

```ts
describe('readProject', () => {
  it('reads project.yaml when present', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    await writeFile(path.join(tp.root, 'project.yaml'), 'name: YamlProj\nboards: []\n', 'utf8');
    const meta = await readProject(tp.root);
    expect(meta.config.name).toBe('YamlProj');
  });

  it('falls back to project.meeseeks when project.yaml absent', async () => {
    const tp = await makeBareProject('LegacyProj');  // writes project.meeseeks
    cleanups.push(tp.cleanup);
    const meta = await readProject(tp.root);
    expect(meta.config.name).toBe('LegacyProj');
  });

  it('prefers project.yaml over project.meeseeks when both present', async () => {
    const tp = await makeBareProject('LegacyName');
    cleanups.push(tp.cleanup);
    await writeFile(path.join(tp.root, 'project.yaml'), 'name: NewName\nboards: []\n', 'utf8');
    const meta = await readProject(tp.root);
    expect(meta.config.name).toBe('NewName');
  });

  it('auto-creates project.yaml from directory name when neither file exists', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    const meta = await readProject(tp.root);
    expect(meta.config.name).toBe(path.basename(tp.root));
    expect(meta.config.boards).toEqual([]);
    // file was created on disk
    const text = await readFile(path.join(tp.root, 'project.yaml'), 'utf8');
    expect(text).toContain(`name: ${path.basename(tp.root)}`);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/storage/project.test.ts
```

Expected: several FAIL — `readProject` still throws `NotFoundError` instead of auto-creating.

- [ ] **Step 3: Rewrite `src/storage/project.ts`**

Replace the file content with:

```ts
import { readFile, writeFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, InvalidInputError } from './errors.js';
import { resolveWithin, slugifyBoardPath } from './paths.js';
import type { ProjectConfig, ProjectMeta, BoardSummary } from '../shared/types.js';

const PROJECT_FILE = 'project.yaml';
const PROJECT_FILE_LEGACY = 'project.meeseeks';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function yamlPath(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_FILE);
}

async function resolveConfigPath(projectRoot: string): Promise<string | null> {
  const p = yamlPath(projectRoot);
  if (await exists(p)) return p;
  const legacy = path.join(projectRoot, PROJECT_FILE_LEGACY);
  if (await exists(legacy)) return legacy;
  return null;
}

function parseConfig(text: string, projectRoot: string): ProjectConfig {
  const parsed = yaml.load(text) as Partial<ProjectConfig> | null;
  if (!parsed || typeof parsed !== 'object') {
    throw new InvalidInputError(`malformed project config at ${projectRoot}`);
  }
  return {
    name: typeof parsed.name === 'string' ? parsed.name : path.basename(projectRoot),
    boards: Array.isArray(parsed.boards)
      ? parsed.boards.filter((b): b is string => typeof b === 'string')
      : [],
  };
}

export async function readProject(projectRoot: string): Promise<ProjectMeta> {
  const configFile = await resolveConfigPath(projectRoot);
  if (configFile) {
    const text = await readFile(configFile, 'utf8');
    return { path: path.resolve(projectRoot), config: parseConfig(text, projectRoot) };
  }
  // Auto-create project.yaml using directory name
  const config: ProjectConfig = { name: path.basename(projectRoot), boards: [] };
  const text = yaml.dump(config, { lineWidth: 100 });
  await writeFile(yamlPath(projectRoot), text, 'utf8');
  return { path: path.resolve(projectRoot), config };
}

export async function writeProject(projectRoot: string, config: ProjectConfig): Promise<void> {
  const text = yaml.dump(config, { lineWidth: 100 });
  await writeFile(yamlPath(projectRoot), text, 'utf8');
}

export async function addBoardToProject(projectRoot: string, boardPath: string): Promise<void> {
  const meta = await readProject(projectRoot);
  if (meta.config.boards.includes(boardPath)) {
    throw new ConflictError(`board already registered: ${boardPath}`);
  }
  meta.config.boards.push(boardPath);
  await writeProject(projectRoot, meta.config);
}

export async function removeBoardFromProject(projectRoot: string, boardPath: string): Promise<void> {
  const meta = await readProject(projectRoot);
  const idx = meta.config.boards.indexOf(boardPath);
  if (idx === -1) throw new ConflictError(`board not registered: ${boardPath}`);
  meta.config.boards.splice(idx, 1);
  await writeProject(projectRoot, meta.config);
}

export async function listBoards(projectRoot: string): Promise<BoardSummary[]> {
  const meta = await readProject(projectRoot);
  const seen = new Map<string, number>();
  const out: BoardSummary[] = [];
  for (const entry of meta.config.boards) {
    const abs = path.isAbsolute(entry)
      ? entry
      : resolveWithin(projectRoot, entry);
    const baseId = slugifyBoardPath(entry);
    let id = baseId;
    const collisions = seen.get(baseId) ?? 0;
    if (collisions > 0) id = `${baseId}-${collisions}`;
    seen.set(baseId, collisions + 1);

    let available = false;
    try { available = (await stat(abs)).isDirectory(); } catch { available = false; }
    const name = path.basename(abs);
    out.push({ boardId: id, name, path: abs, available });
  }
  return out;
}

export async function getBoard(projectRoot: string, boardId: string): Promise<BoardSummary> {
  const boards = await listBoards(projectRoot);
  const board = boards.find(b => b.boardId === boardId);
  if (!board) throw new ConflictError(`no board with id ${boardId}`);
  return board;
}
```

Note: `createProject` is removed — creation is now handled inline in `readProject`. `NotFoundError` import is also removed since it's no longer thrown here.

- [ ] **Step 4: Update the `createProject` test block** — replace with a test for auto-creation via `readProject`, and update the `writeProject` test to expect `project.yaml`:

In `tests/storage/project.test.ts`, remove the entire `describe('createProject', ...)` block. Update the existing import to remove `createProject` and `NotFoundError` if they are no longer used:

```ts
import { readProject, listBoards, addBoardToProject } from '../../src/storage/project.js';
import { ConflictError } from '../../src/storage/errors.js';
```

- [ ] **Step 5: Run storage tests**

```bash
npm test -- tests/storage/project.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/storage/project.ts tests/storage/project.test.ts
git commit -m "refactor(storage): readProject auto-creates project.yaml, falls back to project.meeseeks"
```

---

### Task 2: Update test helpers

**Files:**
- Modify: `tests/helpers/tmp-project.ts`
- Modify: `tests/helpers/server.ts`

- [ ] **Step 1: Update `makeBareProject` to write `project.yaml`**

In `tests/helpers/tmp-project.ts`, change `makeBareProject`:

```ts
export async function makeBareProject(name = 'Test Project'): Promise<TmpProject> {
  const tp = await makeTmpProject();
  await writeYaml(path.join(tp.root, 'project.yaml'), `name: ${name}\nboards: []\n`);
  return tp;
}
```

- [ ] **Step 2: Run the full test suite to confirm no regressions**

```bash
npm test
```

Expected: all storage and server tests still pass (server tests use `makeBareProject` via the open-project route which still exists; we haven't touched routes yet).

- [ ] **Step 3: Rewrite `bootTestServer` to accept a project**

Replace `tests/helpers/server.ts` with:

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { ServerState } from '../../src/server/state.js';
import { WsHub, registerWs } from '../../src/server/ws.js';
import { mapErrorToResponse } from '../../src/server/error-mapper.js';
import { registerProjectRoutes } from '../../src/server/routes/projects.js';
import { registerBoardRoutes } from '../../src/server/routes/boards.js';
import { registerLaneRoutes } from '../../src/server/routes/lanes.js';
import { registerTicketRoutes } from '../../src/server/routes/tickets.js';
import { registerRuntimeRoutes } from '../../src/server/routes/runtimes.js';
import { readProject } from '../../src/storage/project.js';
import { startWatcher } from '../../src/server/watcher.js';
import type { ProjectMeta } from '../../src/shared/types.js';

export interface TestServer {
  app: FastifyInstance;
  state: ServerState;
  hub: WsHub;
  port: number;
  url: string;
  cleanup(): Promise<void>;
}

export async function bootTestServer(projectRoot: string): Promise<TestServer> {
  const meta: ProjectMeta = await readProject(projectRoot);
  const state = new ServerState(meta);
  const hub = new WsHub();
  const app = Fastify({ logger: false });
  await app.register(websocket);
  app.setErrorHandler(mapErrorToResponse);
  await registerProjectRoutes(app, { state, hub });
  await registerBoardRoutes(app, { state, hub });
  await registerLaneRoutes(app, { state, hub });
  await registerTicketRoutes(app, { state, hub });
  await registerRuntimeRoutes(app, { state, hub });
  state.supervisor.on('runtime-spawned', (s) => hub.broadcast({ type: 'runtime-spawned', payload: s }));
  state.supervisor.on('runtime-status', (s) => hub.broadcast({ type: 'runtime-status', payload: s }));
  state.supervisor.on('runtime-stdio', (s) => hub.broadcast({ type: 'runtime-stdio', payload: s }));
  await registerWs(app, state, hub);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  const port = address.port;
  return {
    app, state, hub, port, url: `http://127.0.0.1:${port}`,
    async cleanup() {
      await state.shutdown();
      await app.close();
    },
  };
}
```

Note: `AppConfig` is gone. `bootTestServer` now requires a `projectRoot` string.

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/tmp-project.ts tests/helpers/server.ts
git commit -m "refactor(tests): bootTestServer takes a project root; makeBareProject writes project.yaml"
```

---

### Task 3: Rewrite `ServerState`

**Files:**
- Modify: `src/server/state.ts`

- [ ] **Step 1: Rewrite `src/server/state.ts`**

Replace the file with:

```ts
import type { ProjectMeta } from '../shared/types.js';
import { RuntimeSupervisor } from '../runtime/supervisor.js';

export interface OpenProjectState {
  meta: ProjectMeta;
  watcherCleanup?: () => Promise<void>;
}

export class ServerState {
  private readonly _state: OpenProjectState;
  readonly supervisor = new RuntimeSupervisor();

  constructor(meta: ProjectMeta, watcherCleanup?: () => Promise<void>) {
    this._state = { meta, watcherCleanup };
  }

  async shutdown(): Promise<void> {
    await this.supervisor.terminateAll();
    if (this._state.watcherCleanup) {
      await this._state.watcherCleanup();
    }
  }

  require(): OpenProjectState { return this._state; }
  peek(): OpenProjectState { return this._state; }
}
```

- [ ] **Step 2: Check for TypeScript errors**

```bash
npm run typecheck 2>&1 | head -60
```

Expected: errors in `index.ts`, `routes/projects.ts`, `ws.ts` — all callers of the old API. These are resolved in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/server/state.ts
git commit -m "refactor(server): ServerState always holds a project; remove open/close lifecycle"
```

---

### Task 4: Update server startup (`src/server/index.ts`)

**Files:**
- Modify: `src/server/index.ts`

- [ ] **Step 1: Rewrite `src/server/index.ts`**

Replace the file with:

```ts
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { ServerState } from './state.js';
import { WsHub, registerWs } from './ws.js';
import { mapErrorToResponse } from './error-mapper.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerBoardRoutes } from './routes/boards.js';
import { registerLaneRoutes } from './routes/lanes.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { registerRuntimeRoutes } from './routes/runtimes.js';
import { readProject } from '../storage/project.js';
import { startWatcher } from './watcher.js';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.MEESEEKS_PORT ?? 5174);
const HOST = process.env.MEESEEKS_HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  const argPath = process.argv[2];
  const projectDir = path.resolve(argPath ?? process.cwd());

  if (!existsSync(projectDir)) {
    console.error(`meeseeks: directory does not exist: ${projectDir}`);
    process.exit(1);
  }

  const hub = new WsHub();
  const meta = await readProject(projectDir);
  const handle = startWatcher(meta, hub);
  const state = new ServerState(meta, handle.cleanup);

  state.supervisor.on('runtime-spawned', (s) => hub.broadcast({ type: 'runtime-spawned', payload: s }));
  state.supervisor.on('runtime-status', (s) => hub.broadcast({ type: 'runtime-status', payload: s }));
  state.supervisor.on('runtime-stdio', (s) => hub.broadcast({ type: 'runtime-stdio', payload: s }));

  const app = Fastify({ logger: true });
  await app.register(websocket);
  app.setErrorHandler(mapErrorToResponse);
  await registerProjectRoutes(app, { state, hub });
  await registerBoardRoutes(app, { state, hub });
  await registerLaneRoutes(app, { state, hub });
  await registerTicketRoutes(app, { state, hub });
  await registerRuntimeRoutes(app, { state, hub });
  await registerWs(app, state, hub);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDir = path.resolve(__dirname, '../web');
  if (existsSync(webDir)) {
    await app.register(fastifyStatic, { root: webDir, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'route not found' } });
        return;
      }
      reply.type('text/html').sendFile('index.html');
    });
  }

  await app.listen({ port: PORT, host: HOST });
  app.log.info({ project: meta.path }, `meeseeks open: ${meta.config.name}`);
  app.log.info(`meeseeks server on http://${HOST}:${PORT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

> **Note on watcher ordering:** `startWatcher` needs the hub to broadcast events. The current signature is `startWatcher(meta, hub)`. Check `src/server/watcher.ts` — if the hub is passed directly, we can create the hub first and then call `startWatcher` once:

```ts
  const hub = new WsHub();
  const meta = await readProject(projectDir);
  const handle = startWatcher(meta, hub);
  const state = new ServerState(meta, handle.cleanup);
```

Use this simpler version if `startWatcher` accepts the hub. Open `src/server/watcher.ts` and verify the signature before writing this file.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck 2>&1 | head -60
```

Expected: errors only in `routes/projects.ts` (still references AppConfig and old methods).

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "refactor(server): resolve project from argv/cwd at startup; always open on boot"
```

---

### Task 5: Clean up project routes and delete `app-config.ts`

**Files:**
- Modify: `src/server/routes/projects.ts`
- Delete: `src/server/app-config.ts`
- Delete: `tests/server/app-config.test.ts`

- [ ] **Step 1: Rewrite `src/server/routes/projects.ts`**

Replace with:

```ts
import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { listBoards } from '../../storage/project.js';

interface Deps { state: ServerState; hub: WsHub }

export async function registerProjectRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { state } = deps;

  app.get('/api/projects/current', async () => {
    const open = state.require();
    const boards = await listBoards(open.meta.path);
    return { project: open.meta, boards };
  });
}
```

- [ ] **Step 2: Delete `src/server/app-config.ts`**

```bash
rm src/server/app-config.ts
```

- [ ] **Step 3: Delete `tests/server/app-config.test.ts`**

```bash
rm tests/server/app-config.test.ts
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck 2>&1 | head -60
```

Expected: errors in `ws.ts` (still references `project-opened`/`project-closed` event types from shared/events.ts) and possibly in web files.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/projects.ts
git rm src/server/app-config.ts tests/server/app-config.test.ts
git commit -m "refactor(server): remove open/close/create/recent project routes and AppConfig"
```

---

### Task 6: Update WebSocket handler and shared event types

**Files:**
- Modify: `src/server/ws.ts`
- Modify: `src/shared/events.ts`
- Modify: `src/shared/api.ts`

- [ ] **Step 1: Remove `project-opened` and `project-closed` from `src/shared/events.ts`**

Replace the `WsEvent` type (keep runtime events, remove project events):

```ts
import type { RuntimeStatus, RuntimeSummary } from './runtime.js';

export type ChangeKind = 'created' | 'updated' | 'deleted';

export type WsEvent =
  | { type: 'board-changed'; payload: { boardId: string; kind: ChangeKind } }
  | { type: 'lane-changed'; payload: { boardId: string; laneName: string; kind: ChangeKind } }
  | { type: 'ticket-changed'; payload: { boardId: string; laneName: string; filename: string; state: string; kind: ChangeKind } }
  | { type: 'runtime-spawned'; payload: RuntimeSummary }
  | { type: 'runtime-status'; payload: { runtimeId: string; status: RuntimeStatus; exitCode?: number; errorMessage?: string } }
  | { type: 'runtime-stdio'; payload: { runtimeId: string; data: string } };

export type ClientWsMessage =
  | { type: 'runtime-input'; payload: { runtimeId: string; data: string } }
  | { type: 'runtime-resize'; payload: { runtimeId: string; cols: number; rows: number } };
```

- [ ] **Step 2: Remove project-related types from `src/shared/api.ts`**

Remove these interfaces:

```ts
export interface OpenProjectRequest { path: string }
export interface OpenProjectResponse { project: ProjectMeta; boards: BoardSummary[] }
export interface CreateProjectRequest { path: string; name: string }
export interface ListRecentsResponse { recents: RecentEntry[] }
```

Also remove `RecentEntry` from the re-export at the bottom if it's only used by those types. Check `src/shared/types.ts` for `RecentEntry` — if it's defined there and used elsewhere, leave the type but remove the API interfaces.

The updated `src/shared/api.ts`:

```ts
import type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, LaneState, TicketSummary, TicketDetail } from './types.js';

// Boards
export interface CreateBoardRequest { name: string; path?: string }
export interface PatchBoardRequest { name?: string }
export interface DeleteBoardRequest { deleteFiles?: boolean }

// Lanes
export interface CreateLaneRequest { name: string; states: LaneState[] }
export interface PatchLaneRequest { name?: string; states?: LaneState[]; force?: boolean }
export interface DeleteLaneRequest { deleteFiles?: boolean }

// Tickets
export interface CreateTicketRequest { title: string; state: string; body?: string }
export interface PatchTicketRequest { title?: string; body?: string; state?: string }
export interface ListTicketsResponse { tickets: TicketSummary[] }

// Errors
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, TicketSummary, TicketDetail };
```

- [ ] **Step 3: Simplify `src/server/ws.ts` on-connect handler**

In the `registerWs` function, replace the on-connect logic that sends `project-opened`/`project-closed` with just the runtime replay:

```ts
  const handler: WebsocketHandler = async (socket) => {
    hub.add(socket);
    for (const r of state.supervisor.list()) {
      hub.send(socket, { type: 'runtime-spawned', payload: r });
    }

    socket.on('message', (raw: Buffer) => {
      let msg: { type?: string; payload?: { runtimeId?: string; data?: string; cols?: number; rows?: number } } | null = null;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      const p = msg.payload;
      if (msg.type === 'runtime-input' && p?.runtimeId && typeof p.data === 'string') {
        state.supervisor.writeInput(p.runtimeId, Buffer.from(p.data, 'base64'));
      } else if (msg.type === 'runtime-resize' && p?.runtimeId && typeof p.cols === 'number' && typeof p.rows === 'number') {
        state.supervisor.resize(p.runtimeId, p.cols, p.rows);
      }
    });
  };
```

Remove the `listBoards` import from `ws.ts` if it's no longer used.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck 2>&1 | head -60
```

Expected: errors only in web files (queries.ts, use-ws.ts, api.ts, PickerRoute.tsx, etc.).

- [ ] **Step 5: Commit**

```bash
git add src/shared/events.ts src/shared/api.ts src/server/ws.ts
git commit -m "refactor: remove project-opened/closed events and project open/close API types"
```

---

### Task 7: Update server-side tests

**Files:**
- Modify: `tests/server/projects.test.ts`
- Modify: `tests/server/ws.test.ts`
- Modify: `tests/server/boards.test.ts`
- Modify: `tests/server/lanes.test.ts`
- Modify: `tests/server/tickets.test.ts`
- Modify: `tests/server/runtimes-routes.test.ts`

- [ ] **Step 1: Rewrite `tests/server/projects.test.ts`**

Replace with:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe('project routes', () => {
  it('GET /api/projects/current returns the open project', async () => {
    const tp = await makeBareProject('Hello');
    cleanups.push(tp.cleanup);
    const srv = await bootTestServer(tp.root);
    cleanups.push(srv.cleanup);

    const res = await fetch(`${srv.url}/api/projects/current`);
    expect(res.status).toBe(200);
    const body = await res.json() as { project: { config: { name: string } } };
    expect(body.project.config.name).toBe('Hello');
  });
});
```

- [ ] **Step 2: Run projects test**

```bash
npm test -- tests/server/projects.test.ts
```

Expected: PASS.

- [ ] **Step 3: Update `tests/server/boards.test.ts`**

Remove the `setup()` function's `POST /api/projects/open` fetch. Replace `setup()` with:

```ts
async function setup() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const srv = await bootTestServer(tp.root);
  cleanups.push(srv.cleanup);
  return { srv, tp };
}
```

- [ ] **Step 4: Run boards test**

```bash
npm test -- tests/server/boards.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Update `tests/server/lanes.test.ts`** — same pattern: replace `setup()` to remove the open-project fetch and pass `tp.root` to `bootTestServer`.

Open the file, find the `setup()` function, and replace it with:

```ts
async function setup() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const srv = await bootTestServer(tp.root);
  cleanups.push(srv.cleanup);
  // Create a board since lanes require one
  const boardRes = await fetch(`${srv.url}/api/boards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'B' }),
  }).then(r => r.json()) as { board: { boardId: string } };
  return { srv, tp, boardId: boardRes.board.boardId };
}
```

> Note: Check the existing `lanes.test.ts` setup — it may already create a board inside setup, or the board creation may happen inside each test. Adapt accordingly without removing any board-creation logic that the tests depend on.

- [ ] **Step 6: Run lanes test**

```bash
npm test -- tests/server/lanes.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Update `tests/server/tickets.test.ts`** — same pattern.

Find the setup function and remove the `POST /api/projects/open` call. Pass `tp.root` to `bootTestServer`. Keep all board/lane creation logic that follows.

- [ ] **Step 8: Run tickets test**

```bash
npm test -- tests/server/tickets.test.ts
```

Expected: all PASS.

- [ ] **Step 9: Update `tests/server/runtimes-routes.test.ts`** — same pattern.

Find setup and remove the open-project fetch. Pass `tp.root` to `bootTestServer`.

- [ ] **Step 10: Update `tests/server/ws.test.ts`**

Remove the test `'sends project-opened on connect when a project is open'` entirely, along with its associated `POST /api/projects/open` call. For any remaining tests, update `bootTestServer()` calls to pass a project root:

```ts
const tp = await makeBareProject('ProjectName');
cleanups.push(tp.cleanup);
const srv = await bootTestServer(tp.root);
```

Remove any `project-opened` or `project-closed` event expectations.

- [ ] **Step 11: Run the full test suite**

```bash
npm test
```

Expected: all PASS. If anything fails, diagnose and fix before committing.

- [ ] **Step 12: Commit**

```bash
git add tests/server/
git commit -m "refactor(tests): update server tests to use bootTestServer(projectRoot)"
```

---

### Task 8: Clean up the web layer

**Files:**
- Modify: `src/web/lib/api.ts`
- Modify: `src/web/hooks/queries.ts`
- Modify: `src/web/hooks/use-ws.ts`
- Modify: `src/web/App.tsx`
- Modify: `src/web/components/AppShell.tsx`
- Delete: `src/web/routes/PickerRoute.tsx`
- Delete: `src/web/components/NewProjectModal.tsx`

- [ ] **Step 1: Remove dead methods from `src/web/lib/api.ts`**

Find and remove the following lines (the api object entries for recents, open, close, and createProject):

```ts
  recents: () => request<ListRecentsResponse>('GET', '/api/projects/recent'),
  open: (req: OpenProjectRequest) => request<OpenProjectResponse>('POST', '/api/projects/open', req),
  close: () => request<{ ok: true }>('POST', '/api/projects/close'),
  createProject: (req: CreateProjectRequest) => request<OpenProjectResponse>('POST', '/api/projects/create', req),
```

Also remove the imports of `ListRecentsResponse`, `OpenProjectRequest`, `OpenProjectResponse`, `CreateProjectRequest` from `@shared/api.js`.

- [ ] **Step 2: Remove dead hooks from `src/web/hooks/queries.ts`**

Remove these exports and their imports:

```ts
export const useRecents = ...
export function useOpenProject() { ... }
export function useCloseProject() { ... }
export function useCreateProject() { ... }
```

Also remove the import of `CreateProjectRequest` and `OpenProjectRequest` from `@shared/api.js`.

- [ ] **Step 3: Remove `project-opened`/`project-closed` cases from `src/web/hooks/use-ws.ts`**

Remove these two cases from the switch:

```ts
        case 'project-opened':
        case 'project-closed':
          qc.invalidateQueries();
          return;
```

- [ ] **Step 4: Update `src/web/App.tsx`**

Replace the `PickerRoute` import and route with a `Navigate` redirect:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useWsInvalidation } from './hooks/use-ws.js';
import { useRuntimeWs } from './hooks/use-runtime-ws.js';
import { AppShell } from './components/AppShell.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { BoardsRoute } from './routes/BoardsRoute.js';
import { BoardRoute } from './routes/BoardRoute.js';
import { TicketRoute } from './routes/TicketRoute.js';
import { Mdi } from './components/console/Mdi.js';
import { Dock } from './components/console/Dock.js';

export default function App() {
  useWsInvalidation();
  useRuntimeWs();
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/boards" replace />} />
          <Route path="/boards" element={<BoardsRoute />} />
          <Route path="/boards/:boardId" element={<BoardRoute />} />
          <Route path="/boards/:boardId/lanes/:laneName/tickets/:filename" element={<TicketRoute />} />
        </Route>
      </Routes>
      <Mdi />
      <Dock />
    </ErrorBoundary>
  );
}
```

- [ ] **Step 5: Update `src/web/components/AppShell.tsx`**

Remove the Close button, remove `useCloseProject`, and change the logo link to `/boards`:

```tsx
import { Outlet, Link } from 'react-router-dom';
import { useCurrentProject } from '../hooks/queries.js';

export function AppShell() {
  const { data } = useCurrentProject();
  const project = data?.project;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-900">
        <Link to="/boards" className="font-semibold">Meeseeks</Link>
        <div className="flex items-center gap-3 text-sm">
          {project && (
            <span className="text-slate-400">{project.config.name}</span>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  );
}
```

- [ ] **Step 6: Delete dead files**

```bash
rm src/web/routes/PickerRoute.tsx
rm src/web/components/NewProjectModal.tsx
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck 2>&1 | head -80
```

Expected: no errors. If there are remaining references to deleted types/functions, fix them now.

- [ ] **Step 8: Commit**

```bash
git add src/web/
git rm src/web/routes/PickerRoute.tsx src/web/components/NewProjectModal.tsx
git commit -m "feat(web): remove project picker; root redirects to /boards; AppShell simplified"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all PASS, no skipped tests.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Smoke test the dev server**

```bash
npm run dev
```

Open `http://localhost:5173` — confirm it redirects to `/boards`. Confirm the project name appears in the header. Confirm "New board" button is visible.

Kill the server and restart with an explicit path:

```bash
npm run dev:server -- /tmp
```

Confirm it starts without error and the project name shown in the header is `tmp`.

- [ ] **Step 4: Verify auto-create**

```bash
mkdir /tmp/meeseeks-test-proj
npm run dev:server -- /tmp/meeseeks-test-proj
ls /tmp/meeseeks-test-proj
```

Expected: `project.yaml` created with `name: meeseeks-test-proj`.

- [ ] **Step 5: Verify legacy fallback**

```bash
mkdir /tmp/meeseeks-legacy
echo "name: LegacyName\nboards: []" > /tmp/meeseeks-legacy/project.meeseeks
npm run dev:server -- /tmp/meeseeks-legacy
```

Expected: server starts; header shows `LegacyName`; no `project.yaml` created in that directory.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: project model simplification complete"
```

---

### Task 10: Update wiki

**Files:**
- Modify: `wiki/meeseeks-wiki/components/web.md`
- Modify: `wiki/meeseeks-wiki/concepts/project-model.md`
- Modify: `wiki/meeseeks-wiki/runbooks/project-setup.md`
- Modify: `wiki/meeseeks-wiki/syntheses/architecture-overview.md`
- Modify: `wiki/meeseeks-wiki/log.md`

- [ ] **Step 1: Update `concepts/project-model.md`**

Change the Project section to note the file is now `project.yaml` with fallback to `project.meeseeks`.

- [ ] **Step 2: Update `components/web.md`**

Remove references to `PickerRoute`, `NewProjectModal`, project picker, project open/close. Note that the root route redirects to `/boards`.

- [ ] **Step 3: Update `runbooks/project-setup.md`**

- Remove "Method 2: Start full dev stack, open project via UI"
- Update "Method 1" to be the default: `npm run dev` uses cwd; `npm run dev:server -- ./path` to specify a path
- Note project file is `project.yaml` (auto-created if absent)

- [ ] **Step 4: Update `syntheses/architecture-overview.md`**

Remove reference to project picker in the Web UI section.

- [ ] **Step 5: Append to `log.md`**

```
[2026-04-27] update | Project model simplification — project.yaml replaces project.meeseeks; picker UI removed; server always opens a project at startup
```

- [ ] **Step 6: Commit**

```bash
git add wiki/
git commit -m "docs(wiki): update for project model simplification"
```
