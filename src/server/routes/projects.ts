import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import type { AppConfig } from '../app-config.js';
import { readProject, createProject, listBoards } from '../../storage/project.js';
import { startWatcher } from '../watcher.js';

interface Deps { state: ServerState; hub: WsHub; appConfig: AppConfig }

export async function registerProjectRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { state, hub, appConfig } = deps;

  app.get('/api/projects/recent', async () => {
    return { recents: await appConfig.listRecents() };
  });

  app.post<{ Body: { path: string } }>('/api/projects/open', async (req) => {
    const body = req.body ?? {} as { path?: string };
    const targetPath = body.path;
    if (typeof targetPath !== 'string' || !targetPath) {
      const e = new Error('path required'); (e as any).statusCode = 400; throw e;
    }
    if (state.isOpen()) await state.close();
    const meta = await readProject(targetPath);
    const handle = startWatcher(meta, hub);
    state.open(meta, handle.cleanup);
    const boards = await listBoards(meta.path);
    await appConfig.recordRecent(meta.path, meta.config.name);
    hub.broadcast({ type: 'project-opened', payload: { project: meta, boards } });
    return { project: meta, boards };
  });

  app.post('/api/projects/close', async () => {
    await state.close();
    hub.broadcast({ type: 'project-closed', payload: {} });
    return { ok: true };
  });

  app.post<{ Body: { path: string; name: string } }>('/api/projects/create', async (req) => {
    const body = req.body ?? {} as { path?: string; name?: string };
    if (!body.path || !body.name) {
      const e = new Error('path and name required'); (e as any).statusCode = 400; throw e;
    }
    const meta = await createProject(body.path, body.name);
    return { project: meta };
  });

  app.get('/api/projects/current', async (_req, reply) => {
    const open = state.peek();
    if (!open) {
      reply.code(404).send({ error: { code: 'PROJECT_NOT_OPEN', message: 'no project open' } });
      return;
    }
    const boards = await listBoards(open.meta.path);
    return { project: open.meta, boards };
  });
}
