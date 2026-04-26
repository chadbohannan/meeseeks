# Storage and Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the filesystem storage layer and the Fastify HTTP + WebSocket server that exposes it. End state: an `npm run dev` server that can open a project, do full CRUD on boards/lanes/tickets via REST, and push live filesystem-event updates over WebSocket.

**Architecture:** Three-layer Node.js + TypeScript project. `src/storage/` is a pure filesystem layer with typed errors and no I/O beyond `fs/promises`. `src/server/` wraps it with Fastify routes, a WebSocket hub, and a chokidar-based filesystem watcher that translates events into semantic `board-changed`/`lane-changed`/`ticket-changed` messages. `src/shared/` holds types used by both server and (later) web. No UI in this plan.

**Tech Stack:** Node.js 22, TypeScript 5, Fastify 5, `ws`, `chokidar`, `gray-matter`, `js-yaml`, `vitest`. Package manager: `npm`.

**Reference spec:** `docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md`

---

## File Structure

**Created in this plan:**
- `package.json`, `tsconfig.json`, `tsconfig.server.json`, `vitest.config.ts`, `.gitignore`, `.nvmrc`
- `src/shared/types.ts` — shared TypeScript types (Project, Board, Lane, Ticket, etc.)
- `src/shared/api.ts` — request/response shapes
- `src/shared/events.ts` — WebSocket event shapes
- `src/storage/errors.ts` — typed errors
- `src/storage/paths.ts` — path resolution and traversal safety
- `src/storage/project.ts` — `project.meeseeks` read/write, board listing
- `src/storage/board.ts` — board CRUD on the filesystem
- `src/storage/lane.ts` — lane CRUD, `lane.yaml` parsing
- `src/storage/ticket.ts` — ticket CRUD, frontmatter, move-between-states
- `src/server/index.ts` — Fastify entry, CLI argument handling
- `src/server/state.ts` — open-project state container
- `src/server/error-mapper.ts` — typed errors → JSON envelope
- `src/server/app-config.ts` — `~/.config/meeseeks/recents.json`
- `src/server/watcher.ts` — chokidar wrapper, debounce, semantic events
- `src/server/ws.ts` — WebSocket hub, broadcast helpers
- `src/server/routes/projects.ts`, `boards.ts`, `lanes.ts`, `tickets.ts`
- `tests/helpers/tmp-project.ts` — test helper that builds a tmp project tree
- `tests/storage/*.test.ts`, `tests/server/*.test.ts`

**One responsibility per file.** Storage files do not import server modules. Server files import storage and shared types only. Routes do not own state — they read/write through `state.ts`.

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.server.json`, `vitest.config.ts`, `.gitignore`, `.nvmrc`, `src/server/index.ts`

- [ ] **Step 1: Verify Node version**

Run: `node --version`
Expected: `v22.x` or higher. If lower, ask the user to install Node 22+ before proceeding.

- [ ] **Step 2: Create `.nvmrc`**

```
22
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "meeseeks",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev:server": "tsx watch src/server/index.ts",
    "build:server": "tsc -p tsconfig.server.json",
    "start": "node dist/server/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/static": "^8.0.0",
    "ws": "^8.18.0",
    "chokidar": "^4.0.1",
    "gray-matter": "^4.0.3",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.13",
    "@types/js-yaml": "^4.0.9",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Create `tsconfig.json` (base, used by tests/typecheck)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 5: Create `tsconfig.server.json` (build config)**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist/server",
    "rootDir": "src",
    "declaration": false,
    "noEmit": false,
    "allowImportingTsExtensions": false
  },
  "include": ["src/server/**/*", "src/storage/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    testTimeout: 10000,
    pool: 'forks',
  },
});
```

- [ ] **Step 7: Create `.gitignore`**

```
node_modules/
dist/
coverage/
*.log
.DS_Store
.meeseeks/
```

- [ ] **Step 8: Create placeholder `src/server/index.ts`**

```ts
console.log('meeseeks server placeholder');
```

- [ ] **Step 9: Install and verify**

Run: `npm install`
Expected: installs without errors.

Run: `npm run typecheck`
Expected: passes (no source files to check yet, exit 0).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.server.json vitest.config.ts .gitignore .nvmrc src/server/index.ts
git commit -m "Scaffold Node/TS project with Fastify and Vitest"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create `src/shared/types.ts`**

```ts
export interface ProjectConfig {
  name: string;
  boards: string[];
}

export interface ProjectMeta {
  path: string;          // absolute path to the project folder (containing project.meeseeks)
  config: ProjectConfig;
}

export interface BoardSummary {
  boardId: string;       // slug derived from project.meeseeks entry
  name: string;
  path: string;          // absolute
  available: boolean;    // false if folder is missing on disk
}

export interface BoardDetail extends BoardSummary {
  lanes: LaneSummary[];
}

export interface LaneState {
  dir: string;           // folder name on disk
  name: string;          // display name
}

export interface LaneSummary {
  laneName: string;      // folder name = id
  states: LaneState[];
  ticketCounts: Record<string, number>;  // by state.dir
  orphanedCount: number;
}

export interface LaneDetail extends LaneSummary {
  hasProcessDoc: boolean;
  hasPermissions: boolean;
}

export interface TicketSummary {
  filename: string;
  state: string;         // state.dir, or '__orphaned__' for tickets in unknown folders
  title: string;
  created: string;       // ISO
  updated: string;       // ISO
  orphaned: boolean;
}

export interface TicketDetail extends TicketSummary {
  body: string;
}

export interface RecentEntry {
  path: string;
  name: string;
  lastOpened: string;    // ISO
  available: boolean;    // checked at list-time
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "Add shared domain types"
```

---

## Task 3: Storage errors

**Files:**
- Create: `src/storage/errors.ts`
- Create: `tests/storage/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/storage/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  StorageError,
  NotFoundError,
  ConflictError,
  InvalidInputError,
  PathSafetyError,
  InvalidLaneError,
} from '../../src/storage/errors.js';

describe('storage errors', () => {
  it('NotFoundError has code NOT_FOUND', () => {
    const e = new NotFoundError('thing missing');
    expect(e).toBeInstanceOf(StorageError);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toBe('thing missing');
  });

  it('ConflictError has code CONFLICT', () => {
    expect(new ConflictError('x').code).toBe('CONFLICT');
  });

  it('InvalidInputError has code INVALID_INPUT', () => {
    expect(new InvalidInputError('x').code).toBe('INVALID_INPUT');
  });

  it('PathSafetyError has code PATH_UNSAFE', () => {
    expect(new PathSafetyError('x').code).toBe('PATH_UNSAFE');
  });

  it('InvalidLaneError has code INVALID_LANE and a reason', () => {
    const e = new InvalidLaneError('bad lane', 'missing lane.yaml');
    expect(e.code).toBe('INVALID_LANE');
    expect(e.reason).toBe('missing lane.yaml');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/storage/errors.ts`**

```ts
export type StorageErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_INPUT'
  | 'PATH_UNSAFE'
  | 'INVALID_LANE'
  | 'PROJECT_NOT_OPEN';

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends StorageError {
  constructor(message: string) { super('NOT_FOUND', message); }
}

export class ConflictError extends StorageError {
  constructor(message: string) { super('CONFLICT', message); }
}

export class InvalidInputError extends StorageError {
  constructor(message: string) { super('INVALID_INPUT', message); }
}

export class PathSafetyError extends StorageError {
  constructor(message: string) { super('PATH_UNSAFE', message); }
}

export class InvalidLaneError extends StorageError {
  readonly reason: string;
  constructor(message: string, reason: string) {
    super('INVALID_LANE', message);
    this.reason = reason;
  }
}

export class ProjectNotOpenError extends StorageError {
  constructor() { super('PROJECT_NOT_OPEN', 'no project is currently open'); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/errors.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/storage/errors.ts tests/storage/errors.test.ts
git commit -m "Add typed storage errors"
```

---

## Task 4: Path resolution and traversal safety

**Files:**
- Create: `src/storage/paths.ts`
- Create: `tests/storage/paths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/storage/paths.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveWithin, slugifyBoardPath } from '../../src/storage/paths.js';
import { PathSafetyError } from '../../src/storage/errors.js';

describe('resolveWithin', () => {
  const root = path.resolve('/tmp/meeseeks-test');

  it('resolves a child path under the root', () => {
    expect(resolveWithin(root, 'a/b.md')).toBe(path.join(root, 'a/b.md'));
  });

  it('rejects parent traversal', () => {
    expect(() => resolveWithin(root, '../escape.md')).toThrow(PathSafetyError);
  });

  it('rejects absolute paths outside root', () => {
    expect(() => resolveWithin(root, '/etc/passwd')).toThrow(PathSafetyError);
  });

  it('accepts absolute paths inside root', () => {
    expect(resolveWithin(root, path.join(root, 'sub/x.md')))
      .toBe(path.join(root, 'sub/x.md'));
  });
});

describe('slugifyBoardPath', () => {
  it('produces a stable slug from a folder path', () => {
    expect(slugifyBoardPath('boards/my-board')).toBe('my-board');
  });

  it('lowercases and replaces non-alphanumerics', () => {
    expect(slugifyBoardPath('boards/My Board!')).toBe('my-board');
  });

  it('strips trailing slashes', () => {
    expect(slugifyBoardPath('boards/my-board/')).toBe('my-board');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/paths.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/storage/paths.ts`**

```ts
import path from 'node:path';
import { PathSafetyError } from './errors.js';

/** Resolve `child` against `root` and guarantee the result stays inside `root`. */
export function resolveWithin(root: string, child: string): string {
  const absRoot = path.resolve(root);
  const resolved = path.isAbsolute(child)
    ? path.resolve(child)
    : path.resolve(absRoot, child);
  const rel = path.relative(absRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathSafetyError(`path escapes root: ${child}`);
  }
  return resolved;
}

/** Derive a stable, filesystem-safe board id from its config path. */
export function slugifyBoardPath(configPath: string): string {
  const base = path.basename(configPath.replace(/[\\/]+$/, ''));
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Build a datetime-prefixed ticket filename (filesystem-safe). */
export function buildTicketFilename(title: string, now: Date = new Date()): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
  const ts = formatStamp(now);
  return `${ts}-${slug}.md`;
}

function formatStamp(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

export function appendCollisionSuffix(filename: string, suffix: string): string {
  const ext = path.extname(filename);
  const base = filename.slice(0, -ext.length);
  return `${base}-${suffix}${ext}`;
}

export function randomSuffix(): string {
  return Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/paths.ts tests/storage/paths.test.ts
git commit -m "Add path safety and slug helpers"
```

---

## Task 5: Test helper for tmp projects

**Files:**
- Create: `tests/helpers/tmp-project.ts`

This helper is used by every later test. No production code, no failing test of its own — verified by use.

- [ ] **Step 1: Implement `tests/helpers/tmp-project.ts`**

```ts
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface TmpProject {
  root: string;
  cleanup(): Promise<void>;
}

export async function makeTmpProject(): Promise<TmpProject> {
  const root = await mkdtemp(path.join(tmpdir(), 'meeseeks-'));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function writeYaml(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

export async function writeText(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

export async function makeBareProject(name = 'Test Project'): Promise<TmpProject> {
  const tp = await makeTmpProject();
  await writeYaml(path.join(tp.root, 'project.meeseeks'), `name: ${name}\nboards: []\n`);
  return tp;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/tmp-project.ts
git commit -m "Add tmp-project test helper"
```

---

## Task 6: Project read/write/create

**Files:**
- Create: `src/storage/project.ts`
- Create: `tests/storage/project.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/storage/project.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readProject, createProject, listBoards, addBoardToProject } from '../../src/storage/project.js';
import { NotFoundError, ConflictError } from '../../src/storage/errors.js';
import { makeTmpProject, makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe('createProject', () => {
  it('writes a project.meeseeks file', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);

    const meta = await createProject(tp.root, 'My Proj');
    expect(meta.config.name).toBe('My Proj');
    expect(meta.config.boards).toEqual([]);

    const text = await readFile(path.join(tp.root, 'project.meeseeks'), 'utf8');
    expect(text).toContain('name: My Proj');
  });

  it('rejects an existing project file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await expect(createProject(tp.root, 'Other')).rejects.toThrow(ConflictError);
  });
});

describe('readProject', () => {
  it('returns parsed config', async () => {
    const tp = await makeBareProject('Hello');
    cleanups.push(tp.cleanup);
    const meta = await readProject(tp.root);
    expect(meta.config.name).toBe('Hello');
  });

  it('throws NotFoundError when project.meeseeks missing', async () => {
    const tp = await makeTmpProject();
    cleanups.push(tp.cleanup);
    await expect(readProject(tp.root)).rejects.toThrow(NotFoundError);
  });
});

describe('listBoards / addBoardToProject', () => {
  it('returns empty list initially', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    expect(await listBoards(tp.root)).toEqual([]);
  });

  it('adds a board entry and reports availability', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b1');
    await mkdir(boardPath, { recursive: true });

    await addBoardToProject(tp.root, 'boards/b1');
    const list = await listBoards(tp.root);
    expect(list).toHaveLength(1);
    expect(list[0]!.boardId).toBe('b1');
    expect(list[0]!.available).toBe(true);
  });

  it('flags missing folders as unavailable', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await addBoardToProject(tp.root, 'boards/missing');
    const list = await listBoards(tp.root);
    expect(list[0]!.available).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/project.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/storage/project.ts`**

```ts
import { readFile, writeFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { NotFoundError, ConflictError, InvalidInputError } from './errors.js';
import { resolveWithin, slugifyBoardPath } from './paths.js';
import type { ProjectConfig, ProjectMeta, BoardSummary } from '../shared/types.js';

const PROJECT_FILE = 'project.meeseeks';

function configPath(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_FILE);
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

export async function readProject(projectRoot: string): Promise<ProjectMeta> {
  const p = configPath(projectRoot);
  if (!(await exists(p))) {
    throw new NotFoundError(`no project.meeseeks at ${projectRoot}`);
  }
  const text = await readFile(p, 'utf8');
  const parsed = yaml.load(text) as Partial<ProjectConfig> | null;
  if (!parsed || typeof parsed !== 'object') {
    throw new InvalidInputError(`malformed project.meeseeks at ${p}`);
  }
  const config: ProjectConfig = {
    name: typeof parsed.name === 'string' ? parsed.name : path.basename(projectRoot),
    boards: Array.isArray(parsed.boards) ? parsed.boards.filter((b): b is string => typeof b === 'string') : [],
  };
  return { path: path.resolve(projectRoot), config };
}

export async function writeProject(projectRoot: string, config: ProjectConfig): Promise<void> {
  const text = yaml.dump(config, { lineWidth: 100 });
  await writeFile(configPath(projectRoot), text, 'utf8');
}

export async function createProject(projectRoot: string, name: string): Promise<ProjectMeta> {
  if (!name || typeof name !== 'string') {
    throw new InvalidInputError('project name required');
  }
  if (await exists(configPath(projectRoot))) {
    throw new ConflictError(`project already exists at ${projectRoot}`);
  }
  const config: ProjectConfig = { name, boards: [] };
  await writeProject(projectRoot, config);
  return { path: path.resolve(projectRoot), config };
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
  if (idx === -1) throw new NotFoundError(`board not registered: ${boardPath}`);
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
    let name = path.basename(abs);
    out.push({ boardId: id, name, path: abs, available });
  }
  return out;
}

/** Look up a board by its derived id; throws NotFoundError if absent. */
export async function getBoard(projectRoot: string, boardId: string): Promise<BoardSummary> {
  const boards = await listBoards(projectRoot);
  const board = boards.find(b => b.boardId === boardId);
  if (!board) throw new NotFoundError(`no board with id ${boardId}`);
  return board;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/project.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/project.ts tests/storage/project.test.ts
git commit -m "Implement project read/write/create and board listing"
```

---

## Task 7: Board CRUD (filesystem operations)

**Files:**
- Create: `src/storage/board.ts`
- Create: `tests/storage/board.test.ts`

A "Board" on disk is a folder containing optional `CLAUDE.md`, `board.yaml`, and a `lanes/` subfolder. Creating a board scaffolds these. Renaming a board renames the folder. Deleting (with `deleteFiles`) removes the folder; without it, only the project entry is removed (handled by Task 6's `removeBoardFromProject`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/storage/board.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { createBoard, renameBoard, deleteBoardFolder, readBoardDetail } from '../../src/storage/board.js';
import { addBoardToProject, listBoards } from '../../src/storage/project.js';
import { ConflictError, NotFoundError } from '../../src/storage/errors.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

describe('createBoard', () => {
  it('creates folder, CLAUDE.md, board.yaml, lanes/', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');

    await createBoard(boardPath, 'My Board');
    expect(await exists(path.join(boardPath, 'CLAUDE.md'))).toBe(true);
    expect(await exists(path.join(boardPath, 'board.yaml'))).toBe(true);
    expect(await exists(path.join(boardPath, 'lanes'))).toBe(true);

    const claudeMd = await readFile(path.join(boardPath, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('My Board');
  });

  it('rejects existing folder', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/my-board');
    await createBoard(boardPath, 'My Board');
    await expect(createBoard(boardPath, 'Again')).rejects.toThrow(ConflictError);
  });
});

describe('readBoardDetail', () => {
  it('returns lane summaries for an existing board', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    const detail = await readBoardDetail(boardPath);
    expect(detail.lanes).toEqual([]);
  });
});

describe('renameBoard', () => {
  it('renames the directory and updates project entry', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/old');
    await createBoard(boardPath, 'Old');
    await addBoardToProject(tp.root, 'boards/old');

    const newPath = path.join(tp.root, 'boards/renamed');
    await renameBoard(tp.root, 'boards/old', 'boards/renamed');

    expect(await exists(boardPath)).toBe(false);
    expect(await exists(newPath)).toBe(true);
    const list = await listBoards(tp.root);
    expect(list[0]!.path).toBe(newPath);
  });
});

describe('deleteBoardFolder', () => {
  it('removes the directory tree', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');

    await deleteBoardFolder(boardPath);
    expect(await exists(boardPath)).toBe(false);
  });

  it('throws NotFoundError when folder absent', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await expect(deleteBoardFolder(path.join(tp.root, 'nope'))).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/board.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/storage/board.ts`**

```ts
import { mkdir, rename, rm, writeFile, readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, NotFoundError, InvalidInputError } from './errors.js';
import { listBoards, readProject, writeProject } from './project.js';
import { listLanes } from './lane.js';
import type { BoardDetail } from '../shared/types.js';

const DEFAULT_BOARD_YAML = (name: string) => yaml.dump({
  runtime: {
    harness: 'claude-code',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    args: [],
    env: {},
  },
});

const DEFAULT_CLAUDE_MD = (name: string) => `# ${name}\n\nBoard-level instructions for agents go here.\n`;

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

export async function createBoard(boardPath: string, name: string): Promise<void> {
  if (!name || typeof name !== 'string') throw new InvalidInputError('board name required');
  if (await exists(boardPath)) throw new ConflictError(`board folder already exists: ${boardPath}`);
  await mkdir(path.join(boardPath, 'lanes'), { recursive: true });
  await writeFile(path.join(boardPath, 'CLAUDE.md'), DEFAULT_CLAUDE_MD(name), 'utf8');
  await writeFile(path.join(boardPath, 'board.yaml'), DEFAULT_BOARD_YAML(name), 'utf8');
}

export async function readBoardDetail(boardPath: string): Promise<BoardDetail> {
  if (!(await exists(boardPath))) {
    throw new NotFoundError(`board not found: ${boardPath}`);
  }
  const lanes = await listLanes(boardPath);
  return {
    boardId: path.basename(boardPath),
    name: path.basename(boardPath),
    path: boardPath,
    available: true,
    lanes,
  };
}

export async function renameBoard(
  projectRoot: string,
  oldEntry: string,
  newEntry: string,
): Promise<void> {
  const meta = await readProject(projectRoot);
  const idx = meta.config.boards.indexOf(oldEntry);
  if (idx === -1) throw new NotFoundError(`board not registered: ${oldEntry}`);
  const oldAbs = path.isAbsolute(oldEntry) ? oldEntry : path.resolve(projectRoot, oldEntry);
  const newAbs = path.isAbsolute(newEntry) ? newEntry : path.resolve(projectRoot, newEntry);
  if (await exists(newAbs)) throw new ConflictError(`destination exists: ${newAbs}`);
  await mkdir(path.dirname(newAbs), { recursive: true });
  await rename(oldAbs, newAbs);
  meta.config.boards[idx] = newEntry;
  await writeProject(projectRoot, meta.config);
}

export async function deleteBoardFolder(boardPath: string): Promise<void> {
  if (!(await exists(boardPath))) throw new NotFoundError(`board folder not found: ${boardPath}`);
  await rm(boardPath, { recursive: true, force: true });
}
```

- [ ] **Step 4: Stub `src/storage/lane.ts` so `board.ts` compiles**

Create a minimal stub now; full implementation in Task 8.

```ts
// src/storage/lane.ts (stub)
import type { LaneSummary } from '../shared/types.js';
export async function listLanes(_boardPath: string): Promise<LaneSummary[]> {
  return [];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/storage/board.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/storage/board.ts src/storage/lane.ts tests/storage/board.test.ts
git commit -m "Implement board create/read/rename/delete"
```

---

## Task 8: Lane CRUD with `lane.yaml`

**Files:**
- Modify: `src/storage/lane.ts`
- Create: `tests/storage/lane.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/storage/lane.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import {
  createLane, listLanes, readLaneDetail, renameLane, updateLaneStates, deleteLaneFolder,
} from '../../src/storage/lane.js';
import { createBoard } from '../../src/storage/board.js';
import { ConflictError, NotFoundError, InvalidLaneError } from '../../src/storage/errors.js';
import { makeBareProject, writeYaml } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

const STATES = [
  { dir: 'todo', name: 'Todo' },
  { dir: 'doing', name: 'Doing' },
  { dir: 'done', name: 'Done' },
];

async function setupBoard() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const boardPath = path.join(tp.root, 'boards/b');
  await createBoard(boardPath, 'B');
  return { tp, boardPath };
}

describe('createLane', () => {
  it('creates folder, lane.yaml, state subfolders', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    const lanePath = path.join(boardPath, 'lanes/work');
    expect(await exists(path.join(lanePath, 'lane.yaml'))).toBe(true);
    expect(await exists(path.join(lanePath, 'PROCESS.md'))).toBe(true);
    expect(await exists(path.join(lanePath, 'permissions.yaml'))).toBe(true);
    for (const s of STATES) {
      expect(await exists(path.join(lanePath, s.dir))).toBe(true);
    }
    const yaml = await readFile(path.join(lanePath, 'lane.yaml'), 'utf8');
    expect(yaml).toContain('todo');
  });

  it('rejects duplicate lane name', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    await expect(createLane(boardPath, 'work', STATES)).rejects.toThrow(ConflictError);
  });
});

describe('listLanes / readLaneDetail', () => {
  it('lists lanes with empty ticket counts', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    const lanes = await listLanes(boardPath);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.ticketCounts).toEqual({ todo: 0, doing: 0, done: 0 });
  });

  it('throws InvalidLaneError when lane.yaml missing', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(boardPath, 'lanes/work/lane.yaml'));
    await expect(readLaneDetail(boardPath, 'work')).rejects.toThrow(InvalidLaneError);
  });

  it('auto-creates state folders missing on disk but listed in lane.yaml', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    const { rm } = await import('node:fs/promises');
    await rm(path.join(boardPath, 'lanes/work/doing'), { recursive: true });
    await readLaneDetail(boardPath, 'work');  // auto-creates
    expect(await exists(path.join(boardPath, 'lanes/work/doing'))).toBe(true);
  });
});

describe('updateLaneStates', () => {
  it('adds a new state folder', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    await updateLaneStates(boardPath, 'work', [...STATES, { dir: 'review', name: 'Review' }]);
    expect(await exists(path.join(boardPath, 'lanes/work/review'))).toBe(true);
  });

  it('rejects removal of a state folder containing tickets unless force=true', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    await writeYaml(path.join(boardPath, 'lanes/work/doing/2026-04-26T1430-x.md'), '---\ntitle: x\n---\n');
    await expect(
      updateLaneStates(boardPath, 'work', STATES.filter(s => s.dir !== 'doing')),
    ).rejects.toThrow(ConflictError);
  });
});

describe('renameLane', () => {
  it('renames folder', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    await renameLane(boardPath, 'work', 'engineering');
    expect(await exists(path.join(boardPath, 'lanes/engineering'))).toBe(true);
    expect(await exists(path.join(boardPath, 'lanes/work'))).toBe(false);
  });
});

describe('deleteLaneFolder', () => {
  it('removes lane', async () => {
    const { boardPath } = await setupBoard();
    await createLane(boardPath, 'work', STATES);
    await deleteLaneFolder(boardPath, 'work');
    expect(await exists(path.join(boardPath, 'lanes/work'))).toBe(false);
  });

  it('throws NotFoundError on missing lane', async () => {
    const { boardPath } = await setupBoard();
    await expect(deleteLaneFolder(boardPath, 'nope')).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/lane.test.ts`
Expected: FAIL — most exports missing.

- [ ] **Step 3: Implement `src/storage/lane.ts`**

```ts
import { mkdir, readFile, writeFile, readdir, rename, rm, access } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConflictError, NotFoundError, InvalidInputError, InvalidLaneError } from './errors.js';
import { resolveWithin } from './paths.js';
import type { LaneSummary, LaneDetail, LaneState } from '../shared/types.js';

const LANE_YAML = 'lane.yaml';
const PROCESS_MD = 'PROCESS.md';
const PERMISSIONS = 'permissions.yaml';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function lanesDir(boardPath: string): string {
  return path.join(boardPath, 'lanes');
}

function lanePath(boardPath: string, laneName: string): string {
  return resolveWithin(lanesDir(boardPath), laneName);
}

function validateStates(states: LaneState[]): void {
  if (!Array.isArray(states) || states.length === 0) {
    throw new InvalidInputError('lane requires at least one state');
  }
  const seen = new Set<string>();
  for (const s of states) {
    if (!s.dir || !/^[a-z0-9][a-z0-9-]*$/i.test(s.dir)) {
      throw new InvalidInputError(`invalid state dir: ${s.dir}`);
    }
    if (seen.has(s.dir)) throw new InvalidInputError(`duplicate state dir: ${s.dir}`);
    seen.add(s.dir);
    if (!s.name) throw new InvalidInputError(`state name required for ${s.dir}`);
  }
}

export async function createLane(boardPath: string, laneName: string, states: LaneState[]): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(laneName)) {
    throw new InvalidInputError(`invalid lane name: ${laneName}`);
  }
  validateStates(states);
  const lp = lanePath(boardPath, laneName);
  if (await exists(lp)) throw new ConflictError(`lane exists: ${laneName}`);
  await mkdir(lp, { recursive: true });
  for (const s of states) await mkdir(path.join(lp, s.dir), { recursive: true });
  await writeFile(path.join(lp, LANE_YAML), yaml.dump({ states }), 'utf8');
  await writeFile(path.join(lp, PROCESS_MD), `# Process for ${laneName}\n\nDescribe stages and transition rules here.\n`, 'utf8');
  await writeFile(path.join(lp, PERMISSIONS), yaml.dump({ allowedPaths: [], allowedTools: [], deniedTools: [] }), 'utf8');
}

async function readLaneStates(lp: string): Promise<LaneState[]> {
  const yamlPath = path.join(lp, LANE_YAML);
  if (!(await exists(yamlPath))) {
    throw new InvalidLaneError(`missing lane.yaml at ${lp}`, 'missing lane.yaml');
  }
  const text = await readFile(yamlPath, 'utf8');
  const parsed = yaml.load(text) as { states?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.states)) {
    throw new InvalidLaneError(`malformed lane.yaml at ${lp}`, 'malformed lane.yaml');
  }
  const states: LaneState[] = [];
  for (const raw of parsed.states) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as { dir?: unknown; name?: unknown };
    if (typeof r.dir !== 'string' || typeof r.name !== 'string') continue;
    states.push({ dir: r.dir, name: r.name });
  }
  if (states.length === 0) {
    throw new InvalidLaneError(`lane.yaml has no valid states`, 'no states');
  }
  return states;
}

export async function listLanes(boardPath: string): Promise<LaneSummary[]> {
  const dir = lanesDir(boardPath);
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const summaries: LaneSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const detail = await readLaneSummary(boardPath, e.name);
      summaries.push(detail);
    } catch (err) {
      if (err instanceof InvalidLaneError) {
        summaries.push({
          laneName: e.name,
          states: [],
          ticketCounts: {},
          orphanedCount: 0,
        });
      } else {
        throw err;
      }
    }
  }
  return summaries;
}

async function readLaneSummary(boardPath: string, laneName: string): Promise<LaneSummary> {
  const lp = lanePath(boardPath, laneName);
  const states = await readLaneStates(lp);
  const ticketCounts: Record<string, number> = {};
  for (const s of states) {
    const sp = path.join(lp, s.dir);
    if (!(await exists(sp))) {
      await mkdir(sp, { recursive: true });  // auto-create
    }
    const files = await readdir(sp);
    ticketCounts[s.dir] = files.filter(f => f.endsWith('.md')).length;
  }
  // Detect orphans: .md files in subfolders not listed in states
  const known = new Set(states.map(s => s.dir));
  let orphanedCount = 0;
  const all = await readdir(lp, { withFileTypes: true });
  for (const e of all) {
    if (!e.isDirectory() || known.has(e.name)) continue;
    if (e.name === '.' || e.name === '..') continue;
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const files = await readdir(path.join(lp, e.name));
    orphanedCount += files.filter(f => f.endsWith('.md')).length;
  }
  return { laneName, states, ticketCounts, orphanedCount };
}

export async function readLaneDetail(boardPath: string, laneName: string): Promise<LaneDetail> {
  const lp = lanePath(boardPath, laneName);
  if (!(await exists(lp))) throw new NotFoundError(`lane not found: ${laneName}`);
  const summary = await readLaneSummary(boardPath, laneName);
  return {
    ...summary,
    hasProcessDoc: await exists(path.join(lp, PROCESS_MD)),
    hasPermissions: await exists(path.join(lp, PERMISSIONS)),
  };
}

export async function updateLaneStates(
  boardPath: string,
  laneName: string,
  newStates: LaneState[],
  opts: { force?: boolean } = {},
): Promise<void> {
  validateStates(newStates);
  const lp = lanePath(boardPath, laneName);
  const oldStates = await readLaneStates(lp);
  const newDirs = new Set(newStates.map(s => s.dir));
  for (const s of oldStates) {
    if (newDirs.has(s.dir)) continue;
    const sp = path.join(lp, s.dir);
    const files = (await readdir(sp).catch(() => [])).filter(f => f.endsWith('.md'));
    if (files.length > 0 && !opts.force) {
      throw new ConflictError(`state ${s.dir} contains tickets; remove them or pass force=true`);
    }
  }
  for (const s of newStates) {
    await mkdir(path.join(lp, s.dir), { recursive: true });
  }
  await writeFile(path.join(lp, LANE_YAML), yaml.dump({ states: newStates }), 'utf8');
  // Removed-state folders are NOT deleted from disk in this slice; tickets become orphaned.
}

export async function renameLane(boardPath: string, oldName: string, newName: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(newName)) {
    throw new InvalidInputError(`invalid lane name: ${newName}`);
  }
  const oldPath = lanePath(boardPath, oldName);
  const newPath = lanePath(boardPath, newName);
  if (!(await exists(oldPath))) throw new NotFoundError(`lane not found: ${oldName}`);
  if (await exists(newPath)) throw new ConflictError(`lane exists: ${newName}`);
  await rename(oldPath, newPath);
}

export async function deleteLaneFolder(boardPath: string, laneName: string): Promise<void> {
  const lp = lanePath(boardPath, laneName);
  if (!(await exists(lp))) throw new NotFoundError(`lane not found: ${laneName}`);
  await rm(lp, { recursive: true, force: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/lane.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/lane.ts tests/storage/lane.test.ts
git commit -m "Implement lane CRUD with lane.yaml"
```

---

## Task 9: Ticket CRUD with frontmatter and move-between-states

**Files:**
- Create: `src/storage/ticket.ts`
- Create: `tests/storage/ticket.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/storage/ticket.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import {
  createTicket, listTickets, readTicket, updateTicket, deleteTicket,
} from '../../src/storage/ticket.js';
import { createBoard } from '../../src/storage/board.js';
import { createLane } from '../../src/storage/lane.js';
import { NotFoundError, InvalidInputError } from '../../src/storage/errors.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

const STATES = [
  { dir: 'todo', name: 'Todo' },
  { dir: 'doing', name: 'Doing' },
  { dir: 'done', name: 'Done' },
];

async function setup() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const boardPath = path.join(tp.root, 'boards/b');
  await createBoard(boardPath, 'B');
  await createLane(boardPath, 'work', STATES);
  return { boardPath, lanePath: path.join(boardPath, 'lanes/work') };
}

describe('createTicket', () => {
  it('creates a markdown file with frontmatter in the state folder', async () => {
    const { boardPath } = await setup();
    const t = await createTicket(boardPath, 'work', { title: 'Fix login', state: 'todo', body: 'Body text' });
    expect(t.title).toBe('Fix login');
    expect(t.state).toBe('todo');
    expect(t.filename.endsWith('.md')).toBe(true);
    const filePath = path.join(boardPath, 'lanes/work/todo', t.filename);
    const text = await readFile(filePath, 'utf8');
    expect(text).toContain('title: Fix login');
    expect(text).toContain('Body text');
  });

  it('rejects unknown state', async () => {
    const { boardPath } = await setup();
    await expect(createTicket(boardPath, 'work', { title: 'x', state: 'nope' })).rejects.toThrow(InvalidInputError);
  });
});

describe('listTickets', () => {
  it('lists tickets across all states', async () => {
    const { boardPath } = await setup();
    await createTicket(boardPath, 'work', { title: 'a', state: 'todo' });
    await createTicket(boardPath, 'work', { title: 'b', state: 'doing' });
    const list = await listTickets(boardPath, 'work');
    expect(list).toHaveLength(2);
  });
});

describe('readTicket', () => {
  it('returns parsed ticket', async () => {
    const { boardPath } = await setup();
    const created = await createTicket(boardPath, 'work', { title: 'x', state: 'todo', body: 'hi' });
    const t = await readTicket(boardPath, 'work', created.filename);
    expect(t.title).toBe('x');
    expect(t.body.trim()).toBe('hi');
  });

  it('throws NotFoundError for missing file', async () => {
    const { boardPath } = await setup();
    await expect(readTicket(boardPath, 'work', '2026-01-01T0000-nope.md')).rejects.toThrow(NotFoundError);
  });
});

describe('updateTicket', () => {
  it('updates title and body without moving', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'orig', state: 'todo', body: 'old' });
    const u = await updateTicket(boardPath, 'work', c.filename, { title: 'new', body: 'new body' });
    expect(u.title).toBe('new');
    const text = await readFile(path.join(boardPath, 'lanes/work/todo', c.filename), 'utf8');
    expect(text).toContain('new body');
  });

  it('moves the file when state changes', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'x', state: 'todo' });
    const moved = await updateTicket(boardPath, 'work', c.filename, { state: 'doing' });
    expect(moved.state).toBe('doing');
    expect(await exists(path.join(boardPath, 'lanes/work/todo', c.filename))).toBe(false);
    expect(await exists(path.join(boardPath, 'lanes/work/doing', c.filename))).toBe(true);
  });
});

describe('deleteTicket', () => {
  it('removes the file', async () => {
    const { boardPath } = await setup();
    const c = await createTicket(boardPath, 'work', { title: 'x', state: 'todo' });
    await deleteTicket(boardPath, 'work', c.filename);
    expect(await exists(path.join(boardPath, 'lanes/work/todo', c.filename))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/ticket.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/storage/ticket.ts`**

```ts
import { readFile, writeFile, rename, unlink, readdir, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { NotFoundError, InvalidInputError, ConflictError } from './errors.js';
import { buildTicketFilename, appendCollisionSuffix, randomSuffix, resolveWithin } from './paths.js';
import type { TicketSummary, TicketDetail, LaneState } from '../shared/types.js';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function lanePath(boardPath: string, laneName: string): string {
  return resolveWithin(path.join(boardPath, 'lanes'), laneName);
}

async function readStates(lp: string): Promise<LaneState[]> {
  const text = await readFile(path.join(lp, 'lane.yaml'), 'utf8').catch(() => null);
  if (!text) return [];
  const parsed = yaml.load(text) as { states?: LaneState[] } | null;
  return Array.isArray(parsed?.states) ? parsed!.states : [];
}

interface FrontMatter {
  title: string;
  created: string;
  updated: string;
}

async function findTicketFile(lp: string, filename: string): Promise<{ state: string; abs: string } | null> {
  const entries = await readdir(lp, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = path.join(lp, e.name, filename);
    if (await exists(candidate)) return { state: e.name, abs: candidate };
  }
  return null;
}

function parse(content: string): { fm: FrontMatter; body: string } {
  const parsed = matter(content);
  const data = parsed.data as Partial<FrontMatter>;
  if (typeof data.title !== 'string') throw new InvalidInputError('ticket frontmatter missing title');
  return {
    fm: {
      title: data.title,
      created: typeof data.created === 'string' ? data.created : new Date().toISOString(),
      updated: typeof data.updated === 'string' ? data.updated : new Date().toISOString(),
    },
    body: parsed.content,
  };
}

function serialize(fm: FrontMatter, body: string): string {
  return matter.stringify(body, fm);
}

export async function createTicket(
  boardPath: string,
  laneName: string,
  input: { title: string; state: string; body?: string },
): Promise<TicketSummary> {
  if (!input.title) throw new InvalidInputError('title required');
  const lp = lanePath(boardPath, laneName);
  const states = await readStates(lp);
  if (!states.find(s => s.dir === input.state)) {
    throw new InvalidInputError(`unknown state: ${input.state}`);
  }
  let filename = buildTicketFilename(input.title);
  let target = path.join(lp, input.state, filename);
  let attempts = 0;
  while (await exists(target)) {
    if (++attempts > 5) throw new ConflictError('cannot generate unique filename');
    filename = appendCollisionSuffix(buildTicketFilename(input.title), randomSuffix());
    target = path.join(lp, input.state, filename);
  }
  const now = new Date().toISOString();
  const fm: FrontMatter = { title: input.title, created: now, updated: now };
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, serialize(fm, input.body ?? ''), 'utf8');
  return {
    filename,
    state: input.state,
    title: input.title,
    created: now,
    updated: now,
    orphaned: false,
  };
}

export async function listTickets(boardPath: string, laneName: string): Promise<TicketSummary[]> {
  const lp = lanePath(boardPath, laneName);
  const states = await readStates(lp);
  const known = new Set(states.map(s => s.dir));
  const out: TicketSummary[] = [];
  const dirEntries = await readdir(lp, { withFileTypes: true });
  for (const dirEntry of dirEntries) {
    if (!dirEntry.isDirectory()) continue;
    if (dirEntry.name.startsWith('.')) continue;
    const isKnown = known.has(dirEntry.name);
    const dirAbs = path.join(lp, dirEntry.name);
    const files = (await readdir(dirAbs)).filter(f => f.endsWith('.md'));
    for (const f of files) {
      try {
        const text = await readFile(path.join(dirAbs, f), 'utf8');
        const { fm } = parse(text);
        out.push({
          filename: f,
          state: isKnown ? dirEntry.name : '__orphaned__',
          title: fm.title,
          created: fm.created,
          updated: fm.updated,
          orphaned: !isKnown,
        });
      } catch { /* skip unparseable */ }
    }
  }
  return out;
}

export async function readTicket(
  boardPath: string,
  laneName: string,
  filename: string,
): Promise<TicketDetail> {
  const lp = lanePath(boardPath, laneName);
  const found = await findTicketFile(lp, filename);
  if (!found) throw new NotFoundError(`ticket not found: ${filename}`);
  const text = await readFile(found.abs, 'utf8');
  const { fm, body } = parse(text);
  const states = await readStates(lp);
  const known = new Set(states.map(s => s.dir));
  const orphaned = !known.has(found.state);
  return {
    filename,
    state: orphaned ? '__orphaned__' : found.state,
    title: fm.title,
    created: fm.created,
    updated: fm.updated,
    orphaned,
    body,
  };
}

export async function updateTicket(
  boardPath: string,
  laneName: string,
  filename: string,
  patch: { title?: string; body?: string; state?: string },
): Promise<TicketSummary> {
  const lp = lanePath(boardPath, laneName);
  const found = await findTicketFile(lp, filename);
  if (!found) throw new NotFoundError(`ticket not found: ${filename}`);
  const text = await readFile(found.abs, 'utf8');
  const { fm, body } = parse(text);
  const states = await readStates(lp);
  const newState = patch.state ?? found.state;
  if (patch.state !== undefined && !states.find(s => s.dir === patch.state)) {
    throw new InvalidInputError(`unknown state: ${patch.state}`);
  }
  const newFm: FrontMatter = {
    title: patch.title ?? fm.title,
    created: fm.created,
    updated: new Date().toISOString(),
  };
  const newBody = patch.body ?? body;
  const newAbs = path.join(lp, newState, filename);
  if (newAbs !== found.abs) {
    await mkdir(path.dirname(newAbs), { recursive: true });
    if (await exists(newAbs)) throw new ConflictError(`destination exists: ${filename} in ${newState}`);
    await writeFile(found.abs, serialize(newFm, newBody), 'utf8');
    await rename(found.abs, newAbs);
  } else {
    await writeFile(found.abs, serialize(newFm, newBody), 'utf8');
  }
  return {
    filename,
    state: newState,
    title: newFm.title,
    created: newFm.created,
    updated: newFm.updated,
    orphaned: false,
  };
}

export async function deleteTicket(
  boardPath: string,
  laneName: string,
  filename: string,
): Promise<void> {
  const lp = lanePath(boardPath, laneName);
  const found = await findTicketFile(lp, filename);
  if (!found) throw new NotFoundError(`ticket not found: ${filename}`);
  await unlink(found.abs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/ticket.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/ticket.ts tests/storage/ticket.test.ts
git commit -m "Implement ticket CRUD with frontmatter and state-folder moves"
```

---

## Task 10: Shared API and event types

**Files:**
- Create: `src/shared/api.ts`
- Create: `src/shared/events.ts`

- [ ] **Step 1: Create `src/shared/api.ts`**

```ts
import type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, LaneState, TicketSummary, TicketDetail, RecentEntry } from './types.js';

// Projects
export interface OpenProjectRequest { path: string }
export interface OpenProjectResponse { project: ProjectMeta; boards: BoardSummary[] }
export interface CreateProjectRequest { path: string; name: string }
export interface ListRecentsResponse { recents: RecentEntry[] }

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

export type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, TicketSummary, TicketDetail, RecentEntry };
```

- [ ] **Step 2: Create `src/shared/events.ts`**

```ts
import type { ProjectMeta, BoardSummary } from './types.js';

export type ChangeKind = 'created' | 'updated' | 'deleted';

export type WsEvent =
  | { type: 'project-opened'; payload: { project: ProjectMeta; boards: BoardSummary[] } }
  | { type: 'project-closed'; payload: Record<string, never> }
  | { type: 'board-changed'; payload: { boardId: string; kind: ChangeKind } }
  | { type: 'lane-changed'; payload: { boardId: string; laneName: string; kind: ChangeKind } }
  | { type: 'ticket-changed'; payload: { boardId: string; laneName: string; filename: string; state: string; kind: ChangeKind } };
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/shared/api.ts src/shared/events.ts
git commit -m "Add shared API and WebSocket event types"
```

---

## Task 11: App-level config (recents)

**Files:**
- Create: `src/server/app-config.ts`
- Create: `tests/server/app-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/app-config.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { AppConfig } from '../../src/server/app-config.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function makeDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'meeseeks-cfg-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

describe('AppConfig', () => {
  it('starts with empty recents', async () => {
    const dir = await makeDir();
    const cfg = new AppConfig(path.join(dir, 'recents.json'));
    expect(await cfg.listRecents()).toEqual([]);
  });

  it('records a recent and persists it', async () => {
    const dir = await makeDir();
    const file = path.join(dir, 'recents.json');
    const cfg = new AppConfig(file);
    await cfg.recordRecent('/some/path', 'My Proj');
    const list = await cfg.listRecents();
    expect(list).toHaveLength(1);
    expect(list[0]!.path).toBe('/some/path');
    expect(list[0]!.name).toBe('My Proj');
    const text = await readFile(file, 'utf8');
    expect(text).toContain('/some/path');
  });

  it('deduplicates and reorders by lastOpened', async () => {
    const dir = await makeDir();
    const cfg = new AppConfig(path.join(dir, 'recents.json'));
    await cfg.recordRecent('/a', 'A');
    await cfg.recordRecent('/b', 'B');
    await cfg.recordRecent('/a', 'A2');
    const list = await cfg.listRecents();
    expect(list.map(r => r.path)).toEqual(['/a', '/b']);
    expect(list[0]!.name).toBe('A2');
  });

  it('flags missing folders as unavailable', async () => {
    const dir = await makeDir();
    const cfg = new AppConfig(path.join(dir, 'recents.json'));
    await cfg.recordRecent('/definitely/not/here', 'x');
    const list = await cfg.listRecents();
    expect(list[0]!.available).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/app-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/app-config.ts`**

```ts
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { RecentEntry } from '../shared/types.js';

export function defaultRecentsPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, 'meeseeks', 'recents.json');
}

interface StoredRecent {
  path: string;
  name: string;
  lastOpened: string;
}

export class AppConfig {
  constructor(private readonly file: string = defaultRecentsPath()) {}

  private async loadStored(): Promise<StoredRecent[]> {
    try {
      const text = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(text) as { recents?: unknown };
      if (!parsed || !Array.isArray(parsed.recents)) return [];
      return parsed.recents.filter((r): r is StoredRecent =>
        typeof r === 'object' && r !== null
        && typeof (r as StoredRecent).path === 'string'
        && typeof (r as StoredRecent).name === 'string'
        && typeof (r as StoredRecent).lastOpened === 'string'
      );
    } catch {
      return [];
    }
  }

  private async save(items: StoredRecent[]): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify({ recents: items }, null, 2), 'utf8');
  }

  async recordRecent(projectPath: string, name: string): Promise<void> {
    const items = await this.loadStored();
    const filtered = items.filter(r => r.path !== projectPath);
    filtered.unshift({ path: projectPath, name, lastOpened: new Date().toISOString() });
    await this.save(filtered.slice(0, 50));
  }

  async listRecents(): Promise<RecentEntry[]> {
    const items = await this.loadStored();
    const out: RecentEntry[] = [];
    for (const r of items) {
      let available = false;
      try { available = (await stat(r.path)).isDirectory(); } catch { available = false; }
      out.push({ ...r, available });
    }
    return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server/app-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/app-config.ts tests/server/app-config.test.ts
git commit -m "Add app-level recents config"
```

---

## Task 12: Server state container and error mapper

**Files:**
- Create: `src/server/state.ts`
- Create: `src/server/error-mapper.ts`

These are small, used by routes. No dedicated tests; covered by route tests.

- [ ] **Step 1: Implement `src/server/state.ts`**

```ts
import type { ProjectMeta } from '../shared/types.js';
import { ProjectNotOpenError } from '../storage/errors.js';

export interface OpenProjectState {
  meta: ProjectMeta;
  watcherCleanup?: () => Promise<void>;
}

export class ServerState {
  private current: OpenProjectState | null = null;

  open(meta: ProjectMeta, watcherCleanup?: () => Promise<void>): void {
    this.current = { meta, watcherCleanup };
  }

  async close(): Promise<void> {
    if (this.current?.watcherCleanup) {
      await this.current.watcherCleanup();
    }
    this.current = null;
  }

  isOpen(): boolean { return this.current !== null; }

  require(): OpenProjectState {
    if (!this.current) throw new ProjectNotOpenError();
    return this.current;
  }

  peek(): OpenProjectState | null { return this.current; }
}
```

- [ ] **Step 2: Implement `src/server/error-mapper.ts`**

```ts
import { StorageError } from '../storage/errors.js';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_INPUT: 400,
  PATH_UNSAFE: 400,
  INVALID_LANE: 422,
  PROJECT_NOT_OPEN: 409,
};

export function mapErrorToResponse(
  err: FastifyError | Error,
  _req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (err instanceof StorageError) {
    const status = STATUS[err.code] ?? 500;
    reply.code(status).send({ error: { code: err.code, message: err.message } });
    return;
  }
  reply.code(500).send({ error: { code: 'INTERNAL', message: 'internal error' } });
  reply.log.error({ err }, 'unhandled error');
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/server/state.ts src/server/error-mapper.ts
git commit -m "Add server state container and error mapper"
```

---

## Task 13: WebSocket hub

**Files:**
- Create: `src/server/ws.ts`

- [ ] **Step 1: Implement `src/server/ws.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { WsEvent } from '../shared/events.js';
import type { ServerState } from './state.js';
import { listBoards } from '../storage/project.js';

export class WsHub {
  private clients = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.clients.add(socket);
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
  }

  broadcast(event: WsEvent): void {
    const text = JSON.stringify(event);
    for (const c of this.clients) {
      if (c.readyState === c.OPEN) c.send(text);
    }
  }

  send(socket: WebSocket, event: WsEvent): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
  }

  size(): number { return this.clients.size; }
}

export async function registerWs(
  app: FastifyInstance,
  state: ServerState,
  hub: WsHub,
): Promise<void> {
  app.get('/ws', { websocket: true }, async (socket) => {
    hub.add(socket);
    const open = state.peek();
    if (open) {
      const boards = await listBoards(open.meta.path);
      hub.send(socket, { type: 'project-opened', payload: { project: open.meta, boards } });
    } else {
      hub.send(socket, { type: 'project-closed', payload: {} });
    }
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/server/ws.ts
git commit -m "Add WebSocket hub"
```

---

## Task 14: Filesystem watcher

**Files:**
- Create: `src/server/watcher.ts`

The watcher translates raw chokidar events into semantic events with a 50ms debounce. We test it implicitly via the integration tests in Task 16+.

- [ ] **Step 1: Implement `src/server/watcher.ts`**

```ts
import chokidar from 'chokidar';
import path from 'node:path';
import type { ProjectMeta } from '../shared/types.js';
import type { ChangeKind, WsEvent } from '../shared/events.js';
import type { WsHub } from './ws.js';
import { slugifyBoardPath } from '../storage/paths.js';

export interface WatcherHandle {
  cleanup(): Promise<void>;
}

interface PendingChange {
  type: 'board' | 'lane' | 'ticket';
  payload: WsEvent['payload'];
  timer: NodeJS.Timeout;
  kind: ChangeKind;
}

const DEBOUNCE_MS = 50;

export function startWatcher(meta: ProjectMeta, hub: WsHub): WatcherHandle {
  const projectRoot = meta.path;
  const watcher = chokidar.watch(projectRoot, {
    ignored: ['**/node_modules/**', '**/.git/**', '**/.meeseeks/**'],
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 30, pollInterval: 20 },
  });

  const pending = new Map<string, PendingChange>();

  function emit(key: string, event: WsEvent): void {
    const existing = pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      pending.delete(key);
      hub.broadcast(event);
    }, DEBOUNCE_MS);
    pending.set(key, { type: 'ticket', payload: event.payload, timer, kind: 'updated' });
  }

  function handle(absPath: string, kind: ChangeKind): void {
    const rel = path.relative(projectRoot, absPath);
    if (!rel || rel.startsWith('..')) return;
    const parts = rel.split(path.sep);
    // Patterns we care about, relative to project root:
    // <boardEntry>/CLAUDE.md or board.yaml
    // <boardEntry>/lanes/<lane>/lane.yaml or PROCESS.md or permissions.yaml
    // <boardEntry>/lanes/<lane>/<state>/<filename>.md
    const lanesIdx = parts.indexOf('lanes');
    if (lanesIdx === -1) {
      // board-level change (e.g. board.yaml)
      const boardEntry = parts.slice(0, parts.length - 1).join('/');
      const boardId = slugifyBoardPath(boardEntry);
      emit(`board:${boardId}`, { type: 'board-changed', payload: { boardId, kind: 'updated' } });
      return;
    }
    const boardEntry = parts.slice(0, lanesIdx).join('/');
    const boardId = slugifyBoardPath(boardEntry);
    if (parts.length === lanesIdx + 2) {
      // <board>/lanes/<lane>  -- lane folder itself
      const laneName = parts[lanesIdx + 1]!;
      emit(`lane:${boardId}:${laneName}`, {
        type: 'lane-changed', payload: { boardId, laneName, kind },
      });
      return;
    }
    if (parts.length === lanesIdx + 3) {
      // <board>/lanes/<lane>/<file-or-state>
      const laneName = parts[lanesIdx + 1]!;
      const last = parts[lanesIdx + 2]!;
      if (['lane.yaml', 'PROCESS.md', 'permissions.yaml'].includes(last)) {
        emit(`lane:${boardId}:${laneName}`, {
          type: 'lane-changed', payload: { boardId, laneName, kind: 'updated' },
        });
      }
      return;
    }
    if (parts.length === lanesIdx + 4) {
      // <board>/lanes/<lane>/<state>/<file>.md
      const laneName = parts[lanesIdx + 1]!;
      const state = parts[lanesIdx + 2]!;
      const filename = parts[lanesIdx + 3]!;
      if (!filename.endsWith('.md')) return;
      emit(`ticket:${boardId}:${laneName}:${filename}`, {
        type: 'ticket-changed',
        payload: { boardId, laneName, filename, state, kind },
      });
    }
  }

  watcher.on('add', p => handle(p, 'created'));
  watcher.on('change', p => handle(p, 'updated'));
  watcher.on('unlink', p => handle(p, 'deleted'));
  watcher.on('addDir', p => handle(p, 'created'));
  watcher.on('unlinkDir', p => handle(p, 'deleted'));

  return {
    async cleanup() {
      for (const v of pending.values()) clearTimeout(v.timer);
      pending.clear();
      await watcher.close();
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/server/watcher.ts
git commit -m "Add filesystem watcher with debounced semantic events"
```

---

## Task 15: Project routes

**Files:**
- Create: `src/server/routes/projects.ts`
- Create: `tests/server/projects.test.ts`
- Create: `tests/helpers/server.ts`

- [ ] **Step 1: Create test helper that boots the server**

```ts
// tests/helpers/server.ts
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { ServerState } from '../../src/server/state.js';
import { WsHub, registerWs } from '../../src/server/ws.js';
import { mapErrorToResponse } from '../../src/server/error-mapper.js';
import { registerProjectRoutes } from '../../src/server/routes/projects.js';
import { registerBoardRoutes } from '../../src/server/routes/boards.js';
import { registerLaneRoutes } from '../../src/server/routes/lanes.js';
import { registerTicketRoutes } from '../../src/server/routes/tickets.js';
import { AppConfig } from '../../src/server/app-config.js';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

export interface TestServer {
  app: FastifyInstance;
  state: ServerState;
  hub: WsHub;
  appConfig: AppConfig;
  port: number;
  url: string;
  cleanup(): Promise<void>;
}

export async function bootTestServer(): Promise<TestServer> {
  const cfgDir = await mkdtemp(path.join(tmpdir(), 'meeseeks-srv-'));
  const appConfig = new AppConfig(path.join(cfgDir, 'recents.json'));
  const state = new ServerState();
  const hub = new WsHub();
  const app = Fastify({ logger: false });
  await app.register(websocket);
  app.setErrorHandler(mapErrorToResponse);
  await registerProjectRoutes(app, { state, hub, appConfig });
  await registerBoardRoutes(app, { state, hub });
  await registerLaneRoutes(app, { state, hub });
  await registerTicketRoutes(app, { state, hub });
  await registerWs(app, state, hub);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  const port = address.port;
  return {
    app, state, hub, appConfig, port, url: `http://127.0.0.1:${port}`,
    async cleanup() {
      await state.close();
      await app.close();
      await rm(cfgDir, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/server/projects.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe('project routes', () => {
  it('opens, current, closes a project', async () => {
    const srv = await bootTestServer();
    cleanups.push(srv.cleanup);
    const tp = await makeBareProject('Hello');
    cleanups.push(tp.cleanup);

    const open = await fetch(`${srv.url}/api/projects/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: tp.root }),
    });
    expect(open.status).toBe(200);
    const body = await open.json() as { project: { config: { name: string } } };
    expect(body.project.config.name).toBe('Hello');

    const cur = await fetch(`${srv.url}/api/projects/current`);
    expect(cur.status).toBe(200);

    const close = await fetch(`${srv.url}/api/projects/close`, { method: 'POST' });
    expect(close.status).toBe(200);

    const cur2 = await fetch(`${srv.url}/api/projects/current`);
    expect(cur2.status).toBe(404);
  });

  it('records project in recents on open', async () => {
    const srv = await bootTestServer();
    cleanups.push(srv.cleanup);
    const tp = await makeBareProject('R');
    cleanups.push(tp.cleanup);

    await fetch(`${srv.url}/api/projects/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: tp.root }),
    });
    const recents = await fetch(`${srv.url}/api/projects/recent`).then(r => r.json()) as { recents: Array<{ path: string }> };
    expect(recents.recents[0]!.path).toBe(tp.root);
  });

  it('returns 400 on invalid path', async () => {
    const srv = await bootTestServer();
    cleanups.push(srv.cleanup);
    const r = await fetch(`${srv.url}/api/projects/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/totally/not/a/place' }),
    });
    expect(r.status).toBe(404);
  });

  it('creates a new project', async () => {
    const srv = await bootTestServer();
    cleanups.push(srv.cleanup);
    const tp = await (await import('../helpers/tmp-project.js')).makeTmpProject();
    cleanups.push(tp.cleanup);
    const r = await fetch(`${srv.url}/api/projects/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: tp.root, name: 'Fresh' }),
    });
    expect(r.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/server/projects.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `src/server/routes/projects.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import type { AppConfig } from '../app-config.js';
import { readProject, createProject, listBoards } from '../../storage/project.js';
import { ProjectNotOpenError } from '../../storage/errors.js';
import { startWatcher } from '../watcher.js';

interface Deps { state: ServerState; hub: WsHub; appConfig: AppConfig }

export async function registerProjectRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { state, hub, appConfig } = deps;

  app.get('/api/projects/recent', async () => {
    return { recents: await appConfig.listRecents() };
  });

  app.post<{ Body: { path: string } }>('/api/projects/open', async (req) => {
    const { path } = req.body ?? {} as any;
    if (typeof path !== 'string' || !path) {
      const e = new Error('path required'); (e as any).statusCode = 400; throw e;
    }
    if (state.isOpen()) await state.close();
    const meta = await readProject(path);
    const handle = startWatcher(meta, hub);
    state.open(meta, handle.cleanup);
    const boards = await listBoards(meta.path);
    await appConfig.recordRecent(meta.path, meta.config.name);
    hub.broadcast({ type: 'project-opened', payload: { project: meta, boards } });
    return { project: meta, boards };
  });

  app.post('/api/projects/close', async () => {
    await state.close();
    hub.broadcast({ type: 'project-closed', payload: {} });
    return { ok: true };
  });

  app.post<{ Body: { path: string; name: string } }>('/api/projects/create', async (req) => {
    const { path, name } = req.body ?? {} as any;
    const meta = await createProject(path, name);
    return { project: meta };
  });

  app.get('/api/projects/current', async (_req, reply) => {
    const open = state.peek();
    if (!open) {
      reply.code(404).send({ error: { code: 'PROJECT_NOT_OPEN', message: 'no project open' } });
      return;
    }
    const boards = await listBoards(open.meta.path);
    return { project: open.meta, boards };
  });
}
```

- [ ] **Step 5: Stub the other route registrars so the helper compiles**

Create temporary stubs for `boards.ts`, `lanes.ts`, `tickets.ts` — full implementations in later tasks.

```ts
// src/server/routes/boards.ts
import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
export async function registerBoardRoutes(_app: FastifyInstance, _d: { state: ServerState; hub: WsHub }) {}
```

```ts
// src/server/routes/lanes.ts
import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
export async function registerLaneRoutes(_app: FastifyInstance, _d: { state: ServerState; hub: WsHub }) {}
```

```ts
// src/server/routes/tickets.ts
import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
export async function registerTicketRoutes(_app: FastifyInstance, _d: { state: ServerState; hub: WsHub }) {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/server/projects.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/routes tests/helpers/server.ts tests/server/projects.test.ts
git commit -m "Add project routes and server test harness"
```

---

## Task 16: Board routes

**Files:**
- Modify: `src/server/routes/boards.ts`
- Create: `tests/server/boards.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/boards.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function setup() {
  const srv = await bootTestServer();
  cleanups.push(srv.cleanup);
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  await fetch(`${srv.url}/api/projects/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: tp.root }),
  });
  return { srv, tp };
}

describe('board routes', () => {
  it('creates and lists boards', async () => {
    const { srv } = await setup();
    const create = await fetch(`${srv.url}/api/boards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'B' }),
    });
    expect(create.status).toBe(200);
    const list = await fetch(`${srv.url}/api/boards`).then(r => r.json()) as { boards: Array<{ name: string }> };
    expect(list.boards).toHaveLength(1);
  });

  it('reads board detail with empty lanes', async () => {
    const { srv } = await setup();
    const created = await (await fetch(`${srv.url}/api/boards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'B' }),
    })).json() as { board: { boardId: string } };
    const detail = await fetch(`${srv.url}/api/boards/${created.board.boardId}`).then(r => r.json()) as { board: { lanes: unknown[] } };
    expect(detail.board.lanes).toEqual([]);
  });

  it('renames a board', async () => {
    const { srv } = await setup();
    const created = await (await fetch(`${srv.url}/api/boards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Old' }),
    })).json() as { board: { boardId: string } };
    const r = await fetch(`${srv.url}/api/boards/${created.board.boardId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'new-name' }),
    });
    expect(r.status).toBe(200);
  });

  it('deletes a board (config-only)', async () => {
    const { srv } = await setup();
    const created = await (await fetch(`${srv.url}/api/boards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'B' }),
    })).json() as { board: { boardId: string } };
    const r = await fetch(`${srv.url}/api/boards/${created.board.boardId}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deleteFiles: false }),
    });
    expect(r.status).toBe(200);
    const list = await fetch(`${srv.url}/api/boards`).then(r => r.json()) as { boards: unknown[] };
    expect(list.boards).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/boards.test.ts`
Expected: FAIL — routes return 404 (stub).

- [ ] **Step 3: Implement `src/server/routes/boards.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { listBoards, addBoardToProject, removeBoardFromProject, getBoard } from '../../storage/project.js';
import { createBoard, readBoardDetail, renameBoard, deleteBoardFolder } from '../../storage/board.js';
import { InvalidInputError } from '../../storage/errors.js';
import { slugifyBoardPath } from '../../storage/paths.js';

export async function registerBoardRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.get('/api/boards', async () => {
    const open = state.require();
    return { boards: await listBoards(open.meta.path) };
  });

  app.post<{ Body: { name: string; path?: string } }>('/api/boards', async (req) => {
    const open = state.require();
    const { name, path: rel } = req.body ?? {} as any;
    if (!name) throw new InvalidInputError('name required');
    const entry = rel ?? `boards/${slugifyBoardPath(name)}`;
    const abs = path.isAbsolute(entry) ? entry : path.resolve(open.meta.path, entry);
    await createBoard(abs, name);
    await addBoardToProject(open.meta.path, entry);
    const board = await getBoard(open.meta.path, slugifyBoardPath(entry));
    hub.broadcast({ type: 'board-changed', payload: { boardId: board.boardId, kind: 'created' } });
    return { board };
  });

  app.get<{ Params: { boardId: string } }>('/api/boards/:boardId', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const detail = await readBoardDetail(board.path);
    detail.boardId = board.boardId;
    detail.name = board.name;
    return { board: detail };
  });

  app.patch<{ Params: { boardId: string }; Body: { name?: string } }>('/api/boards/:boardId', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    if (req.body?.name) {
      const open2 = state.require();
      const newEntry = `boards/${slugifyBoardPath(req.body.name)}`;
      const meta = await (await import('../../storage/project.js')).readProject(open2.meta.path);
      const oldEntry = meta.config.boards.find(b => slugifyBoardPath(b) === board.boardId);
      if (oldEntry) await renameBoard(open2.meta.path, oldEntry, newEntry);
    }
    hub.broadcast({ type: 'board-changed', payload: { boardId: board.boardId, kind: 'updated' } });
    return { ok: true };
  });

  app.delete<{ Params: { boardId: string }; Body: { deleteFiles?: boolean } }>('/api/boards/:boardId', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const meta = await (await import('../../storage/project.js')).readProject(open.meta.path);
    const entry = meta.config.boards.find(b => slugifyBoardPath(b) === board.boardId);
    if (entry) await removeBoardFromProject(open.meta.path, entry);
    if (req.body?.deleteFiles) await deleteBoardFolder(board.path);
    hub.broadcast({ type: 'board-changed', payload: { boardId: board.boardId, kind: 'deleted' } });
    return { ok: true };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server/boards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/boards.ts tests/server/boards.test.ts
git commit -m "Implement board routes"
```

---

## Task 17: Lane routes

**Files:**
- Modify: `src/server/routes/lanes.ts`
- Create: `tests/server/lanes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/lanes.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const STATES = [{ dir: 'todo', name: 'Todo' }, { dir: 'doing', name: 'Doing' }];

async function setup() {
  const srv = await bootTestServer();
  cleanups.push(srv.cleanup);
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  await fetch(`${srv.url}/api/projects/open`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: tp.root }),
  });
  const board = await (await fetch(`${srv.url}/api/boards`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'B' }),
  })).json() as { board: { boardId: string } };
  return { srv, boardId: board.board.boardId };
}

describe('lane routes', () => {
  it('creates and reads a lane', async () => {
    const { srv, boardId } = await setup();
    const create = await fetch(`${srv.url}/api/boards/${boardId}/lanes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    expect(create.status).toBe(200);
    const detail = await fetch(`${srv.url}/api/boards/${boardId}/lanes/work`).then(r => r.json()) as { lane: { states: Array<{ dir: string }> } };
    expect(detail.lane.states.map(s => s.dir)).toEqual(['todo', 'doing']);
  });

  it('rejects creating duplicate lane', async () => {
    const { srv, boardId } = await setup();
    await fetch(`${srv.url}/api/boards/${boardId}/lanes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    const r = await fetch(`${srv.url}/api/boards/${boardId}/lanes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    expect(r.status).toBe(409);
  });

  it('updates lane states (add)', async () => {
    const { srv, boardId } = await setup();
    await fetch(`${srv.url}/api/boards/${boardId}/lanes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    const r = await fetch(`${srv.url}/api/boards/${boardId}/lanes/work`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ states: [...STATES, { dir: 'done', name: 'Done' }] }),
    });
    expect(r.status).toBe(200);
  });

  it('deletes a lane', async () => {
    const { srv, boardId } = await setup();
    await fetch(`${srv.url}/api/boards/${boardId}/lanes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    const r = await fetch(`${srv.url}/api/boards/${boardId}/lanes/work`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deleteFiles: true }),
    });
    expect(r.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/lanes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/server/routes/lanes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { getBoard } from '../../storage/project.js';
import { createLane, readLaneDetail, renameLane, updateLaneStates, deleteLaneFolder } from '../../storage/lane.js';
import { InvalidInputError } from '../../storage/errors.js';

export async function registerLaneRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.post<{
    Params: { boardId: string };
    Body: { name: string; states: Array<{ dir: string; name: string }> };
  }>('/api/boards/:boardId/lanes', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const { name, states } = req.body ?? {} as any;
    if (!name || !Array.isArray(states)) throw new InvalidInputError('name and states required');
    await createLane(board.path, name, states);
    hub.broadcast({ type: 'lane-changed', payload: { boardId: board.boardId, laneName: name, kind: 'created' } });
    return { lane: await readLaneDetail(board.path, name) };
  });

  app.get<{ Params: { boardId: string; laneName: string } }>(
    '/api/boards/:boardId/lanes/:laneName',
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      return { lane: await readLaneDetail(board.path, req.params.laneName) };
    },
  );

  app.patch<{
    Params: { boardId: string; laneName: string };
    Body: { name?: string; states?: Array<{ dir: string; name: string }>; force?: boolean };
  }>('/api/boards/:boardId/lanes/:laneName', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    let currentName = req.params.laneName;
    if (req.body?.states) {
      await updateLaneStates(board.path, currentName, req.body.states, { force: req.body.force });
    }
    if (req.body?.name) {
      await renameLane(board.path, currentName, req.body.name);
      currentName = req.body.name;
    }
    hub.broadcast({ type: 'lane-changed', payload: { boardId: board.boardId, laneName: currentName, kind: 'updated' } });
    return { lane: await readLaneDetail(board.path, currentName) };
  });

  app.delete<{
    Params: { boardId: string; laneName: string };
    Body: { deleteFiles?: boolean };
  }>('/api/boards/:boardId/lanes/:laneName', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    if (req.body?.deleteFiles) {
      await deleteLaneFolder(board.path, req.params.laneName);
    }
    hub.broadcast({ type: 'lane-changed', payload: { boardId: board.boardId, laneName: req.params.laneName, kind: 'deleted' } });
    return { ok: true };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server/lanes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/lanes.ts tests/server/lanes.test.ts
git commit -m "Implement lane routes"
```

---

## Task 18: Ticket routes

**Files:**
- Modify: `src/server/routes/tickets.ts`
- Create: `tests/server/tickets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/tickets.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const STATES = [{ dir: 'todo', name: 'Todo' }, { dir: 'doing', name: 'Doing' }];

async function setup() {
  const srv = await bootTestServer();
  cleanups.push(srv.cleanup);
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  await fetch(`${srv.url}/api/projects/open`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: tp.root }),
  });
  const board = await (await fetch(`${srv.url}/api/boards`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'B' }),
  })).json() as { board: { boardId: string } };
  await fetch(`${srv.url}/api/boards/${board.board.boardId}/lanes`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'work', states: STATES }),
  });
  return { srv, boardId: board.board.boardId };
}

describe('ticket routes', () => {
  it('full CRUD lifecycle', async () => {
    const { srv, boardId } = await setup();
    const base = `${srv.url}/api/boards/${boardId}/lanes/work/tickets`;

    const created = await (await fetch(base, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Fix bug', state: 'todo', body: 'do the thing' }),
    })).json() as { ticket: { filename: string; state: string } };
    expect(created.ticket.state).toBe('todo');

    const list = await (await fetch(base)).json() as { tickets: unknown[] };
    expect(list.tickets).toHaveLength(1);

    const fetched = await (await fetch(`${base}/${created.ticket.filename}`)).json() as { ticket: { body: string } };
    expect(fetched.ticket.body.trim()).toBe('do the thing');

    const moved = await (await fetch(`${base}/${created.ticket.filename}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'doing' }),
    })).json() as { ticket: { state: string } };
    expect(moved.ticket.state).toBe('doing');

    const del = await fetch(`${base}/${created.ticket.filename}`, { method: 'DELETE' });
    expect(del.status).toBe(200);

    const list2 = await (await fetch(base)).json() as { tickets: unknown[] };
    expect(list2.tickets).toEqual([]);
  });

  it('returns 404 for missing ticket', async () => {
    const { srv, boardId } = await setup();
    const r = await fetch(`${srv.url}/api/boards/${boardId}/lanes/work/tickets/2026-01-01T0000-x.md`);
    expect(r.status).toBe(404);
  });

  it('returns 400 on invalid state', async () => {
    const { srv, boardId } = await setup();
    const r = await fetch(`${srv.url}/api/boards/${boardId}/lanes/work/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', state: 'notreal' }),
    });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/tickets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/server/routes/tickets.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { getBoard } from '../../storage/project.js';
import { createTicket, listTickets, readTicket, updateTicket, deleteTicket } from '../../storage/ticket.js';
import { InvalidInputError } from '../../storage/errors.js';

const BASE = '/api/boards/:boardId/lanes/:laneName/tickets';

export async function registerTicketRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.get<{ Params: { boardId: string; laneName: string } }>(BASE, async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    return { tickets: await listTickets(board.path, req.params.laneName) };
  });

  app.post<{
    Params: { boardId: string; laneName: string };
    Body: { title: string; state: string; body?: string };
  }>(BASE, async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const body = req.body ?? {} as any;
    if (!body.title || !body.state) throw new InvalidInputError('title and state required');
    const ticket = await createTicket(board.path, req.params.laneName, body);
    hub.broadcast({
      type: 'ticket-changed',
      payload: { boardId: board.boardId, laneName: req.params.laneName, filename: ticket.filename, state: ticket.state, kind: 'created' },
    });
    return { ticket };
  });

  app.get<{ Params: { boardId: string; laneName: string; filename: string } }>(
    `${BASE}/:filename`,
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      return { ticket: await readTicket(board.path, req.params.laneName, req.params.filename) };
    },
  );

  app.patch<{
    Params: { boardId: string; laneName: string; filename: string };
    Body: { title?: string; body?: string; state?: string };
  }>(`${BASE}/:filename`, async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const ticket = await updateTicket(board.path, req.params.laneName, req.params.filename, req.body ?? {});
    hub.broadcast({
      type: 'ticket-changed',
      payload: { boardId: board.boardId, laneName: req.params.laneName, filename: ticket.filename, state: ticket.state, kind: 'updated' },
    });
    return { ticket };
  });

  app.delete<{ Params: { boardId: string; laneName: string; filename: string } }>(
    `${BASE}/:filename`,
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      await deleteTicket(board.path, req.params.laneName, req.params.filename);
      hub.broadcast({
        type: 'ticket-changed',
        payload: { boardId: board.boardId, laneName: req.params.laneName, filename: req.params.filename, state: '__deleted__', kind: 'deleted' },
      });
      return { ok: true };
    },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server/tickets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/tickets.ts tests/server/tickets.test.ts
git commit -m "Implement ticket routes"
```

---

## Task 19: WebSocket integration test

**Files:**
- Create: `tests/server/ws.test.ts`

This verifies that filesystem watcher events reach a connected WebSocket client.

- [ ] **Step 1: Write the test**

```ts
// tests/server/ws.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

function waitForEvent(ws: WebSocket, predicate: (e: any) => boolean, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for ws event')), timeoutMs);
    const onMsg = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString());
      if (predicate(event)) {
        clearTimeout(t);
        ws.off('message', onMsg);
        resolve(event);
      }
    };
    ws.on('message', onMsg);
  });
}

describe('websocket events', () => {
  it('sends project-opened on connect when a project is open', async () => {
    const srv = await bootTestServer();
    cleanups.push(srv.cleanup);
    const tp = await makeBareProject('Hi');
    cleanups.push(tp.cleanup);
    await fetch(`${srv.url}/api/projects/open`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: tp.root }),
    });
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    cleanups.push(async () => ws.close());
    const event = await waitForEvent(ws, e => e.type === 'project-opened');
    expect(event.payload.project.config.name).toBe('Hi');
  });

  it('emits ticket-changed when a file is added on disk', async () => {
    const srv = await bootTestServer();
    cleanups.push(srv.cleanup);
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await fetch(`${srv.url}/api/projects/open`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: tp.root }),
    });
    const board = await (await fetch(`${srv.url}/api/boards`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'B' }),
    })).json() as { board: { boardId: string } };
    await fetch(`${srv.url}/api/boards/${board.board.boardId}/lanes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: [{ dir: 'todo', name: 'Todo' }] }),
    });

    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    cleanups.push(async () => ws.close());
    await waitForEvent(ws, e => e.type === 'project-opened');

    const todoDir = path.join(tp.root, 'boards', 'b', 'lanes', 'work', 'todo');
    await mkdir(todoDir, { recursive: true });
    await writeFile(path.join(todoDir, '2026-04-26T1430-test.md'), '---\ntitle: T\ncreated: 2026-04-26T14:30:00Z\nupdated: 2026-04-26T14:30:00Z\n---\nbody', 'utf8');

    const event = await waitForEvent(ws, e => e.type === 'ticket-changed' && e.payload.filename === '2026-04-26T1430-test.md');
    expect(event.payload.boardId).toBe('b');
    expect(event.payload.laneName).toBe('work');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- tests/server/ws.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/server/ws.test.ts
git commit -m "Add WebSocket integration tests for project and ticket events"
```

---

## Task 20: Server entry point and CLI

**Files:**
- Modify: `src/server/index.ts`

- [ ] **Step 1: Implement `src/server/index.ts`**

```ts
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { ServerState } from './state.js';
import { WsHub, registerWs } from './ws.js';
import { mapErrorToResponse } from './error-mapper.js';
import { AppConfig } from './app-config.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerBoardRoutes } from './routes/boards.js';
import { registerLaneRoutes } from './routes/lanes.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { readProject, listBoards } from '../storage/project.js';
import { startWatcher } from './watcher.js';
import path from 'node:path';

const PORT = Number(process.env.MEESEEKS_PORT ?? 5174);
const HOST = process.env.MEESEEKS_HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  const argPath = process.argv[2];
  const state = new ServerState();
  const hub = new WsHub();
  const appConfig = new AppConfig();
  const app = Fastify({ logger: true });
  await app.register(websocket);
  app.setErrorHandler(mapErrorToResponse);
  await registerProjectRoutes(app, { state, hub, appConfig });
  await registerBoardRoutes(app, { state, hub });
  await registerLaneRoutes(app, { state, hub });
  await registerTicketRoutes(app, { state, hub });
  await registerWs(app, state, hub);

  if (argPath) {
    try {
      const meta = await readProject(path.resolve(argPath));
      const handle = startWatcher(meta, hub);
      state.open(meta, handle.cleanup);
      const boards = await listBoards(meta.path);
      await appConfig.recordRecent(meta.path, meta.config.name);
      app.log.info({ project: meta.path }, 'opened project from CLI');
      hub.broadcast({ type: 'project-opened', payload: { project: meta, boards } });
    } catch (err) {
      app.log.warn({ err }, 'could not open CLI project; starting at picker');
    }
  }

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`meeseeks server on http://${HOST}:${PORT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke test**

Run: `npm run dev:server` in one terminal.
Expected: server logs `meeseeks server on http://127.0.0.1:5174`. (Stop with Ctrl-C.)

In a second terminal: `curl http://127.0.0.1:5174/api/projects/recent`
Expected: `{"recents":[]}`.

- [ ] **Step 3: Commit**

```bash
git add src/server/index.ts
git commit -m "Wire up server entry point with CLI project arg"
```

---

## Task 21: Final typecheck and full test pass

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all tests in `tests/storage/` and `tests/server/` pass.

- [ ] **Step 3: Build server**

Run: `npm run build:server`
Expected: builds without errors. `dist/server/index.js` exists.

- [ ] **Step 4: Smoke test built artifact**

Run: `node dist/server/index.js`
Expected: server starts on `:5174`. Stop with Ctrl-C.

- [ ] **Step 5: Final commit if anything was tweaked**

If steps required edits:
```bash
git add -A
git commit -m "Fix issues from final verification pass"
```

If nothing changed, no commit needed — plan complete.

---

## Out of scope for this plan (covered by later plans)

- Web UI (project picker, Kanban view, ticket detail/editor) — next plan: `2026-04-26-web-ui.md`.
- Runtime supervisor, Claude Code adapter, MDI console UI, runtime API/WS — plan: `2026-04-26-runtime-and-console.md`.
- Autonomous-trigger Runtimes, sync, knowledge-base ingestion — deferred to a future cycle.
