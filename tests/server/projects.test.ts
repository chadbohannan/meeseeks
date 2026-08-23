import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bootTestServer, type TestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';
import type { Detection, ProjectSummary, ProjectDetail } from '../../src/shared/types.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function boot(): Promise<{ srv: TestServer; root: string; repo: string }> {
  const tp = await makeBareProject('WS');
  cleanups.push(tp.cleanup);
  const repo = path.join(tp.root, 'repo');
  await mkdir(repo, { recursive: true });
  const srv = await bootTestServer(tp.root);
  cleanups.push(srv.cleanup);
  return { srv, root: tp.root, repo };
}

const json = (res: Response) => res.json() as Promise<any>;

async function post(srv: TestServer, body: unknown) {
  return fetch(`${srv.url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('project routes', () => {
  it('GET /api/projects returns an empty list initially', async () => {
    const { srv } = await boot();
    const res = await fetch(`${srv.url}/api/projects`);
    expect(res.status).toBe(200);
    expect((await json(res)).projects).toEqual([]);
  });

  it('POST /api/projects creates and lists a project', async () => {
    const { srv, repo } = await boot();
    const res = await post(srv, { name: 'Meeseeks', root: repo });
    expect(res.status).toBe(200);
    const created = (await json(res)).project as ProjectSummary;
    expect(created.projectId).toBe('meeseeks');
    expect(created.available).toBe(true);

    const listed = (await json(await fetch(`${srv.url}/api/projects`))).projects as ProjectSummary[];
    expect(listed.map(p => p.projectId)).toEqual(['meeseeks']);
  });

  it('POST /api/projects rejects a missing name or root with 400', async () => {
    const { srv, repo } = await boot();
    expect((await post(srv, { root: repo })).status).toBe(400);
    expect((await post(srv, { name: 'NoRoot' })).status).toBe(400);
  });

  it('POST /api/projects returns 409 on a duplicate', async () => {
    const { srv, repo } = await boot();
    await post(srv, { name: 'Dup', root: repo });
    expect((await post(srv, { name: 'Dup', root: repo })).status).toBe(409);
  });

  it('GET /api/projects/:id returns detail; 404 when unknown', async () => {
    const { srv, repo } = await boot();
    await post(srv, { name: 'Detail', root: repo, context: 'hello' });

    const res = await fetch(`${srv.url}/api/projects/detail`);
    expect(res.status).toBe(200);
    const detail = (await json(res)).project as ProjectDetail;
    expect(detail.contextContent).toBe('hello');
    expect(detail.root).toBe(repo);

    expect((await fetch(`${srv.url}/api/projects/nope`)).status).toBe(404);
  });

  it('PATCH /api/projects/:id updates fields', async () => {
    const { srv, repo } = await boot();
    await post(srv, { name: 'Before', root: repo });

    const res = await fetch(`${srv.url}/api/projects/before`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'After', color: '#f00' }),
    });
    expect(res.status).toBe(200);
    const updated = (await json(res)).project as ProjectDetail;
    expect(updated.name).toBe('After');
    expect(updated.color).toBe('#f00');
    expect(updated.projectId).toBe('before');
  });

  it('DELETE /api/projects/:id removes it; 404 when unknown', async () => {
    const { srv, repo } = await boot();
    await post(srv, { name: 'Doomed', root: repo });

    expect((await fetch(`${srv.url}/api/projects/doomed`, { method: 'DELETE' })).status).toBe(200);
    expect((await json(await fetch(`${srv.url}/api/projects`))).projects).toEqual([]);
    expect((await fetch(`${srv.url}/api/projects/doomed`, { method: 'DELETE' })).status).toBe(404);
  });

  it('does not collide with GET /api/workspace', async () => {
    const { srv, repo } = await boot();
    await post(srv, { name: 'Coexist', root: repo });
    const ws = await json(await fetch(`${srv.url}/api/workspace`));
    expect(ws.workspace.config.name).toBe('WS');
    expect(ws.workspace.config.projects).toEqual(['projects/coexist.yaml']);
  });
});

describe('POST /api/projects/detect', () => {
  it('returns proposals for a repository root without creating anything', async () => {
    const { srv, repo } = await boot();
    await writeFile(
      path.join(repo, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
      'utf8',
    );

    const res = await fetch(`${srv.url}/api/projects/detect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: repo }),
    });
    expect(res.status).toBe(200);
    const detections = (await json(res)).detections as Detection[];
    expect(detections.map(d => d.value)).toContain('Bash(npm run test *)');

    // Detection runs before the project exists and must not bring one into being.
    expect((await json(await fetch(`${srv.url}/api/projects`))).projects).toEqual([]);
  });

  // `detect` must not be captured as a project id by /api/projects/:projectId.
  it('is not shadowed by the project detail route', async () => {
    const { srv, repo } = await boot();
    await post(srv, { name: 'Detect', root: repo });
    const res = await fetch(`${srv.url}/api/projects/detect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: repo }),
    });
    expect(res.status).toBe(200);
    expect(Array.isArray((await json(res)).detections)).toBe(true);
  });

  it('rejects a request with no root', async () => {
    const { srv } = await boot();
    const res = await fetch(`${srv.url}/api/projects/detect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns an empty list for a root that does not exist', async () => {
    const { srv } = await boot();
    const res = await fetch(`${srv.url}/api/projects/detect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: '/definitely/not/here' }),
    });
    expect(res.status).toBe(200);
    expect((await json(res)).detections).toEqual([]);
  });
});
