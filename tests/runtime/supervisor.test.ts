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
      processDocContent: null,
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
      processDocContent: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
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
      processDocContent: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
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
      processDocContent: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
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

  it('transitions starting → idle via debounce when no stream-json init arrives', async () => {
    const sup = new RuntimeSupervisor({ spawnFn: stubSpawn, ringBytes: 8192, startingDebounceMs: 100 });
    // scripted=crash: stub exits immediately after emitting nothing parseable
    // Use a custom spawn that emits raw non-JSON data then stays silent
    let ptyDataHandler: ((d: string) => void) | null = null;
    let ptyExitHandler: ((e: { exitCode: number }) => void) | null = null;
    const silentSpawn: typeof stubSpawn = () => ({
      pid: 999,
      write: () => {},
      resize: () => {},
      kill: () => {},
      onData: (h) => { ptyDataHandler = h; return { dispose: () => {} }; },
      onExit: (h) => { ptyExitHandler = h; return { dispose: () => {} }; },
    });
    const silentSup = new RuntimeSupervisor({ spawnFn: silentSpawn, ringBytes: 8192, startingDebounceMs: 100 });
    await silentSup.spawn({
      runtimeId: 'rt-debounce',
      boardPath: tmp, lanePath: tmp, ticketAbsPath: tmp,
      processDocContent: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
      board: null, permissions: null,
    });
    expect(silentSup.get('rt-debounce')?.status).toBe('starting');
    // Emit non-JSON TUI data to trigger the debounce timer
    ptyDataHandler!('\x1b[2J\x1b[H> ');
    await waitFor(() => silentSup.get('rt-debounce')?.status === 'running', 500);
    expect(silentSup.get('rt-debounce')?.status).toBe('running');
    ptyExitHandler!({ exitCode: 0 });
    void sup.terminateAll();
  });

  it('applies resize to the pty immediately, even while still starting', async () => {
    // Interactive ticket runtimes render a TUI sized to the pty columns. They emit
    // ANSI escape sequences rather than stream-json, so they never produce an `init`
    // event and only leave 'starting' via the output-idle debounce — which keeps
    // resetting while the TUI animates. A resize requested on mount must reach the
    // pty right away, not be deferred until the runtime happens to settle.
    const resizes: Array<{ cols: number; rows: number }> = [];
    const captureSpawn: typeof stubSpawn = () => ({
      pid: 4242,
      write: () => {},
      resize: (cols: number, rows: number) => { resizes.push({ cols, rows }); },
      kill: () => {},
      onData: () => ({ dispose: () => {} }),
      onExit: () => ({ dispose: () => {} }),
    });
    // Long debounce so the runtime stays 'starting' for the duration of the test.
    const sup = new RuntimeSupervisor({ spawnFn: captureSpawn, ringBytes: 8192, startingDebounceMs: 60_000 });
    await sup.spawn({
      runtimeId: 'rt-resize',
      boardPath: tmp, lanePath: tmp, ticketAbsPath: tmp,
      processDocContent: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
      board: null, permissions: null,
    });
    expect(sup.get('rt-resize')?.status).toBe('starting');
    const ok = sup.resize('rt-resize', 96, 24);
    expect(ok).toBe(true);
    expect(resizes).toEqual([{ cols: 96, rows: 24 }]);
  });

  it('re-applies the last starting-phase resize when the runtime leaves starting', async () => {
    // Backstop for an interactive child that had not yet installed its SIGWINCH
    // handler when the on-mount resize arrived: the recorded size is replayed once
    // the runtime settles out of 'starting'.
    const resizes: Array<{ cols: number; rows: number }> = [];
    let dataHandler: ((d: string) => void) | null = null;
    const captureSpawn: typeof stubSpawn = () => ({
      pid: 4243,
      write: () => {},
      resize: (cols: number, rows: number) => { resizes.push({ cols, rows }); },
      kill: () => {},
      onData: (h) => { dataHandler = h; return { dispose: () => {} }; },
      onExit: () => ({ dispose: () => {} }),
    });
    const sup = new RuntimeSupervisor({ spawnFn: captureSpawn, ringBytes: 8192, startingDebounceMs: 50 });
    await sup.spawn({
      runtimeId: 'rt-reflush',
      boardPath: tmp, lanePath: tmp, ticketAbsPath: tmp,
      processDocContent: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
      board: null, permissions: null,
    });
    sup.resize('rt-reflush', 110, 40);
    expect(resizes).toEqual([{ cols: 110, rows: 40 }]);
    // Non-JSON TUI output arms the debounce; when it fires, status leaves 'starting'.
    dataHandler!('\x1b[2J\x1b[H> ');
    await waitFor(() => sup.get('rt-reflush')?.status === 'running', 500);
    expect(resizes).toEqual([{ cols: 110, rows: 40 }, { cols: 110, rows: 40 }]);
  });

  it('notifyState drives status; hooks are the sole authority for idle and awaiting-user', async () => {
    const sup = new RuntimeSupervisor({ spawnFn: stubSpawn, ringBytes: 8192 });
    const statuses: string[] = [];
    sup.on('runtime-status', (s) => statuses.push(s.status));
    await sup.spawn({
      runtimeId: 'rt-notify',
      boardPath: tmp, lanePath: tmp, ticketAbsPath: tmp,
      processDocContent: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
      board: null, permissions: null,
      adapterArgsOverride: ['--scripted=init'],
    });
    // Wait for idle from StreamParser init event
    await waitFor(() => sup.get('rt-notify')?.status === 'idle' || sup.get('rt-notify')?.status === 'exited');
    // notifyState awaiting-user
    const ok = sup.notifyState('rt-notify', 'awaiting-user');
    expect(ok).toBe(true);
    expect(sup.get('rt-notify')?.status).toBe('awaiting-user');
    // notifyState idle
    const ok2 = sup.notifyState('rt-notify', 'idle');
    expect(ok2).toBe(true);
    expect(sup.get('rt-notify')?.status).toBe('idle');
    expect(statuses).toContain('awaiting-user');
    expect(statuses).toContain('idle');
    await sup.terminateAll();
  });

  it('includes preamble in the summary returned by spawn', async () => {
    const sup = new RuntimeSupervisor({ spawnFn: stubSpawn, ringBytes: 8192 });
    const summary = await sup.spawn({
      runtimeId: 'rt-preamble',
      boardPath: tmp,
      lanePath: path.join(tmp, 'lane'),
      ticketAbsPath: path.join(tmp, 'lane', 'todo', 'my-ticket.md'),
      processDocContent: null,
      ticketRef: { boardId: 'b', laneName: 'lane', filename: 'my-ticket.md' },
      board: null,
      permissions: null,
      adapterArgsOverride: ['--scripted=init,result'],
    });
    expect(summary.preamble).toBeTruthy();
    expect(summary.preamble).toContain('my-ticket.md');
    expect(summary.preamble).toContain('lane');
    await sup.terminateAll();
  });
});
