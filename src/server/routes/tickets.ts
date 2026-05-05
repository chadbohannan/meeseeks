import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { getBoard } from '../../storage/project.js';
import { createTicket, listTickets, readTicket, updateTicket, deleteTicket } from '../../storage/ticket.js';
import { InvalidInputError } from '../../storage/errors.js';

const BASE = '/api/boards/:boardId/lanes/:laneName/tickets';

export async function registerTicketRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.get<{ Params: { boardId: string; laneName: string } }>(BASE, async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    return { tickets: await listTickets(board.path, req.params.laneName) };
  });

  app.post<{
    Params: { boardId: string; laneName: string };
    Body: { title: string; state: string; body?: string };
  }>(BASE, async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const body = req.body ?? {} as { title?: string; state?: string; body?: string };
    if (!body.title || !body.state) throw new InvalidInputError('title and state required');
    const ticket = await createTicket(board.path, req.params.laneName, { title: body.title, state: body.state, body: body.body });
    hub.broadcast({
      type: 'ticket-changed',
      payload: { boardId: board.boardId, laneName: req.params.laneName, filename: ticket.filename, state: ticket.state, kind: 'created' },
    });
    return { ticket };
  });

  app.get<{ Params: { boardId: string; laneName: string; filename: string } }>(
    `${BASE}/:filename`,
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      return { ticket: await readTicket(board.path, req.params.laneName, req.params.filename) };
    },
  );

  app.patch<{
    Params: { boardId: string; laneName: string; filename: string };
    Body: { title?: string; body?: string; state?: string; color?: string };
  }>(`${BASE}/:filename`, async (req) => {
    const open = state.require();
    const board = await getBoard(open.meta.path, req.params.boardId);
    const ticket = await updateTicket(board.path, req.params.laneName, req.params.filename, req.body ?? {});
    hub.broadcast({
      type: 'ticket-changed',
      payload: { boardId: board.boardId, laneName: req.params.laneName, filename: ticket.filename, state: ticket.state, kind: 'updated' },
    });
    return { ticket };
  });

  app.delete<{ Params: { boardId: string; laneName: string; filename: string } }>(
    `${BASE}/:filename`,
    async (req) => {
      const open = state.require();
      const board = await getBoard(open.meta.path, req.params.boardId);
      await deleteTicket(board.path, req.params.laneName, req.params.filename);
      hub.broadcast({
        type: 'ticket-changed',
        payload: { boardId: board.boardId, laneName: req.params.laneName, filename: req.params.filename, state: '__deleted__', kind: 'deleted' },
      });
      return { ok: true };
    },
  );
}
