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
