import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WsClient, makeWsUrl } from '../lib/ws.js';
import type { WsEvent } from '@shared/events.js';

let singleton: WsClient | null = null;

function getClient(): WsClient {
  if (!singleton) {
    singleton = new WsClient(makeWsUrl());
    singleton.connect();
  }
  return singleton;
}

export function useWsInvalidation(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const client = getClient();
    const unsubscribe = client.subscribe((event: WsEvent) => {
      switch (event.type) {
        case 'project-opened':
        case 'project-closed':
          qc.invalidateQueries();
          return;
        case 'board-changed':
          qc.invalidateQueries({ queryKey: ['boards'] });
          qc.invalidateQueries({ queryKey: ['board', event.payload.boardId] });
          return;
        case 'lane-changed':
          qc.invalidateQueries({ queryKey: ['board', event.payload.boardId] });
          qc.invalidateQueries({ queryKey: ['lane', event.payload.boardId, event.payload.laneName] });
          qc.invalidateQueries({ queryKey: ['tickets', event.payload.boardId, event.payload.laneName] });
          return;
        case 'ticket-changed':
          qc.invalidateQueries({ queryKey: ['tickets', event.payload.boardId, event.payload.laneName] });
          qc.invalidateQueries({ queryKey: ['ticket', event.payload.boardId, event.payload.laneName, event.payload.filename] });
          return;
      }
    });
    return unsubscribe;
  }, [qc]);
}
