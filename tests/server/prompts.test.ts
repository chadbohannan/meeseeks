import { describe, it, expect, afterEach } from 'vitest';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function setup() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const srv = await bootTestServer(tp.root);
  cleanups.push(srv.cleanup);
  const created = await (await fetch(`${srv.url}/api/boards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'B' }),
  })).json() as { board: { boardId: string } };
  return { srv, boardId: created.board.boardId };
}

describe('prompt routes', () => {
  it('lists, writes, reads, deletes prompts', async () => {
    const { srv, boardId } = await setup();

    let list = await (await fetch(`${srv.url}/api/boards/${boardId}/prompts`)).json() as { prompts: unknown[] };
    expect(list.prompts).toEqual([]);

    const put = await fetch(`${srv.url}/api/boards/${boardId}/prompts/foo.md`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'hello' }),
    });
    expect(put.status).toBe(200);

    list = await (await fetch(`${srv.url}/api/boards/${boardId}/prompts`)).json() as { prompts: Array<{ name: string }> };
    expect(list.prompts).toHaveLength(1);

    const got = await (await fetch(`${srv.url}/api/boards/${boardId}/prompts/foo.md`)).json() as { prompt: { body: string } };
    expect(got.prompt.body).toBe('hello');

    const del = await fetch(`${srv.url}/api/boards/${boardId}/prompts/foo.md`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    list = await (await fetch(`${srv.url}/api/boards/${boardId}/prompts`)).json() as { prompts: unknown[] };
    expect(list.prompts).toEqual([]);
  });

  it('rejects non-md filename', async () => {
    const { srv, boardId } = await setup();
    const r = await fetch(`${srv.url}/api/boards/${boardId}/prompts/foo.txt`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'x' }),
    });
    expect(r.status).toBe(400);
  });

  it('returns 404 on missing prompt', async () => {
    const { srv, boardId } = await setup();
    const r = await fetch(`${srv.url}/api/boards/${boardId}/prompts/missing.md`);
    expect(r.status).toBe(404);
  });

  it('run returns 404 if prompt does not exist', async () => {
    const { srv, boardId } = await setup();
    const r = await fetch(`${srv.url}/api/boards/${boardId}/prompts/missing.md/run`, { method: 'POST' });
    expect(r.status).toBe(404);
  });
});
