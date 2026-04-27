# Runtime Supervisor & Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the runtime supervisor (spawn/terminate Claude Code as a per-ticket pty process), the WebSocket multiplexed stdio/lifecycle protocol, and the SPA's MDI console panels (xterm.js + dock + dismiss-without-kill gesture).

**Architecture:** A new `src/runtime/` module owns the supervisor, ring buffers, the Claude Code adapter (translates `board.yaml` + `permissions.yaml` into argv/env/settings), and a stream-json parser that maps harness output to lifecycle status transitions. The Fastify server gains runtime REST routes and extends its WebSocket hub to (a) multiplex `runtime-stdio` frames per `runtimeId`, and (b) accept `runtime-input` frames from clients. The web app adds an MDI host (Zustand-driven), an xterm.js panel that replays the ring buffer on (re)attach, a dock at the bottom of the viewport, runtime status badges on ticket cards, and "Open console" / "Terminate" actions on the ticket detail route.

**Tech Stack:** `node-pty` (pty), existing `ws` (transport), `xterm` + `xterm-addon-fit` (console UI). Stream-json parsing is hand-rolled (line-delimited JSON over stdout). Permissions settings are written to `<board>/.meeseeks/session-<runtimeId>.json` and cleaned up on exit.

---

## File structure

**Created in this plan:**
- `src/shared/runtime.ts` — `RuntimeStatus`, `RuntimeSummary`, `TicketRef`, runtime API request/response shapes
- Extension to `src/shared/events.ts` — `runtime-spawned`, `runtime-status`, `runtime-stdio` (server→client) + `runtime-input` (client→server)
- `src/runtime/types.ts` — internal-only runtime types (Runtime record, ring buffer interface, adapter interface)
- `src/runtime/ring-buffer.ts` — bounded byte ring with `append(buf)` / `snapshot(): Buffer`
- `src/runtime/stream-parser.ts` — line-delimited stream-json parser; emits `'turn-start' | 'turn-end' | 'parse-error'` events
- `src/runtime/claude-code.ts` — adapter: argv/env/settings file from `board.yaml` + `permissions.yaml` + ticket context
- `src/runtime/supervisor.ts` — `RuntimeSupervisor` class: spawn, terminate, list, get, write-input; emits lifecycle events; cleans up settings files
- `src/server/routes/runtimes.ts` — REST routes for `/api/runtimes` + `/api/tickets/.../runtime`
- `src/web/store/mdi.ts` — Zustand store: open consoles list (`{ runtimeId, ticketRef, minimized, z, x, y, w, h }`)
- `src/web/store/runtimes.ts` — Zustand store: runtime registry keyed by runtimeId (status, ticketRef, pid)
- `src/web/hooks/use-runtime-ws.ts` — subscribes to `runtime-*` events, updates `runtimes` store, fan-outs stdio to xterms
- `src/web/components/console/Panel.tsx` — single MDI panel: xterm + drag header + minimize/close/terminate buttons
- `src/web/components/console/Dock.tsx` — bottom dock listing live runtimes (status pill + click-to-restore/focus)
- `src/web/components/console/Mdi.tsx` — host that mounts panels from the mdi store
- `src/web/components/console/xterm-host.tsx` — imperatively wraps xterm.js and routes input/output frames
- `src/web/components/RuntimeStatusDot.tsx` — colored dot for a status
- `src/web/lib/b64.ts` — small base64 ↔ Uint8Array helpers
- `tests/runtime/ring-buffer.test.ts`, `stream-parser.test.ts`, `claude-code-adapter.test.ts`, `supervisor.test.ts`
- `tests/server/runtimes-routes.test.ts`
- `bin/stub-harness.mjs` — test fixture: a Node script that pretends to be Claude Code (reads stdin, writes scripted stream-json to stdout). Invoked by supervisor tests.

**Modified:**
- `package.json` — add `node-pty`, `xterm`, `xterm-addon-fit`. Add `@types/node-pty` is unnecessary (its types are bundled).
- `src/shared/events.ts` — add the four new event types
- `src/server/state.ts` — owns the `RuntimeSupervisor` instance, hands it out to routes, terminates all runtimes on `close()`
- `src/server/index.ts` — instantiate supervisor with hub; register runtime routes
- `src/server/ws.ts` — accept `runtime-input` frames from client and forward to supervisor; on connect, send a `runtime-spawned` for each live runtime
- `src/web/App.tsx` — mount `<Mdi />` and `<Dock />` next to routes; subscribe via `useRuntimeWs()`
- `src/web/components/AppShell.tsx` — leave room at the bottom for the dock
- `src/web/routes/TicketRoute.tsx` — add "Open console" / "Terminate" buttons + status indicator
- `src/web/components/TicketCard.tsx` — show `RuntimeStatusDot` when a runtime exists for the card's ticket
- `src/web/hooks/queries.ts` — add `useRuntimes`, `useSpawnRuntime`, `useTerminateRuntime`
- `src/web/lib/api.ts` — add runtime endpoints
- `wiki/meeseeks-wiki/index.md`, `log.md` — link the new pages
- `wiki/meeseeks-wiki/components/runtime.md` (new), `wiki/meeseeks-wiki/components/console.md` (new)

---

## Task 1: Shared runtime types and event extensions

**Files:**
- Create: `src/shared/runtime.ts`
- Modify: `src/shared/events.ts`

- [ ] **Step 1: Create `src/shared/runtime.ts`**

```ts
export type RuntimeStatus =
  | 'starting'
  | 'running'
  | 'idle'
  | 'terminating'
  | 'exited'
  | 'errored';

export interface TicketRef {
  boardId: string;
  laneName: string;
  filename: string;
}

export interface RuntimeSummary {
  runtimeId: string;
  ticketRef: TicketRef;
  pid: number | null;
  status: RuntimeStatus;
  startedAt: string;
  exitCode?: number;
  errorMessage?: string;
}

export interface ListRuntimesResponse { runtimes: RuntimeSummary[] }
export interface SpawnRuntimeResponse { runtime: RuntimeSummary }
```

- [ ] **Step 2: Extend `src/shared/events.ts`**

```ts
import type { ProjectMeta, BoardSummary } from './types.js';
import type { RuntimeStatus, RuntimeSummary, TicketRef } from './runtime.js';

export type ChangeKind = 'created' | 'updated' | 'deleted';

export type WsEvent =
  | { type: 'project-opened'; payload: { project: ProjectMeta; boards: BoardSummary[] } }
  | { type: 'project-closed'; payload: Record<string, never> }
  | { type: 'board-changed'; payload: { boardId: string; kind: ChangeKind } }
  | { type: 'lane-changed'; payload: { boardId: string; laneName: string; kind: ChangeKind } }
  | { type: 'ticket-changed'; payload: { boardId: string; laneName: string; filename: string; state: string; kind: ChangeKind } }
  | { type: 'runtime-spawned'; payload: RuntimeSummary }
  | { type: 'runtime-status'; payload: { runtimeId: string; status: RuntimeStatus; exitCode?: number; errorMessage?: string } }
  | { type: 'runtime-stdio'; payload: { runtimeId: string; data: string } }; // base64

export type ClientWsMessage =
  | { type: 'runtime-input'; payload: { runtimeId: string; data: string } } // base64
  | { type: 'runtime-resize'; payload: { runtimeId: string; cols: number; rows: number } };
```

- [ ] **Step 3: Run typecheck to confirm wiring**

Run: `npm run typecheck`
Expected: PASS (the symbols compile in isolation; no consumer imports yet).

- [ ] **Step 4: Commit**

```bash
git add src/shared/runtime.ts src/shared/events.ts
git commit -m "Add runtime shared types and WS event extensions"
```

---

## Task 2: Bounded ring buffer

**Files:**
- Create: `src/runtime/ring-buffer.ts`
- Test: `tests/runtime/ring-buffer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../../src/runtime/ring-buffer.js';

describe('RingBuffer', () => {
  it('appends and snapshots small writes', () => {
    const r = new RingBuffer(16);
    r.append(Buffer.from('hello'));
    r.append(Buffer.from(' world'));
    expect(r.snapshot().toString('utf8')).toBe('hello world');
    expect(r.size).toBe(11);
    expect(r.dropped).toBe(0);
  });

  it('drops oldest bytes when capacity exceeded', () => {
    const r = new RingBuffer(8);
    r.append(Buffer.from('123456789')); // 9 bytes into 8
    expect(r.snapshot().toString('utf8')).toBe('23456789');
    expect(r.dropped).toBe(1);
  });

  it('handles a single write larger than capacity', () => {
    const r = new RingBuffer(4);
    r.append(Buffer.from('abcdefgh'));
    expect(r.snapshot().toString('utf8')).toBe('efgh');
    expect(r.dropped).toBe(4);
  });

  it('marks dropped after multiple wrap-around writes', () => {
    const r = new RingBuffer(4);
    r.append(Buffer.from('abcd'));
    r.append(Buffer.from('ef'));
    expect(r.snapshot().toString('utf8')).toBe('cdef');
    expect(r.dropped).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx vitest run tests/runtime/ring-buffer.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the ring buffer**

```ts
// src/runtime/ring-buffer.ts
export class RingBuffer {
  private buf: Buffer;
  private start = 0;
  private len = 0;
  private droppedBytes = 0;

  constructor(public readonly capacity: number) {
    if (capacity <= 0) throw new Error('capacity must be positive');
    this.buf = Buffer.alloc(capacity);
  }

  get size(): number { return this.len; }
  get dropped(): number { return this.droppedBytes; }

  append(chunk: Buffer): void {
    if (chunk.length === 0) return;
    if (chunk.length >= this.capacity) {
      const tail = chunk.subarray(chunk.length - this.capacity);
      tail.copy(this.buf, 0, 0, this.capacity);
      this.droppedBytes += this.len + (chunk.length - this.capacity);
      this.start = 0;
      this.len = this.capacity;
      return;
    }
    const overflow = this.len + chunk.length - this.capacity;
    if (overflow > 0) {
      this.start = (this.start + overflow) % this.capacity;
      this.len -= overflow;
      this.droppedBytes += overflow;
    }
    const writeAt = (this.start + this.len) % this.capacity;
    const firstSpan = Math.min(chunk.length, this.capacity - writeAt);
    chunk.copy(this.buf, writeAt, 0, firstSpan);
    if (firstSpan < chunk.length) {
      chunk.copy(this.buf, 0, firstSpan, chunk.length);
    }
    this.len += chunk.length;
  }

  snapshot(): Buffer {
    if (this.len === 0) return Buffer.alloc(0);
    const out = Buffer.alloc(this.len);
    const firstSpan = Math.min(this.len, this.capacity - this.start);
    this.buf.copy(out, 0, this.start, this.start + firstSpan);
    if (firstSpan < this.len) {
      this.buf.copy(out, firstSpan, 0, this.len - firstSpan);
    }
    return out;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/runtime/ring-buffer.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/runtime/ring-buffer.ts tests/runtime/ring-buffer.test.ts
git commit -m "Add bounded ring buffer for runtime stdio"
```

---

## Task 3: Stream-json line parser

**Files:**
- Create: `src/runtime/stream-parser.ts`
- Test: `tests/runtime/stream-parser.test.ts`

The parser consumes Claude Code's `--output-format stream-json` over stdout. Stream-json is line-delimited JSON; each line has a `type` field. We care about a small subset of types that map to our `RuntimeStatus` transitions:

- `system` (init message at start, with `subtype: "init"`) → first event, supervisor moves `starting → idle`
- `assistant` / `user` content events → first one after `idle`/`init` flips to `running` (via the parser's `'turn-start'` event)
- `result` (final turn message, `subtype` ∈ `success | error | ...`) → emits `'turn-end'`, supervisor flips back to `idle`

The parser is tolerant: unknown types are ignored, malformed JSON lines emit a `'parse-error'` event but do not throw.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { StreamParser, type ParseEvent } from '../../src/runtime/stream-parser.js';

function collect(input: string): ParseEvent[] {
  const out: ParseEvent[] = [];
  const p = new StreamParser();
  p.on('event', (e: ParseEvent) => out.push(e));
  p.feed(Buffer.from(input));
  return out;
}

describe('StreamParser', () => {
  it('emits init then turn-start then turn-end', () => {
    const stream =
      `${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' })}\n` +
      `${JSON.stringify({ type: 'assistant', message: { content: [] } })}\n` +
      `${JSON.stringify({ type: 'result', subtype: 'success', session_id: 's1' })}\n`;
    const events = collect(stream);
    expect(events.map(e => e.kind)).toEqual(['init', 'turn-start', 'turn-end']);
  });

  it('handles partial chunks across writes', () => {
    const p = new StreamParser();
    const events: ParseEvent[] = [];
    p.on('event', (e) => events.push(e));
    p.feed(Buffer.from(`{"type":"system","subtype":"i`));
    p.feed(Buffer.from(`nit"}\n{"type":"result","subtype":"success"}\n`));
    expect(events.map(e => e.kind)).toEqual(['init', 'turn-end']);
  });

  it('emits parse-error for malformed JSON and continues', () => {
    const p = new StreamParser();
    const events: ParseEvent[] = [];
    p.on('event', (e) => events.push(e));
    p.feed(Buffer.from(`not-json\n{"type":"result","subtype":"success"}\n`));
    expect(events[0]?.kind).toBe('parse-error');
    expect(events[1]?.kind).toBe('turn-end');
  });

  it('emits one turn-start per turn (subsequent assistants are quiet)', () => {
    const stream =
      `${JSON.stringify({ type: 'system', subtype: 'init' })}\n` +
      `${JSON.stringify({ type: 'assistant' })}\n` +
      `${JSON.stringify({ type: 'assistant' })}\n` +
      `${JSON.stringify({ type: 'result', subtype: 'success' })}\n`;
    const events = collect(stream);
    expect(events.map(e => e.kind)).toEqual(['init', 'turn-start', 'turn-end']);
  });
});
```

- [ ] **Step 2: Run tests to confirm fail**

Run: `npx vitest run tests/runtime/stream-parser.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the parser**

```ts
// src/runtime/stream-parser.ts
import { EventEmitter } from 'node:events';

export type ParseEvent =
  | { kind: 'init'; raw: unknown }
  | { kind: 'turn-start'; raw: unknown }
  | { kind: 'turn-end'; raw: unknown }
  | { kind: 'parse-error'; line: string; error: string };

export class StreamParser extends EventEmitter {
  private leftover = '';
  private inTurn = false;

  feed(chunk: Buffer): void {
    const text = this.leftover + chunk.toString('utf8');
    const lines = text.split('\n');
    this.leftover = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        this.emit('event', { kind: 'parse-error', line: trimmed, error: String(err) } satisfies ParseEvent);
        continue;
      }
      const obj = parsed as { type?: string; subtype?: string };
      if (obj.type === 'system' && obj.subtype === 'init') {
        this.emit('event', { kind: 'init', raw: parsed } satisfies ParseEvent);
      } else if (obj.type === 'assistant' || obj.type === 'user') {
        if (!this.inTurn) {
          this.inTurn = true;
          this.emit('event', { kind: 'turn-start', raw: parsed } satisfies ParseEvent);
        }
      } else if (obj.type === 'result') {
        this.inTurn = false;
        this.emit('event', { kind: 'turn-end', raw: parsed } satisfies ParseEvent);
      }
      // unknown types are ignored
    }
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/runtime/stream-parser.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/runtime/stream-parser.ts tests/runtime/stream-parser.test.ts
git commit -m "Add stream-json line parser for runtime lifecycle"
```

---

## Task 4: Claude Code adapter (argv + env + settings)

**Files:**
- Create: `src/runtime/claude-code.ts`
- Create: `src/runtime/types.ts`
- Test: `tests/runtime/claude-code-adapter.test.ts`

The adapter is a pure function (`buildSpawnSpec`) plus a small writer for the per-runtime settings file. It does not spawn anything; it returns `{ argv, env, settingsFile, cwd }`. The supervisor handles the actual write + spawn so this stays unit-testable.

The "spike" referenced in the design (Section 7.5) lands here: we commit to **single pty process with `--output-format stream-json`** for lifecycle parsing while still rendering a usable console (Claude Code in stream-json mode emits human-readable assistant text inside its events; the user sees raw JSON in xterm). This is a pragmatic v1 — readable enough to drive the agent, with parseable lifecycle for free. A future task can swap in a TUI re-renderer.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { buildSpawnSpec } from '../../src/runtime/claude-code.js';

const ticketRef = { boardId: 'b', laneName: 'l', filename: '2026-04-26T1430-x.md' };

describe('buildSpawnSpec', () => {
  it('produces minimal argv when board.yaml and permissions.yaml are absent', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/tmp/p/boards/b/lanes/l/todo/2026-04-26T1430-x.md',
      processDocPath: null,
      ticketRef,
      board: null,
      permissions: null,
    });
    expect(spec.argv[0]).toBe('claude');
    expect(spec.argv).toContain('--output-format');
    expect(spec.argv).toContain('stream-json');
    expect(spec.argv).toContain('--input-format');
    expect(spec.argv).toContain('stream-json');
    expect(spec.argv.filter(a => a === '--add-dir')).toHaveLength(0);
    expect(spec.settingsFile).toBeNull();
    expect(spec.env.MEESEEKS_TICKET_PATH).toBe('/tmp/p/boards/b/lanes/l/todo/2026-04-26T1430-x.md');
    expect(spec.env.MEESEEKS_BOARD_PATH).toBe('/tmp/p/boards/b');
    expect(spec.env.MEESEEKS_LANE_PATH).toBe('/tmp/p/boards/b/lanes/l');
    expect(spec.cwd).toBe('/tmp/p/boards/b');
  });

  it('translates allowedPaths to repeated --add-dir flags resolved against lane', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/x.md',
      processDocPath: null,
      ticketRef,
      board: null,
      permissions: { allowedPaths: ['../my-repo', '~/notes'], allowedTools: [], deniedTools: [] },
    });
    const addDirs: string[] = [];
    for (let i = 0; i < spec.argv.length; i++) {
      if (spec.argv[i] === '--add-dir') addDirs.push(spec.argv[i + 1]!);
    }
    expect(addDirs).toContain(path.resolve('/tmp/p/boards/b/lanes/l', '../my-repo'));
    expect(addDirs).toContain(path.join(os.homedir(), 'notes'));
  });

  it('writes a settings file body containing allow/deny tool rules', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-7',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/x.md',
      processDocPath: null,
      ticketRef,
      board: null,
      permissions: { allowedPaths: [], allowedTools: ['Bash', 'Edit'], deniedTools: ['Write'] },
    });
    expect(spec.settingsFile).not.toBeNull();
    expect(spec.settingsFile!.path).toMatch(/\.meeseeks\/session-rt-7\.json$/);
    const body = JSON.parse(spec.settingsFile!.body) as { permissions: { allow: string[]; deny: string[] } };
    expect(body.permissions.allow).toEqual(['Bash', 'Edit']);
    expect(body.permissions.deny).toEqual(['Write']);
    // settings flag is referenced in argv
    expect(spec.argv).toContain('--settings');
    expect(spec.argv).toContain(spec.settingsFile!.path);
  });

  it('merges board.yaml runtime.args / env / model into argv + env', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/x.md',
      processDocPath: null,
      ticketRef,
      board: {
        runtime: {
          harness: 'claude-code',
          provider: 'anthropic',
          model: 'claude-opus-4-7',
          args: ['--debug'],
          env: { FOO: 'bar' },
        },
      },
      permissions: null,
    });
    expect(spec.argv).toContain('--model');
    expect(spec.argv).toContain('claude-opus-4-7');
    expect(spec.argv).toContain('--debug');
    expect(spec.env.FOO).toBe('bar');
  });

  it('includes preamble in returned object', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      boardPath: '/tmp/p/boards/my-board',
      lanePath: '/tmp/p/boards/my-board/lanes/dev',
      ticketAbsPath: '/tmp/p/boards/my-board/lanes/dev/todo/2026-04-26T1430-x.md',
      processDocPath: '/tmp/p/boards/my-board/lanes/dev/PROCESS.md',
      ticketRef: { boardId: 'my-board', laneName: 'dev', filename: '2026-04-26T1430-x.md' },
      board: null,
      permissions: null,
    });
    expect(spec.preamble).toContain('2026-04-26T1430-x.md');
    expect(spec.preamble).toContain('dev');
    expect(spec.preamble).toContain('my-board');
    expect(spec.preamble).toContain('/tmp/p/boards/my-board/lanes/dev/PROCESS.md');
  });
});
```

- [ ] **Step 2: Run tests to confirm fail**

Run: `npx vitest run tests/runtime/claude-code-adapter.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Create `src/runtime/types.ts`**

```ts
import type { RuntimeStatus, TicketRef, RuntimeSummary } from '../shared/runtime.js';

export interface BoardRuntimeConfig {
  runtime?: {
    harness?: string;
    provider?: string;
    model?: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

export interface PermissionsConfig {
  allowedPaths: string[];
  allowedTools: string[];
  deniedTools: string[];
}

export interface SpawnContext {
  runtimeId: string;
  boardPath: string;
  lanePath: string;
  ticketAbsPath: string;
  processDocPath: string | null;
  ticketRef: TicketRef;
  board: BoardRuntimeConfig | null;
  permissions: PermissionsConfig | null;
}

export interface SettingsFile {
  path: string;
  body: string;
}

export interface SpawnSpec {
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  preamble: string;
  settingsFile: SettingsFile | null;
}

export type { RuntimeStatus, TicketRef, RuntimeSummary };
```

- [ ] **Step 4: Implement `src/runtime/claude-code.ts`**

```ts
import path from 'node:path';
import os from 'node:os';
import type { SpawnContext, SpawnSpec } from './types.js';

const HARNESS_BIN = 'claude';

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveAllowedPath(p: string, lanePath: string): string {
  const expanded = expandHome(p);
  return path.isAbsolute(expanded) ? expanded : path.resolve(lanePath, expanded);
}

export function buildSpawnSpec(ctx: SpawnContext): SpawnSpec {
  const argv: string[] = [HARNESS_BIN];
  argv.push('--output-format', 'stream-json');
  argv.push('--input-format', 'stream-json');
  argv.push('--verbose'); // required by stream-json in non-print mode

  const model = ctx.board?.runtime?.model;
  if (model) argv.push('--model', model);

  for (const p of ctx.permissions?.allowedPaths ?? []) {
    argv.push('--add-dir', resolveAllowedPath(p, ctx.lanePath));
  }

  let settingsFile: SpawnSpec['settingsFile'] = null;
  const allowedTools = ctx.permissions?.allowedTools ?? [];
  const deniedTools = ctx.permissions?.deniedTools ?? [];
  if (allowedTools.length > 0 || deniedTools.length > 0) {
    const filePath = path.join(ctx.boardPath, '.meeseeks', `session-${ctx.runtimeId}.json`);
    const body = JSON.stringify(
      { permissions: { allow: allowedTools, deny: deniedTools } },
      null,
      2,
    );
    settingsFile = { path: filePath, body };
    argv.push('--settings', filePath);
  }

  for (const a of ctx.board?.runtime?.args ?? []) argv.push(a);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    MEESEEKS_TICKET_PATH: ctx.ticketAbsPath,
    MEESEEKS_BOARD_PATH: ctx.boardPath,
    MEESEEKS_LANE_PATH: ctx.lanePath,
    ...(ctx.board?.runtime?.env ?? {}),
  };
  if (ctx.board?.runtime?.provider) env.CLAUDE_CODE_PROVIDER = ctx.board.runtime.provider;

  const boardName = path.basename(ctx.boardPath);
  const processLine = ctx.processDocPath
    ? ` Lane process doc: \`${ctx.processDocPath}\`.`
    : '';
  const preamble =
    `You are working on ticket \`${ctx.ticketRef.filename}\` in lane \`${ctx.ticketRef.laneName}\` of board \`${boardName}\`. ` +
    `Ticket file: \`${ctx.ticketAbsPath}\`.${processLine}`;

  return { argv, env, cwd: ctx.boardPath, preamble, settingsFile };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/runtime/claude-code-adapter.test.ts`
Expected: PASS (5/5)

- [ ] **Step 6: Commit**

```bash
git add src/runtime/claude-code.ts src/runtime/types.ts tests/runtime/claude-code-adapter.test.ts
git commit -m "Add Claude Code adapter for spawn specs"
```

---

## Task 5: Stub harness fixture

**Files:**
- Create: `bin/stub-harness.mjs`

A small Node script that pretends to be Claude Code. It reads stream-json from stdin, writes scripted stream-json events to stdout, and exits cleanly on a `quit` instruction. Used by `supervisor.test.ts` instead of spawning real Claude Code.

- [ ] **Step 1: Create the fixture**

```js
#!/usr/bin/env node
// bin/stub-harness.mjs
// Pretend Claude Code: emits stream-json events on stdout, reads stream-json on stdin.
// Args: --scripted=<comma-list of event keywords> e.g. --scripted=init,assistant,result

import readline from 'node:readline';

const arg = process.argv.find(a => a.startsWith('--scripted='));
const events = arg ? arg.slice('--scripted='.length).split(',') : ['init', 'assistant', 'result'];

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

setImmediate(() => {
  for (const kind of events) {
    if (kind === 'init') emit({ type: 'system', subtype: 'init', session_id: 's1' });
    else if (kind === 'assistant') emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } });
    else if (kind === 'result') emit({ type: 'result', subtype: 'success', session_id: 's1' });
    else if (kind === 'crash') process.exit(1);
  }
});

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg && msg.type === 'user') {
    emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'reply' }] } });
    emit({ type: 'result', subtype: 'success' });
  }
  if (msg && msg.type === 'control' && msg.subtype === 'quit') {
    process.exit(0);
  }
});

process.on('SIGTERM', () => { process.exit(143); });
```

- [ ] **Step 2: Make executable**

Run: `chmod +x bin/stub-harness.mjs`

- [ ] **Step 3: Sanity-check it runs**

Run: `node bin/stub-harness.mjs --scripted=init,result < /dev/null | head -2`
Expected: two JSON lines on stdout, then process waits for stdin EOF and exits.

- [ ] **Step 4: Commit**

```bash
git add bin/stub-harness.mjs
git commit -m "Add stub harness fixture for runtime tests"
```

---

## Task 6: Runtime supervisor

**Files:**
- Create: `src/runtime/supervisor.ts`
- Test: `tests/runtime/supervisor.test.ts`

The supervisor owns the live runtime registry. Its public surface:

```ts
class RuntimeSupervisor extends EventEmitter {
  spawn(input: SpawnInput): Promise<RuntimeSummary>;
  list(): RuntimeSummary[];
  get(runtimeId: string): RuntimeSummary | null;
  snapshot(runtimeId: string): Buffer | null;
  writeInput(runtimeId: string, data: Buffer): boolean;
  resize(runtimeId: string, cols: number, rows: number): boolean;
  terminate(runtimeId: string): Promise<void>;
  terminateAll(): Promise<void>;
}
```

Events emitted: `'runtime-spawned'`, `'runtime-status'`, `'runtime-stdio'`. The server's `state.ts` wires these directly to the WS hub.

For testability, the supervisor accepts an injectable `spawnFn` whose default is `node-pty.spawn`. The test injects a custom spawnFn that runs `node bin/stub-harness.mjs ...`.

The implementation uses real node-pty in production. node-pty requires a native compile; we'll defer the install + sanity-check to Step 6.

- [ ] **Step 1: Write failing tests using injected spawnFn**

```ts
// tests/runtime/supervisor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn as childSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { RuntimeSupervisor } from '../../src/runtime/supervisor.js';
import type { PtyLike, SpawnFn } from '../../src/runtime/supervisor.js';

const STUB = path.resolve(process.cwd(), 'bin/stub-harness.mjs');

function childToPtyLike(child: ChildProcessWithoutNullStreams): PtyLike {
  const listeners = { data: new Set<(d: string) => void>(), exit: new Set<(e: { exitCode: number }) => void>() };
  child.stdout.on('data', (b: Buffer) => listeners.data.forEach(fn => fn(b.toString('utf8'))));
  child.stderr.on('data', (b: Buffer) => listeners.data.forEach(fn => fn(b.toString('utf8'))));
  child.on('exit', (code) => listeners.exit.forEach(fn => fn({ exitCode: code ?? 0 })));
  return {
    pid: child.pid ?? 0,
    write: (d: string) => child.stdin.write(d),
    resize: () => {},
    kill: (sig?: string) => { try { child.kill(sig as NodeJS.Signals | undefined); } catch {} },
    onData: (h) => { listeners.data.add(h); return { dispose: () => listeners.data.delete(h) }; },
    onExit: (h) => { listeners.exit.add(h); return { dispose: () => listeners.exit.delete(h) }; },
  };
}

const stubSpawn: SpawnFn = (file, args, opts) => {
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
      // override: stub harness ignores claude argv and uses its own --scripted
      adapterArgsOverride: ['--scripted=init,assistant,result'],
    });
    expect(summary.status).toBe('starting');
    await new Promise<void>((resolve) => {
      const tick = () => {
        const live = sup.get('rt-1');
        if (live?.status === 'idle' || live?.status === 'exited') resolve();
        else setTimeout(tick, 25);
      };
      tick();
    });
    const list = sup.list();
    expect(list[0]!.runtimeId).toBe('rt-1');
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
    await new Promise(r => setTimeout(r, 200));
    const snap = sup.snapshot('rt-2');
    expect(snap).not.toBeNull();
    expect(snap!.toString('utf8')).toContain('"type":"system"');
    await sup.terminateAll();
  });

  it('terminates with SIGTERM and surfaces exit', async () => {
    const sup = new RuntimeSupervisor({ spawnFn: stubSpawn, ringBytes: 8192 });
    const exits: Array<{ status: string; exitCode?: number }> = [];
    sup.on('runtime-status', (s) => exits.push(s));
    await sup.spawn({
      runtimeId: 'rt-3',
      boardPath: tmp, lanePath: tmp, ticketAbsPath: tmp,
      processDocPath: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
      board: null, permissions: null,
      adapterArgsOverride: ['--scripted=init'], // never emits result; will live until terminated
    });
    await new Promise(r => setTimeout(r, 100));
    await sup.terminate('rt-3');
    expect(exits.some(e => e.status === 'exited' || e.status === 'errored')).toBe(true);
  });

  it('writes settings file when permissions provided and removes it on exit', async () => {
    const sup = new RuntimeSupervisor({ spawnFn: stubSpawn, ringBytes: 8192 });
    await sup.spawn({
      runtimeId: 'rt-4',
      boardPath: tmp, lanePath: tmp, ticketAbsPath: tmp,
      processDocPath: null, ticketRef: { boardId: 'b', laneName: 'l', filename: 't.md' },
      board: null,
      permissions: { allowedPaths: [], allowedTools: ['Bash'], deniedTools: [] },
      adapterArgsOverride: ['--scripted=init,result'],
    });
    const settingsPath = path.join(tmp, '.meeseeks', 'session-rt-4.json');
    await fs.access(settingsPath); // exists during run
    await sup.terminateAll();
    // give cleanup a tick
    await new Promise(r => setTimeout(r, 100));
    await expect(fs.access(settingsPath)).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm fail**

Run: `npx vitest run tests/runtime/supervisor.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/runtime/supervisor.ts`**

```ts
import { EventEmitter } from 'node:events';
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
  adapterArgsOverride?: string[]; // for tests
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
  private runtimes = new Map<string, Runtime>();
  private spawnFn: SpawnFn;
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
      const summary: RuntimeSummary = {
        runtimeId: input.runtimeId,
        ticketRef: input.ticketRef,
        pid: null,
        status: 'errored',
        startedAt: new Date().toISOString(),
        errorMessage: err instanceof Error ? err.message : String(err),
      };
      this.emit('runtime-status', { runtimeId: input.runtimeId, status: 'errored', errorMessage: summary.errorMessage });
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

    // initial preamble as a stream-json user message
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
  // Lazy import so tests on machines without node-pty's native build still pass.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
```

- [ ] **Step 4: Add `node-pty` to package.json (optional install step)**

Run: `npm install node-pty`
Expected: postinstall compiles native module. If it fails, tests still pass via injected `spawnFn`. Production needs the native build. **If the install fails on this machine, skip and document in commit; the supervisor remains testable.**

- [ ] **Step 5: Run supervisor tests**

Run: `npx vitest run tests/runtime/supervisor.test.ts`
Expected: PASS (4/4)

- [ ] **Step 6: Run all tests to confirm no regressions**

Run: `npm test`
Expected: previous storage/server tests + new runtime tests all pass.

- [ ] **Step 7: Commit**

```bash
git add src/runtime/supervisor.ts tests/runtime/supervisor.test.ts package.json package-lock.json
git commit -m "Add runtime supervisor with pty + lifecycle parsing"
```

---

## Task 7: Wire supervisor into ServerState; runtime REST routes

**Files:**
- Modify: `src/server/state.ts`
- Modify: `src/server/index.ts`
- Create: `src/server/routes/runtimes.ts`
- Test: `tests/server/runtimes-routes.test.ts`

REST surface:

- `GET    /api/runtimes` → `{ runtimes: RuntimeSummary[] }`
- `GET    /api/runtimes/:id` → `{ runtime: RuntimeSummary }` (404 if missing)
- `DELETE /api/runtimes/:id` → `{}` (idempotent — 200 if missing)
- `POST   /api/tickets/:boardId/:laneName/:filename/runtime` → `{ runtime: RuntimeSummary }`

Project close calls `supervisor.terminateAll()` before the rest of close-state runs.

Server listens to supervisor's three events (`runtime-spawned`, `runtime-status`, `runtime-stdio`) and broadcasts them through the WS hub.

- [ ] **Step 1: Read current `src/server/state.ts`**

(Open the file; the test below assumes the supervisor is exposed as `state.supervisor`.)

- [ ] **Step 2: Modify `src/server/state.ts`**

Add a `supervisor` field constructed in the constructor and call `terminateAll()` from inside `close()` before invoking the prior cleanup callback. Forward all three supervisor events to the hub via a constructor-injected callback (or have `index.ts` wire them after construction; pick whichever matches the existing style).

```ts
// in state.ts, after existing fields:
import { RuntimeSupervisor } from '../runtime/supervisor.js';
export class ServerState {
  // ...existing
  readonly supervisor = new RuntimeSupervisor();
  async close(): Promise<void> {
    await this.supervisor.terminateAll();
    // ...existing cleanup
  }
}
```

- [ ] **Step 3: In `src/server/index.ts`, wire supervisor → hub broadcast**

```ts
state.supervisor.on('runtime-spawned', (s) => hub.broadcast({ type: 'runtime-spawned', payload: s }));
state.supervisor.on('runtime-status', (s) => hub.broadcast({ type: 'runtime-status', payload: s }));
state.supervisor.on('runtime-stdio', (s) => hub.broadcast({ type: 'runtime-stdio', payload: s }));
```

Place these after `new ServerState()` and before route registration.

- [ ] **Step 4: Create `src/server/routes/runtimes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { NotFoundError, InvalidInputError } from '../../storage/errors.js';
import { resolveBoardPath } from '../../storage/paths.js';
import { readLane } from '../../storage/lane.js';
import { readTicket } from '../../storage/ticket.js';
import type { ListRuntimesResponse, SpawnRuntimeResponse } from '../../shared/runtime.js';

interface Deps { state: ServerState; hub: WsHub }

async function readYaml<T>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, 'utf8');
    return yaml.load(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function registerRuntimeRoutes(app: FastifyInstance, { state }: Deps): Promise<void> {
  app.get('/api/runtimes', async () => {
    const runtimes = state.supervisor.list();
    return { runtimes } satisfies ListRuntimesResponse;
  });

  app.get<{ Params: { id: string } }>('/api/runtimes/:id', async (req) => {
    const r = state.supervisor.get(req.params.id);
    if (!r) throw new NotFoundError(`runtime ${req.params.id} not found`);
    return { runtime: r };
  });

  app.delete<{ Params: { id: string } }>('/api/runtimes/:id', async (req) => {
    await state.supervisor.terminate(req.params.id);
    return {};
  });

  app.post<{ Params: { boardId: string; laneName: string; filename: string } }>(
    '/api/tickets/:boardId/:laneName/:filename/runtime',
    async (req) => {
      const open = state.requireOpen();
      const { boardId, laneName, filename } = req.params;
      const boardPath = resolveBoardPath(open.meta, boardId);
      const lanePath = path.join(boardPath, 'lanes', laneName);
      const ticket = await readTicket(boardPath, laneName, filename);
      if (!ticket) throw new NotFoundError(`ticket ${filename} not found`);
      const lane = await readLane(boardPath, laneName);
      if (!lane) throw new InvalidInputError(`lane ${laneName} missing or invalid`);
      const board = await readYaml<unknown>(path.join(boardPath, 'board.yaml')) as
        | import('../../runtime/types.js').BoardRuntimeConfig | null;
      const permissions = await readYaml<unknown>(path.join(lanePath, 'permissions.yaml')) as
        | import('../../runtime/types.js').PermissionsConfig | null;
      const processDocPath = path.join(lanePath, 'PROCESS.md');
      const existing = state.supervisor.list().find(r =>
        r.ticketRef.boardId === boardId &&
        r.ticketRef.laneName === laneName &&
        r.ticketRef.filename === filename &&
        r.status !== 'exited' && r.status !== 'errored');
      if (existing) return { runtime: existing } satisfies SpawnRuntimeResponse;

      const runtimeId = randomUUID();
      const summary = await state.supervisor.spawn({
        runtimeId,
        boardPath, lanePath,
        ticketAbsPath: ticket.absPath,
        processDocPath,
        ticketRef: { boardId, laneName, filename },
        board, permissions,
      });
      return { runtime: summary } satisfies SpawnRuntimeResponse;
    },
  );
}
```

- [ ] **Step 5: Register the routes in `src/server/index.ts`**

```ts
import { registerRuntimeRoutes } from './routes/runtimes.js';
// ...after other registers:
await registerRuntimeRoutes(app, { state, hub });
```

- [ ] **Step 6: Write failing route tests**

```ts
// tests/server/runtimes-routes.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { buildTestApp } from './_helpers.js'; // existing helper
import { spawn as childSpawn } from 'node:child_process';
import type { PtyLike, SpawnFn } from '../../src/runtime/supervisor.js';

const STUB = path.resolve(process.cwd(), 'bin/stub-harness.mjs');
const stubSpawn: SpawnFn = (_f, args, opts) => {
  const child = childSpawn('node', [STUB, ...(args ?? []).filter(a => a.startsWith('--scripted='))], {
    cwd: opts?.cwd, env: opts?.env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const dataHs = new Set<(d: string) => void>();
  const exitHs = new Set<(e: { exitCode: number }) => void>();
  child.stdout.on('data', b => dataHs.forEach(f => f(b.toString())));
  child.on('exit', c => exitHs.forEach(f => f({ exitCode: c ?? 0 })));
  const pty: PtyLike = {
    pid: child.pid ?? 0,
    write: d => child.stdin.write(d),
    resize: () => {},
    kill: s => child.kill(s as NodeJS.Signals | undefined),
    onData: h => { dataHs.add(h); return { dispose: () => dataHs.delete(h) }; },
    onExit: h => { exitHs.add(h); return { dispose: () => exitHs.delete(h) }; },
  };
  return pty;
};

describe('runtime routes', () => {
  let projectPath: string;
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'meeseeks-rtroutes-'));
    app = await buildTestApp();
    // override the supervisor's spawnFn to use stub
    (app.state.supervisor as unknown as { spawnFn: SpawnFn }).spawnFn = stubSpawn;
    // create a project with a board, lane, ticket
    await app.inject({ method: 'POST', url: '/api/projects/create',
      payload: { path: projectPath, name: 'p' } });
    await app.inject({ method: 'POST', url: '/api/projects/open', payload: { path: projectPath } });
    await app.inject({ method: 'POST', url: '/api/boards', payload: { name: 'b' } });
    await app.inject({ method: 'POST', url: '/api/boards/b/lanes', payload: {
      name: 'l',
      states: [{ dir: 'todo', name: 'Todo' }, { dir: 'done', name: 'Done' }],
    } });
    await app.inject({ method: 'POST', url: '/api/boards/b/lanes/l/tickets',
      payload: { title: 'x', state: 'todo' } });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  it('spawns a runtime for a ticket and lists it', async () => {
    const tickets = (await app.inject({ method: 'GET', url: '/api/boards/b/lanes/l/tickets' })).json() as { tickets: Array<{ filename: string }> };
    const filename = tickets.tickets[0]!.filename;
    const res = await app.inject({ method: 'POST', url: `/api/tickets/b/l/${filename}/runtime` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { runtime: { runtimeId: string } };
    expect(body.runtime.runtimeId).toBeTruthy();
    const list = (await app.inject({ method: 'GET', url: '/api/runtimes' })).json() as { runtimes: Array<{ runtimeId: string }> };
    expect(list.runtimes.find(r => r.runtimeId === body.runtime.runtimeId)).toBeTruthy();
  });

  it('returns 404 for unknown runtime; DELETE is idempotent', async () => {
    const get = await app.inject({ method: 'GET', url: '/api/runtimes/bogus' });
    expect(get.statusCode).toBe(404);
    const del = await app.inject({ method: 'DELETE', url: '/api/runtimes/bogus' });
    expect(del.statusCode).toBe(200);
  });

  it('returns existing live runtime for the same ticket on second spawn', async () => {
    const tickets = (await app.inject({ method: 'GET', url: '/api/boards/b/lanes/l/tickets' })).json() as { tickets: Array<{ filename: string }> };
    const filename = tickets.tickets[0]!.filename;
    const a = (await app.inject({ method: 'POST', url: `/api/tickets/b/l/${filename}/runtime` })).json() as { runtime: { runtimeId: string } };
    const b = (await app.inject({ method: 'POST', url: `/api/tickets/b/l/${filename}/runtime` })).json() as { runtime: { runtimeId: string } };
    expect(b.runtime.runtimeId).toBe(a.runtime.runtimeId);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/server/runtimes-routes.test.ts`
Expected: PASS (3/3) after the implementation.

If `_helpers.ts` doesn't expose `state.supervisor`, expose it (small edit) before re-running.

- [ ] **Step 8: Run full suite**

Run: `npm test`
Expected: all suites green.

- [ ] **Step 9: Commit**

```bash
git add src/server/state.ts src/server/index.ts src/server/routes/runtimes.ts tests/server/runtimes-routes.test.ts
git commit -m "Add runtime REST routes + project-close terminates runtimes"
```

---

## Task 8: WebSocket — runtime input + reconnect hydration

**Files:**
- Modify: `src/server/ws.ts`

Two extensions:

1. **On connect**, after the existing project snapshot, send a `runtime-spawned` event for each currently-live runtime so reconnecting clients hydrate their MDI state.
2. **Receive client messages** (`runtime-input`, `runtime-resize`) and forward to the supervisor. Malformed frames are ignored silently (logged).

- [ ] **Step 1: Modify `src/server/ws.ts`**

```ts
// extend the handler:
const handler: WebsocketHandler = async (socket) => {
  hub.add(socket);
  const open = state.peek();
  if (open) {
    const boards = await listBoards(open.meta.path);
    hub.send(socket, { type: 'project-opened', payload: { project: open.meta, boards } });
    for (const r of state.supervisor.list()) {
      hub.send(socket, { type: 'runtime-spawned', payload: r });
    }
  } else {
    hub.send(socket, { type: 'project-closed', payload: {} });
  }

  socket.on('message', (raw: Buffer) => {
    let msg: { type?: string; payload?: { runtimeId?: string; data?: string; cols?: number; rows?: number } };
    try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const p = msg.payload;
    if (msg.type === 'runtime-input' && p?.runtimeId && typeof p.data === 'string') {
      const buf = Buffer.from(p.data, 'base64');
      state.supervisor.writeInput(p.runtimeId, buf);
    } else if (msg.type === 'runtime-resize' && p?.runtimeId && typeof p.cols === 'number' && typeof p.rows === 'number') {
      state.supervisor.resize(p.runtimeId, p.cols, p.rows);
    }
  });
};
```

- [ ] **Step 2: Run server tests**

Run: `npm test -- tests/server`
Expected: PASS (no regressions; existing WS tests still hold).

- [ ] **Step 3: Commit**

```bash
git add src/server/ws.ts
git commit -m "Forward runtime-input over WS and hydrate snapshots on connect"
```

---

## Task 9: Web — runtime API + queries + WS event handling

**Files:**
- Modify: `src/web/lib/api.ts`
- Create: `src/web/lib/b64.ts`
- Modify: `src/web/hooks/queries.ts`
- Create: `src/web/hooks/use-runtime-ws.ts`
- Create: `src/web/store/runtimes.ts`

- [ ] **Step 1: Create `src/web/lib/b64.ts`**

```ts
export function b64FromBytes(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}

export function bytesFromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
```

- [ ] **Step 2: Add runtime endpoints to `src/web/lib/api.ts`**

```ts
import type { ListRuntimesResponse, SpawnRuntimeResponse, RuntimeSummary } from '@shared/runtime.js';

export const api = {
  // ...existing methods
  listRuntimes: () =>
    fetchJson<ListRuntimesResponse>('/api/runtimes'),
  getRuntime: (id: string) =>
    fetchJson<{ runtime: RuntimeSummary }>(`/api/runtimes/${encodeURIComponent(id)}`),
  spawnRuntime: (boardId: string, laneName: string, filename: string) =>
    fetchJson<SpawnRuntimeResponse>(
      `/api/tickets/${encodeURIComponent(boardId)}/${encodeURIComponent(laneName)}/${encodeURIComponent(filename)}/runtime`,
      { method: 'POST' },
    ),
  terminateRuntime: (id: string) =>
    fetchJson<Record<string, never>>(`/api/runtimes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
```

- [ ] **Step 3: Create `src/web/store/runtimes.ts`**

```ts
import { create } from 'zustand';
import type { RuntimeSummary, RuntimeStatus } from '@shared/runtime.js';

interface RuntimesState {
  byId: Record<string, RuntimeSummary>;
  upsert: (s: RuntimeSummary) => void;
  setStatus: (id: string, status: RuntimeStatus, exitCode?: number, errorMessage?: string) => void;
  remove: (id: string) => void;
  reset: () => void;
}

export const useRuntimesStore = create<RuntimesState>((set) => ({
  byId: {},
  upsert: (s) => set((st) => ({ byId: { ...st.byId, [s.runtimeId]: s } })),
  setStatus: (id, status, exitCode, errorMessage) => set((st) => {
    const cur = st.byId[id];
    if (!cur) return st;
    return { byId: { ...st.byId, [id]: { ...cur, status, exitCode, errorMessage } } };
  }),
  remove: (id) => set((st) => {
    const next = { ...st.byId };
    delete next[id];
    return { byId: next };
  }),
  reset: () => set({ byId: {} }),
}));
```

- [ ] **Step 4: Create `src/web/hooks/use-runtime-ws.ts`**

The existing `useWsInvalidation()` already subscribes to all WS events. Extend its inner switch to also dispatch runtime events to:
- `useRuntimesStore` for status updates
- a module-level emitter that xterm hosts subscribe to for stdio frames

```ts
import { useEffect } from 'react';
import { wsClient } from './use-ws.js'; // export the singleton from use-ws
import { useRuntimesStore } from '../store/runtimes.js';
import { bytesFromB64 } from '../lib/b64.js';

type StdioHandler = (runtimeId: string, bytes: Uint8Array) => void;
const handlers = new Set<StdioHandler>();
export function onRuntimeStdio(h: StdioHandler): () => void {
  handlers.add(h);
  return () => { handlers.delete(h); };
}

export function useRuntimeWs(): void {
  useEffect(() => {
    const unsub = wsClient.subscribe((evt) => {
      if (evt.type === 'runtime-spawned') {
        useRuntimesStore.getState().upsert(evt.payload);
      } else if (evt.type === 'runtime-status') {
        useRuntimesStore.getState().setStatus(evt.payload.runtimeId, evt.payload.status, evt.payload.exitCode, evt.payload.errorMessage);
      } else if (evt.type === 'runtime-stdio') {
        const bytes = bytesFromB64(evt.payload.data);
        for (const h of handlers) h(evt.payload.runtimeId, bytes);
      } else if (evt.type === 'project-closed' || evt.type === 'project-opened') {
        useRuntimesStore.getState().reset();
      }
    });
    return unsub;
  }, []);
}

export function sendRuntimeInput(runtimeId: string, bytes: Uint8Array): void {
  wsClient.send({ type: 'runtime-input', payload: { runtimeId, data: btoa(String.fromCharCode(...bytes)) } });
}
export function sendRuntimeResize(runtimeId: string, cols: number, rows: number): void {
  wsClient.send({ type: 'runtime-resize', payload: { runtimeId, cols, rows } });
}
```

If `wsClient` is currently module-private in `use-ws.ts`, export it and add a `send(json)` method that JSON-stringifies and sends when open (no-op while reconnecting).

- [ ] **Step 5: Add React Query hooks in `src/web/hooks/queries.ts`**

```ts
export function useRuntimes() {
  return useQuery({
    queryKey: ['runtimes'],
    queryFn: api.listRuntimes,
  });
}

export function useSpawnRuntime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { boardId: string; laneName: string; filename: string }) =>
      api.spawnRuntime(vars.boardId, vars.laneName, vars.filename),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['runtimes'] }); },
  });
}

export function useTerminateRuntime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.terminateRuntime(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['runtimes'] }); },
  });
}
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/web/lib/api.ts src/web/lib/b64.ts src/web/hooks/queries.ts src/web/hooks/use-runtime-ws.ts src/web/hooks/use-ws.ts src/web/store/runtimes.ts
git commit -m "Add web runtime API/queries/WS handling"
```

---

## Task 10: Web — xterm.js host component

**Files:**
- Create: `src/web/components/console/xterm-host.tsx`

A minimal imperative wrapper. Renders an empty `<div>`; on mount, instantiates xterm + FitAddon, replays the ring buffer (fetched from `GET /api/runtimes/:id` is not enough — we need a separate ring snapshot endpoint, OR we lean on the live WS stream which already replays on connect via the supervisor's ring? **Decision:** add a small `GET /api/runtimes/:id/snapshot` endpoint returning `{ data: <base64> }` for the post-mount initial paint. Live frames thereafter come from the WS stdio handler. This avoids a race between mount and re-attach.

(See Task 10b for the snapshot endpoint.)

- [ ] **Step 1: Implement `xterm-host.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { onRuntimeStdio, sendRuntimeInput, sendRuntimeResize } from '../../hooks/use-runtime-ws.js';
import { api } from '../../lib/api.js';
import { bytesFromB64 } from '../../lib/b64.js';

export function XtermHost({ runtimeId }: { runtimeId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const term = new Terminal({ convertEol: true, fontFamily: 'ui-monospace, monospace', fontSize: 13 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(ref.current);
    fit.fit();
    sendRuntimeResize(runtimeId, term.cols, term.rows);

    const writeBytes = (bytes: Uint8Array) => term.write(bytes);
    const unsub = onRuntimeStdio((id, bytes) => {
      if (id === runtimeId) writeBytes(bytes);
    });

    void api.getRuntimeSnapshot(runtimeId).then((snap) => {
      if (snap?.data) writeBytes(bytesFromB64(snap.data));
    }).catch(() => { /* silent */ });

    const onKey = term.onData((data) => {
      const enc = new TextEncoder();
      sendRuntimeInput(runtimeId, enc.encode(data));
    });

    const onResize = () => { fit.fit(); sendRuntimeResize(runtimeId, term.cols, term.rows); };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      onKey.dispose();
      unsub();
      term.dispose();
    };
  }, [runtimeId]);
  return <div ref={ref} className="h-full w-full" />;
}
```

- [ ] **Step 2: Add deps**

Run: `npm install xterm xterm-addon-fit`

- [ ] **Step 3: Don't commit yet — Task 10b adds the snapshot endpoint**

---

## Task 10b: Snapshot endpoint

**Files:**
- Modify: `src/server/routes/runtimes.ts`
- Modify: `src/web/lib/api.ts`

- [ ] **Step 1: Add server route**

```ts
app.get<{ Params: { id: string } }>('/api/runtimes/:id/snapshot', async (req, reply) => {
  const buf = state.supervisor.snapshot(req.params.id);
  if (!buf) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'runtime not found' } });
  return { data: buf.toString('base64') };
});
```

- [ ] **Step 2: Add client method**

```ts
getRuntimeSnapshot: (id: string) =>
  fetchJson<{ data: string }>(`/api/runtimes/${encodeURIComponent(id)}/snapshot`),
```

- [ ] **Step 3: Commit Task 10 + 10b together**

```bash
git add src/web/components/console/xterm-host.tsx src/server/routes/runtimes.ts src/web/lib/api.ts package.json package-lock.json
git commit -m "Add xterm console host and runtime snapshot endpoint"
```

---

## Task 11: Web — MDI store, panel, dock

**Files:**
- Create: `src/web/store/mdi.ts`
- Create: `src/web/components/console/Panel.tsx`
- Create: `src/web/components/console/Dock.tsx`
- Create: `src/web/components/console/Mdi.tsx`
- Create: `src/web/components/RuntimeStatusDot.tsx`

- [ ] **Step 1: Create `src/web/store/mdi.ts`**

```ts
import { create } from 'zustand';

export interface PanelState {
  runtimeId: string;
  minimized: boolean;
  z: number;
  x: number; y: number; w: number; h: number;
}

interface MdiState {
  panels: Record<string, PanelState>;
  open: (runtimeId: string) => void;
  close: (runtimeId: string) => void;
  setMinimized: (runtimeId: string, minimized: boolean) => void;
  focus: (runtimeId: string) => void;
  move: (runtimeId: string, x: number, y: number) => void;
  resize: (runtimeId: string, w: number, h: number) => void;
}

let zCounter = 1;

export const useMdiStore = create<MdiState>((set, get) => ({
  panels: {},
  open: (runtimeId) => set((st) => {
    if (st.panels[runtimeId]) return { panels: { ...st.panels, [runtimeId]: { ...st.panels[runtimeId]!, minimized: false, z: ++zCounter } } };
    const idx = Object.keys(st.panels).length;
    return {
      panels: {
        ...st.panels,
        [runtimeId]: {
          runtimeId, minimized: false, z: ++zCounter,
          x: 80 + 30 * idx, y: 80 + 30 * idx, w: 720, h: 420,
        },
      },
    };
  }),
  close: (runtimeId) => set((st) => {
    const p = { ...st.panels }; delete p[runtimeId]; return { panels: p };
  }),
  setMinimized: (runtimeId, minimized) => set((st) => {
    if (!st.panels[runtimeId]) return st;
    return { panels: { ...st.panels, [runtimeId]: { ...st.panels[runtimeId]!, minimized } } };
  }),
  focus: (runtimeId) => set((st) => {
    if (!st.panels[runtimeId]) return st;
    return { panels: { ...st.panels, [runtimeId]: { ...st.panels[runtimeId]!, minimized: false, z: ++zCounter } } };
  }),
  move: (runtimeId, x, y) => set((st) => {
    if (!st.panels[runtimeId]) return st;
    return { panels: { ...st.panels, [runtimeId]: { ...st.panels[runtimeId]!, x, y } } };
  }),
  resize: (runtimeId, w, h) => set((st) => {
    if (!st.panels[runtimeId]) return st;
    return { panels: { ...st.panels, [runtimeId]: { ...st.panels[runtimeId]!, w, h } } };
  }),
}));
```

- [ ] **Step 2: Create `src/web/components/RuntimeStatusDot.tsx`**

```tsx
import type { RuntimeStatus } from '@shared/runtime.js';

const COLORS: Record<RuntimeStatus, string> = {
  starting: 'bg-yellow-500',
  running: 'bg-green-500 animate-pulse',
  idle: 'bg-blue-500',
  terminating: 'bg-orange-500',
  exited: 'bg-gray-500',
  errored: 'bg-red-600',
};

export function RuntimeStatusDot({ status, className = '' }: { status: RuntimeStatus; className?: string }) {
  return (
    <span
      title={status}
      className={`inline-block h-2 w-2 rounded-full ${COLORS[status]} ${className}`}
    />
  );
}
```

- [ ] **Step 3: Create `src/web/components/console/Panel.tsx`**

```tsx
import { useRef } from 'react';
import { useMdiStore } from '../../store/mdi.js';
import { useRuntimesStore } from '../../store/runtimes.js';
import { useTerminateRuntime } from '../../hooks/queries.js';
import { XtermHost } from './xterm-host.js';
import { RuntimeStatusDot } from '../RuntimeStatusDot.js';

export function Panel({ runtimeId }: { runtimeId: string }) {
  const panel = useMdiStore((s) => s.panels[runtimeId]);
  const runtime = useRuntimesStore((s) => s.byId[runtimeId]);
  const { close, setMinimized, focus, move } = useMdiStore.getState();
  const term = useTerminateRuntime();
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  if (!panel || panel.minimized || !runtime) return null;

  const onMouseDown = (e: React.MouseEvent) => {
    focus(runtimeId);
    dragRef.current = { dx: e.clientX - panel.x, dy: e.clientY - panel.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      move(runtimeId, ev.clientX - dragRef.current.dx, ev.clientY - dragRef.current.dy);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onTerminate = async () => {
    if (!confirm('Terminate this runtime?')) return;
    await term.mutateAsync(runtimeId);
  };

  return (
    <div
      className="fixed flex flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
      style={{ left: panel.x, top: panel.y, width: panel.w, height: panel.h, zIndex: panel.z }}
      onMouseDown={() => focus(runtimeId)}
    >
      <div
        className="flex select-none items-center justify-between bg-slate-800 px-3 py-1 text-sm rounded-t-lg cursor-move"
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-2">
          <RuntimeStatusDot status={runtime.status} />
          <span className="font-mono">{runtime.ticketRef.filename}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs text-slate-300 hover:text-white" onClick={() => setMinimized(runtimeId, true)}>—</button>
          <button className="text-xs text-red-400 hover:text-red-300" onClick={onTerminate}>×</button>
          <button className="text-xs text-slate-300 hover:text-white" onClick={() => close(runtimeId)}>close</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 bg-black p-2">
        <XtermHost runtimeId={runtimeId} />
      </div>
    </div>
  );
}
```

The "close" button is the dismiss-without-kill gesture per spec; the "×" is the explicit terminate (with confirmation). Resize is intentionally omitted from this slice — width/height stay at default. Add resize in a future task.

- [ ] **Step 4: Create `src/web/components/console/Dock.tsx`**

```tsx
import { useRuntimesStore } from '../../store/runtimes.js';
import { useMdiStore } from '../../store/mdi.js';
import { RuntimeStatusDot } from '../RuntimeStatusDot.js';

export function Dock() {
  const runtimes = useRuntimesStore((s) => s.byId);
  const panels = useMdiStore((s) => s.panels);
  const { open, focus } = useMdiStore.getState();
  const ids = Object.keys(runtimes);
  if (ids.length === 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-2 overflow-x-auto bg-slate-900 px-3 py-1 text-xs border-t border-slate-700">
      {ids.map((id) => {
        const r = runtimes[id]!;
        const inPanel = panels[id];
        return (
          <button
            key={id}
            className="flex items-center gap-2 rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
            onClick={() => { if (inPanel && !inPanel.minimized) focus(id); else open(id); }}
          >
            <RuntimeStatusDot status={r.status} />
            <span className="font-mono">{r.ticketRef.filename}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/web/components/console/Mdi.tsx`**

```tsx
import { useMdiStore } from '../../store/mdi.js';
import { Panel } from './Panel.js';

export function Mdi() {
  const panels = useMdiStore((s) => s.panels);
  return (
    <>
      {Object.keys(panels).map((id) => (<Panel key={id} runtimeId={id} />))}
    </>
  );
}
```

- [ ] **Step 6: Mount in `App.tsx`**

```tsx
import { Mdi } from './components/console/Mdi.js';
import { Dock } from './components/console/Dock.js';
import { useRuntimeWs } from './hooks/use-runtime-ws.js';

export default function App() {
  useWsInvalidation();
  useRuntimeWs();
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<PickerRoute />} />
          <Route path="/boards" element={<BoardsRoute />} />
          <Route path="/boards/:boardId" element={<BoardRoute />} />
          <Route path="/boards/:boardId/lanes/:laneName/tickets/:filename" element={<TicketRoute />} />
        </Route>
      </Routes>
      <Mdi />
      <Dock />
    </ErrorBoundary>
  );
}
```

- [ ] **Step 7: Typecheck + dev sanity**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/web/store/mdi.ts src/web/components/console/Panel.tsx src/web/components/console/Dock.tsx src/web/components/console/Mdi.tsx src/web/components/RuntimeStatusDot.tsx src/web/App.tsx
git commit -m "Add MDI console panels and runtime dock"
```

---

## Task 12: Web — ticket card / ticket detail integration

**Files:**
- Modify: `src/web/components/TicketCard.tsx`
- Modify: `src/web/routes/TicketRoute.tsx`

- [ ] **Step 1: TicketCard shows status dot when a runtime is bound**

```tsx
// import:
import { useRuntimesStore } from '../store/runtimes.js';
import { RuntimeStatusDot } from './RuntimeStatusDot.js';

// inside the component, after current props:
const runtime = useRuntimesStore((s) =>
  Object.values(s.byId).find(r =>
    r.ticketRef.boardId === boardId &&
    r.ticketRef.laneName === laneName &&
    r.ticketRef.filename === ticket.filename));

// in the JSX, render `runtime && <RuntimeStatusDot status={runtime.status} />` next to the title.
```

(Adjust prop names to match the existing card; the card already receives `boardId`, `laneName` indirectly via `useParams` or props — pull whatever's there.)

- [ ] **Step 2: TicketRoute adds Open/Terminate**

In `TicketRoute.tsx`, after the existing buttons, add:

```tsx
import { useSpawnRuntime, useTerminateRuntime } from '../hooks/queries.js';
import { useRuntimesStore } from '../store/runtimes.js';
import { useMdiStore } from '../store/mdi.js';
import { RuntimeStatusDot } from '../components/RuntimeStatusDot.js';

const spawn = useSpawnRuntime();
const term = useTerminateRuntime();
const open = useMdiStore((s) => s.open);
const runtime = useRuntimesStore((s) =>
  Object.values(s.byId).find(r =>
    r.ticketRef.boardId === boardId && r.ticketRef.laneName === laneName && r.ticketRef.filename === filename));

// JSX:
{runtime ? (
  <div className="flex items-center gap-2">
    <RuntimeStatusDot status={runtime.status} />
    <span className="text-sm">{runtime.status}</span>
    <button className="rounded bg-slate-700 px-3 py-1 text-sm" onClick={() => open(runtime.runtimeId)}>Open console</button>
    {(runtime.status === 'running' || runtime.status === 'idle' || runtime.status === 'starting') && (
      <button className="rounded bg-red-700 px-3 py-1 text-sm"
        onClick={async () => { if (confirm('Terminate runtime?')) await term.mutateAsync(runtime.runtimeId); }}>
        Terminate
      </button>
    )}
  </div>
) : (
  <button
    className="rounded bg-emerald-700 px-3 py-1 text-sm"
    onClick={async () => {
      const r = await spawn.mutateAsync({ boardId, laneName, filename });
      open(r.runtime.runtimeId);
    }}
  >
    Spawn runtime
  </button>
)}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web/components/TicketCard.tsx src/web/routes/TicketRoute.tsx
git commit -m "Wire spawn/terminate/console-open into ticket UI"
```

---

## Task 13: End-to-end smoke test (manual) and wiki updates

**Files:**
- Modify: `wiki/meeseeks-wiki/index.md`, `log.md`
- Create: `wiki/meeseeks-wiki/components/runtime.md`
- Create: `wiki/meeseeks-wiki/components/console.md`

- [ ] **Step 1: Build and run dev**

Run (in two terminals or via `npm run dev`):
- `npm run dev`
- In a browser: open `http://localhost:5173/`. Open a project. Pick a board → lane. Open a ticket. Click "Spawn runtime."

**If `node-pty` is built and `claude` is installed in PATH:** you should see the panel open and stream-json events render in xterm. Status badge transitions: `starting → idle` (after init), `running` after first turn-start, back to `idle` after turn-end.

**If `claude` isn't installed locally:** spawn will likely transition to `errored` quickly. That's expected; verify the error path renders cleanly.

Document whichever you tested in the wiki page (Step 4).

- [ ] **Step 2: Backend-only smoke test against stub harness**

If real Claude Code isn't available, run a backend smoke test by injecting the stub spawnFn at the top of `src/server/index.ts` behind a `MEESEEKS_STUB_HARNESS=1` env flag (skip if you have the real binary). Optional but useful for hands-on validation. **If you skip this, note it in the commit message.**

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all suites green.

- [ ] **Step 4: Write `wiki/meeseeks-wiki/components/runtime.md`**

```markdown
# Runtime Supervisor

The runtime supervisor in `src/runtime/` spawns and watches per-ticket Claude Code processes. A single `RuntimeSupervisor` instance lives on `ServerState`; the supervisor owns each runtime's pty, ring buffer, and stream-json parser, and emits three events that the [server WS hub](../components/server.md) broadcasts to clients: `runtime-spawned`, `runtime-status`, `runtime-stdio`.

## Lifecycle

States transition `starting → idle → running ↔ idle → (terminating →) exited | errored`. The first `system/init` line from Claude's stream-json output flips `starting → idle`; subsequent `assistant` or `user` events mark `running`, and `result` events mark `idle`. Unexpected exit transitions to `errored` unless a prior explicit terminate set `terminating` first.

## Adapter

`src/runtime/claude-code.ts` is the only place that knows Claude Code's flag schema. It compiles `permissions.yaml` into `--add-dir <path>` repeated flags plus a generated `<board>/.meeseeks/session-<runtimeId>.json` referenced via `--settings`. The settings file is removed when the runtime exits. Allowed paths resolve relative to the lane directory; `~` expands. `board.yaml`'s `runtime.model`, `runtime.args`, `runtime.env` are merged into argv/env. The adapter also renders the initial-prompt preamble (env-var ticket context plus a user-visible message) which the supervisor sends as the first stream-json `user` frame.

## Spawn override

The supervisor accepts an injectable `spawnFn` for tests. Production uses the lazy default (`require('node-pty').spawn`); tests substitute a child_process-backed wrapper that runs `bin/stub-harness.mjs`. This keeps the supervisor unit-testable on machines that haven't built node-pty.

## Termination

`terminate(id)` sends SIGTERM, waits 5 seconds, then SIGKILL. `terminateAll()` is invoked from `ServerState.close()`, so closing a project (or switching projects) reaps every active runtime.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/plans/2026-04-26-runtime-and-console.md` |
| 2026-04-26 | `src/runtime/` |
```

- [ ] **Step 5: Write `wiki/meeseeks-wiki/components/console.md`**

```markdown
# Console (MDI panels)

Detachable xterm.js panels rendered on top of the SPA. Each panel is bound to a `runtimeId`; the [runtime supervisor](runtime.md) emits stdio frames that the panel writes to its terminal. Closing a panel is the dismiss-without-kill gesture: the runtime keeps running and reopening replays history from the supervisor's ring buffer (via `GET /api/runtimes/:id/snapshot`).

## State

`store/mdi.ts` (Zustand) holds open panels keyed by runtime — position, size, z-order, minimized flag. `store/runtimes.ts` is the runtime registry; it's hydrated from `runtime-spawned` events on WS reconnect. The [`Dock`](../../../src/web/components/console/Dock.tsx) at the bottom of the viewport always reflects the runtime registry — even runtimes whose panel is closed appear as dock entries, click to reopen.

## Stdio path

`hooks/use-runtime-ws.ts` subscribes to the WS singleton, decodes base64 `runtime-stdio` frames into `Uint8Array`, and fans them out to whichever `XtermHost` is currently mounted. Keystrokes flow back via `runtime-input` frames; `xterm-addon-fit` triggers `runtime-resize` on viewport changes.

## Scope

This slice has no resize handle on the panels (only drag); only one panel per runtime; no persistence across page reload. Listed as future work.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | `docs/superpowers/plans/2026-04-26-runtime-and-console.md` |
| 2026-04-26 | `src/web/components/console/` |
```

- [ ] **Step 6: Update index.md**

Add under Components:

```
- [Runtime Supervisor](components/runtime.md) — per-ticket Claude Code process supervisor with ring buffer + stream-json parser
- [Console (MDI panels)](components/console.md) — xterm.js panels with dismiss-without-kill gesture
```

- [ ] **Step 7: Append log entry**

```
[2026-04-26] update | Runtime + Console — added components/runtime.md and components/console.md after implementing supervisor + xterm panels per plan 3
```

- [ ] **Step 8: Commit wiki updates**

```bash
git add wiki/meeseeks-wiki/components/runtime.md wiki/meeseeks-wiki/components/console.md wiki/meeseeks-wiki/index.md wiki/meeseeks-wiki/log.md
git commit -m "Wiki: document runtime supervisor and console"
```

---

## Done criteria

- All 64+ existing tests pass; new runtime tests pass; new server runtime route tests pass.
- `npm run dev` opens to a project picker; a ticket can be selected, a runtime spawned, and (with `claude` in PATH) the panel shows the agent's stream-json output. Without `claude`, spawning surfaces an `errored` runtime with a visible status badge.
- Closing a panel keeps the runtime alive (visible in dock); reopening replays output.
- Closing the project terminates all runtimes.
- Wiki has runtime + console pages linked from the index.
