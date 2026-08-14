import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../../storage/errors.js';
import {
  listPrompts, readPrompt, writePrompt, deletePrompt, promptExists,
  appendRunLog, listRunLogs,
} from '../../storage/prompts.js';
import { getProject } from '../../storage/project.js';
import { resolveWorkflowPath, resolveWorkflowRuntime } from '../../storage/workflow.js';
import { readWorkspace } from '../../storage/workspace.js';
import { resolvePermissions, type PermissionSource } from '../../runtime/permissions.js';
import type { PermissionsConfig, SpawnProject } from '../../runtime/types.js';

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

export async function registerPromptRoutes(app: FastifyInstance, { state }: Deps): Promise<void> {
  app.get('/api/prompts', async () => {
    const open = state.require();
    return { prompts: await listPrompts(open.meta.path) };
  });

  app.get<{ Params: { name: string } }>('/api/prompts/:name', async (req) => {
    const open = state.require();
    return { prompt: await readPrompt(open.meta.path, req.params.name) };
  });

  app.put<{ Params: { name: string }; Body: { body: string } }>(
    '/api/prompts/:name',
    async (req) => {
      if (typeof req.body?.body !== 'string') {
        throw new InvalidInputError('body must be a string');
      }
      const open = state.require();
      await writePrompt(open.meta.path, req.params.name, req.body.body);
      return { prompt: { name: req.params.name, body: req.body.body } };
    },
  );

  app.delete<{ Params: { name: string } }>('/api/prompts/:name', async (req) => {
    const open = state.require();
    await deletePrompt(open.meta.path, req.params.name);
    return { ok: true };
  });

  app.post<{
    Params: { name: string };
    Body: { model?: string; projectId?: string; workflowName?: string };
  }>('/api/prompts/:name/run', async (req) => {
      const { name } = req.params;
      const open = state.require();
      const wsRoot = open.meta.path;
      if (!(await promptExists(wsRoot, name))) {
        throw new NotFoundError(`prompt not found: ${name}`);
      }
      const { body } = await readPrompt(wsRoot, name);

      const existing = state.supervisor.list().find(r =>
        r.kind === 'prompt' &&
        r.promptRef?.name === name &&
        r.status !== 'exited' && r.status !== 'errored');
      if (existing) {
        throw new ConflictError(`prompt already running: ${name}`);
      }

      // A prompt without a project is allowed — a workspace-level prompt like
      // "lint the wiki" is legitimate — but a named one must exist.
      let project: SpawnProject | null = null;
      const sources: PermissionSource[] = [];
      const projectId = req.body?.projectId;
      if (projectId) {
        const detail = await getProject(wsRoot, projectId).catch(() => null);
        if (!detail) throw new InvalidInputError(`unknown project '${projectId}'`);
        project = {
          projectId: detail.projectId,
          name: detail.name,
          root: detail.root,
          contextContent: detail.contextContent,
        };
        sources.push({ origin: 'project', base: detail.root, config: detail.permissions });
      }

      // The workflow is optional here, unlike on a ticket. Picking one opts the
      // run into that workflow's permissions and runtime; picking none leaves
      // the run with only the project's, plus the workspace default runtime.
      const workflowName = req.body?.workflowName;
      let runtime = (await readWorkspace(wsRoot)).config.runtime ?? null;
      if (workflowName) {
        const wfPath = await resolveWorkflowPath(wsRoot, workflowName).catch(() => null);
        if (!wfPath) throw new InvalidInputError(`unknown workflow '${workflowName}'`);
        const wfPermissions = await readYaml<PermissionsConfig>(path.join(wfPath, 'permissions.yaml'));
        sources.push({ origin: 'workflow', base: wfPath, config: wfPermissions });
        runtime = (await resolveWorkflowRuntime(wsRoot, workflowName)).runtime;
      }

      const runtimeId = randomUUID();
      const summary = await state.supervisor.spawnPrompt({
        runtimeId,
        workspaceRoot: wsRoot,
        promptRef: { name },
        promptBody: body,
        runtime,
        permissions: resolvePermissions(sources),
        project,
        model: req.body?.model,
      });

      const accum: string[] = [];
      const onMessage = (e: { runtimeId: string; text: string }) => {
        if (e.runtimeId === runtimeId) accum.push(e.text);
      };
      const onStatus = (e: { runtimeId: string; status: string; errorMessage?: string }) => {
        if (e.runtimeId !== runtimeId) return;
        if (e.status !== 'exited' && e.status !== 'errored') return;
        state.supervisor.off('runtime-message', onMessage);
        state.supervisor.off('runtime-status', onStatus);
        void appendRunLog(wsRoot, name, {
          runtimeId,
          startedAt: summary.startedAt,
          exitedAt: new Date().toISOString(),
          status: e.status as 'exited' | 'errored',
          errorMessage: e.errorMessage,
          output: accum.join('\n\n'),
        });
      };
      state.supervisor.on('runtime-message', onMessage);
      state.supervisor.on('runtime-status', onStatus);

      return { runtime: summary };
    },
  );

  app.get<{ Params: { name: string } }>('/api/prompts/:name/logs', async (req) => {
    const open = state.require();
    return { logs: await listRunLogs(open.meta.path, req.params.name) };
  });
}
