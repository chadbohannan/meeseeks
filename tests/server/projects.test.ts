import { describe, it, expect, afterEach } from 'vitest';
import { bootTestServer } from '../helpers/server.js';
import { makeBareProject } from '../helpers/tmp-project.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe('project routes', () => {
  it('GET /api/projects/current returns the open project', async () => {
    const tp = await makeBareProject('Hello');
    cleanups.push(tp.cleanup);
    const srv = await bootTestServer(tp.root);
    cleanups.push(srv.cleanup);

    const res = await fetch(`${srv.url}/api/projects/current`);
    expect(res.status).toBe(200);
    const body = await res.json() as { project: { config: { name: string } } };
    expect(body.project.config.name).toBe('Hello');
  });
});
