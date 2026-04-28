import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { getBoard } from '../../storage/project.js';
import { createLane, readLaneDetail, renameLane, updateLaneStates, deleteLaneFolder } from '../../storage/lane.js';
import { InvalidInputError } from '../../storage/errors.js';

export async function registerLaneRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.post<{
    Params: { boardId: string };
    Body: { name: string; states: Array<{ dir: string; name: string }> };
  }>('/api/boards/:boardId/lanes', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const body = req.body ?? {} as { name?: string; states?: Array<{ dir: string; name: string }> };
    if (!body.name || !Array.isArray(body.states)) throw new InvalidInputError('name and states required');
    const slug = await createLane(board.path, body.name, body.states);
    hub.broadcast({ type: 'lane-changed', payload: { boardId: board.boardId, laneName: slug, kind: 'created' } });
    return { lane: await readLaneDetail(board.path, slug) };
  });

  app.get<{ Params: { boardId: string; laneName: string } }>(
    '/api/boards/:boardId/lanes/:laneName',
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      return { lane: await readLaneDetail(board.path, req.params.laneName) };
    },
  );

  app.patch<{
    Params: { boardId: string; laneName: string };
    Body: { name?: string; states?: Array<{ dir: string; name: string }>; force?: boolean };
  }>('/api/boards/:boardId/lanes/:laneName', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    let currentName = req.params.laneName;
    if (req.body?.states) {
      await updateLaneStates(board.path, currentName, req.body.states, { force: req.body.force });
    }
    if (req.body?.name) {
      currentName = await renameLane(board.path, currentName, req.body.name);
    }
    hub.broadcast({ type: 'lane-changed', payload: { boardId: board.boardId, laneName: currentName, kind: 'updated' } });
    return { lane: await readLaneDetail(board.path, currentName) };
  });

  app.delete<{
    Params: { boardId: string; laneName: string };
    Body: { deleteFiles?: boolean };
  }>('/api/boards/:boardId/lanes/:laneName', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    if (req.body?.deleteFiles) {
      await deleteLaneFolder(board.path, req.params.laneName);
    }
    hub.broadcast({ type: 'lane-changed', payload: { boardId: board.boardId, laneName: req.params.laneName, kind: 'deleted' } });
    return { ok: true };
  });
}
