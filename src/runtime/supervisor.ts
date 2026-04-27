import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { RingBuffer } from './ring-buffer.js';
import { StreamParser, type ParseEvent } from './stream-parser.js';
import { buildSpawnSpec } from './claude-code.js';
import type { RuntimeStatus, RuntimeSummary, TicketRef } from '../shared/runtime.js';
import type { BoardRuntimeConfig, PermissionsConfig } from './types.js';

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
  processDocPath: string | null;
  ticketRef: TicketRef;
  board: BoardRuntimeConfig | null;
  permissions: PermissionsConfig | null;
  adapterArgsOverride?: string[];
}

interface Runtime {
  summary: RuntimeSummary;
  pty: PtyLike;
  ring: RingBuffer;
  parser: StreamParser;
  settingsPath: string | null;
}

export interface SupervisorOptions {
  spawnFn?: SpawnFn;
  ringBytes?: number;
  termKillMs?: number;
}

const DEFAULT_RING = 2 * 1024 * 1024;
const DEFAULT_TERM_KILL_MS = 5000;

export class RuntimeSupervisor extends EventEmitter {
  spawnFn: SpawnFn;
  private runtimes = new Map<string, Runtime>();
  private ringBytes: number;
  private termKillMs: number;

  constructor(opts: SupervisorOptions = {}) {
    super();
    this.spawnFn = opts.spawnFn ?? defaultPtySpawn;
    this.ringBytes = opts.ringBytes ?? DEFAULT_RING;
    this.termKillMs = opts.termKillMs ?? DEFAULT_TERM_KILL_MS;
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
    r.pty.write(data.toString('utf8'));
    return true;
  }

  resize(runtimeId: string, cols: number, rows: number): boolean {
    const r = this.runtimes.get(runtimeId);
    if (!r) return false;
    r.pty.resize(cols, rows);
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
        ticketRef: input.ticketRef,
        pid: null,
        status: 'errored',
        startedAt: new Date().toISOString(),
        errorMessage,
      };
      this.emit('runtime-status', { runtimeId: input.runtimeId, status: 'errored', errorMessage });
      return summary;
    }

    const ring = new RingBuffer(this.ringBytes);
    const parser = new StreamParser();
    const summary: RuntimeSummary = {
      runtimeId: input.runtimeId,
      ticketRef: input.ticketRef,
      pid: pty.pid,
      status: 'starting',
      startedAt: new Date().toISOString(),
    };
    const rt: Runtime = { summary, pty, ring, parser, settingsPath: spec.settingsFile?.path ?? null };
    this.runtimes.set(input.runtimeId, rt);
    this.emit('runtime-spawned', { ...summary });

    pty.onData((data) => {
      const buf = Buffer.from(data, 'utf8');
      ring.append(buf);
      this.emit('runtime-stdio', { runtimeId: input.runtimeId, data: buf.toString('base64') });
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
      const wasTerminating = rt.summary.status === 'terminating';
      rt.summary.exitCode = exitCode;
      this.setStatus(rt, wasTerminating || exitCode === 0 ? 'exited' : 'errored', { exitCode });
      void this.cleanupSettings(rt);
      this.runtimes.delete(input.runtimeId);
    });

    setImmediate(() => {
      const msg = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: spec.preamble }] } });
      try { pty.write(msg + '\n'); } catch { /* ignore: process may have died */ }
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

  private setStatus(rt: Runtime, status: RuntimeStatus, extra: { exitCode?: number; errorMessage?: string } = {}): void {
    rt.summary.status = status;
    if (extra.exitCode !== undefined) rt.summary.exitCode = extra.exitCode;
    if (extra.errorMessage) rt.summary.errorMessage = extra.errorMessage;
    this.emit('runtime-status', { runtimeId: rt.summary.runtimeId, status, ...extra });
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
