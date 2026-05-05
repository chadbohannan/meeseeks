import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { RingBuffer } from './ring-buffer.js';
import { StreamParser, type ParseEvent } from './stream-parser.js';
import { buildSpawnSpec, buildPromptSpawnSpec } from './claude-code.js';
import type { RuntimeStatus, RuntimeSummary, TicketRef, PromptRef } from '../shared/runtime.js';
import type { BoardRuntimeConfig, PermissionsConfig } from './types.js';
import { spawn as childSpawn } from 'node:child_process';

export interface PtyLike {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(handler: (data: string) => void): { dispose: () => void };
  onExit(handler: (e: { exitCode: number; signal?: number }) => void): { dispose: () => void };
}

export type SpawnFn = (
  file: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string>; cols?: number; rows?: number },
) => PtyLike;

export interface SpawnInput {
  runtimeId: string;
  boardPath: string;
  lanePath: string;
  ticketAbsPath: string;
  processDocContent?: string | null;
  ticketRef: TicketRef;
  board: BoardRuntimeConfig | null;
  permissions: PermissionsConfig | null;
  model?: string;
  adapterArgsOverride?: string[];
}

export interface PromptSpawnInput {
  runtimeId: string;
  boardPath: string;
  promptRef: PromptRef;
  promptBody: string;
  board: BoardRuntimeConfig | null;
  permissions: PermissionsConfig | null;
  model?: string;
}

interface Runtime {
  summary: RuntimeSummary;
  pty: PtyLike;
  ring: RingBuffer;
  parser: StreamParser;
  settingsPath: string | null;
  startingTimer: ReturnType<typeof setTimeout> | null;
  pendingResize: { cols: number; rows: number } | null;
}

export interface SupervisorOptions {
  spawnFn?: SpawnFn;
  ringBytes?: number;
  termKillMs?: number;
  startingDebounceMs?: number;
}

const DEFAULT_RING = 2 * 1024 * 1024;
const DEFAULT_TERM_KILL_MS = 5000;
const DEFAULT_STARTING_DEBOUNCE_MS = 2000;

export class RuntimeSupervisor extends EventEmitter {
  spawnFn: SpawnFn;
  private runtimes = new Map<string, Runtime>();
  private ringBytes: number;
  private termKillMs: number;
  private startingDebounceMs: number;

  constructor(opts: SupervisorOptions = {}) {
    super();
    this.spawnFn = opts.spawnFn ?? defaultPtySpawn;
    this.ringBytes = opts.ringBytes ?? DEFAULT_RING;
    this.termKillMs = opts.termKillMs ?? DEFAULT_TERM_KILL_MS;
    this.startingDebounceMs = opts.startingDebounceMs ?? DEFAULT_STARTING_DEBOUNCE_MS;
  }

  list(): RuntimeSummary[] {
    return [...this.runtimes.values()].map(r => ({ ...r.summary }));
  }

  get(runtimeId: string): RuntimeSummary | null {
    const r = this.runtimes.get(runtimeId);
    return r ? { ...r.summary } : null;
  }

  snapshot(runtimeId: string): Buffer | null {
    const r = this.runtimes.get(runtimeId);
    return r ? r.ring.snapshot() : null;
  }

  writeInput(runtimeId: string, data: Buffer): boolean {
    const r = this.runtimes.get(runtimeId);
    if (!r) return false;
    const s = r.summary.status;
    if (s === 'exited' || s === 'errored' || s === 'terminating') return false;
    if ((s === 'idle' || s === 'awaiting-user') && data.includes(0x0d)) {
      this.setStatus(r, 'running');
    }
    try { r.pty.write(data.toString('utf8')); } catch { return false; }
    return true;
  }

  resize(runtimeId: string, cols: number, rows: number): boolean {
    const r = this.runtimes.get(runtimeId);
    if (!r) return false;
    const s = r.summary.status;
    if (s === 'exited' || s === 'errored' || s === 'terminating') return false;
    if (s === 'starting') {
      r.pendingResize = { cols, rows };
      return true;
    }
    try { r.pty.resize(cols, rows); } catch { return false; }
    return true;
  }

  async spawn(input: SpawnInput): Promise<RuntimeSummary> {
    if (this.runtimes.has(input.runtimeId)) {
      return { ...this.runtimes.get(input.runtimeId)!.summary };
    }
    const spec = buildSpawnSpec(input);
    if (spec.settingsFile) {
      await fs.mkdir(path.dirname(spec.settingsFile.path), { recursive: true });
      await fs.writeFile(spec.settingsFile.path, spec.settingsFile.body, 'utf8');
    }
    const argv = input.adapterArgsOverride
      ? [spec.argv[0]!, ...input.adapterArgsOverride]
      : spec.argv;
    const [file, ...args] = argv;
    let pty: PtyLike;
    try {
      pty = this.spawnFn(file!, args, { cwd: spec.cwd, env: spec.env, cols: 120, rows: 30 });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const summary: RuntimeSummary = {
        runtimeId: input.runtimeId,
        kind: 'ticket',
        ticketRef: input.ticketRef,
        pid: null,
        status: 'errored',
        startedAt: new Date().toISOString(),
        errorMessage,
        preamble: spec.preamble,
      };
      this.emit('runtime-status', { runtimeId: input.runtimeId, status: 'errored', errorMessage });
      return summary;
    }

    const ring = new RingBuffer(this.ringBytes);
    const parser = new StreamParser();
    const summary: RuntimeSummary = {
      runtimeId: input.runtimeId,
      kind: 'ticket',
      ticketRef: input.ticketRef,
      pid: pty.pid,
      status: 'starting',
      startedAt: new Date().toISOString(),
      preamble: spec.preamble,
    };
    const rt: Runtime = { summary, pty, ring, parser, settingsPath: spec.settingsFile?.path ?? null, startingTimer: null, pendingResize: null };
    this.runtimes.set(input.runtimeId, rt);
    if (spec.settingsFile) {
      console.error(`[meeseeks] settings file: ${spec.settingsFile.path}`);
    }
    this.emit('runtime-spawned', { ...summary });

    pty.onData((data) => {
      const buf = Buffer.from(data, 'utf8');
      ring.append(buf);
      this.emit('runtime-stdio', { runtimeId: input.runtimeId, data: buf.toString('base64') });
      const s = rt.summary.status;
      if (s === 'starting') {
        if (rt.startingTimer) clearTimeout(rt.startingTimer);
        rt.startingTimer = setTimeout(() => {
          rt.startingTimer = null;
          if (rt.summary.status === 'starting') this.setStatus(rt, 'running');
        }, this.startingDebounceMs);
      }
      parser.feed(buf);
    });

    parser.on('event', (e: ParseEvent) => {
      if (e.kind === 'init' && rt.summary.status === 'starting') {
        this.setStatus(rt, 'idle');
      } else if (e.kind === 'turn-start') {
        this.setStatus(rt, 'running');
      } else if (e.kind === 'turn-end') {
        this.setStatus(rt, 'idle');
      }
    });

    pty.onExit(({ exitCode }) => {
      if (rt.startingTimer) { clearTimeout(rt.startingTimer); rt.startingTimer = null; }
      const wasTerminating = rt.summary.status === 'terminating';
      rt.summary.exitCode = exitCode;
      const status = wasTerminating || exitCode === 0 ? 'exited' : 'errored';
      const errorMessage = status === 'errored' ? `Process exited with code ${exitCode}` : undefined;
      this.setStatus(rt, status, { exitCode, errorMessage });
      void this.cleanupSettings(rt);
      this.runtimes.delete(input.runtimeId);
    });

    return { ...summary };
  }

  async spawnPrompt(input: PromptSpawnInput): Promise<RuntimeSummary> {
    if (this.runtimes.has(input.runtimeId)) {
      return { ...this.runtimes.get(input.runtimeId)!.summary };
    }
    const spec = buildPromptSpawnSpec(input);
    if (spec.settingsFile) {
      await fs.mkdir(path.dirname(spec.settingsFile.path), { recursive: true });
      await fs.writeFile(spec.settingsFile.path, spec.settingsFile.body, 'utf8');
    }
    const [file, ...args] = spec.argv;
    let child: ReturnType<typeof childSpawn>;
    try {
      child = childSpawn(file!, args, { cwd: spec.cwd, env: spec.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const summary: RuntimeSummary = {
        runtimeId: input.runtimeId,
        kind: 'prompt',
        promptRef: input.promptRef,
        pid: null,
        status: 'errored',
        startedAt: new Date().toISOString(),
        errorMessage,
        preamble: spec.preamble,
      };
      this.emit('runtime-status', { runtimeId: input.runtimeId, status: 'errored', errorMessage });
      return summary;
    }

    const ring = new RingBuffer(this.ringBytes);
    const parser = new StreamParser();
    const summary: RuntimeSummary = {
      runtimeId: input.runtimeId,
      kind: 'prompt',
      promptRef: input.promptRef,
      pid: child.pid ?? null,
      status: 'starting',
      startedAt: new Date().toISOString(),
      preamble: spec.preamble,
    };
    const ptyShim: PtyLike = {
      pid: child.pid ?? 0,
      write: () => {},
      resize: () => {},
      kill: (sig) => { try { child.kill(sig as NodeJS.Signals | undefined); } catch { /* ignore */ } },
      onData: () => ({ dispose: () => {} }),
      onExit: (handler) => {
        const fn = (code: number | null) => handler({ exitCode: code ?? 0 });
        child.on('exit', fn);
        return { dispose: () => { child.removeListener('exit', fn); } };
      },
    };
    const rt: Runtime = { summary, pty: ptyShim, ring, parser, settingsPath: spec.settingsFile?.path ?? null, startingTimer: null, pendingResize: null };
    this.runtimes.set(input.runtimeId, rt);
    if (spec.settingsFile) {
      console.error(`[meeseeks] settings file: ${spec.settingsFile.path}`);
    }
    this.emit('runtime-spawned', { ...summary });

    const onChunk = (b: Buffer) => {
      ring.append(b);
      this.emit('runtime-stdio', { runtimeId: input.runtimeId, data: b.toString('base64') });
      parser.feed(b);
    };
    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);

    parser.on('event', (e: ParseEvent) => {
      if (e.kind === 'init' && rt.summary.status === 'starting') {
        this.setStatus(rt, 'running');
      } else if (e.kind === 'turn-start' && rt.summary.status === 'starting') {
        this.setStatus(rt, 'running');
      } else if (e.kind === 'message-text') {
        rt.summary.lastMessage = e.text;
        this.emit('runtime-message', { runtimeId: input.runtimeId, text: e.text });
      }
    });

    child.on('exit', (code) => {
      const exitCode = code ?? 0;
      const wasTerminating = rt.summary.status === 'terminating';
      rt.summary.exitCode = exitCode;
      const status = wasTerminating || exitCode === 0 ? 'exited' : 'errored';
      const errorMessage = status === 'errored' ? `Process exited with code ${exitCode}` : undefined;
      this.setStatus(rt, status, { exitCode, errorMessage });
      void this.cleanupSettings(rt);
      this.runtimes.delete(input.runtimeId);
    });

    return { ...summary };
  }

  async terminate(runtimeId: string): Promise<void> {
    const rt = this.runtimes.get(runtimeId);
    if (!rt) return;
    if (rt.summary.status === 'exited' || rt.summary.status === 'errored') return;
    this.setStatus(rt, 'terminating');
    try { rt.pty.kill('SIGTERM'); } catch { /* ignore */ }
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try { rt.pty.kill('SIGKILL'); } catch { /* ignore */ }
        resolve();
      }, this.termKillMs);
      const dispose = rt.pty.onExit(() => { clearTimeout(t); dispose.dispose(); resolve(); });
    });
  }

  async terminateAll(): Promise<void> {
    await Promise.all([...this.runtimes.keys()].map(id => this.terminate(id)));
  }

  notifyState(runtimeId: string, status: 'idle' | 'awaiting-user'): boolean {
    const rt = this.runtimes.get(runtimeId);
    if (!rt) return false;
    const s = rt.summary.status;
    if (s === 'exited' || s === 'errored' || s === 'terminating') return false;
    if (rt.startingTimer) { clearTimeout(rt.startingTimer); rt.startingTimer = null; }
    this.setStatus(rt, status);
    return true;
  }

  private setStatus(rt: Runtime, status: RuntimeStatus, extra: { exitCode?: number; errorMessage?: string } = {}): void {
    const wasStarting = rt.summary.status === 'starting';
    rt.summary.status = status;
    if (extra.exitCode !== undefined) rt.summary.exitCode = extra.exitCode;
    if (extra.errorMessage) rt.summary.errorMessage = extra.errorMessage;
    this.emit('runtime-status', { runtimeId: rt.summary.runtimeId, status, ...extra });
    if (wasStarting && rt.pendingResize) {
      const { cols, rows } = rt.pendingResize;
      rt.pendingResize = null;
      try { rt.pty.resize(cols, rows); } catch { /* ignore */ }
    }
  }

  private async cleanupSettings(rt: Runtime): Promise<void> {
    if (!rt.settingsPath) return;
    try { await fs.rm(rt.settingsPath, { force: true }); } catch { /* ignore */ }
  }
}

const defaultPtySpawn: SpawnFn = (file, args, opts) => {
  const require = createRequire(import.meta.url);
  const pty = require('node-pty') as typeof import('node-pty');
  const proc = pty.spawn(file, args, {
    cwd: opts.cwd, env: opts.env, cols: opts.cols ?? 120, rows: opts.rows ?? 30, name: 'xterm-256color',
  });
  return {
    pid: proc.pid,
    write: (d) => proc.write(d),
    resize: (c, r) => proc.resize(c, r),
    kill: (sig) => proc.kill(sig),
    onData: (h) => proc.onData(h),
    onExit: (h) => proc.onExit(h),
  };
};
