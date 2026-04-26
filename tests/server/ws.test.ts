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
  it('sends project-opened on connect when a project is open', async () => {
    const srv = await bootTestServer();
    cleanups.push(srv.cleanup);
    const tp = await makeBareProject('Hi');
    cleanups.push(tp.cleanup);
    await fetch(`${srv.url}/api/projects/open`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: tp.root }),
    });
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    cleanups.push(async () => ws.close());
    const event = await waitForEvent(ws, e => e.type === 'project-opened');
    expect(event.payload.project.config.name).toBe('Hi');
  });

  it('emits ticket-changed when a file is added on disk', async () => {
    const srv = await bootTestServer();
    cleanups.push(srv.cleanup);
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    await fetch(`${srv.url}/api/projects/open`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: tp.root }),
    });
    const board = await (await fetch(`${srv.url}/api/boards`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'B' }),
    })).json() as { board: { boardId: string } };
    await fetch(`${srv.url}/api/boards/${board.board.boardId}/lanes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: [{ dir: 'todo', name: 'Todo' }] }),
    });

    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    cleanups.push(async () => ws.close());
    await waitForEvent(ws, e => e.type === 'project-opened');

    const todoDir = path.join(tp.root, 'boards', 'b', 'lanes', 'work', 'todo');
    await mkdir(todoDir, { recursive: true });
    await writeFile(path.join(todoDir, '2026-04-26T1430-test.md'), '---\ntitle: T\ncreated: 2026-04-26T14:30:00Z\nupdated: 2026-04-26T14:30:00Z\n---\nbody', 'utf8');

    const event = await waitForEvent(ws, e => e.type === 'ticket-changed' && e.payload.filename === '2026-04-26T1430-test.md');
    expect(event.payload.boardId).toBe('b');
    expect(event.payload.laneName).toBe('work');
  });
});
