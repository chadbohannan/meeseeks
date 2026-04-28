import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { NotFoundError } from '../../storage/errors.js';
import { getBoard } from '../../storage/project.js';
import { findTicketFile } from '../../storage/ticket.js';
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

  app.post<{ Params: { boardId: string; laneName: string; filename: string } }>(
    '/api/tickets/:boardId/:laneName/:filename/runtime',
    async (req) => {
      const open = state.require();
      const { boardId, laneName, filename } = req.params;
      const board = await getBoard(open.meta.path, boardId);
      const lanePath = path.join(board.path, 'lanes', laneName);
      const found = await findTicketFile(lanePath, filename);
      if (!found) throw new NotFoundError(`ticket ${filename} not found`);
      const boardCfg = await readYaml<BoardRuntimeConfig>(path.join(board.path, 'board.yaml'));
      const permissions = await readYaml<PermissionsConfig>(path.join(lanePath, 'permissions.yaml'));
      const processDocPath = path.join(lanePath, 'PROCESS.md');

      const existing = state.supervisor.list().find(r =>
        r.ticketRef.boardId === boardId &&
        r.ticketRef.laneName === laneName &&
        r.ticketRef.filename === filename &&
        r.status !== 'exited' && r.status !== 'errored');
      if (existing) return { runtime: existing };

      const runtimeId = randomUUID();
      const summary = await state.supervisor.spawn({
        runtimeId,
        boardPath: board.path,
        lanePath,
        ticketAbsPath: found.abs,
        processDocPath,
        ticketRef: { boardId, laneName, filename },
        board: boardCfg,
        permissions,
      });
      return { runtime: summary };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { state?: string } }>(
    '/internal/runtime/:id/notify',
    async (req, reply) => {
      const notifyStatus = req.query.state;
      if (notifyStatus !== 'idle' && notifyStatus !== 'awaiting-user') {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'state must be idle or awaiting-user' } });
      }
      const found = state.supervisor.notifyState(req.params.id, notifyStatus);
      if (!found) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'runtime not found' } });
      }
      return {};
    },
  );

}
