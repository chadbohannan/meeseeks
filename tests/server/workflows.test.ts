import { describe, it, expect, afterEach } from 'vitest';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { readWorkspace, writeWorkspace } from '../../src/storage/workspace.js';

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const STATES = [{ dir: 'todo', name: 'Todo' }, { dir: 'doing', name: 'Doing' }];

async function setup() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const srv = await bootTestServer(tp.root);
  cleanups.push(srv.cleanup);
  return { srv, root: tp.root };
}

describe('workflow routes', () => {
  it('creates and reads a workflow', async () => {
    const { srv } = await setup();
    const create = await fetch(`${srv.url}/api/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    expect(create.status).toBe(200);
    const detail = await fetch(`${srv.url}/api/workflows/work`).then(r => r.json()) as { workflow: { states: Array<{ dir: string }> } };
    expect(detail.workflow.states.map(s => s.dir)).toEqual(['todo', 'doing']);
  });

  it('rejects creating duplicate workflow', async () => {
    const { srv } = await setup();
    await fetch(`${srv.url}/api/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    const r = await fetch(`${srv.url}/api/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    expect(r.status).toBe(409);
  });

  it('updates workflow states (add)', async () => {
    const { srv } = await setup();
    await fetch(`${srv.url}/api/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    const r = await fetch(`${srv.url}/api/workflows/work`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ states: [...STATES, { dir: 'done', name: 'Done' }] }),
    });
    expect(r.status).toBe(200);
  });

  it('deletes a workflow', async () => {
    const { srv, root } = await setup();
    await fetch(`${srv.url}/api/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    const r = await fetch(`${srv.url}/api/workflows/work`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deleteFiles: true }),
    });
    expect(r.status).toBe(200);
    const list = await (await fetch(`${srv.url}/api/workflows`)).json() as { workflows: unknown[] };
    expect(list.workflows).toEqual([]);
    expect(await exists(path.join(root, 'workflows/work'))).toBe(false);
  });

  // The default DELETE is non-destructive: a workflow holds tickets, and
  // unregistering is reversible where deleting the files is not.
  it('deregisters without deleting files when deleteFiles is absent', async () => {
    const { srv, root } = await setup();
    await fetch(`${srv.url}/api/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });
    const r = await fetch(`${srv.url}/api/workflows/work`, { method: 'DELETE' });
    expect(r.status).toBe(200);
    const list = await (await fetch(`${srv.url}/api/workflows`)).json() as { workflows: unknown[] };
    expect(list.workflows).toEqual([]);
    expect(await exists(path.join(root, 'workflows/work/workflow.yaml'))).toBe(true);
  });

  it('reports whether a runtime is the workflow own or inherited', async () => {
    const { srv, root } = await setup();
    await fetch(`${srv.url}/api/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: STATES }),
    });

    let got = await (await fetch(`${srv.url}/api/workflows/work`)).json() as
      { workflow: { runtime: unknown; runtimeInherited: boolean } };
    expect(got.workflow.runtime).toBeNull();

    // A workspace default is reported as inherited...
    const meta = await readWorkspace(root);
    await writeWorkspace(root, {
      ...meta.config,
      runtime: { harness: 'claude-code', provider: 'anthropic', model: 'opus', args: [], env: {} },
    });
    got = await (await fetch(`${srv.url}/api/workflows/work`)).json() as typeof got;
    expect(got.workflow.runtimeInherited).toBe(true);

    // ...until the workflow declares its own, which wins and is not inherited.
    const patched = await (await fetch(`${srv.url}/api/workflows/work`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        runtime: { harness: 'claude-code', provider: 'anthropic', model: 'haiku', args: [], env: {} },
      }),
    })).json() as { workflow: { runtime: { model: string }; runtimeInherited: boolean } };
    expect(patched.workflow.runtime.model).toBe('haiku');
    expect(patched.workflow.runtimeInherited).toBe(false);

    // Clearing it with null falls back to the workspace default again.
    const cleared = await (await fetch(`${srv.url}/api/workflows/work`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runtime: null }),
    })).json() as { workflow: { runtime: { model: string }; runtimeInherited: boolean } };
    expect(cleared.workflow.runtime.model).toBe('opus');
    expect(cleared.workflow.runtimeInherited).toBe(true);
  });
});
