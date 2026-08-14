import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { getBoard } from '../../storage/workspace.js';
import { createWorkflow, readWorkflowDetail, renameWorkflow, updateWorkflowStates, deleteWorkflowFolder, writeProcessDoc } from '../../storage/workflow.js';
import { InvalidInputError } from '../../storage/errors.js';

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.post<{
    Params: { boardId: string };
    Body: { name: string; states: Array<{ dir: string; name: string }> };
  }>('/api/boards/:boardId/workflows', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const body = req.body ?? {} as { name?: string; states?: Array<{ dir: string; name: string }> };
    if (!body.name || !Array.isArray(body.states)) throw new InvalidInputError('name and states required');
    const slug = await createWorkflow(board.path, body.name, body.states);
    hub.broadcast({ type: 'workflow-changed', payload: { boardId: board.boardId, workflowName: slug, kind: 'created' } });
    return { workflow: await readWorkflowDetail(board.path, slug) };
  });

  app.get<{ Params: { boardId: string; workflowName: string } }>(
    '/api/boards/:boardId/workflows/:workflowName',
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      return { workflow: await readWorkflowDetail(board.path, req.params.workflowName) };
    },
  );

  app.patch<{
    Params: { boardId: string; workflowName: string };
    Body: { name?: string; states?: Array<{ dir: string; name: string }>; force?: boolean; processDoc?: string };
  }>('/api/boards/:boardId/workflows/:workflowName', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    let currentName = req.params.workflowName;
    if (req.body?.states) {
      await updateWorkflowStates(board.path, currentName, req.body.states, { force: req.body.force });
    }
    if (req.body?.processDoc !== undefined) {
      await writeProcessDoc(board.path, currentName, req.body.processDoc);
    }
    if (req.body?.name) {
      currentName = await renameWorkflow(board.path, currentName, req.body.name);
    }
    hub.broadcast({ type: 'workflow-changed', payload: { boardId: board.boardId, workflowName: currentName, kind: 'updated' } });
    return { workflow: await readWorkflowDetail(board.path, currentName) };
  });

  app.delete<{
    Params: { boardId: string; workflowName: string };
    Body: { deleteFiles?: boolean };
  }>('/api/boards/:boardId/workflows/:workflowName', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    if (req.body?.deleteFiles) {
      await deleteWorkflowFolder(board.path, req.params.workflowName);
    }
    hub.broadcast({ type: 'workflow-changed', payload: { boardId: board.boardId, workflowName: req.params.workflowName, kind: 'deleted' } });
    return { ok: true };
  });
}
