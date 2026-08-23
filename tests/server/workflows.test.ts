import { describe, it, expect, afterEach } from 'vitest';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';
import path from 'node:path';
import { access, readFile, writeFile } from 'node:fs/promises';
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

describe('cloning on create', () => {
  const RUNTIME = {
    harness: 'claude-code', provider: 'anthropic', model: 'opus', args: [], env: {},
  };

  async function postWorkflow(srv: { url: string }, body: unknown) {
    return fetch(`${srv.url}/api/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('copies the source workflow\'s runtime and permissions, but not its states', async () => {
    const { srv, root } = await setup();
    await postWorkflow(srv, { name: 'source', states: STATES, runtime: RUNTIME });
    await writeFile(
      path.join(root, 'workflows/source/permissions.yaml'),
      'allowedPaths: []\nallowedTools:\n  - Bash(npm test *)\ndeniedTools: []\n',
      'utf8',
    );

    const cloneStates = [{ dir: 'backlog', name: 'Backlog' }, { dir: 'shipped', name: 'Shipped' }];
    const res = await postWorkflow(srv, { name: 'clone', states: cloneStates, copyFrom: 'source' });
    expect(res.status).toBe(200);
    const detail = (await res.json() as any).workflow;

    expect(detail.runtime).toEqual(RUNTIME);
    expect(detail.runtimeInherited).toBe(false);
    // States come from the request, never from the source.
    expect(detail.states).toEqual(cloneStates);

    const perms = await readFile(path.join(root, 'workflows/clone/permissions.yaml'), 'utf8');
    expect(perms).toContain('Bash(npm test *)');
  });

  it('does not copy a process document', async () => {
    const { srv, root } = await setup();
    await postWorkflow(srv, { name: 'source', states: STATES });
    await writeFile(path.join(root, 'workflows/source/PROCESS.md'), '# source process\n', 'utf8');

    await postWorkflow(srv, { name: 'clone', states: STATES, copyFrom: 'source' });
    const doc = await readFile(path.join(root, 'workflows/clone/PROCESS.md'), 'utf8');
    expect(doc).not.toContain('source process');
    expect(doc).toContain('clone');
  });

  it('rejects a copyFrom naming a workflow that does not exist', async () => {
    const { srv } = await setup();
    const res = await postWorkflow(srv, { name: 'clone', states: STATES, copyFrom: 'nope' });
    expect(res.status).toBe(404);
  });
});
