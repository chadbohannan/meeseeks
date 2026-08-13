import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import {
  listProjects, getProject, createProject, updateProject, deleteProject,
  type CreateProjectInput, type PatchProjectInput,
} from '../../storage/project.js';
import { InvalidInputError } from '../../storage/errors.js';

export async function registerProjectRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.get('/api/projects', async () => {
    const open = state.require();
    return { projects: await listProjects(open.meta.path) };
  });

  app.post<{ Body: CreateProjectInput }>('/api/projects', async (req) => {
    const open = state.require();
    const body = req.body ?? {} as Partial<CreateProjectInput>;
    if (!body.name) throw new InvalidInputError('name required');
    if (!body.root) throw new InvalidInputError('root required');
    const project = await createProject(open.meta.path, body as CreateProjectInput);
    hub.broadcast({ type: 'project-changed', payload: { projectId: project.projectId, kind: 'created' } });
    return { project };
  });

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId', async (req) => {
    const open = state.require();
    return { project: await getProject(open.meta.path, req.params.projectId) };
  });

  app.patch<{ Params: { projectId: string }; Body: PatchProjectInput }>(
    '/api/projects/:projectId',
    async (req) => {
      const open = state.require();
      const project = await updateProject(open.meta.path, req.params.projectId, req.body ?? {});
      hub.broadcast({ type: 'project-changed', payload: { projectId: project.projectId, kind: 'updated' } });
      return { project };
    },
  );

  app.delete<{ Params: { projectId: string } }>('/api/projects/:projectId', async (req) => {
    const open = state.require();
    await deleteProject(open.meta.path, req.params.projectId);
    hub.broadcast({ type: 'project-changed', payload: { projectId: req.params.projectId, kind: 'deleted' } });
    return { ok: true };
  });
}
