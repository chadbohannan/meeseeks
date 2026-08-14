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
    await fetch(`${srv.url}/api/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: [{ dir: 'todo', name: 'Todo' }] }),
    });

    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    cleanups.push(async () => ws.close());
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const todoDir = path.join(tp.root, 'workflows', 'work', 'todo');
    await mkdir(todoDir, { recursive: true });
    await writeFile(path.join(todoDir, '2026-04-26T1430-test.md'), '---\ntitle: T\ncreated: 2026-04-26T14:30:00Z\nupdated: 2026-04-26T14:30:00Z\n---\nbody', 'utf8');

    const event = await waitForEvent(ws, e => e.type === 'ticket-changed' && e.payload.filename === '2026-04-26T1430-test.md');
    expect(event.payload.workflowName).toBe('work');
  });

  // Without an explicit workflows/ prefix check the classifier would fall
  // through and read any <dir>/<file> as a workflow, which is the shape of bug
  // that previously mistook projects/ for a container.
  it('ignores files outside the known top-level directories', async () => {
    const tp = await makeBareProject();
    cleanups.push(tp.cleanup);
    const srv = await bootTestServer(tp.root);
    cleanups.push(srv.cleanup);
    await fetch(`${srv.url}/api/workflows`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'work', states: [{ dir: 'todo', name: 'Todo' }] }),
    });

    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    cleanups.push(async () => ws.close());
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const seen: any[] = [];
    ws.on('message', (d) => seen.push(JSON.parse(d.toString())));

    const strayDir = path.join(tp.root, 'notes', 'sub');
    await mkdir(strayDir, { recursive: true });
    await writeFile(path.join(strayDir, 'scratch.md'), 'hi', 'utf8');

    // A real workflow write follows, so the wait ends on a positive signal
    // rather than on a timeout that would pass even if nothing worked.
    const todoDir = path.join(tp.root, 'workflows', 'work', 'todo');
    await mkdir(todoDir, { recursive: true });
    await writeFile(path.join(todoDir, '2026-04-26T1430-sentinel.md'), '---\ntitle: S\n---\nb', 'utf8');
    await waitForEvent(ws, e => e.type === 'ticket-changed' && e.payload.filename === '2026-04-26T1430-sentinel.md');

    expect(seen.some(e => e.type === 'workflow-changed' && e.payload.workflowName === 'notes')).toBe(false);
    expect(seen.some(e => e.payload?.workflowName === 'sub')).toBe(false);
  });

  it('emits project-changed for projects/*.yaml and nothing else', async () => {
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
    // a workflow if the projects branch did not intercept first.
    const projectsDir = path.join(tp.root, 'projects');
    await mkdir(projectsDir, { recursive: true });
    await writeFile(path.join(projectsDir, 'meeseeks.yaml'), `name: Meeseeks\nroot: ${tp.root}\n`, 'utf8');

    // The watcher polls at 2s intervals, so allow several cycles.
    const event = await waitForEvent(ws, e => e.type === 'project-changed', 8000);
    expect(event.payload.projectId).toBe('meeseeks');
    expect(seen.some(e => e.type === 'workflow-changed')).toBe(false);
  }, 20000);  // settle delay + poll wait can exceed the 10s default
});
