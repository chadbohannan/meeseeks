import type { WsEvent } from '@shared/events.js';

type Handler = (event: WsEvent) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private reconnectDelay = 500;
  private closed = false;

  constructor(private url: string) {}

  connect(): void {
    this.closed = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WsEvent;
        for (const h of this.handlers) h(event);
      } catch { /* ignore non-JSON */ }
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closed) return;
      const delay = this.reconnectDelay;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
      setTimeout(() => this.connect(), delay);
    };
    ws.onopen = () => { this.reconnectDelay = 500; };
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  send(msg: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}

export function makeWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
