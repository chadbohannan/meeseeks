import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
export async function registerTicketRoutes(_app: FastifyInstance, _d: { state: ServerState; hub: WsHub }) {}
