// tests/server/ws.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

function waitForEvent(ws: WebSocket, predicate: (e: any) => boolean, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for ws event')), timeoutMs);
    const onMsg = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString());
      if (predicate(event)) {
        clearTimeout(t);
        ws.off('message', onMsg);
        resolve(event);
      }
    };
    ws.on('message', onMsg);
  });
}

describe('websocket events', () => {
  it('emits ticket-changed when a file is added on disk', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const srv = await bootTestServer(tp.root);
    cleanups.push(srv.cleanup);
    const board = await (await fetch(`${srv.url}/api/boards`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'B' }),
    })).json() as { board: { boardId: string } };
    await fetch(`${srv.url}/api/boards/${board.board.boardId}/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: [{ dir: 'todo', name: 'Todo' }] }),
    });

    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    cleanups.push(async () => ws.close());
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const todoDir = path.join(tp.root, 'boards', 'b', 'workflows', 'work', 'todo');
    await mkdir(todoDir, { recursive: true });
    await writeFile(path.join(todoDir, '2026-04-26T1430-test.md'), '---\ntitle: T\ncreated: 2026-04-26T14:30:00Z\nupdated: 2026-04-26T14:30:00Z\n---\nbody', 'utf8');

    const event = await waitForEvent(ws, e => e.type === 'ticket-changed' && e.payload.filename === '2026-04-26T1430-test.md');
    expect(event.payload.boardId).toBe('b');
    expect(event.payload.workflowName).toBe('work');
  });

  it('emits project-changed for projects/*.yaml, not a bogus board-changed', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const srv = await bootTestServer(tp.root);
    cleanups.push(srv.cleanup);

    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    cleanups.push(async () => ws.close());
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const seen: any[] = [];
    ws.on('message', (d: WebSocket.RawData) => seen.push(JSON.parse(d.toString())));

    // Let chokidar's initial scan finish. With ignoreInitial, anything created
    // while that scan is still running is treated as pre-existing and skipped.
    await new Promise(r => setTimeout(r, 1500));

    // The generic `<dir>/<file>` fallthrough in the watcher would read this as
    // a board named 'projects' if the projects branch did not intercept first.
    const projectsDir = path.join(tp.root, 'projects');
    await mkdir(projectsDir, { recursive: true });
    await writeFile(path.join(projectsDir, 'meeseeks.yaml'), `name: Meeseeks\nroot: ${tp.root}\n`, 'utf8');

    // The watcher polls at 2s intervals, so allow several cycles.
    const event = await waitForEvent(ws, e => e.type === 'project-changed', 8000);
    expect(event.payload.projectId).toBe('meeseeks');
    expect(seen.some(e => e.type === 'board-changed' && e.payload.boardId === 'projects')).toBe(false);
  }, 20000);  // settle delay + poll wait can exceed the 10s default
});
