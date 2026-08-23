import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import {
  listProjects, getProject, createProject, updateProject, deleteProject,
  readClonableProjectConfig,
  type CreateProjectInput, type PatchProjectInput,
} from '../../storage/project.js';
import { detectProjectDefaults } from '../../storage/detect.js';
import { InvalidInputError } from '../../storage/errors.js';
import type { DetectProjectRequest } from '../../shared/api.js';

export async function registerProjectRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.get('/api/projects', async () => {
    const open = state.require();
    return { projects: await listProjects(open.meta.path) };
  });

  app.post<{ Body: CreateProjectInput & { copyFrom?: string } }>('/api/projects', async (req) => {
    const open = state.require();
    const body = req.body ?? {} as Partial<CreateProjectInput & { copyFrom?: string }>;
    if (!body.name) throw new InvalidInputError('name required');
    if (!body.root) throw new InvalidInputError('root required');
    // Copied values fill only the fields the request left empty, so an explicit
    // choice in the form always beats the source project's.
    const copied = body.copyFrom
      ? await readClonableProjectConfig(open.meta.path, body.copyFrom)
      : {};
    const project = await createProject(open.meta.path, {
      ...(body as CreateProjectInput),
      permissions: body.permissions ?? copied.permissions,
      color: body.color ?? copied.color,
    });
    hub.broadcast({ type: 'project-changed', payload: { projectId: project.projectId, kind: 'created' } });
    return { project };
  });

  /**
   * Detection is its own endpoint rather than a side effect of create: it runs
   * *before* the project exists, while the user is still typing the path, and
   * it must be re-runnable against an existing project without mutating it.
   * The route is a POST because the root travels in the body, not because it
   * changes anything — nothing is written here.
   *
   * Registered ahead of /api/projects/:projectId so `detect` is not captured
   * as a project id.
   */
  app.post<{ Body: DetectProjectRequest }>('/api/projects/detect', async (req) => {
    state.require();
    const root = req.body?.root;
    if (!root) throw new InvalidInputError('root required');
    return { detections: await detectProjectDefaults(root) };
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
