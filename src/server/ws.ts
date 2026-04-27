import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { WebsocketHandler } from '@fastify/websocket';
import type { WsEvent } from '../shared/events.js';
import type { ServerState } from './state.js';

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
    for (const r of state.supervisor.list()) {
      hub.send(socket, { type: 'runtime-spawned', payload: r });
    }

    socket.on('message', (raw: Buffer) => {
      let msg: { type?: string; payload?: { runtimeId?: string; data?: string; cols?: number; rows?: number } } | null = null;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      const p = msg.payload;
      if (msg.type === 'runtime-input' && p?.runtimeId && typeof p.data === 'string') {
        state.supervisor.writeInput(p.runtimeId, Buffer.from(p.data, 'base64'));
      } else if (msg.type === 'runtime-resize' && p?.runtimeId && typeof p.cols === 'number' && typeof p.rows === 'number') {
        state.supervisor.resize(p.runtimeId, p.cols, p.rows);
      }
    });
  };
  app.get('/ws', { websocket: true }, handler);
}
