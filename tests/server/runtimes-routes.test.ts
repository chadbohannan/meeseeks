import { describe, it, expect, afterEach } from 'vitest';
import { spawn as childSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';
import type { PtyLike, SpawnFn } from '../../src/runtime/supervisor.js';

const STUB = path.resolve(process.cwd(), 'bin/stub-harness.mjs');

function childToPty(child: ChildProcessWithoutNullStreams): PtyLike {
  const dataHs = new Set<(d: string) => void>();
  const exitHs = new Set<(e: { exitCode: number }) => void>();
  child.stdout.on('data', (b: Buffer) => dataHs.forEach(f => f(b.toString('utf8'))));
  child.on('exit', c => exitHs.forEach(f => f({ exitCode: c ?? 0 })));
  return {
    pid: child.pid ?? 0,
    write: (d) => { try { child.stdin.write(d); } catch { /* ignore */ } },
    resize: () => {},
    kill: (s) => { try { child.kill(s as NodeJS.Signals | undefined); } catch { /* ignore */ } },
    onData: (h) => { dataHs.add(h); return { dispose: () => dataHs.delete(h) }; },
    onExit: (h) => { exitHs.add(h); return { dispose: () => exitHs.delete(h) }; },
  };
}

const stubSpawn: SpawnFn = (_f, args, opts) => {
  const child = childSpawn('node', [STUB, ...(args ?? []).filter(a => a.startsWith('--scripted='))], {
    cwd: opts?.cwd, env: opts?.env, stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;
  return childToPty(child);
};

const STATES = [{ dir: 'todo', name: 'Todo' }, { dir: 'done', name: 'Done' }];

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

interface SetupOpts {
  /** Ticket project assignment. undefined leaves the ticket unassigned. */
  project?: string;
  /** Permissions written to the created project's config. */
  projectPermissions?: { allowedPaths?: string[]; allowedTools?: string[]; deniedTools?: string[] };
  /** Permissions written to the lane's permissions.yaml. */
  lanePermissions?: { allowedPaths?: string[]; allowedTools?: string[]; deniedTools?: string[] };
}

async function setup(opts: SetupOpts = { project: 'proj' }) {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const srv = await bootTestServer(tp.root);
  cleanups.push(srv.cleanup);
  // override supervisor spawnFn for tests
  (srv.state.supervisor as unknown as { spawnFn: SpawnFn }).spawnFn = stubSpawn;
  const board = await (await fetch(`${srv.url}/api/boards`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'B' }),
  })).json() as { board: { boardId: string } };
  await fetch(`${srv.url}/api/boards/${board.board.boardId}/lanes`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'work', states: STATES }),
  });

  const boardPath = path.join(tp.root, 'boards', board.board.boardId);
  const repoRoot = path.join(tp.root, 'repo');
  await mkdir(repoRoot, { recursive: true });

  if (opts.project) {
    await fetch(`${srv.url}/api/projects`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: opts.project,
        root: repoRoot,
        ...(opts.projectPermissions
          ? {
            permissions: {
              allowedPaths: [], allowedTools: [], deniedTools: [], ...opts.projectPermissions,
            },
          }
          : {}),
      }),
    });
  }
  if (opts.lanePermissions) {
    await writeFile(
      path.join(boardPath, 'lanes', 'work', 'permissions.yaml'),
      yaml.dump({ allowedPaths: [], allowedTools: [], deniedTools: [], ...opts.lanePermissions }),
      'utf8',
    );
  }

  const ticket = await (await fetch(`${srv.url}/api/boards/${board.board.boardId}/lanes/work/tickets`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'X', state: 'todo', project: opts.project }),
  })).json() as { ticket: { filename: string } };
  return {
    srv, boardId: board.board.boardId, filename: ticket.ticket.filename, repoRoot, boardPath,
  };
}

async function waitForStatus(
  srv: { url: string },
  runtimeId: string,
  target: string,
  timeoutMs = 2000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await (await fetch(`${srv.url}/api/runtimes/${runtimeId}`)).json() as { runtime?: { status: string } };
    if (!r.runtime) return 'gone';
    if (r.runtime.status === target || r.runtime.status === 'exited' || r.runtime.status === 'errored') return r.runtime.status;
    await new Promise(res => setTimeout(res, 25));
  }
  throw new Error(`timed out waiting for status ${target}`);
}

describe('runtime routes', () => {
  it('refuses to start a runtime for an unassigned ticket', async () => {
    const { srv, boardId, filename } = await setup({ project: undefined });
    const res = await fetch(`${srv.url}/api/tickets/${boardId}/work/${filename}/runtime`, { method: 'POST' });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain('no project assigned');
    // Nothing should have been spawned.
    const list = await (await fetch(`${srv.url}/api/runtimes`)).json() as { runtimes: unknown[] };
    expect(list.runtimes).toHaveLength(0);
  });

  it('refuses to start a runtime for a ticket naming an unknown project', async () => {
    const { srv, boardId, filename } = await setup({ project: 'proj' });
    await fetch(`${srv.url}/api/projects/proj`, { method: 'DELETE' });
    const res = await fetch(`${srv.url}/api/tickets/${boardId}/work/${filename}/runtime`, { method: 'POST' });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("unknown project 'proj'");
  });

  it('permissions preview unions project and lane, tagging each entry origin', async () => {
    const { srv, boardId, filename, repoRoot, boardPath } = await setup({
      project: 'proj',
      projectPermissions: { allowedTools: ['Read'], deniedTools: ['Fetch'], allowedPaths: ['./vendor'] },
      lanePermissions: { allowedTools: ['Read'], deniedTools: ['Write', 'Bash'], allowedPaths: ['../shared'] },
    });

    const res = await fetch(`${srv.url}/api/tickets/${boardId}/work/${filename}/permissions`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      projectId: string | null;
      projectResolved: boolean;
      permissions: {
        allowedPaths: Array<{ value: string; origins: string[] }>;
        allowedTools: Array<{ value: string; origins: string[] }>;
        deniedTools: Array<{ value: string; origins: string[] }>;
      };
    };

    expect(body.projectId).toBe('proj');
    expect(body.projectResolved).toBe(true);

    // The lane's denials survive alongside the project's - the floor property.
    expect(body.permissions.deniedTools.map(e => e.value).sort())
      .toEqual(['Bash', 'Fetch', 'Write']);

    // A value both sides contribute is de-duplicated and carries both origins.
    const read = body.permissions.allowedTools.find(e => e.value === 'Read')!;
    expect(read.origins).toEqual(['project', 'lane']);

    // Each source resolved its own relative path against its own base.
    const paths = body.permissions.allowedPaths.map(e => e.value);
    expect(paths).toContain(path.resolve(repoRoot, './vendor'));
    expect(paths).toContain(path.resolve(path.join(boardPath, 'lanes', 'work'), '../shared'));
  });

  it('permissions preview tolerates an unassigned ticket and returns lane-only rules', async () => {
    const { srv, boardId, filename } = await setup({
      project: undefined,
      lanePermissions: { deniedTools: ['Write'] },
    });
    const res = await fetch(`${srv.url}/api/tickets/${boardId}/work/${filename}/permissions`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      projectId: string | null;
      projectResolved: boolean;
      permissions: { deniedTools: Array<{ value: string; origins: string[] }> };
    };
    expect(body.projectId).toBeNull();
    expect(body.projectResolved).toBe(false);
    expect(body.permissions.deniedTools).toEqual([{ value: 'Write', origins: ['lane'] }]);
  });

  it('spawns a runtime for a ticket and lists it', async () => {
    const { srv, boardId, filename } = await setup();
    const res = await fetch(`${srv.url}/api/tickets/${boardId}/work/${filename}/runtime`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json() as { runtime: { runtimeId: string } };
    expect(body.runtime.runtimeId).toBeTruthy();
    const list = await (await fetch(`${srv.url}/api/runtimes`)).json() as { runtimes: Array<{ runtimeId: string }> };
    expect(list.runtimes.find(r => r.runtimeId === body.runtime.runtimeId)).toBeTruthy();
  });

  it('returns 404 for unknown runtime; DELETE is idempotent', async () => {
    const { srv } = await setup();
    const get = await fetch(`${srv.url}/api/runtimes/bogus`);
    expect(get.status).toBe(404);
    const del = await fetch(`${srv.url}/api/runtimes/bogus`, { method: 'DELETE' });
    expect(del.status).toBe(200);
  });

  it('returns existing live runtime for the same ticket on second spawn', async () => {
    const { srv, boardId, filename } = await setup();
    const a = await (await fetch(`${srv.url}/api/tickets/${boardId}/work/${filename}/runtime`, { method: 'POST' })).json() as { runtime: { runtimeId: string } };
    const b = await (await fetch(`${srv.url}/api/tickets/${boardId}/work/${filename}/runtime`, { method: 'POST' })).json() as { runtime: { runtimeId: string } };
    expect(b.runtime.runtimeId).toBe(a.runtime.runtimeId);
  });

  it('notify route: drives supervisor state from idle to awaiting-user', async () => {
    const { srv, boardId, filename } = await setup();
    const spawn = await (await fetch(`${srv.url}/api/tickets/${boardId}/work/${filename}/runtime`, { method: 'POST' })).json() as { runtime: { runtimeId: string } };
    const { runtimeId } = spawn.runtime;
    // stub default (init,assistant,result) drives runtime to idle
    await waitForStatus(srv, runtimeId, 'idle');
    const res = await fetch(`${srv.url}/internal/runtime/${runtimeId}/notify?state=awaiting-user`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const after = await (await fetch(`${srv.url}/api/runtimes/${runtimeId}`)).json() as { runtime: { status: string } };
    expect(after.runtime.status).toBe('awaiting-user');
  });

  it('notify route: drives supervisor state from idle to idle (no-op re-assertion)', async () => {
    const { srv, boardId, filename } = await setup();
    const spawn = await (await fetch(`${srv.url}/api/tickets/${boardId}/work/${filename}/runtime`, { method: 'POST' })).json() as { runtime: { runtimeId: string } };
    const { runtimeId } = spawn.runtime;
    await waitForStatus(srv, runtimeId, 'idle');
    const res = await fetch(`${srv.url}/internal/runtime/${runtimeId}/notify?state=idle`);
    expect(res.status).toBe(200);
  });

  it('notify route: returns 400 for invalid state', async () => {
    const { srv } = await setup();
    const res = await fetch(`${srv.url}/internal/runtime/any-id/notify?state=running`);
    expect(res.status).toBe(400);
  });

  it('notify route: returns 404 for unknown runtime id', async () => {
    const { srv } = await setup();
    const res = await fetch(`${srv.url}/internal/runtime/bogus/notify?state=idle`);
    expect(res.status).toBe(404);
  });
});
