import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { getModels, readWorkspace } from '../../storage/workspace.js';
import { listWorkflows } from '../../storage/workflow.js';

interface Deps { state: ServerState; hub: WsHub }

export async function registerWorkspaceRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { state } = deps;

  app.get('/api/workspace', async () => {
    const open = state.require();
    // Re-read rather than returning the cached boot-time snapshot: workflows
    // and projects registered since startup would otherwise be missing here.
    const workspace = await readWorkspace(open.meta.path);
    const workflows = await listWorkflows(open.meta.path);
    return { workspace, workflows };
  });

  app.get('/api/models', async () => {
    const open = state.require();
    return { models: await getModels(open.meta.path) };
  });
}
