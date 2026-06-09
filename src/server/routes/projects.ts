import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { listBoards, getModels } from '../../storage/project.js';

interface Deps { state: ServerState; hub: WsHub }

export async function registerProjectRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { state } = deps;

  app.get('/api/projects/current', async () => {
    const open = state.require();
    const boards = await listBoards(open.meta.path);
    return { project: open.meta, boards };
  });

  app.get('/api/models', async () => {
    const open = state.require();
    return { models: await getModels(open.meta.path) };
  });
}
