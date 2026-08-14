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
  // Prompts live at the workspace root and no longer need a container, so
  // there is nothing to scaffold. A workflow is only involved when a run
  // explicitly picks one.
  return { srv };
}

describe('prompt routes', () => {
  it('lists, writes, reads, deletes prompts', async () => {
    const { srv } = await setup();

    let list = await (await fetch(`${srv.url}/api/prompts`)).json() as { prompts: unknown[] };
    expect(list.prompts).toEqual([]);

    const put = await fetch(`${srv.url}/api/prompts/foo.md`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'hello' }),
    });
    expect(put.status).toBe(200);

    list = await (await fetch(`${srv.url}/api/prompts`)).json() as { prompts: Array<{ name: string }> };
    expect(list.prompts).toHaveLength(1);

    const got = await (await fetch(`${srv.url}/api/prompts/foo.md`)).json() as { prompt: { body: string } };
    expect(got.prompt.body).toBe('hello');

    const del = await fetch(`${srv.url}/api/prompts/foo.md`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    list = await (await fetch(`${srv.url}/api/prompts`)).json() as { prompts: unknown[] };
    expect(list.prompts).toEqual([]);
  });

  it('rejects non-md filename', async () => {
    const { srv } = await setup();
    const r = await fetch(`${srv.url}/api/prompts/foo.txt`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'x' }),
    });
    expect(r.status).toBe(400);
  });

  it('returns 404 on missing prompt', async () => {
    const { srv } = await setup();
    const r = await fetch(`${srv.url}/api/prompts/missing.md`);
    expect(r.status).toBe(404);
  });

  it('run returns 404 if prompt does not exist', async () => {
    const { srv } = await setup();
    const r = await fetch(`${srv.url}/api/prompts/missing.md/run`, { method: 'POST' });
    expect(r.status).toBe(404);
  });

  it('run rejects an unknown projectId with 400', async () => {
    const { srv } = await setup();
    await fetch(`${srv.url}/api/prompts/p.md`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'do a thing' }),
    });
    const r = await fetch(`${srv.url}/api/prompts/p.md/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'nope' }),
    });
    expect(r.status).toBe(400);
    const body = await r.json() as { error: { message: string } };
    expect(body.error.message).toContain("unknown project 'nope'");
  });

  // The workflow is optional on a prompt run, unlike on a ticket — a
  // workspace-level prompt is legitimate — but a named one must exist, or the
  // run would silently proceed without the permissions the caller asked for.
  it('run rejects an unknown workflowName with 400', async () => {
    const { srv } = await setup();
    await fetch(`${srv.url}/api/prompts/p.md`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'do a thing' }),
    });
    const r = await fetch(`${srv.url}/api/prompts/p.md/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workflowName: 'nope' }),
    });
    expect(r.status).toBe(400);
    const body = await r.json() as { error: { message: string } };
    expect(body.error.message).toContain("unknown workflow 'nope'");
  });
});
