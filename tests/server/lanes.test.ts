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
