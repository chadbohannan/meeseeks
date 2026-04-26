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

  it('returns 404 on missing path', async () => {
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
