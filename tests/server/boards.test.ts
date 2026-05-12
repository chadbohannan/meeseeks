import { describe, it, expect, afterEach } from 'vitest';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function setup() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const srv = await bootTestServer(tp.root);
  cleanups.push(srv.cleanup);
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

describe('PATCH /api/boards/:boardId with contextContent', () => {
  it('updates CONTEXT.md content', async () => {
    const { srv } = await setup();
    const createRes = await (await fetch(`${srv.url}/api/boards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test Board' }),
    })).json() as { board: { boardId: string } };
    const boardId = createRes.board.boardId;

    const newContent = '# Updated Instructions\n\nNew content here';
    const patchRes = await fetch(`${srv.url}/api/boards/${boardId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contextContent: newContent }),
    });

    expect(patchRes.status).toBe(200);

    const getRes = await fetch(`${srv.url}/api/boards/${boardId}`).then(r => r.json()) as { board: { contextContent: string } };
    expect(getRes.board.contextContent).toBe(newContent);
  });

  it('persists contextContent to disk', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const srv = await bootTestServer(tp.root);
    cleanups.push(srv.cleanup);

    const createRes = await (await fetch(`${srv.url}/api/boards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test Board' }),
    })).json() as { board: { boardId: string } };
    const boardId = createRes.board.boardId;

    const newContent = '# Persisted Content\n\nShould write to disk';
    await fetch(`${srv.url}/api/boards/${boardId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contextContent: newContent }),
    });

    // Read directly from filesystem to verify persistence
    const boardPath = path.join(tp.root, 'boards/test-board');
    const contextPath = path.join(boardPath, 'CONTEXT.md');
    const diskContent = await readFile(contextPath, 'utf8');

    expect(diskContent).toBe(newContent);
  });
});
