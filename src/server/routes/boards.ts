import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { listBoards, addBoardToProject, removeBoardFromProject, getBoard, readProject } from '../../storage/project.js';
import { createBoard, readBoardDetail, renameBoard, deleteBoardFolder, updateBoardName, writeBoardClaudeContent } from '../../storage/board.js';
import { InvalidInputError } from '../../storage/errors.js';
import { slugifyBoardPath } from '../../storage/paths.js';

export async function registerBoardRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.get('/api/boards', async () => {
    const open = state.require();
    return { boards: await listBoards(open.meta.path) };
  });

  app.post<{ Body: { name: string; path?: string } }>('/api/boards', async (req) => {
    const open = state.require();
    const body = req.body ?? {} as { name?: string; path?: string };
    if (!body.name) throw new InvalidInputError('name required');
    const entry = body.path ?? `boards/${slugifyBoardPath(body.name)}`;
    const abs = path.isAbsolute(entry) ? entry : path.resolve(open.meta.path, entry);
    await createBoard(abs, body.name);
    await addBoardToProject(open.meta.path, entry);
    const board = await getBoard(open.meta.path, slugifyBoardPath(entry));
    hub.broadcast({ type: 'board-changed', payload: { boardId: board.boardId, kind: 'created' } });
    return { board };
  });

  app.get<{ Params: { boardId: string } }>('/api/boards/:boardId', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    return { board: await readBoardDetail(board.path, { boardId: board.boardId, name: board.name }) };
  });

  app.patch<{ Params: { boardId: string }; Body: { name?: string; claudeContent?: string } }>('/api/boards/:boardId', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    if (req.body?.name) {
      const meta = await readProject(open.meta.path);
      const oldEntry = meta.config.boards.find(b => slugifyBoardPath(b) === board.boardId);
      if (oldEntry) {
        const parentDir = path.dirname(oldEntry);
        const newEntry = parentDir === '.' ? slugifyBoardPath(req.body.name) : `${parentDir}/${slugifyBoardPath(req.body.name)}`;
        if (newEntry !== oldEntry) {
          await renameBoard(open.meta.path, oldEntry, newEntry);
        }
        const newAbs = path.isAbsolute(newEntry) ? newEntry : path.resolve(open.meta.path, newEntry);
        await updateBoardName(newAbs, req.body.name);
      }
    }
    if (req.body?.claudeContent !== undefined) {
      await writeBoardClaudeContent(board.path, req.body.claudeContent);
    }
    hub.broadcast({ type: 'board-changed', payload: { boardId: board.boardId, kind: 'updated' } });
    return { ok: true };
  });

  app.delete<{ Params: { boardId: string }; Body: { deleteFiles?: boolean } }>('/api/boards/:boardId', async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const meta = await readProject(open.meta.path);
    const entry = meta.config.boards.find(b => slugifyBoardPath(b) === board.boardId);
    if (entry) await removeBoardFromProject(open.meta.path, entry);
    if (req.body?.deleteFiles) await deleteBoardFolder(board.path);
    hub.broadcast({ type: 'board-changed', payload: { boardId: board.boardId, kind: 'deleted' } });
    return { ok: true };
  });
}
