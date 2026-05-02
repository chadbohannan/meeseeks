import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../../storage/errors.js';
import { getBoard } from '../../storage/project.js';
import {
  listPrompts, readPrompt, writePrompt, deletePrompt, promptExists,
  appendRunLog, listRunLogs,
} from '../../storage/prompts.js';
import type { BoardRuntimeConfig, PermissionsConfig } from '../../runtime/types.js';

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
  app.get<{ Params: { boardId: string } }>(
    '/api/boards/:boardId/prompts',
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      const prompts = await listPrompts(board.path);
      return { prompts };
    },
  );

  app.get<{ Params: { boardId: string; name: string } }>(
    '/api/boards/:boardId/prompts/:name',
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      const result = await readPrompt(board.path, req.params.name);
      return { prompt: result };
    },
  );

  app.put<{ Params: { boardId: string; name: string }; Body: { body: string } }>(
    '/api/boards/:boardId/prompts/:name',
    async (req) => {
      if (typeof req.body?.body !== 'string') {
        throw new InvalidInputError('body must be a string');
      }
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      await writePrompt(board.path, req.params.name, req.body.body);
      return { prompt: { name: req.params.name, body: req.body.body } };
    },
  );

  app.delete<{ Params: { boardId: string; name: string } }>(
    '/api/boards/:boardId/prompts/:name',
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      await deletePrompt(board.path, req.params.name);
      return { ok: true };
    },
  );

  app.post<{ Params: { boardId: string; name: string }; Body: { model?: string } }>(
    '/api/boards/:boardId/prompts/:name/run',
    async (req) => {
      const { boardId, name } = req.params;
      const open = state.require();
      const board = await getBoard(open.meta.path, boardId);
      if (!(await promptExists(board.path, name))) {
        throw new NotFoundError(`prompt not found: ${name}`);
      }
      const { body } = await readPrompt(board.path, name);

      const existing = state.supervisor.list().find(r =>
        r.kind === 'prompt' &&
        r.promptRef?.boardId === boardId &&
        r.promptRef?.name === name &&
        r.status !== 'exited' && r.status !== 'errored');
      if (existing) {
        throw new ConflictError(`prompt already running: ${name}`);
      }

      const boardCfg = await readYaml<BoardRuntimeConfig>(path.join(board.path, 'board.yaml'));
      const permissions = await readYaml<PermissionsConfig>(path.join(board.path, 'permissions.yaml'));

      const runtimeId = randomUUID();
      const summary = await state.supervisor.spawnPrompt({
        runtimeId,
        boardPath: board.path,
        promptRef: { boardId, name },
        promptBody: body,
        board: boardCfg,
        permissions,
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
        void appendRunLog(board.path, name, {
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

  app.get<{ Params: { boardId: string; name: string } }>(
    '/api/boards/:boardId/prompts/:name/logs',
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      const logs = await listRunLogs(board.path, req.params.name);
      return { logs };
    },
  );
}
