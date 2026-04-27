import { describe, it, expect, afterEach } from 'vitest';
import { spawn as childSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
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

async function setup() {
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
  const ticket = await (await fetch(`${srv.url}/api/boards/${board.board.boardId}/lanes/work/tickets`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'X', state: 'todo' }),
  })).json() as { ticket: { filename: string } };
  return { srv, boardId: board.board.boardId, filename: ticket.ticket.filename };
}

describe('runtime routes', () => {
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
});
