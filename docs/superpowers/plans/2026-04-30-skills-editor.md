# Skills Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `.claude/skills` editor to the board editor with a generic namespace-based file API for reusable file management

**Architecture:** Namespace-based REST API (skills, prompts, hooks) backed by storage layer with security validation, React UI with TDD-first development following existing patterns

**Tech Stack:** TypeScript, Node.js fs/promises, Fastify, React Query, Vitest

---

## Task 1: Add Shared Types

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/api.ts`

- [ ] **Step 1: Add FileNode type to types.ts**

```typescript
// Add to src/shared/types.ts after TicketDetail interface

export interface FileNode {
  name: string;
  isDirectory: boolean;
  size?: number;
  modified?: string; // ISO timestamp
}
```

- [ ] **Step 2: Add file API types to api.ts**

```typescript
// Add to src/shared/api.ts before the export type line

// Files
export interface ListFilesResponse { files: FileNode[] }
export interface ReadFileResponse { content: string; path: string }
export interface WriteFileRequest { content: string }
export interface WriteFileResponse { ok: boolean; path: string }
export interface PatchFileRequest { content: string }
export interface PatchFileResponse { ok: boolean }
```

- [ ] **Step 3: Update api.ts exports**

```typescript
// Modify the export type line in src/shared/api.ts
export type { ProjectMeta, BoardSummary, BoardDetail, LaneDetail, TicketSummary, TicketDetail, FileNode };
```

- [ ] **Step 4: Verify types compile**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/api.ts
git commit -m "feat(types): add FileNode and file API request/response types"
```

---

## Task 2: Storage Layer - Write Failing Tests

**Files:**
- Create: `tests/storage/files.test.ts`

- [ ] **Step 1: Create test file with imports and helpers**

```typescript
// tests/storage/files.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { writeFile as fsWriteFile, access } from 'node:fs/promises';
import { listFiles, readFile, writeFile, deleteFile } from '../../src/storage/files.js';
import { createBoard } from '../../src/storage/board.js';
import { NotFoundError, InvalidInputError } from '../../src/storage/errors.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

describe('listFiles', () => {
  it('returns empty array for empty skills directory', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    
    const files = await listFiles(boardPath, 'skills');
    expect(files).toEqual([]);
  });

  it('lists skill files with metadata', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    const skillsDir = path.join(boardPath, '.claude/skills');
    await fsWriteFile(path.join(skillsDir, 'test.md'), 'content', 'utf8');
    
    const files = await listFiles(boardPath, 'skills');
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe('test.md');
    expect(files[0]!.isDirectory).toBe(false);
    expect(files[0]!.size).toBeGreaterThan(0);
    expect(files[0]!.modified).toBeTruthy();
  });

  it('rejects invalid namespace', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    
    await expect(listFiles(boardPath, 'invalid')).rejects.toThrow(InvalidInputError);
  });
});

describe('readFile', () => {
  it('reads skill file content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    const skillsDir = path.join(boardPath, '.claude/skills');
    await fsWriteFile(path.join(skillsDir, 'test.md'), 'hello world', 'utf8');
    
    const content = await readFile(boardPath, 'skills', 'test.md');
    expect(content).toBe('hello world');
  });

  it('throws NotFoundError for missing file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    
    await expect(readFile(boardPath, 'skills', 'missing.md')).rejects.toThrow(NotFoundError);
  });

  it('rejects path traversal with ..', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    
    await expect(readFile(boardPath, 'skills', '../../../etc/passwd')).rejects.toThrow(InvalidInputError);
  });

  it('rejects absolute paths', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    
    await expect(readFile(boardPath, 'skills', '/etc/passwd')).rejects.toThrow(InvalidInputError);
  });
});

describe('writeFile', () => {
  it('creates skill file with content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    
    await writeFile(boardPath, 'skills', 'new.md', 'content');
    
    const filePath = path.join(boardPath, '.claude/skills/new.md');
    expect(await exists(filePath)).toBe(true);
    const content = await readFile(boardPath, 'skills', 'new.md');
    expect(content).toBe('content');
  });

  it('creates .claude/skills directory if missing', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    
    const skillsDir = path.join(boardPath, '.claude/skills');
    expect(await exists(skillsDir)).toBe(false);
    
    await writeFile(boardPath, 'skills', 'test.md', 'content');
    expect(await exists(skillsDir)).toBe(true);
  });

  it('rejects files without .md extension in skills namespace', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    
    await expect(writeFile(boardPath, 'skills', 'test.txt', 'content')).rejects.toThrow(InvalidInputError);
  });

  it('rejects path traversal', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    
    await expect(writeFile(boardPath, 'skills', '../escape.md', 'content')).rejects.toThrow(InvalidInputError);
  });
});

describe('deleteFile', () => {
  it('deletes existing skill file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await writeFile(boardPath, 'skills', 'test.md', 'content');
    
    await deleteFile(boardPath, 'skills', 'test.md');
    
    const filePath = path.join(boardPath, '.claude/skills/test.md');
    expect(await exists(filePath)).toBe(false);
  });

  it('throws NotFoundError for missing file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    
    await expect(deleteFile(boardPath, 'skills', 'missing.md')).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test tests/storage/files.test.ts`
Expected: All tests FAIL with "Cannot find module '../../src/storage/files.js'"

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/storage/files.test.ts
git commit -m "test(storage): add failing tests for generic file operations"
```

---

## Task 3: Storage Layer - Implement Files Module

**Files:**
- Create: `src/storage/files.ts`

- [ ] **Step 1: Create files.ts with namespace mapping and validation**

```typescript
// src/storage/files.ts
import { readdir, readFile as fsReadFile, writeFile as fsWriteFile, unlink, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { NotFoundError, InvalidInputError } from './errors.js';
import type { FileNode } from '../shared/types.js';

const NAMESPACE_DIRS: Record<string, string> = {
  skills: '.claude/skills',
  prompts: '.claude/prompts',
  hooks: '.claude/hooks',
};

function validateNamespace(namespace: string): void {
  if (!NAMESPACE_DIRS[namespace]) {
    throw new InvalidInputError(`unsupported namespace: ${namespace}`);
  }
}

function validateFilepath(filepath: string): void {
  if (filepath.includes('..')) {
    throw new InvalidInputError('path traversal not allowed');
  }
  if (path.isAbsolute(filepath)) {
    throw new InvalidInputError('absolute paths not allowed');
  }
}

function validateSkillFilename(filename: string): void {
  if (!filename.endsWith('.md')) {
    throw new InvalidInputError('skill files must have .md extension');
  }
}

async function ensureNamespaceDir(boardPath: string, namespace: string): Promise<string> {
  const dir = path.join(boardPath, NAMESPACE_DIRS[namespace]!);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function listFiles(boardPath: string, namespace: string): Promise<FileNode[]> {
  validateNamespace(namespace);
  const dir = await ensureNamespaceDir(boardPath, namespace);
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const nodes: FileNode[] = [];
    
    for (const entry of entries) {
      const stats = await stat(path.join(dir, entry.name));
      nodes.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modified: stats.mtime.toISOString(),
      });
    }
    
    return nodes;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export async function readFile(boardPath: string, namespace: string, filepath: string): Promise<string> {
  validateNamespace(namespace);
  validateFilepath(filepath);
  
  const fullPath = path.join(boardPath, NAMESPACE_DIRS[namespace]!, filepath);
  
  try {
    return await fsReadFile(fullPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`file not found: ${filepath}`);
    }
    throw err;
  }
}

export async function writeFile(
  boardPath: string,
  namespace: string,
  filepath: string,
  content: string,
): Promise<void> {
  validateNamespace(namespace);
  validateFilepath(filepath);
  
  if (namespace === 'skills') {
    validateSkillFilename(filepath);
  }
  
  const dir = await ensureNamespaceDir(boardPath, namespace);
  const fullPath = path.join(dir, filepath);
  await fsWriteFile(fullPath, content, 'utf8');
}

export async function deleteFile(boardPath: string, namespace: string, filepath: string): Promise<void> {
  validateNamespace(namespace);
  validateFilepath(filepath);
  
  const fullPath = path.join(boardPath, NAMESPACE_DIRS[namespace]!, filepath);
  
  try {
    await unlink(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`file not found: ${filepath}`);
    }
    throw err;
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test tests/storage/files.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit implementation**

```bash
git add src/storage/files.ts
git commit -m "feat(storage): implement generic file operations with namespace validation"
```

---

## Task 4: API Layer - Write Failing Tests

**Files:**
- Create: `tests/server/routes/files.test.ts`

- [ ] **Step 1: Create API test file**

```typescript
// tests/server/routes/files.test.ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import path from 'node:path';
import { createTestServer } from '../helpers/test-server.js';
import { makeBareProject } from '../helpers/tmp-project.js';
import { createBoard } from '../../src/storage/board.js';
import { addBoardToProject } from '../../src/storage/project.js';
import { writeFile } from '../../src/storage/files.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe('GET /api/boards/:boardId/files/:namespace', () => {
  it('lists files in skills namespace', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    await writeFile(boardPath, 'skills', 'test.md', 'content');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({ method: 'GET', url: '/api/boards/b/files/skills' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files).toHaveLength(1);
    expect(body.files[0].name).toBe('test.md');
  });

  it('returns empty array for empty directory', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({ method: 'GET', url: '/api/boards/b/files/skills' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files).toEqual([]);
  });

  it('returns 400 for invalid namespace', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({ method: 'GET', url: '/api/boards/b/files/invalid' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/boards/:boardId/files/:namespace/:filepath', () => {
  it('reads file content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    await writeFile(boardPath, 'skills', 'test.md', 'hello world');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({ method: 'GET', url: '/api/boards/b/files/skills/test.md' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.content).toBe('hello world');
    expect(body.path).toBe('test.md');
  });

  it('returns 404 for missing file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({ method: 'GET', url: '/api/boards/b/files/skills/missing.md' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for path traversal', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({ method: 'GET', url: '/api/boards/b/files/skills/../../../etc/passwd' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/boards/:boardId/files/:namespace/:filepath', () => {
  it('creates file with content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({
      method: 'POST',
      url: '/api/boards/b/files/skills/new.md',
      payload: { content: 'new content' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.path).toBe('new.md');
    
    // Verify file was created
    const readRes = await app.inject({ method: 'GET', url: '/api/boards/b/files/skills/new.md' });
    expect(JSON.parse(readRes.body).content).toBe('new content');
  });

  it('returns 400 for missing content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({
      method: 'POST',
      url: '/api/boards/b/files/skills/new.md',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /api/boards/:boardId/files/:namespace/:filepath', () => {
  it('updates file content', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    await writeFile(boardPath, 'skills', 'test.md', 'original');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/boards/b/files/skills/test.md',
      payload: { content: 'updated' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    
    // Verify content was updated
    const readRes = await app.inject({ method: 'GET', url: '/api/boards/b/files/skills/test.md' });
    expect(JSON.parse(readRes.body).content).toBe('updated');
  });
});

describe('DELETE /api/boards/:boardId/files/:namespace/:filepath', () => {
  it('deletes existing file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    await writeFile(boardPath, 'skills', 'test.md', 'content');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/b/files/skills/test.md' });
    expect(res.statusCode).toBe(200);
    
    // Verify file was deleted
    const readRes = await app.inject({ method: 'GET', url: '/api/boards/b/files/skills/test.md' });
    expect(readRes.statusCode).toBe(404);
  });

  it('returns 404 for missing file', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const boardPath = path.join(tp.root, 'boards/b');
    await createBoard(boardPath, 'B');
    await addBoardToProject(tp.root, 'boards/b');
    
    const { app, cleanup } = await createTestServer(tp.root);
    cleanups.push(cleanup);
    
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/b/files/skills/missing.md' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test tests/server/routes/files.test.ts`
Expected: All tests FAIL with 404 errors (routes not registered)

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/server/routes/files.test.ts
git commit -m "test(api): add failing tests for file API endpoints"
```

---

## Task 5: API Layer - Implement File Routes

**Files:**
- Create: `src/server/routes/files.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Create file routes**

```typescript
// src/server/routes/files.ts
import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import { getBoard } from '../../storage/project.js';
import { listFiles, readFile, writeFile, deleteFile } from '../../storage/files.js';
import { InvalidInputError } from '../../storage/errors.js';
import type {
  ListFilesResponse,
  ReadFileResponse,
  WriteFileRequest,
  WriteFileResponse,
  PatchFileRequest,
  PatchFileResponse,
} from '@shared/api.js';

export async function registerFileRoutes(
  app: FastifyInstance,
  deps: { state: ServerState },
): Promise<void> {
  const { state } = deps;

  // List files in namespace
  app.get<{ Params: { boardId: string; namespace: string } }>(
    '/api/boards/:boardId/files/:namespace',
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      const files = await listFiles(board.path, req.params.namespace);
      return { files } as ListFilesResponse;
    },
  );

  // Read file
  app.get<{ Params: { boardId: string; namespace: string; filepath: string } }>(
    '/api/boards/:boardId/files/:namespace/*',
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      const filepath = req.params.filepath || req.params['*'];
      if (!filepath) throw new InvalidInputError('filepath required');
      const content = await readFile(board.path, req.params.namespace, filepath);
      return { content, path: filepath } as ReadFileResponse;
    },
  );

  // Create file
  app.post<{
    Params: { boardId: string; namespace: string; filepath: string };
    Body: WriteFileRequest;
  }>('/api/boards/:boardId/files/:namespace/*', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const filepath = req.params.filepath || req.params['*'];
    if (!filepath) throw new InvalidInputError('filepath required');
    const body = req.body ?? ({} as WriteFileRequest);
    if (body.content === undefined) throw new InvalidInputError('content required');
    await writeFile(board.path, req.params.namespace, filepath, body.content);
    return { ok: true, path: filepath } as WriteFileResponse;
  });

  // Update file
  app.patch<{
    Params: { boardId: string; namespace: string; filepath: string };
    Body: PatchFileRequest;
  }>('/api/boards/:boardId/files/:namespace/*', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const filepath = req.params.filepath || req.params['*'];
    if (!filepath) throw new InvalidInputError('filepath required');
    const body = req.body ?? ({} as PatchFileRequest);
    if (body.content === undefined) throw new InvalidInputError('content required');
    await writeFile(board.path, req.params.namespace, filepath, body.content);
    return { ok: true } as PatchFileResponse;
  });

  // Delete file
  app.delete<{ Params: { boardId: string; namespace: string; filepath: string } }>(
    '/api/boards/:boardId/files/:namespace/*',
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      const filepath = req.params.filepath || req.params['*'];
      if (!filepath) throw new InvalidInputError('filepath required');
      await deleteFile(board.path, req.params.namespace, filepath);
      return { ok: true };
    },
  );
}
```

- [ ] **Step 2: Register routes in server index**

```typescript
// Modify src/server/index.ts
// Add import at top
import { registerFileRoutes } from './routes/files.js';

// Add registration after other route registrations (around line 40)
await registerFileRoutes(app, { state });
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test tests/server/routes/files.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit implementation**

```bash
git add src/server/routes/files.ts src/server/index.ts
git commit -m "feat(api): implement file API endpoints with namespace routing"
```

---

## Task 6: UI Layer - Add API Client Methods

**Files:**
- Modify: `src/web/lib/api.ts`

- [ ] **Step 1: Add file API imports**

```typescript
// Modify src/web/lib/api.ts
// Add to imports at top
import type {
  // ... existing imports
  ListFilesResponse, ReadFileResponse, WriteFileRequest, WriteFileResponse,
  PatchFileRequest, PatchFileResponse, FileNode,
} from '@shared/api.js';
```

- [ ] **Step 2: Add file API methods to api object**

```typescript
// Add to src/web/lib/api.ts api object (after runtimes section)

  // Files
  listFiles: (boardId: string, namespace: string) =>
    request<ListFilesResponse>('GET', `/api/boards/${enc(boardId)}/files/${enc(namespace)}`),
  readFile: (boardId: string, namespace: string, filepath: string) =>
    request<ReadFileResponse>('GET', `/api/boards/${enc(boardId)}/files/${enc(namespace)}/${enc(filepath)}`),
  createFile: (boardId: string, namespace: string, filepath: string, req: WriteFileRequest) =>
    request<WriteFileResponse>('POST', `/api/boards/${enc(boardId)}/files/${enc(namespace)}/${enc(filepath)}`, req),
  patchFile: (boardId: string, namespace: string, filepath: string, req: PatchFileRequest) =>
    request<PatchFileResponse>('PATCH', `/api/boards/${enc(boardId)}/files/${enc(namespace)}/${enc(filepath)}`, req),
  deleteFile: (boardId: string, namespace: string, filepath: string) =>
    request<{ ok: boolean }>('DELETE', `/api/boards/${enc(boardId)}/files/${enc(namespace)}/${enc(filepath)}`),
```

- [ ] **Step 3: Verify types compile**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Commit API client**

```bash
git add src/web/lib/api.ts
git commit -m "feat(ui): add file API methods to client"
```

---

## Task 7: UI Layer - Add React Query Hooks

**Files:**
- Modify: `src/web/hooks/queries.ts`

- [ ] **Step 1: Add file hook exports**

```typescript
// Add to src/web/hooks/queries.ts after ticket hooks

export const useSkillFiles = (boardId: string | undefined) => useQuery({
  queryKey: ['files', boardId, 'skills'],
  queryFn: () => api.listFiles(boardId!, 'skills'),
  enabled: !!boardId,
});

export const useSkillFile = (boardId: string | undefined, filename: string | undefined) => useQuery({
  queryKey: ['file', boardId, 'skills', filename],
  queryFn: () => api.readFile(boardId!, 'skills', filename!),
  enabled: !!boardId && !!filename,
});

export function useCreateSkillFile(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      api.createFile(boardId, 'skills', filename, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', boardId, 'skills'] });
    },
  });
}

export function usePatchSkillFile(boardId: string, filename: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content }: { content: string }) =>
      api.patchFile(boardId, 'skills', filename, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', boardId, 'skills'] });
      qc.invalidateQueries({ queryKey: ['file', boardId, 'skills', filename] });
    },
  });
}

export function useDeleteSkillFile(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => api.deleteFile(boardId, 'skills', filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', boardId, 'skills'] });
    },
  });
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Commit hooks**

```bash
git add src/web/hooks/queries.ts
git commit -m "feat(ui): add React Query hooks for skill file operations"
```

---

## Task 8: UI Component - Create SkillsEditor

**Files:**
- Create: `src/web/components/SkillsEditor.tsx`

- [ ] **Step 1: Create SkillsEditor component**

```typescript
// src/web/components/SkillsEditor.tsx
import { useState } from 'react';
import { useSkillFiles, useSkillFile, useCreateSkillFile, usePatchSkillFile } from '../hooks/queries.js';
import { toast } from 'sonner';
import { Markdown } from './Markdown.js';

const SKILL_TEMPLATE = `---
name: skill-name
description: Brief description of what this skill does
---

# Skill Name

Skill content goes here.
`;

export function SkillsEditor({ boardId }: { boardId: string }) {
  const files = useSkillFiles(boardId);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const createFile = useCreateSkillFile(boardId);

  const handleCreateFile = async () => {
    if (!newFilename.trim()) {
      toast.error('Filename is required');
      return;
    }

    // Validate filename
    const sanitized = newFilename.trim().replace(/[^a-zA-Z0-9\-_.]/g, '-');
    const filename = sanitized.endsWith('.md') ? sanitized : `${sanitized}.md`;

    try {
      await createFile.mutateAsync({ filename, content: SKILL_TEMPLATE });
      toast.success('Skill created');
      setSelectedFile(filename);
      setCreatingFile(false);
      setNewFilename('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left panel: file list */}
      <div className="w-52 shrink-0 border-r border-slate-800 overflow-y-auto">
        <div className="p-3 border-b border-slate-800">
          <button
            className="w-full px-3 py-1.5 rounded bg-blue-600 text-sm hover:bg-blue-500"
            onClick={() => setCreatingFile(true)}
          >
            + New Skill
          </button>
        </div>

        {creatingFile && (
          <div className="p-3 border-b border-slate-800 bg-slate-800/50">
            <input
              className="w-full bg-slate-900 rounded px-2 py-1 text-sm mb-2"
              placeholder="skill-name.md"
              value={newFilename}
              onChange={(e) => setNewFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFile();
                if (e.key === 'Escape') { setCreatingFile(false); setNewFilename(''); }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                className="px-2 py-1 rounded bg-blue-600 text-xs hover:bg-blue-500"
                onClick={handleCreateFile}
              >Create</button>
              <button
                className="px-2 py-1 rounded bg-slate-700 text-xs hover:bg-slate-600"
                onClick={() => { setCreatingFile(false); setNewFilename(''); }}
              >Cancel</button>
            </div>
          </div>
        )}

        {files.isLoading && <div className="p-3 text-sm text-slate-500">Loading...</div>}
        
        {files.data?.files.length === 0 && !creatingFile && (
          <div className="p-3 text-sm text-slate-500">
            No skills yet. Create your first skill!
          </div>
        )}

        {files.data?.files.map((file) => (
          <div
            key={file.name}
            className={`px-3 py-2 cursor-pointer border-b border-slate-800/50 ${
              selectedFile === file.name ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-300'
            }`}
            onClick={() => setSelectedFile(file.name)}
          >
            <div className="text-sm truncate">
              {file.name.replace(/\.md$/, '')}
            </div>
          </div>
        ))}
      </div>

      {/* Right panel: file editor */}
      <div className="flex-1 overflow-y-auto">
        {selectedFile ? (
          <FileEditor boardId={boardId} filename={selectedFile} />
        ) : (
          <div className="p-8 text-slate-500">Select a skill to edit</div>
        )}
      </div>
    </div>
  );
}

function FileEditor({ boardId, filename }: { boardId: string; filename: string }) {
  const file = useSkillFile(boardId, filename);
  const patchFile = usePatchSkillFile(boardId, filename);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const dirty = content !== null;

  if (file.isLoading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (!file.data) return <div className="p-6 text-red-400">File not found.</div>;

  const currentContent = content ?? file.data.content;

  const save = async () => {
    if (!dirty) return;
    try {
      await patchFile.mutateAsync({ content: content! });
      setContent(null);
      toast.success('Skill saved');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-lg font-semibold mb-4">{filename}</h2>

      {editing ? (
        <textarea
          className="w-full bg-slate-800 rounded px-3 py-2 font-mono text-sm resize-none min-h-96"
          value={currentContent}
          onChange={(e) => setContent(e.target.value)}
          onBlur={async () => {
            if (dirty) await save();
            setEditing(false);
          }}
          autoFocus
        />
      ) : (
        <div
          className="w-full bg-slate-800 rounded px-3 py-2 min-h-96 overflow-y-auto cursor-pointer hover:ring-1 hover:ring-slate-600"
          onClick={() => {
            setContent(file.data!.content);
            setEditing(true);
          }}
        >
          <Markdown>{currentContent}</Markdown>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Commit component**

```bash
git add src/web/components/SkillsEditor.tsx
git commit -m "feat(ui): add SkillsEditor component with file list and markdown editor"
```

---

## Task 9: Integration - Add Skills Editor to BoardEditorRoute

**Files:**
- Modify: `src/web/routes/BoardEditorRoute.tsx`

- [ ] **Step 1: Import SkillsEditor**

```typescript
// Add to imports in src/web/routes/BoardEditorRoute.tsx
import { SkillsEditor } from '../components/SkillsEditor.js';
```

- [ ] **Step 2: Add navigation item**

```typescript
// In BoardEditorRoute component, add after CLAUDE.md navigation item (around line 74)
          <div
            className={`flex items-center px-4 py-3 cursor-pointer border-b border-slate-800/50 ${
              searchParams.get('skills') === 'true' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-300'
            }`}
            onClick={() => setSearchParams({ skills: 'true' })}
          >
            <span className="text-sm font-medium">.claude/skills</span>
          </div>
```

- [ ] **Step 3: Add conditional rendering**

```typescript
// In the right panel content area (around line 94), update the conditional:
        <div className="flex-1 overflow-y-auto">
          {searchParams.get('context') === 'true' ? (
            <ContextEditor boardId={boardId} />
          ) : searchParams.get('skills') === 'true' ? (
            <SkillsEditor boardId={boardId} />
          ) : selectedLane === NEW_LANE_KEY ? (
            <NewLaneEditor boardId={boardId} onCreated={(name) => setSearchParams({ lane: name })} />
          ) : selectedLane ? (
            <LaneEditor boardId={boardId} laneName={selectedLane} />
          ) : (
            <div className="p-8 text-slate-500">Select a lane to edit its configuration.</div>
          )}
        </div>
```

- [ ] **Step 4: Test in browser**

Run: `npm run dev`
Navigate to a board editor, click ".claude/skills", verify UI renders

Expected: Skills editor displays with file list panel and editor panel

- [ ] **Step 5: Test creating a skill**

Click "+ New Skill", enter "test-skill", click Create
Expected: File created, appears in list, editor shows template content

- [ ] **Step 6: Test editing a skill**

Click the created skill, edit content, click outside textarea
Expected: Toast shows "Skill saved", content persists on reload

- [ ] **Step 7: Commit integration**

```bash
git add src/web/routes/BoardEditorRoute.tsx
git commit -m "feat(ui): integrate SkillsEditor into board editor navigation"
```

---

## Task 10: Final Testing and Documentation

**Files:**
- Run all tests

- [ ] **Step 1: Run all storage tests**

Run: `npm test tests/storage/files.test.ts`
Expected: All tests PASS

- [ ] **Step 2: Run all API tests**

Run: `npm test tests/server/routes/files.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests PASS (existing + new)

- [ ] **Step 4: Manual UI testing**

Test these scenarios in the browser:
1. Navigate to board editor, click ".claude/skills"
2. Create new skill with valid name
3. Create skill with invalid characters (verify sanitization)
4. Edit skill content and verify auto-save
5. Reload page and verify skill list persists
6. Create multiple skills and verify list updates
7. Test with empty skills directory
8. Switch between skills and verify content loads

Expected: All scenarios work without errors

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete skills editor implementation with tests"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✓ List skill files in `.claude/skills/` directory
- ✓ Create new skill files with template
- ✓ Edit existing skill files with markdown editing
- ✓ Save changes to skill files
- ✓ Flat file organization
- ✓ Generic file API with namespace support
- ✓ Security validation (path traversal, namespace validation)
- ✓ Error handling with proper error types
- ✓ TDD throughout implementation

**No placeholders:**
- All code is complete and runnable
- All file paths are exact
- All commands have expected outputs
- No TBD or TODO items

**Type consistency:**
- FileNode used consistently across storage/API/UI
- Request/response types match between client and server
- Namespace parameter consistent throughout
- Hook naming follows existing patterns
