import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { WebsocketHandler } from '@fastify/websocket';
import type { WsEvent } from '../shared/events.js';
import type { ServerState } from './state.js';
import { listBoards } from '../storage/project.js';

export class WsHub {
  private clients = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.clients.add(socket);
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
  }

  broadcast(event: WsEvent): void {
    const text = JSON.stringify(event);
    for (const c of this.clients) {
      if (c.readyState === c.OPEN) c.send(text);
    }
  }

  send(socket: WebSocket, event: WsEvent): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
  }

  size(): number { return this.clients.size; }
}

export async function registerWs(
  app: FastifyInstance,
  state: ServerState,
  hub: WsHub,
): Promise<void> {
  const handler: WebsocketHandler = async (socket) => {
    hub.add(socket);
    const open = state.peek();
    if (open) {
      const boards = await listBoards(open.meta.path);
      hub.send(socket, { type: 'project-opened', payload: { project: open.meta, boards } });
    } else {
      hub.send(socket, { type: 'project-closed', payload: {} });
    }
  };
  app.get('/ws', { websocket: true }, handler);
}
