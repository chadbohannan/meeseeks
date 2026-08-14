import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { createTicket, listTickets, readTicket, updateTicket, deleteTicket } from '../../storage/ticket.js';
import { InvalidInputError } from '../../storage/errors.js';

const BASE = '/api/workflows/:workflowName/tickets';

export async function registerTicketRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub: WsHub },
): Promise<void> {
  const { state, hub } = deps;

  app.get<{ Params: { workflowName: string } }>(BASE, async (req) => {
    const open = state.require();
    return { tickets: await listTickets(open.meta.path, req.params.workflowName) };
  });

  app.post<{
    Params: { workflowName: string };
    Body: { title: string; state: string; body?: string; project?: string };
  }>(BASE, async (req) => {
    const open = state.require();
    const body = req.body ?? {} as { title?: string; state?: string; body?: string; project?: string };
    if (!body.title || !body.state) throw new InvalidInputError('title and state required');
    const ticket = await createTicket(open.meta.path, req.params.workflowName, {
      title: body.title, state: body.state, body: body.body, project: body.project,
    });
    hub.broadcast({
      type: 'ticket-changed',
      payload: { workflowName: req.params.workflowName, filename: ticket.filename, state: ticket.state, kind: 'created' },
    });
    return { ticket };
  });

  app.get<{ Params: { workflowName: string; filename: string } }>(
    `${BASE}/:filename`,
    async (req) => {
      const open = state.require();
      return { ticket: await readTicket(open.meta.path, req.params.workflowName, req.params.filename) };
    },
  );

  app.patch<{
    Params: { workflowName: string; filename: string };
    Body: { title?: string; body?: string; state?: string; color?: string; project?: string };
  }>(`${BASE}/:filename`, async (req) => {
    const open = state.require();
    const ticket = await updateTicket(open.meta.path, req.params.workflowName, req.params.filename, req.body ?? {});
    hub.broadcast({
      type: 'ticket-changed',
      payload: { workflowName: req.params.workflowName, filename: ticket.filename, state: ticket.state, kind: 'updated' },
    });
    return { ticket };
  });

  app.delete<{ Params: { workflowName: string; filename: string } }>(
    `${BASE}/:filename`,
    async (req) => {
      const open = state.require();
      await deleteTicket(open.meta.path, req.params.workflowName, req.params.filename);
      hub.broadcast({
        type: 'ticket-changed',
        payload: { workflowName: req.params.workflowName, filename: req.params.filename, state: '__deleted__', kind: 'deleted' },
      });
      return { ok: true };
    },
  );
}
