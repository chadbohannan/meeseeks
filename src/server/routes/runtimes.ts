import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { NotFoundError, InvalidInputError } from '../../storage/errors.js';
import { resolveWorkflowPath, resolveWorkflowRuntime } from '../../storage/workflow.js';
import { findTicketFile, readTicket } from '../../storage/ticket.js';
import { getProject } from '../../storage/project.js';
import { resolvePermissions, type PermissionSource } from '../../runtime/permissions.js';
import type { PermissionsConfig, SpawnProject } from '../../runtime/types.js';
import type { ResolvedPermissions } from '../../shared/types.js';

interface Deps { state: ServerState; hub: WsHub }

async function readYaml<T>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, 'utf8');
    return yaml.load(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

interface TicketRuntimeContext {
  project: SpawnProject | null;
  permissions: ResolvedPermissions | null;
}

/**
 * Resolve the project a ticket names and union its permissions with the workflow's.
 *
 * `requireProject` is what enforces the "optional to assign, required to run"
 * rule: the preview endpoint tolerates an unassigned ticket so the UI can show
 * what a workflow alone would contribute, while a spawn refuses it — there is no
 * project root to point the agent at.
 */
async function ticketRuntimeContext(
  workspaceRoot: string,
  workflowPath: string,
  projectId: string | undefined,
  requireProject: boolean,
): Promise<TicketRuntimeContext> {
  const workflowPermissions = await readYaml<PermissionsConfig>(path.join(workflowPath, 'permissions.yaml'));

  if (!projectId) {
    if (requireProject) {
      throw new InvalidInputError('ticket has no project assigned; assign one before starting a runtime');
    }
    return {
      project: null,
      permissions: resolvePermissions([{ origin: 'workflow', base: workflowPath, config: workflowPermissions }]),
    };
  }

  const detail = await getProject(workspaceRoot, projectId).catch(() => null);
  if (!detail) {
    if (requireProject) {
      throw new InvalidInputError(`ticket names unknown project '${projectId}'`);
    }
    return {
      project: null,
      permissions: resolvePermissions([{ origin: 'workflow', base: workflowPath, config: workflowPermissions }]),
    };
  }

  const sources: PermissionSource[] = [
    { origin: 'project', base: detail.root, config: detail.permissions },
    { origin: 'workflow', base: workflowPath, config: workflowPermissions },
  ];
  return {
    project: {
      projectId: detail.projectId,
      name: detail.name,
      root: detail.root,
      contextContent: detail.contextContent,
    },
    permissions: resolvePermissions(sources),
  };
}

export async function registerRuntimeRoutes(app: FastifyInstance, { state }: Deps): Promise<void> {
  app.get('/api/runtimes', async () => {
    return { runtimes: state.supervisor.list() };
  });

  app.get<{ Params: { id: string } }>('/api/runtimes/:id', async (req) => {
    const r = state.supervisor.get(req.params.id);
    if (!r) throw new NotFoundError(`runtime ${req.params.id} not found`);
    return { runtime: r };
  });

  app.get<{ Params: { id: string } }>('/api/runtimes/:id/snapshot', async (req, reply) => {
    const buf = state.supervisor.snapshot(req.params.id);
    if (!buf) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'runtime not found' } });
      return;
    }
    return { data: buf.toString('base64') };
  });

  app.delete<{ Params: { id: string } }>('/api/runtimes/:id', async (req) => {
    await state.supervisor.terminate(req.params.id);
    return {};
  });

  app.post<{ Params: { workflowName: string; filename: string }; Body: { model?: string } }>(
    '/api/tickets/:workflowName/:filename/runtime',
    async (req) => {
      const open = state.require();
      const { workflowName, filename } = req.params;
      const wsRoot = open.meta.path;
      const workflowPath = await resolveWorkflowPath(wsRoot, workflowName);
      const found = await findTicketFile(workflowPath, filename);
      if (!found) throw new NotFoundError(`ticket ${filename} not found`);
      const ticket = await readTicket(wsRoot, workflowName, filename);
      const { project, permissions } = await ticketRuntimeContext(
        wsRoot, workflowPath, ticket.project, true,
      );

      const { runtime } = await resolveWorkflowRuntime(wsRoot, workflowName);
      const processDocPath = path.join(workflowPath, 'PROCESS.md');
      const processDocContent = await readFile(processDocPath, 'utf8').catch(() => null);

      const existing = state.supervisor.list().find(r =>
        r.kind === 'ticket' &&
        r.ticketRef?.workflowName === workflowName &&
        r.ticketRef?.filename === filename &&
        r.status !== 'exited' && r.status !== 'errored');
      if (existing) return { runtime: existing };

      const runtimeId = randomUUID();
      const summary = await state.supervisor.spawn({
        runtimeId,
        workspaceRoot: wsRoot,
        workflowPath,
        ticketAbsPath: found.abs,
        processDocContent,
        ticketRef: { workflowName, filename },
        runtime,
        permissions,
        project,
        model: req.body?.model,
      });
      return { runtime: summary };
    },
  );

  // Preview: what a spawn *would* use. Deliberately calls the same
  // ticketRuntimeContext the spawn path calls — a preview computed by a
  // parallel implementation would eventually disagree with reality.
  app.get<{ Params: { workflowName: string; filename: string } }>(
    '/api/tickets/:workflowName/:filename/permissions',
    async (req) => {
      const open = state.require();
      const { workflowName, filename } = req.params;
      const wsRoot = open.meta.path;
      const workflowPath = await resolveWorkflowPath(wsRoot, workflowName);
      const ticket = await readTicket(wsRoot, workflowName, filename);
      const { project, permissions } = await ticketRuntimeContext(
        wsRoot, workflowPath, ticket.project, false,
      );
      return {
        projectId: ticket.project ?? null,
        projectResolved: project !== null,
        permissions,
      };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { state?: string } }>(
    '/internal/runtime/:id/notify',
    async (req, reply) => {
      const notifyStatus = req.query.state;
      if (notifyStatus !== 'idle' && notifyStatus !== 'awaiting-user') {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'state must be idle or awaiting-user' } });
      }
      console.error(`[meeseeks] notify ${req.params.id} → ${notifyStatus}`);
      const found = state.supervisor.notifyState(req.params.id, notifyStatus);
      if (!found) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'runtime not found' } });
      }
      return {};
    },
  );

}
