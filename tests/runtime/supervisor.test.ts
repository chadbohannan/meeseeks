import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn as childSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { RuntimeSupervisor } from '../../src/runtime/supervisor.js';
import type { PtyLike, SpawnFn } from '../../src/runtime/supervisor.js';

const STUB = path.resolve(process.cwd(), 'bin/stub-harness.mjs');

function childToPtyLike(child: ChildProcessWithoutNullStreams): PtyLike {
  const dataHs = new Set<(d: string) => void>();
  const exitHs = new Set<(e: { exitCode: number }) => void>();
  child.stdout.on('data', (b: Buffer) => dataHs.forEach(fn => fn(b.toString('utf8'))));
  child.stderr.on('data', (b: Buffer) => dataHs.forEach(fn => fn(b.toString('utf8'))));
  child.on('exit', (code) => exitHs.forEach(fn => fn({ exitCode: code ?? 0 })));
  return {
    pid: child.pid ?? 0,
    write: (d: string) => { try { child.stdin.write(d); } catch { /* ignore */ } },
    resize: () => {},
    kill: (sig?: string) => { try { child.kill(sig as NodeJS.Signals | undefined); } catch { /* ignore */ } },
    onData: (h) => { dataHs.add(h); return { dispose: () => dataHs.delete(h) }; },
    onExit: (h) => { exitHs.add(h); return { dispose: () => exitHs.delete(h) }; },
  };
}

const stubSpawn: SpawnFn = (_file, args, opts) => {
  const child = childSpawn('node', [STUB, ...(args ?? []).filter(a => a.startsWith('--scripted='))], {
    cwd: opts?.cwd, env: opts?.env,
  }) as ChildProcessWithoutNullStreams;
  return childToPtyLike(child);
};

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'meeseeks-rt-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout');
    await new Promise(r => setTimeout(r, 25));
  }
}

describe('RuntimeSupervisor', () => {
  it('spawns, sees init then turn-end, transitions to idle, and lists', async () => {
    const sup = new RuntimeSupervisor({ spawnFn: stubSpawn, ringBytes: 8192 });
    const events: Array<{ status: string }> = [];
    sup.on('runtime-status', (s) => events.push(s));
    const summary = await sup.spawn({
      runtimeId: 'rt-1',
      boardPath: tmp,
      lanePath: path.join(tmp, 'lane'),
      ticketAbsPath: path.join(tmp, 'lane', 'todo', 't.md'),
      processDocPath: null,
      ticketRef: { boardId: 'b', laneName: 'lane', filename: 't.md' },
      board: null,
      permissions: null,
      adapterArgsOverride: ['--scripted=init,assistant,result'],
    });
    expect(summary.status).toBe('starting');
    await waitFor(() => {
      const live = sup.get('rt-1');
      return live?.status === 'idle' || live?.status === 'exited';
    });
    expect(events.map(e => e.status)).toContain('idle');
    await sup.terminateAll();
  });

  it('captures stdout in the ring buffer, retrievable via snapshot', async () => {
    const sup = new RuntimeSupervisor({ spawnFn: stubSpawn, ringBytes: 8192 });
    await sup.spawn({
      runtimeId: 'rt-2',
      boardPath: tmp, lanePath: tmp, ticketAbsPath: tmp,
      processDocPath: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
      board: null, permissions: null,
      adapterArgsOverride: ['--scripted=init,result'],
    });
    await waitFor(() => {
      const snap = sup.snapshot('rt-2');
      return !!snap && snap.toString('utf8').includes('"type":"system"');
    });
    await sup.terminateAll();
  });

  it('terminates with SIGTERM and surfaces exit', async () => {
    const sup = new RuntimeSupervisor({ spawnFn: stubSpawn, ringBytes: 8192, termKillMs: 200 });
    const exits: Array<{ status: string; exitCode?: number }> = [];
    sup.on('runtime-status', (s) => exits.push(s));
    await sup.spawn({
      runtimeId: 'rt-3',
      boardPath: tmp, lanePath: tmp, ticketAbsPath: tmp,
      processDocPath: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
      board: null, permissions: null,
      adapterArgsOverride: ['--scripted=init'],
    });
    await new Promise(r => setTimeout(r, 100));
    await sup.terminate('rt-3');
    expect(exits.some(e => e.status === 'exited' || e.status === 'errored')).toBe(true);
  });

  it('writes settings file when permissions provided and removes it on exit', async () => {
    const sup = new RuntimeSupervisor({ spawnFn: stubSpawn, ringBytes: 8192, termKillMs: 200 });
    await sup.spawn({
      runtimeId: 'rt-4',
      boardPath: tmp, lanePath: tmp, ticketAbsPath: tmp,
      processDocPath: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
      board: null,
      permissions: { allowedPaths: [], allowedTools: ['Bash'], deniedTools: [] },
      adapterArgsOverride: ['--scripted=init'],
    });
    const settingsPath = path.join(tmp, '.meeseeks', 'session-rt-4.json');
    await fs.access(settingsPath);
    await sup.terminateAll();
    let removed = false;
    for (let i = 0; i < 80 && !removed; i++) {
      await new Promise(r => setTimeout(r, 25));
      try { await fs.access(settingsPath); } catch { removed = true; }
    }
    expect(removed).toBe(true);
  });
});
