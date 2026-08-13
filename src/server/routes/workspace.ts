import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { listBoards, getModels } from '../../storage/workspace.js';

interface Deps { state: ServerState; hub: WsHub }

export async function registerWorkspaceRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { state } = deps;

  app.get('/api/workspace', async () => {
    const open = state.require();
    const boards = await listBoards(open.meta.path);
    return { workspace: open.meta, boards };
  });

  app.get('/api/models', async () => {
    const open = state.require();
    return { models: await getModels(open.meta.path) };
  });
}
