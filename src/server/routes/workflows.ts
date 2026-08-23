import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import {
  createWorkflow, listWorkflows, readWorkflowDetail, renameWorkflow, updateWorkflowStates,
  deleteWorkflowFolder, deregisterWorkflow, writeProcessDoc, writeWorkflowRuntime,
  readClonableWorkflowConfig,
} from '../../storage/workflow.js';
import { InvalidInputError } from '../../storage/errors.js';
import type { RuntimeConfig, WorkflowState } from '../../shared/types.js';

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.get('/api/workflows', async () => {
    const open = state.require();
    return { workflows: await listWorkflows(open.meta.path) };
  });

  app.post<{
    Body: { name: string; states: WorkflowState[]; runtime?: RuntimeConfig; copyFrom?: string };
  }>('/api/workflows', async (req) => {
    const open = state.require();
    const body = req.body ?? {} as { name?: string; states?: WorkflowState[] };
    if (!body.name || !Array.isArray(body.states)) {
      throw new InvalidInputError('name and states required');
    }
    // Cloning resolves here rather than on the client: the source's own runtime
    // block and permissions are readable from the server, so the SPA never has
    // to hold a permission set it has no other reason to fetch, and an
    // inherited runtime cannot be copied in as if it were declared.
    const copied = body.copyFrom
      ? await readClonableWorkflowConfig(open.meta.path, body.copyFrom)
      : {};
    const slug = await createWorkflow(open.meta.path, body.name, body.states, {
      runtime: req.body?.runtime ?? copied.runtime,
      ...(copied.permissions ? { permissions: copied.permissions } : {}),
    });
    hub.broadcast({ type: 'workflow-changed', payload: { workflowName: slug, kind: 'created' } });
    return { workflow: await readWorkflowDetail(open.meta.path, slug) };
  });

  app.get<{ Params: { workflowName: string } }>(
    '/api/workflows/:workflowName',
    async (req) => {
      const open = state.require();
      return { workflow: await readWorkflowDetail(open.meta.path, req.params.workflowName) };
    },
  );

  app.patch<{
    Params: { workflowName: string };
    Body: {
      name?: string; states?: WorkflowState[]; force?: boolean;
      processDoc?: string; runtime?: RuntimeConfig | null;
    };
  }>('/api/workflows/:workflowName', async (req) => {
    const open = state.require();
    let currentName = req.params.workflowName;
    if (req.body?.states) {
      await updateWorkflowStates(open.meta.path, currentName, req.body.states, {
        force: req.body.force,
      });
    }
    if (req.body?.processDoc !== undefined) {
      await writeProcessDoc(open.meta.path, currentName, req.body.processDoc);
    }
    // `runtime: null` clears the workflow's own block so it falls back to the
    // workspace default; omitting the key leaves whatever is there.
    if (req.body?.runtime !== undefined) {
      await writeWorkflowRuntime(open.meta.path, currentName, req.body.runtime);
    }
    // Renaming last: it can move the directory, and the writes above address
    // the workflow by its pre-rename id.
    if (req.body?.name) {
      currentName = await renameWorkflow(open.meta.path, currentName, req.body.name);
    }
    hub.broadcast({
      type: 'workflow-changed',
      payload: { workflowName: currentName, kind: 'updated' },
    });
    return { workflow: await readWorkflowDetail(open.meta.path, currentName) };
  });

  app.delete<{
    Params: { workflowName: string };
    Body: { deleteFiles?: boolean };
  }>('/api/workflows/:workflowName', async (req) => {
    const open = state.require();
    if (req.body?.deleteFiles) {
      await deleteWorkflowFolder(open.meta.path, req.params.workflowName);
    } else {
      await deregisterWorkflow(open.meta.path, req.params.workflowName);
    }
    hub.broadcast({
      type: 'workflow-changed',
      payload: { workflowName: req.params.workflowName, kind: 'deleted' },
    });
    return { ok: true };
  });
}
